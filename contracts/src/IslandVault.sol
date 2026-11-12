// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IMezoCoreInterfaces.sol";
import "./utils/ReentrancyGuardLite.sol";

/**
 * @title IslandVault
 * @notice Per-Sub-Island multi-asset vault (BTC + MUSD) deployed as EIP-1167 minimal proxy clones.
 *         Uses internal tracked balances (blocking transfer/selfdestruct profit spoofing),
 *         deducts active loan liability from equity, scales cost basis proportionally on withdrawals,
 *         and supports whitelisted swap execution, profit checkpoints, and default seizure.
 */
contract IslandVault is ReentrancyGuardLite, IIslandVault {
    uint256 private constant BPS_DENOM = 10_000;

    struct VaultPolicy {
        uint16 maxSingleTradeBps;     // Max % of gross NAV per single swap (e.g., 2500 = 25%)
        uint16 maxDailyDrawdownBps;   // Reserved for drawdown circuit checks
        uint32 cooldownSeconds;
        bool allowBtc;
        bool allowMusd;
        bool emergencyLock;
    }

    struct ProfitCheckpoint {
        uint256 id;
        uint256 blockNumber;
        uint64 timestamp;
        uint256 grossNavUsd;
        uint256 loanLiabilityUsd;
        uint256 netEquityUsd;
        uint256 costBasisUsd;
        uint256 netProfitUsd;
        uint256 roiBps;
        uint32 tradeCount;
        bytes32 transcriptHash;
    }

    // Shared implementation immutables (identical across all EIP-1167 clones)
    IERC20Minimal public immutable musd;
    IPriceFeed public immutable priceFeed;

    // Clone storage (initialized once per Sub-Island)
    bool private _initialized;
    bool private _inSwap;

    address public factory;
    address public creditCouncil;
    IMezoTestnetSwapPool public approvedSwapPool;

    uint256 public override islandId;
    address public override owner;
    address public override operator;

    // Anti-spoof tracked internal balances (ignores raw transfers / selfdestruct injections)
    uint256 public override trackedBtcBalance;
    uint256 public override trackedMusdBalance;
    uint256 public override activeCostBasisUsd;

    // Loan liability tracking
    uint256 public activeLoanId;
    uint256 public override outstandingLoanPrincipalMusd;
    uint16 public loanMaintenanceMarginBps; // e.g., 11500 = 115% gross asset coverage over debt

    VaultPolicy public policy;
    uint32 public realizedTradeCount;
    uint64 public lastExecutionTs;

    ProfitCheckpoint[] private _checkpoints;

    event VaultInitialized(uint256 indexed islandId, address indexed owner, address indexed operator);
    event SeededBtc(address indexed funder, uint256 amountWei, uint256 costBasisAddedUsd);
    event SeededMusd(address indexed funder, uint256 amountMusd, uint256 costBasisAddedUsd);
    event WithdrawnBtc(address indexed to, uint256 amountWei, uint256 remainingCostBasisUsd);
    event WithdrawnMusd(address indexed to, uint256 amountMusd, uint256 remainingCostBasisUsd);
    event SwapExecuted(bool btcToMusd, uint256 amountIn, uint256 amountOut, uint32 tradeCount);
    event PolicyUpdated(uint16 maxSingleTradeBps, uint16 maxDailyDrawdownBps, uint32 cooldownSeconds, bool allowBtc, bool allowMusd, bool emergencyLock);
    event CheckpointRecorded(uint256 indexed checkpointId, uint256 netEquityUsd, uint256 netProfitUsd, uint256 roiBps, bytes32 transcriptHash);
    event LoanLiabilityOpened(uint256 indexed loanId, uint256 principalMusd);
    event LoanRepaymentTransferred(uint256 principalReduced, uint256 totalTransferMusd, address indexed recipient);
    event DefaultCollateralSeized(uint256 musdRecovered, address indexed recipient);

    error AlreadyInitialized();
    error Unauthorized();
    error InvalidAmount();
    error InvalidParameters();
    error DirectTransferDisabled();
    error VaultLocked();
    error CooldownActive();
    error AssetDisabled();
    error ExceedsTradeCap();
    error InsufficientBalance();
    error LoanCoverageBreached();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyOwnerOrFactory() {
        if (msg.sender != owner && msg.sender != factory) revert Unauthorized();
        _;
    }

    modifier onlyOwnerOrOperator() {
        if (msg.sender != owner && msg.sender != operator) revert Unauthorized();
        _;
    }

    modifier onlyCreditCouncil() {
        if (msg.sender != creditCouncil) revert Unauthorized();
        _;
    }

    constructor(address _musd, address _priceFeed) {
        if (_musd == address(0) || _priceFeed == address(0)) revert InvalidParameters();
        musd = IERC20Minimal(_musd);
        priceFeed = IPriceFeed(_priceFeed);
        _initialized = true; // Lock the logic implementation itself
    }

    receive() external payable {
        if (!_inSwap || msg.sender != address(approvedSwapPool)) {
            revert DirectTransferDisabled();
        }
    }

    function initialize(
        uint256 _islandId,
        address _owner,
        address _operator,
        address _creditCouncil,
        address _approvedSwapPool
    ) external {
        if (_initialized) revert AlreadyInitialized();
        if (_owner == address(0) || _creditCouncil == address(0) || _approvedSwapPool == address(0)) {
            revert InvalidParameters();
        }

        _initialized = true;
        factory = msg.sender;
        islandId = _islandId;
        owner = _owner;
        operator = _operator == address(0) ? _owner : _operator;
        creditCouncil = _creditCouncil;
        approvedSwapPool = IMezoTestnetSwapPool(_approvedSwapPool);
        loanMaintenanceMarginBps = 11_500; // 115% collateralization floor when loan is active

        policy = VaultPolicy({
            maxSingleTradeBps: 2500, // 25% of gross NAV max per swap
            maxDailyDrawdownBps: 1000,
            cooldownSeconds: 0,
            allowBtc: true,
            allowMusd: true,
            emergencyLock: false
        });

        emit VaultInitialized(_islandId, _owner, operator);
    }

    function setOperator(address _operator) external onlyOwner {
        if (_operator == address(0)) revert InvalidParameters();
        operator = _operator;
    }

    function updatePolicy(
        uint16 _maxSingleTradeBps,
        uint16 _maxDailyDrawdownBps,
        uint32 _cooldownSeconds,
        bool _allowBtc,
        bool _allowMusd,
        bool _emergencyLock
    ) external onlyOwner {
        if (_maxSingleTradeBps == 0 || _maxSingleTradeBps > 5000 || _maxDailyDrawdownBps > 5000) {
            revert InvalidParameters();
        }
        policy = VaultPolicy({
            maxSingleTradeBps: _maxSingleTradeBps,
            maxDailyDrawdownBps: _maxDailyDrawdownBps,
            cooldownSeconds: _cooldownSeconds,
            allowBtc: _allowBtc,
            allowMusd: _allowMusd,
            emergencyLock: _emergencyLock
        });
        emit PolicyUpdated(_maxSingleTradeBps, _maxDailyDrawdownBps, _cooldownSeconds, _allowBtc, _allowMusd, _emergencyLock);
    }

    function depositBtc() external payable nonReentrant onlyOwnerOrFactory {
        if (msg.value == 0) revert InvalidAmount();
        uint256 price = priceFeed.fetchPrice();
        uint256 usdVal = (msg.value * price) / 1 ether;
        trackedBtcBalance += msg.value;
        activeCostBasisUsd += usdVal;
        emit SeededBtc(msg.sender, msg.value, usdVal);
    }

    function depositMusd(uint256 musdAmount) external nonReentrant onlyOwnerOrFactory {
        if (musdAmount == 0) revert InvalidAmount();
        bool ok = musd.transferFrom(msg.sender, address(this), musdAmount);
        if (!ok) revert TransferFailed();
        trackedMusdBalance += musdAmount;
        activeCostBasisUsd += musdAmount;
        emit SeededMusd(msg.sender, musdAmount, musdAmount);
    }

    function withdrawBtc(uint256 amountWei) external nonReentrant onlyOwner {
        if (amountWei == 0) revert InvalidAmount();
        if (amountWei > trackedBtcBalance) revert InsufficientBalance();

        uint256 equityBefore = getNetEquityUsd();
        trackedBtcBalance -= amountWei;

        _enforcePostWithdrawLoanCoverage();
        _scaleCostBasisAfterWithdraw(equityBefore);

        (bool ok, ) = owner.call{value: amountWei}("");
        if (!ok) revert TransferFailed();

        emit WithdrawnBtc(owner, amountWei, activeCostBasisUsd);
    }

    function withdrawMusd(uint256 amountMusd) external nonReentrant onlyOwner {
        if (amountMusd == 0) revert InvalidAmount();
        if (amountMusd > trackedMusdBalance) revert InsufficientBalance();

        uint256 equityBefore = getNetEquityUsd();
        trackedMusdBalance -= amountMusd;

        _enforcePostWithdrawLoanCoverage();
        _scaleCostBasisAfterWithdraw(equityBefore);

        bool ok = musd.transfer(owner, amountMusd);
        if (!ok) revert TransferFailed();

        emit WithdrawnMusd(owner, amountMusd, activeCostBasisUsd);
    }

    function _enforcePostWithdrawLoanCoverage() internal view {
        if (outstandingLoanPrincipalMusd > 0) {
            uint256 grossNav = getCurrentGrossNavUsd();
            if ((grossNav * BPS_DENOM) < (outstandingLoanPrincipalMusd * loanMaintenanceMarginBps)) {
                revert LoanCoverageBreached();
            }
        }
    }

    function _scaleCostBasisAfterWithdraw(uint256 equityBefore) internal {
        uint256 equityAfter = getNetEquityUsd();
        if (equityBefore == 0 || equityAfter == 0) {
            activeCostBasisUsd = 0;
        } else {
            activeCostBasisUsd = (activeCostBasisUsd * equityAfter) / equityBefore;
        }
    }

    /**
     * @notice Execute an atomic swap through the whitelisted MezoTestnetSwapPool within policy limits.
     */
    function executeWhitelistedSwap(
        bool btcToMusd,
        uint256 amountIn,
        uint256 minAmountOut
    ) external nonReentrant onlyOwnerOrOperator returns (uint256 amountOut) {
        if (policy.emergencyLock) revert VaultLocked();
        if (!policy.allowBtc || !policy.allowMusd) revert AssetDisabled();
        if (amountIn == 0) revert InvalidAmount();
        if (lastExecutionTs != 0 && block.timestamp < lastExecutionTs + policy.cooldownSeconds) {
            revert CooldownActive();
        }

        uint256 price = priceFeed.fetchPrice();
        uint256 grossNav = getCurrentGrossNavUsd();
        uint256 tradeUsd = btcToMusd ? (amountIn * price) / 1 ether : amountIn;
        if (tradeUsd > (grossNav * policy.maxSingleTradeBps) / BPS_DENOM) {
            revert ExceedsTradeCap();
        }

        if (btcToMusd) {
            if (amountIn > trackedBtcBalance) revert InsufficientBalance();
            uint256 musdBefore = musd.balanceOf(address(this));
            amountOut = approvedSwapPool.swapBtcForMusd{value: amountIn}(minAmountOut, address(this));
            uint256 musdReceived = musd.balanceOf(address(this)) - musdBefore;
            if (musdReceived < minAmountOut) revert InsufficientBalance();
            trackedBtcBalance -= amountIn;
            trackedMusdBalance += musdReceived;
            amountOut = musdReceived;
        } else {
            if (amountIn > trackedMusdBalance) revert InsufficientBalance();
            uint256 btcBefore = address(this).balance;
            musd.approve(address(approvedSwapPool), 0);
            musd.approve(address(approvedSwapPool), amountIn);
            _inSwap = true;
            amountOut = approvedSwapPool.swapMusdForBtc(amountIn, minAmountOut, address(this));
            _inSwap = false;
            musd.approve(address(approvedSwapPool), 0);
            uint256 btcReceived = address(this).balance - btcBefore;
            if (btcReceived < minAmountOut) revert InsufficientBalance();
            trackedMusdBalance -= amountIn;
            trackedBtcBalance += btcReceived;
            amountOut = btcReceived;
        }

        realizedTradeCount += 1;
        lastExecutionTs = uint64(block.timestamp);
        emit SwapExecuted(btcToMusd, amountIn, amountOut, realizedTradeCount);
    }

    /**
     * @notice Anchor an immutable on-chain profit checkpoint strictly derived from tracked balances & oracle price.
     */
    function recordProfitCheckpoint(
        bytes32 strategyTranscriptHash
    ) external onlyOwnerOrOperator returns (uint256 checkpointId) {
        uint256 grossNav = getCurrentGrossNavUsd();
        uint256 loanDebt = outstandingLoanPrincipalMusd;
        uint256 netEquity = grossNav > loanDebt ? grossNav - loanDebt : 0;
        uint256 profit = netEquity > activeCostBasisUsd ? netEquity - activeCostBasisUsd : 0;
        uint256 roiBps = activeCostBasisUsd == 0 ? 0 : (profit * BPS_DENOM) / activeCostBasisUsd;

        checkpointId = _checkpoints.length;
        _checkpoints.push(
            ProfitCheckpoint({
                id: checkpointId,
                blockNumber: block.number,
                timestamp: uint64(block.timestamp),
                grossNavUsd: grossNav,
                loanLiabilityUsd: loanDebt,
                netEquityUsd: netEquity,
                costBasisUsd: activeCostBasisUsd,
                netProfitUsd: profit,
                roiBps: roiBps,
                tradeCount: realizedTradeCount,
                transcriptHash: strategyTranscriptHash
            })
        );

        emit CheckpointRecorded(checkpointId, netEquity, profit, roiBps, strategyTranscriptHash);
    }

    function getCurrentGrossNavUsd() public view override returns (uint256) {
        uint256 price = priceFeed.fetchPrice();
        uint256 btcUsd = (trackedBtcBalance * price) / 1 ether;
        return btcUsd + trackedMusdBalance;
    }

    function getNetEquityUsd() public view override returns (uint256) {
        uint256 gross = getCurrentGrossNavUsd();
        return gross > outstandingLoanPrincipalMusd ? gross - outstandingLoanPrincipalMusd : 0;
    }

    function getNetProfitUsd() public view override returns (uint256) {
        uint256 equity = getNetEquityUsd();
        return equity > activeCostBasisUsd ? equity - activeCostBasisUsd : 0;
    }

    function isLoanUndercollateralized() external view override returns (bool) {
        if (outstandingLoanPrincipalMusd == 0) return false;
        uint256 gross = getCurrentGrossNavUsd();
        return (gross * BPS_DENOM) < (outstandingLoanPrincipalMusd * loanMaintenanceMarginBps);
    }

    function getCheckpoint(
        uint256 checkpointId
    )
        external
        view
        override
        returns (
            uint256 id,
            uint256 blockNumber,
            uint64 timestamp,
            uint256 grossNavUsd,
            uint256 loanLiabilityUsd,
            uint256 netEquityUsd,
            uint256 costBasisUsd,
            uint256 netProfitUsd,
            uint256 roiBps,
            uint32 tradeCount,
            bytes32 transcriptHash
        )
    {
        ProfitCheckpoint memory cp = _checkpoints[checkpointId];
        return (
            cp.id,
            cp.blockNumber,
            cp.timestamp,
            cp.grossNavUsd,
            cp.loanLiabilityUsd,
            cp.netEquityUsd,
            cp.costBasisUsd,
            cp.netProfitUsd,
            cp.roiBps,
            cp.tradeCount,
            cp.transcriptHash
        );
    }

    function totalCheckpoints() external view override returns (uint256) {
        return _checkpoints.length;
    }

    // =========================================================================
    // Credit Council Lifecycle Hooks (Only IslandCreditCouncil)
    // =========================================================================

    function onLoanDisbursed(uint256 loanId, uint256 principalMusd) external override onlyCreditCouncil {
        activeLoanId = loanId;
        outstandingLoanPrincipalMusd += principalMusd;
        trackedMusdBalance += principalMusd;
        emit LoanLiabilityOpened(loanId, principalMusd);
    }

    function repayActiveLoanFromVault(
        uint256 principalToReduce,
        uint256 totalTransferMusd,
        address recipient
    ) external override nonReentrant onlyCreditCouncil {
        if (totalTransferMusd > trackedMusdBalance) revert InsufficientBalance();
        trackedMusdBalance -= totalTransferMusd;
        outstandingLoanPrincipalMusd = principalToReduce >= outstandingLoanPrincipalMusd
            ? 0
            : outstandingLoanPrincipalMusd - principalToReduce;
        if (outstandingLoanPrincipalMusd == 0) {
            activeLoanId = 0;
        }
        bool ok = musd.transfer(recipient, totalTransferMusd);
        if (!ok) revert TransferFailed();
        emit LoanRepaymentTransferred(principalToReduce, totalTransferMusd, recipient);
    }

    function notifyExternalRepayment(uint256 principalReduced) external override onlyCreditCouncil {
        // Increasing cost basis by externally cleared debt prevents external repayments from inflating profit metrics
        uint256 reduced = principalReduced > outstandingLoanPrincipalMusd
            ? outstandingLoanPrincipalMusd
            : principalReduced;
        outstandingLoanPrincipalMusd -= reduced;
        activeCostBasisUsd += reduced;
        if (outstandingLoanPrincipalMusd == 0) {
            activeLoanId = 0;
        }
    }

    function seizeDefaultedCollateral(
        uint256 targetRecoveryMusd,
        address musdRecipient
    ) external override nonReentrant onlyCreditCouncil returns (uint256 recoveredMusd) {
        if (trackedMusdBalance > 0) {
            recoveredMusd = trackedMusdBalance < targetRecoveryMusd
                ? trackedMusdBalance
                : targetRecoveryMusd;
            trackedMusdBalance -= recoveredMusd;
        }

        if (recoveredMusd < targetRecoveryMusd && trackedBtcBalance > 0) {
            uint256 btcToLiquidate = trackedBtcBalance;
            uint256 poolMusdAvail = musd.balanceOf(address(approvedSwapPool));
            uint256 fullQuote = approvedSwapPool.quoteBtcForMusd(btcToLiquidate);
            if (poolMusdAvail > 0 && fullQuote > 0) {
                if (fullQuote > poolMusdAvail) {
                    btcToLiquidate = (btcToLiquidate * poolMusdAvail) / fullQuote;
                }
                if (btcToLiquidate > 0 && btcToLiquidate <= trackedBtcBalance) {
                    uint256 musdBefore = musd.balanceOf(address(this));
                    try approvedSwapPool.swapBtcForMusd{value: btcToLiquidate}(1, address(this)) returns (uint256 outAmt) {
                        uint256 received = musd.balanceOf(address(this)) - musdBefore;
                        uint256 swapped = received > outAmt ? received : outAmt;
                        trackedBtcBalance -= btcToLiquidate;
                        uint256 needed = targetRecoveryMusd - recoveredMusd;
                        if (swapped > needed) {
                            recoveredMusd += needed;
                            trackedMusdBalance += (swapped - needed);
                        } else {
                            recoveredMusd += swapped;
                        }
                    } catch {
                        // Leave remaining BTC in vault if pool liquidation fails temporarily
                    }
                }
            }
        }

        outstandingLoanPrincipalMusd = 0;
        activeLoanId = 0;

        if (recoveredMusd > 0) {
            bool ok = musd.transfer(musdRecipient, recoveredMusd);
            if (!ok) revert TransferFailed();
        }

        emit DefaultCollateralSeized(recoveredMusd, musdRecipient);
    }
}
