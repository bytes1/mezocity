// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IMezoCoreInterfaces.sol";
import "./utils/ReentrancyGuardLite.sol";

/**
 * @title MainMEZOVault
 * @notice Main Island MEZO Coordination & MUSD Fee-Share Vault on Mezo Testnet (Chain ID: 31611).
 *         Holders stake native MEZO (with Flexible 1.0x, 30-day 1.5x, or 90-day 2.5x lock tiers)
 *         to earn MUSD protocol yield distributions and flash-loan-resistant coordination power
 *         for Credit Council APR discounts, Mezo Guard priority, and Leaderboard boosts.
 */
contract MainMEZOVault is ReentrancyGuardLite {
    uint256 private constant BPS_DENOM = 10_000;
    uint256 private constant PRECISION = 1e18;
    uint32 public constant MAX_HOLD_SECONDS = 7 days;

    uint8 public constant TIER_FLEXIBLE = 0;
    uint8 public constant TIER_30_DAYS = 1;
    uint8 public constant TIER_90_DAYS = 2;

    uint16 public constant MULTIPLIER_FLEXIBLE_BPS = 10_000; // 1.0x
    uint16 public constant MULTIPLIER_30_DAYS_BPS = 15_000;  // 1.5x
    uint16 public constant MULTIPLIER_90_DAYS_BPS = 25_000;  // 2.5x

    uint64 public constant LOCK_30_DAYS = 30 days;
    uint64 public constant LOCK_90_DAYS = 90 days;

    struct StakePosition {
        uint256 principalMezo;
        uint256 weightedPower;
        uint64 unlockAt;
        uint64 lastStakeTimestamp;
        uint8 tierId;
    }

    IERC20Minimal public immutable mezo;
    IERC20Minimal public immutable musdReward;

    address public owner;
    address public rewardDistributor;

    uint256 public totalStakedMezo;
    uint256 public totalWeightedPower;
    uint256 public rewardPerWeightStored;
    uint256 public totalRewardsDistributedMusd;
    uint256 public rewardReserveMusd;

    uint32 public minHoldSeconds = 60;
    bool public emergencyPause;

    mapping(address => StakePosition) public positions;
    mapping(address => uint256) public userRewardPerWeightPaid;
    mapping(address => uint256) public rewardsAccruedMusd;

    event MezoStaked(
        address indexed user,
        uint256 amountMezo,
        uint8 tierId,
        uint256 newPrincipalMezo,
        uint256 newWeightedPower,
        uint64 unlockAt
    );
    event MezoUnstaked(
        address indexed user,
        uint256 amountMezo,
        uint256 remainingPrincipalMezo,
        uint256 remainingWeightedPower
    );
    event RewardNotifiedMusd(address indexed caller, uint256 musdAmount, uint256 newRewardPerWeightStored);
    event RewardClaimedMusd(address indexed user, uint256 musdAmount);
    event RewardDistributorUpdated(address indexed previousDistributor, address indexed newDistributor);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event GuardrailsUpdated(uint32 minHoldSeconds, bool emergencyPause);

    error Unauthorized();
    error InvalidAmount();
    error InvalidParameters();
    error InvalidTier();
    error VaultPaused();
    error InsufficientStakedBalance();
    error LockNotExpired();
    error CannotDowngradeActiveLock();
    error HoldPeriodNotElapsed();
    error NoActiveStakers();
    error NoRewardsToClaim();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyRewardDistributor() {
        if (msg.sender != owner && msg.sender != rewardDistributor) revert Unauthorized();
        _;
    }

    constructor(address _mezo, address _musdReward, address _rewardDistributor) {
        if (_mezo == address(0) || _musdReward == address(0)) revert InvalidParameters();
        mezo = IERC20Minimal(_mezo);
        musdReward = IERC20Minimal(_musdReward);
        owner = msg.sender;
        rewardDistributor = _rewardDistributor == address(0) ? msg.sender : _rewardDistributor;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidParameters();
        address prev = owner;
        owner = newOwner;
        emit OwnershipTransferred(prev, newOwner);
    }

    function setRewardDistributor(address newDistributor) external onlyOwner {
        if (newDistributor == address(0)) revert InvalidParameters();
        address prev = rewardDistributor;
        rewardDistributor = newDistributor;
        emit RewardDistributorUpdated(prev, newDistributor);
    }

    function setGuardrails(uint32 _minHoldSeconds, bool _emergencyPause) external onlyOwner {
        if (_minHoldSeconds > MAX_HOLD_SECONDS) revert InvalidParameters();
        minHoldSeconds = _minHoldSeconds;
        emergencyPause = _emergencyPause;
        emit GuardrailsUpdated(_minHoldSeconds, _emergencyPause);
    }

    function tierMultiplierBps(uint8 tierId) public pure returns (uint16) {
        if (tierId == TIER_FLEXIBLE) return MULTIPLIER_FLEXIBLE_BPS;
        if (tierId == TIER_30_DAYS) return MULTIPLIER_30_DAYS_BPS;
        if (tierId == TIER_90_DAYS) return MULTIPLIER_90_DAYS_BPS;
        revert InvalidTier();
    }

    function tierDuration(uint8 tierId) public pure returns (uint64) {
        if (tierId == TIER_FLEXIBLE) return 0;
        if (tierId == TIER_30_DAYS) return LOCK_30_DAYS;
        if (tierId == TIER_90_DAYS) return LOCK_90_DAYS;
        revert InvalidTier();
    }

    function _updateReward(address account) internal {
        if (account != address(0)) {
            rewardsAccruedMusd[account] = earnedMusd(account);
            userRewardPerWeightPaid[account] = rewardPerWeightStored;
        }
    }

    /**
     * @notice Total pending + accrued MUSD rewards claimable by `account`.
     */
    function earnedMusd(address account) public view returns (uint256) {
        StakePosition storage pos = positions[account];
        uint256 delta = rewardPerWeightStored - userRewardPerWeightPaid[account];
        uint256 accrued = (pos.weightedPower * delta) / PRECISION;
        return rewardsAccruedMusd[account] + accrued;
    }

    /**
     * @notice Flash-loan-resistant coordination weight eligible for Credit Council APR discounts.
     *         Returns 0 until the staker's minimum hold period has elapsed.
     */
    function coordinationPowerOf(address account) external view returns (uint256) {
        StakePosition storage pos = positions[account];
        if (pos.principalMezo == 0) return 0;
        if (block.timestamp < uint256(pos.lastStakeTimestamp) + minHoldSeconds) return 0;
        return pos.weightedPower;
    }

    /**
     * @notice Returns full stake position and unlock readiness for a wallet.
     */
    function getPosition(address account)
        external
        view
        returns (
            uint256 principalMezo,
            uint256 weightedPower,
            uint64 unlockAt,
            uint64 lastStakeTimestamp,
            uint8 tierId,
            uint256 pendingRewardsMusd,
            uint256 activeCoordinationPower,
            bool isLocked
        )
    {
        StakePosition storage pos = positions[account];
        principalMezo = pos.principalMezo;
        weightedPower = pos.weightedPower;
        unlockAt = pos.unlockAt;
        lastStakeTimestamp = pos.lastStakeTimestamp;
        tierId = pos.tierId;
        pendingRewardsMusd = earnedMusd(account);
        bool holdElapsed = pos.principalMezo > 0 &&
            block.timestamp >= uint256(pos.lastStakeTimestamp) + minHoldSeconds;
        activeCoordinationPower = holdElapsed ? pos.weightedPower : 0;
        isLocked = pos.principalMezo > 0 && pos.unlockAt > block.timestamp;
    }

    /**
     * @notice Compact vault-level telemetry for backend/frontend indexing in one RPC call.
     */
    function vaultOverview()
        external
        view
        returns (
            uint256 _totalStakedMezo,
            uint256 _totalWeightedPower,
            uint256 _totalRewardsDistributedMusd,
            uint256 _rewardReserveMusd,
            uint32 _minHoldSeconds,
            bool _emergencyPause
        )
    {
        return (
            totalStakedMezo,
            totalWeightedPower,
            totalRewardsDistributedMusd,
            rewardReserveMusd,
            minHoldSeconds,
            emergencyPause
        );
    }

    /**
     * @notice Stake MEZO tokens into Main Island Vault under Flexible (1.0x), 30-day (1.5x), or 90-day (2.5x).
     */
    function stakeMezo(uint256 amount, uint8 tierId) external nonReentrant {
        if (emergencyPause) revert VaultPaused();
        if (amount == 0) revert InvalidAmount();

        uint16 multiplier = tierMultiplierBps(tierId);
        uint64 duration = tierDuration(tierId);

        _updateReward(msg.sender);

        StakePosition storage pos = positions[msg.sender];
        if (pos.principalMezo > 0 && block.timestamp < pos.unlockAt && tierId < pos.tierId) {
            revert CannotDowngradeActiveLock();
        }

        bool ok = mezo.transferFrom(msg.sender, address(this), amount);
        if (!ok) revert TransferFailed();

        uint256 prevPower = pos.weightedPower;
        uint256 newPrincipal = pos.principalMezo + amount;
        uint256 newPower = (newPrincipal * multiplier) / BPS_DENOM;

        pos.principalMezo = newPrincipal;
        pos.weightedPower = newPower;
        pos.tierId = tierId;
        pos.lastStakeTimestamp = uint64(block.timestamp);

        if (duration == 0) {
            pos.unlockAt = 0;
        } else {
            uint64 candidateUnlock = uint64(block.timestamp + duration);
            pos.unlockAt = candidateUnlock > pos.unlockAt ? candidateUnlock : pos.unlockAt;
        }

        totalStakedMezo += amount;
        totalWeightedPower = totalWeightedPower - prevPower + newPower;

        emit MezoStaked(
            msg.sender,
            amount,
            tierId,
            newPrincipal,
            newPower,
            pos.unlockAt
        );
    }

    /**
     * @notice Unstake principal MEZO once lock duration (and minHoldSeconds) has elapsed.
     */
    function unstakeMezo(uint256 amount) external nonReentrant {
        if (amount == 0) revert InvalidAmount();

        StakePosition storage pos = positions[msg.sender];
        if (pos.principalMezo < amount) revert InsufficientStakedBalance();
        if (block.timestamp < uint256(pos.lastStakeTimestamp) + minHoldSeconds) {
            revert HoldPeriodNotElapsed();
        }
        if (pos.unlockAt > 0 && block.timestamp < pos.unlockAt) {
            revert LockNotExpired();
        }

        _updateReward(msg.sender);

        uint256 prevPower = pos.weightedPower;
        uint256 newPrincipal = pos.principalMezo - amount;
        uint256 newPower = newPrincipal == 0
            ? 0
            : (newPrincipal * tierMultiplierBps(pos.tierId)) / BPS_DENOM;

        pos.principalMezo = newPrincipal;
        pos.weightedPower = newPower;
        if (newPrincipal == 0) {
            pos.unlockAt = 0;
            pos.tierId = TIER_FLEXIBLE;
        }

        totalStakedMezo -= amount;
        totalWeightedPower = totalWeightedPower - prevPower + newPower;

        bool ok = mezo.transfer(msg.sender, amount);
        if (!ok) revert TransferFailed();

        emit MezoUnstaked(msg.sender, amount, newPrincipal, newPower);
    }

    /**
     * @notice Claim accumulated MUSD protocol fee-share rewards.
     */
    function claimRewards() external nonReentrant returns (uint256 payout) {
        StakePosition storage pos = positions[msg.sender];
        if (
            pos.lastStakeTimestamp > 0 &&
            block.timestamp < uint256(pos.lastStakeTimestamp) + minHoldSeconds
        ) {
            revert HoldPeriodNotElapsed();
        }

        _updateReward(msg.sender);
        payout = rewardsAccruedMusd[msg.sender];
        if (payout == 0) revert NoRewardsToClaim();
        if (payout > rewardReserveMusd) {
            payout = rewardReserveMusd;
        }

        rewardsAccruedMusd[msg.sender] -= payout;
        rewardReserveMusd -= payout;

        bool ok = musdReward.transfer(msg.sender, payout);
        if (!ok) revert TransferFailed();

        emit RewardClaimedMusd(msg.sender, payout);
    }

    /**
     * @notice Fund MUSD protocol fee-share rewards across all currently active weighted stakers.
     */
    function notifyRewardMusd(uint256 musdAmount) external nonReentrant onlyRewardDistributor {
        if (musdAmount == 0) revert InvalidAmount();
        if (totalWeightedPower == 0) revert NoActiveStakers();

        bool ok = musdReward.transferFrom(msg.sender, address(this), musdAmount);
        if (!ok) revert TransferFailed();

        rewardPerWeightStored += (musdAmount * PRECISION) / totalWeightedPower;
        totalRewardsDistributedMusd += musdAmount;
        rewardReserveMusd += musdAmount;

        emit RewardNotifiedMusd(msg.sender, musdAmount, rewardPerWeightStored);
    }
}
