// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IMezoCoreInterfaces.sol";
import "./utils/ReentrancyGuardLite.sol";

/**
 * @title MezoCityFeeSplitter
 * @notice Canonical MUSD revenue router for MezoCity on Mezo Testnet (Chain ID: 31611).
 *         Collects protocol fees across 5 revenue streams and routes splits governed by MEZO
 *         between MainMEZOVault stakers (real MUSD yield), Protocol Treasury / POL, and
 *         the Bad-Debt Insurance Reserve protecting MainMUSDVault depositors.
 */
contract MezoCityFeeSplitter is ReentrancyGuardLite, IMezoFeeSplitter {
    uint256 private constant BPS_DENOM = 10_000;

    uint8 public constant STREAM_CREDIT_SPREAD = 0; // Loan interest spread & origination
    uint8 public constant STREAM_CLONE_ROYALTY = 1; // Sub-Island high-water-mark / clone royalties
    uint8 public constant STREAM_SWAP_EARN_FEE = 2; // SwapPool & Earn/DCA routing fees
    uint8 public constant STREAM_GUARD_PREMIUM = 3; // Mezo Guard rescue premiums
    uint8 public constant STREAM_SAAS_MINT = 4;     // Island launch fees, Managed AI & MCP SaaS
    uint8 public constant MAX_STREAM_ID = 4;

    IERC20Minimal public immutable musd;
    IMainMEZOVaultCoord public mainMezoVault;

    address public owner;
    address public governance;
    address public protocolTreasury;
    address public insuranceReserve;

    uint16 public mezoStakersBps = 5000; // 50% -> MainMEZOVault.notifyRewardMusd
    uint16 public treasuryBps = 3000;    // 30% -> Protocol Treasury / POL
    uint16 public insuranceBps = 2000;   // 20% -> Bad-Debt Insurance Reserve

    uint256 public totalCollectedMusd;
    uint256 public totalToMezoStakersMusd;
    uint256 public totalToTreasuryMusd;
    uint256 public totalToInsuranceMusd;
    uint256 public pendingStakerRewardsMusd;
    uint256 public insuranceReserveBalanceMusd;

    mapping(uint8 => uint256) public streamTotalsMusd;

    event RevenueCollected(
        uint8 indexed streamId,
        address indexed source,
        uint256 totalMusd,
        uint256 stakersShareMusd,
        uint256 treasuryShareMusd,
        uint256 insuranceShareMusd,
        string memo
    );
    event StakerRewardsFlushed(uint256 musdAmount, uint256 weightedPowerSnapshot);
    event FeeSplitUpdated(uint16 mezoStakersBps, uint16 treasuryBps, uint16 insuranceBps);
    event RecipientsUpdated(address mainMezoVault, address protocolTreasury, address insuranceReserve);
    event GovernanceUpdated(address indexed previousGovernance, address indexed newGovernance);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event InsuranceCoverDisbursed(address indexed recipient, uint256 musdAmount);

    error Unauthorized();
    error InvalidAmount();
    error InvalidStream();
    error InvalidParameters();
    error TransferFailed();

    modifier onlyOwnerOrGovernance() {
        if (msg.sender != owner && msg.sender != governance) revert Unauthorized();
        _;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(
        address _musd,
        address _mainMezoVault,
        address _protocolTreasury,
        address _insuranceReserve
    ) {
        if (
            _musd == address(0) ||
            _mainMezoVault == address(0) ||
            _protocolTreasury == address(0)
        ) {
            revert InvalidParameters();
        }
        musd = IERC20Minimal(_musd);
        mainMezoVault = IMainMEZOVaultCoord(_mainMezoVault);
        protocolTreasury = _protocolTreasury;
        insuranceReserve = _insuranceReserve; // address(0) = hold internally in splitter reserve
        owner = msg.sender;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidParameters();
        address prev = owner;
        owner = newOwner;
        emit OwnershipTransferred(prev, newOwner);
    }

    function setGovernance(address newGovernance) external onlyOwnerOrGovernance {
        address prev = governance;
        governance = newGovernance;
        emit GovernanceUpdated(prev, newGovernance);
    }

    /**
     * @notice Adjust MUSD revenue splits with immutable floors for MEZO stakers and bad-debt insurance.
     */
    function setFeeSplitBps(
        uint16 _mezoStakersBps,
        uint16 _treasuryBps,
        uint16 _insuranceBps
    ) external onlyOwnerOrGovernance {
        if (uint256(_mezoStakersBps) + _treasuryBps + _insuranceBps != BPS_DENOM) {
            revert InvalidParameters();
        }
        if (_mezoStakersBps < 2000 || _treasuryBps > 6000 || _insuranceBps < 500) {
            revert InvalidParameters();
        }
        mezoStakersBps = _mezoStakersBps;
        treasuryBps = _treasuryBps;
        insuranceBps = _insuranceBps;
        emit FeeSplitUpdated(_mezoStakersBps, _treasuryBps, _insuranceBps);
    }

    function updateRecipients(
        address _mainMezoVault,
        address _protocolTreasury,
        address _insuranceReserve
    ) external onlyOwnerOrGovernance {
        if (_mainMezoVault == address(0) || _protocolTreasury == address(0)) {
            revert InvalidParameters();
        }
        mainMezoVault = IMainMEZOVaultCoord(_mainMezoVault);
        protocolTreasury = _protocolTreasury;
        insuranceReserve = _insuranceReserve;
        emit RecipientsUpdated(_mainMezoVault, _protocolTreasury, _insuranceReserve);
    }

    /**
     * @notice Pull MUSD revenue from caller and route across MEZO stakers, Treasury, and Insurance.
     */
    function collectRevenue(
        uint8 streamId,
        uint256 musdAmount,
        string calldata memo
    ) external override nonReentrant {
        if (streamId > MAX_STREAM_ID) revert InvalidStream();
        if (musdAmount == 0) revert InvalidAmount();

        bool okIn = musd.transferFrom(msg.sender, address(this), musdAmount);
        if (!okIn) revert TransferFailed();

        uint256 stakersShare = (musdAmount * mezoStakersBps) / BPS_DENOM;
        uint256 treasuryShare = (musdAmount * treasuryBps) / BPS_DENOM;
        uint256 insuranceShare = musdAmount - stakersShare - treasuryShare;

        totalCollectedMusd += musdAmount;
        streamTotalsMusd[streamId] += musdAmount;
        totalToTreasuryMusd += treasuryShare;
        totalToInsuranceMusd += insuranceShare;

        if (treasuryShare > 0) {
            bool okTreas = musd.transfer(protocolTreasury, treasuryShare);
            if (!okTreas) revert TransferFailed();
        }

        if (insuranceShare > 0) {
            if (insuranceReserve != address(0)) {
                bool okIns = musd.transfer(insuranceReserve, insuranceShare);
                if (!okIns) revert TransferFailed();
            } else {
                insuranceReserveBalanceMusd += insuranceShare;
            }
        }

        if (stakersShare > 0) {
            pendingStakerRewardsMusd += stakersShare;
            _tryFlushStakerRewards();
        }

        emit RevenueCollected(
            streamId,
            msg.sender,
            musdAmount,
            stakersShare,
            treasuryShare,
            insuranceShare,
            memo
        );
    }

    /**
     * @notice Permissionless flush pushing buffered staker rewards into MainMEZOVault once stakers exist.
     */
    function flushPendingStakerRewards() external nonReentrant returns (uint256 flushed) {
        flushed = _tryFlushStakerRewards();
    }

    function _tryFlushStakerRewards() internal returns (uint256 flushed) {
        uint256 pending = pendingStakerRewardsMusd;
        if (pending == 0) return 0;

        uint256 activeWeight = mainMezoVault.totalWeightedPower();
        if (activeWeight == 0) return 0;

        pendingStakerRewardsMusd = 0;
        totalToMezoStakersMusd += pending;

        musd.approve(address(mainMezoVault), 0);
        musd.approve(address(mainMezoVault), pending);
        mainMezoVault.notifyRewardMusd(pending);
        musd.approve(address(mainMezoVault), 0);

        emit StakerRewardsFlushed(pending, activeWeight);
        return pending;
    }

    /**
     * @notice Governance/Owner-authorized disbursement from the internal Bad-Debt Insurance Reserve.
     */
    function coverBadDebt(address recipient, uint256 musdAmount) external nonReentrant onlyOwnerOrGovernance {
        if (recipient == address(0) || musdAmount == 0 || musdAmount > insuranceReserveBalanceMusd) {
            revert InvalidParameters();
        }
        insuranceReserveBalanceMusd -= musdAmount;
        bool ok = musd.transfer(recipient, musdAmount);
        if (!ok) revert TransferFailed();
        emit InsuranceCoverDisbursed(recipient, musdAmount);
    }

    function splitterOverview()
        external
        view
        returns (
            uint256 _totalCollectedMusd,
            uint256 _totalToMezoStakersMusd,
            uint256 _totalToTreasuryMusd,
            uint256 _totalToInsuranceMusd,
            uint256 _insuranceReserveBalanceMusd,
            uint256 _pendingStakerRewardsMusd,
            uint16 _mezoStakersBps,
            uint16 _treasuryBps,
            uint16 _insuranceBps
        )
    {
        return (
            totalCollectedMusd,
            totalToMezoStakersMusd,
            totalToTreasuryMusd,
            totalToInsuranceMusd,
            insuranceReserveBalanceMusd,
            pendingStakerRewardsMusd,
            mezoStakersBps,
            treasuryBps,
            insuranceBps
        );
    }
}
