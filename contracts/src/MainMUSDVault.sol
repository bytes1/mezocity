// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IMezoCoreInterfaces.sol";
import "./utils/ReentrancyGuardLite.sol";

/**
 * @title MainMUSDVault
 * @notice Main Island MUSD Treasury & Sub-Island Credit Pool on Mezo Testnet (Chain ID: 31611).
 *         Provides LP share accounting with ERC-4626 virtual share offset, O(1) continuous linear
 *         interest accrual, reserve ratio floors, and a rolling 24h auto-disbursement circuit breaker.
 */
contract MainMUSDVault is ReentrancyGuardLite {
    uint256 private constant BPS_DENOM = 10_000;
    uint256 private constant SECONDS_PER_YEAR = 365 days;
    uint256 private constant VIRTUAL_SHARES = 1e3;
    uint256 private constant VIRTUAL_ASSETS = 1e3;

    IERC20Minimal public immutable musd;
    address public owner;
    address public creditCouncil;

    // Vault LP state
    uint256 public trackedLiquidMusd;
    uint256 public totalShares;
    mapping(address => uint256) public shareBalances;
    mapping(address => uint64) public lastDepositTimestamp;

    // O(1) continuous interest accrual across all active Sub-Island loans
    uint256 public activePrincipalTotal;
    uint256 public weightedAprPrincipalSum; // sum(principal * aprBps)
    uint64 public lastAccrualTimestamp;
    uint256 public accruedInterestBuffer;
    uint256 public cumulativeInterestEarnedMusd;
    uint256 public cumulativeBadDebtWriteOffMusd;
    uint256 public cumulativeProtocolFeesSharedMusd;

    address public protocolFeeSplitter;
    uint16 public protocolInterestCutBps; // Max 3000 (30% of interest paid routed to FeeSplitter)

    // Guardrails & rolling 24h circuit breaker
    uint16 public minLiquidReserveBps = 2500; // Keep >= 25% liquid for withdrawals
    uint16 public maxSingleLoanBps = 2000;    // Max 20% of totalAssets per Sub-Island loan
    uint32 public minHoldSeconds = 60;        // Anti-front-running holding window after deposit
    bool public emergencyPause;

    uint256 public dailyAutoDisburseCapMusd = 2_000 ether;
    uint256 public dailyAutoDisbursedMusd;
    uint64 public autoDisburseDayStart;

    event MusdDeposited(address indexed depositor, uint256 assetsMusd, uint256 sharesMinted, uint256 sharePriceE18);
    event MusdWithdrawn(address indexed depositor, uint256 assetsMusd, uint256 sharesBurned, uint256 sharePriceE18);
    event LoanDisbursed(address indexed islandVault, uint256 principalMusd, uint16 aprBps, bool isAutoDisburse);
    event LoanRepaymentReceived(uint256 principalPaid, uint256 interestPaid, uint256 newTotalAssets);
    event DefaultRecoveryRecorded(uint256 originalPrincipal, uint256 recoveredMusd, uint256 badDebtMusd);
    event ProtocolFeeConfigUpdated(address indexed feeSplitter, uint16 interestCutBps);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event GuardrailsUpdated(
        uint16 minLiquidReserveBps,
        uint16 maxSingleLoanBps,
        uint256 dailyAutoDisburseCapMusd,
        uint32 minHoldSeconds,
        bool emergencyPause
    );

    error Unauthorized();
    error InvalidAmount();
    error InvalidParameters();
    error VaultPaused();
    error InsufficientShares();
    error HoldPeriodNotElapsed();
    error InsufficientLiquidReserve();
    error ExceedsSingleLoanCap();
    error DailyAutoDisburseCapExceeded();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyCreditCouncil() {
        if (msg.sender != creditCouncil) revert Unauthorized();
        _;
    }

    constructor(address _musd) {
        if (_musd == address(0)) revert InvalidParameters();
        musd = IERC20Minimal(_musd);
        owner = msg.sender;
        lastAccrualTimestamp = uint64(block.timestamp);
        autoDisburseDayStart = uint64(block.timestamp);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidParameters();
        address prev = owner;
        owner = newOwner;
        emit OwnershipTransferred(prev, newOwner);
    }

    function setProtocolFeeConfig(address _feeSplitter, uint16 _interestCutBps) external onlyOwner {
        if (_interestCutBps > 3000) revert InvalidParameters();
        protocolFeeSplitter = _feeSplitter;
        protocolInterestCutBps = _interestCutBps;
        emit ProtocolFeeConfigUpdated(_feeSplitter, _interestCutBps);
    }

    function setCreditCouncil(address _creditCouncil) external onlyOwner {
        if (_creditCouncil == address(0)) revert InvalidParameters();
        creditCouncil = _creditCouncil;
    }

    function updateGuardrails(
        uint16 _minLiquidReserveBps,
        uint16 _maxSingleLoanBps,
        uint256 _dailyAutoDisburseCapMusd,
        uint32 _minHoldSeconds,
        bool _emergencyPause
    ) external onlyOwner {
        if (_minLiquidReserveBps > 8000 || _maxSingleLoanBps == 0 || _maxSingleLoanBps > 5000) {
            revert InvalidParameters();
        }
        minLiquidReserveBps = _minLiquidReserveBps;
        maxSingleLoanBps = _maxSingleLoanBps;
        dailyAutoDisburseCapMusd = _dailyAutoDisburseCapMusd;
        minHoldSeconds = _minHoldSeconds;
        emergencyPause = _emergencyPause;

        emit GuardrailsUpdated(
            _minLiquidReserveBps,
            _maxSingleLoanBps,
            _dailyAutoDisburseCapMusd,
            _minHoldSeconds,
            _emergencyPause
        );
    }

    function _pendingInterest() internal view returns (uint256) {
        if (weightedAprPrincipalSum == 0 || block.timestamp <= lastAccrualTimestamp) {
            return 0;
        }
        uint256 elapsed = block.timestamp - lastAccrualTimestamp;
        return (weightedAprPrincipalSum * elapsed) / (BPS_DENOM * SECONDS_PER_YEAR);
    }

    function _accrueInterest() internal {
        uint256 pending = _pendingInterest();
        if (pending > 0) {
            accruedInterestBuffer += pending;
        }
        lastAccrualTimestamp = uint64(block.timestamp);
    }

    /**
     * @notice Total MUSD equity managed by Main Island MUSD Vault (O(1) computation).
     */
    function totalAssets() public view returns (uint256) {
        return trackedLiquidMusd + activePrincipalTotal + accruedInterestBuffer + _pendingInterest();
    }

    /**
     * @notice Share price scaled to 1e18 (MUSD per vault share).
     */
    function sharePriceE18() public view returns (uint256) {
        return ((totalAssets() + VIRTUAL_ASSETS) * 1 ether) / (totalShares + VIRTUAL_SHARES);
    }

    function convertToShares(uint256 assetsMusd) public view returns (uint256) {
        return (assetsMusd * (totalShares + VIRTUAL_SHARES)) / (totalAssets() + VIRTUAL_ASSETS);
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        return (shares * (totalAssets() + VIRTUAL_ASSETS)) / (totalShares + VIRTUAL_SHARES);
    }

    /**
     * @notice Maximum loan amount currently permissible without breaching reserve floor or single-loan cap.
     */
    function maxEligibleLoanMusd() public view returns (uint256) {
        if (emergencyPause) return 0;
        uint256 assets = totalAssets();
        if (assets == 0) return 0;

        uint256 minReserve = (assets * minLiquidReserveBps) / BPS_DENOM;
        if (trackedLiquidMusd <= minReserve) return 0;

        uint256 availByReserve = trackedLiquidMusd - minReserve;
        uint256 capBySingle = (assets * maxSingleLoanBps) / BPS_DENOM;
        return availByReserve < capBySingle ? availByReserve : capBySingle;
    }

    /**
     * @notice Deposit MUSD into the Main Island treasury vault to earn lending yield from Sub-Islands.
     */
    function depositMUSD(uint256 assetsMusd) external nonReentrant returns (uint256 sharesMinted) {
        if (assetsMusd == 0) revert InvalidAmount();
        _accrueInterest();

        sharesMinted = convertToShares(assetsMusd);
        if (sharesMinted == 0) revert InvalidAmount();

        bool ok = musd.transferFrom(msg.sender, address(this), assetsMusd);
        if (!ok) revert TransferFailed();

        trackedLiquidMusd += assetsMusd;
        totalShares += sharesMinted;
        shareBalances[msg.sender] += sharesMinted;
        lastDepositTimestamp[msg.sender] = uint64(block.timestamp);

        emit MusdDeposited(msg.sender, assetsMusd, sharesMinted, sharePriceE18());
    }

    /**
     * @notice Burn vault shares to withdraw liquid MUSD back to depositor wallet.
     */
    function withdrawMUSD(uint256 shares) external nonReentrant returns (uint256 assetsOut) {
        if (shares == 0) revert InvalidAmount();
        if (shareBalances[msg.sender] < shares) revert InsufficientShares();
        if (block.timestamp < lastDepositTimestamp[msg.sender] + minHoldSeconds) {
            revert HoldPeriodNotElapsed();
        }

        _accrueInterest();
        assetsOut = convertToAssets(shares);
        if (assetsOut == 0) revert InvalidAmount();
        if (assetsOut > trackedLiquidMusd) revert InsufficientLiquidReserve();

        shareBalances[msg.sender] -= shares;
        totalShares -= shares;
        trackedLiquidMusd -= assetsOut;

        bool ok = musd.transfer(msg.sender, assetsOut);
        if (!ok) revert TransferFailed();

        emit MusdWithdrawn(msg.sender, assetsOut, shares, sharePriceE18());
    }

    /**
     * @notice Called by IslandCreditCouncil to fund an approved Sub-Island IslandVault.
     */
    function disburseLoan(
        address islandVault,
        uint256 principalMusd,
        uint16 aprBps,
        bool isAutoDisburse
    ) external nonReentrant onlyCreditCouncil {
        if (emergencyPause) revert VaultPaused();
        if (islandVault == address(0) || principalMusd == 0) revert InvalidParameters();

        _accrueInterest();

        uint256 assets = totalAssets();
        uint256 capBySingle = (assets * maxSingleLoanBps) / BPS_DENOM;
        if (principalMusd > capBySingle) revert ExceedsSingleLoanCap();

        uint256 minReserve = (assets * minLiquidReserveBps) / BPS_DENOM;
        if (trackedLiquidMusd < principalMusd || trackedLiquidMusd - principalMusd < minReserve) {
            revert InsufficientLiquidReserve();
        }

        if (isAutoDisburse) {
            if (block.timestamp >= autoDisburseDayStart + 1 days) {
                autoDisburseDayStart = uint64(block.timestamp);
                dailyAutoDisbursedMusd = 0;
            }
            if (dailyAutoDisbursedMusd + principalMusd > dailyAutoDisburseCapMusd) {
                revert DailyAutoDisburseCapExceeded();
            }
            dailyAutoDisbursedMusd += principalMusd;
        }

        trackedLiquidMusd -= principalMusd;
        activePrincipalTotal += principalMusd;
        weightedAprPrincipalSum += principalMusd * aprBps;

        bool ok = musd.transfer(islandVault, principalMusd);
        if (!ok) revert TransferFailed();

        emit LoanDisbursed(islandVault, principalMusd, aprBps, isAutoDisburse);
    }

    /**
     * @notice Receives principal + interest repaid from IslandCreditCouncil (from Sub-Island profit or owner).
     */
    function receiveLoanRepayment(
        uint256 principalPaid,
        uint256 interestPaid,
        uint16 aprBps
    ) external nonReentrant onlyCreditCouncil {
        _accrueInterest();

        uint256 totalTransfer = principalPaid + interestPaid;
        if (totalTransfer > 0) {
            bool ok = musd.transferFrom(msg.sender, address(this), totalTransfer);
            if (!ok) revert TransferFailed();
        }

        uint256 protocolCut = 0;
        if (interestPaid > 0 && protocolFeeSplitter != address(0) && protocolInterestCutBps > 0) {
            protocolCut = (interestPaid * protocolInterestCutBps) / BPS_DENOM;
            if (protocolCut > 0) {
                musd.approve(protocolFeeSplitter, 0);
                musd.approve(protocolFeeSplitter, protocolCut);
                IMezoFeeSplitter(protocolFeeSplitter).collectRevenue(
                    0,
                    protocolCut,
                    "CREDIT_INTEREST_SPREAD"
                );
                musd.approve(protocolFeeSplitter, 0);
                cumulativeProtocolFeesSharedMusd += protocolCut;
            }
        }

        if (totalTransfer > protocolCut) {
            trackedLiquidMusd += (totalTransfer - protocolCut);
        }

        if (principalPaid > 0) {
            uint256 reducePrincipal = principalPaid > activePrincipalTotal ? activePrincipalTotal : principalPaid;
            activePrincipalTotal -= reducePrincipal;
            uint256 weightDelta = reducePrincipal * aprBps;
            weightedAprPrincipalSum = weightDelta > weightedAprPrincipalSum
                ? 0
                : weightedAprPrincipalSum - weightDelta;
        }

        if (interestPaid > 0) {
            cumulativeInterestEarnedMusd += (interestPaid - protocolCut);
            accruedInterestBuffer = interestPaid >= accruedInterestBuffer
                ? 0
                : accruedInterestBuffer - interestPaid;
        }

        emit LoanRepaymentReceived(principalPaid, interestPaid, totalAssets());
    }

    /**
     * @notice Settles recovered funds + writes off any bad debt from a liquidated Sub-Island default.
     */
    function recordDefaultRecovery(
        uint256 originalPrincipal,
        uint16 aprBps,
        uint256 recoveredMusd
    ) external nonReentrant onlyCreditCouncil {
        _accrueInterest();

        if (recoveredMusd > 0) {
            bool ok = musd.transferFrom(msg.sender, address(this), recoveredMusd);
            if (!ok) revert TransferFailed();
            trackedLiquidMusd += recoveredMusd;
        }

        uint256 reducePrincipal = originalPrincipal > activePrincipalTotal ? activePrincipalTotal : originalPrincipal;
        activePrincipalTotal -= reducePrincipal;
        uint256 weightDelta = reducePrincipal * aprBps;
        weightedAprPrincipalSum = weightDelta > weightedAprPrincipalSum
            ? 0
            : weightedAprPrincipalSum - weightDelta;

        uint256 badDebt = recoveredMusd < originalPrincipal ? (originalPrincipal - recoveredMusd) : 0;
        if (badDebt > 0) {
            cumulativeBadDebtWriteOffMusd += badDebt;
        }
        if (recoveredMusd > originalPrincipal) {
            uint256 interestRecovered = recoveredMusd - originalPrincipal;
            cumulativeInterestEarnedMusd += interestRecovered;
            accruedInterestBuffer = interestRecovered >= accruedInterestBuffer
                ? 0
                : accruedInterestBuffer - interestRecovered;
        }

        emit DefaultRecoveryRecorded(originalPrincipal, recoveredMusd, badDebt);
    }
}
