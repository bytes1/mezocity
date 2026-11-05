// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IERC8004AgentRegistry.sol";

/**
 * @title PolicyVault
 * @notice 4lpha "Verify, Then Trust" Policy-Locked Autonomous Execution Vault for Mezo Testnet (BTC 18 decimals).
 *         Enforces mathematical risk guardrails on every autonomous agent action before capital can move.
 */
contract PolicyVault {
    enum ActionType {
        LONG_POSITION,
        SHORT_POSITION,
        REBALANCE_BASKET,
        PREDICTION_BET,
        BTC_YIELD_ALLOCATION
    }

    struct PolicyConfig {
        uint16 maxSingleTradeBps;   // Max % of vault per trade in bps (e.g., 1000 = 10.00%)
        uint16 maxDailyDrawdownBps; // Max daily drawdown allowed in bps (e.g., 500 = 5.00%)
        uint16 minConfidenceBps;    // Minimum Council confidence score required (e.g., 7000 = 70.00%)
        uint32 cooldownSeconds;     // Minimum cooldown between executions
        bool emergencyLock;         // Hard kill-switch locking all agent actions
    }

    struct ExecutionRecord {
        uint256 executionId;
        uint256 agentId;
        ActionType actionType;
        string marketTicker;
        uint256 amountWei;          // In Mezo BTC (18 decimals)
        uint16 confidenceBps;
        bytes32 reasoningProofHash; // Hash of Pip/Hoot/Brutus/Bramble/Polly Council reasoning
        bool passedPolicy;
        string violationReason;
        uint64 timestamp;
    }

    address public owner;
    IERC8004AgentRegistry public immutable registry;
    PolicyConfig public policy;

    uint256 public totalPrincipalDeposited;
    uint256 public totalActiveAllocated;
    uint256 public dailyRealizedLoss;
    uint64 public currentDayTimestamp;
    uint64 public lastExecutionTimestamp;

    mapping(address => uint256) public userDeposits;
    ExecutionRecord[] public executionHistory;

    event Deposited(address indexed user, uint256 amountBtcWei, uint256 newVaultBalance);
    event Withdrawn(address indexed user, uint256 amountBtcWei, uint256 newVaultBalance);
    event PolicyUpdated(
        uint16 maxSingleTradeBps,
        uint16 maxDailyDrawdownBps,
        uint16 minConfidenceBps,
        uint32 cooldownSeconds,
        bool emergencyLock
    );
    event AutonomousActionExecuted(
        uint256 indexed executionId,
        uint256 indexed agentId,
        ActionType actionType,
        string marketTicker,
        uint256 amountWei,
        uint16 confidenceBps,
        bytes32 reasoningProofHash
    );
    event PolicyViolationBlocked(
        uint256 indexed executionId,
        uint256 indexed agentId,
        string marketTicker,
        uint256 attemptedAmountWei,
        uint16 confidenceBps,
        string violationReason
    );
    event PositionSettled(uint256 indexed executionId, int256 pnlWei, uint256 newVaultEquity);

    error Unauthorized();
    error InvalidAmount();
    error InsufficientUserBalance();
    error InvalidPolicyParameters();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address _registry) {
        owner = msg.sender;
        registry = IERC8004AgentRegistry(_registry);

        // Default 4lpha Policy Guardrails:
        // - 10% max single trade (1000 bps)
        // - 5% max daily drawdown (500 bps)
        // - 70% minimum Council confidence (7000 bps)
        // - 15 second cooldown on testnet
        policy = PolicyConfig({
            maxSingleTradeBps: 1000,
            maxDailyDrawdownBps: 500,
            minConfidenceBps: 7000,
            cooldownSeconds: 15,
            emergencyLock: false
        });

        currentDayTimestamp = uint64(block.timestamp);
    }

    /**
     * @notice Deposit Mezo Testnet BTC (native gas token, 18 decimals) into the Policy-Locked Vault
     */
    function deposit() external payable {
        if (msg.value == 0) revert InvalidAmount();
        userDeposits[msg.sender] += msg.value;
        totalPrincipalDeposited += msg.value;
        emit Deposited(msg.sender, msg.value, vaultTotalEquity());
    }

    /**
     * @notice Withdraw Mezo Testnet BTC from the Vault (custody always stays with user)
     */
    function withdraw(uint256 amountWei) external {
        if (amountWei == 0) revert InvalidAmount();
        if (userDeposits[msg.sender] < amountWei) revert InsufficientUserBalance();

        userDeposits[msg.sender] -= amountWei;
        totalPrincipalDeposited -= amountWei;

        (bool ok, ) = msg.sender.call{value: amountWei}("");
        require(ok, "BTC transfer failed");

        emit Withdrawn(msg.sender, amountWei, vaultTotalEquity());
    }

    /**
     * @notice Update the mathematical guardrails of the Policy Vault
     */
    function updatePolicy(
        uint16 maxSingleTradeBps,
        uint16 maxDailyDrawdownBps,
        uint16 minConfidenceBps,
        uint32 cooldownSeconds,
        bool emergencyLock
    ) external {
        if (maxSingleTradeBps == 0 || maxSingleTradeBps > 5000) revert InvalidPolicyParameters();
        if (maxDailyDrawdownBps == 0 || maxDailyDrawdownBps > 5000) revert InvalidPolicyParameters();
        if (minConfidenceBps < 5000 || minConfidenceBps > 9900) revert InvalidPolicyParameters();

        policy = PolicyConfig({
            maxSingleTradeBps: maxSingleTradeBps,
            maxDailyDrawdownBps: maxDailyDrawdownBps,
            minConfidenceBps: minConfidenceBps,
            cooldownSeconds: cooldownSeconds,
            emergencyLock: emergencyLock
        });

        emit PolicyUpdated(
            maxSingleTradeBps,
            maxDailyDrawdownBps,
            minConfidenceBps,
            cooldownSeconds,
            emergencyLock
        );
    }

    /**
     * @notice Verify policy guardrails for a proposed agent action without mutating state
     */
    function checkPolicyGuardrails(
        uint256 agentId,
        uint256 amountWei,
        uint16 confidenceBps
    ) public view returns (bool allowed, string memory reason) {
        if (policy.emergencyLock) {
            return (false, "POLICY_LOCKED: Emergency kill-switch is active");
        }

        IERC8004AgentRegistry.AgentProfile memory agent = registry.getAgent(agentId);
        if (agent.agentId == 0 || !agent.active) {
            return (false, "ERC8004_UNAUTHORIZED: Agent not active in registry");
        }

        if (
            lastExecutionTimestamp != 0 &&
            block.timestamp < lastExecutionTimestamp + policy.cooldownSeconds
        ) {
            return (false, "COOLDOWN_ACTIVE: Minimum execution interval not elapsed");
        }

        if (confidenceBps < policy.minConfidenceBps) {
            return (false, "LOW_CONFIDENCE: Council consensus below minConfidenceBps guardrail");
        }

        uint256 equity = vaultTotalEquity();
        if (equity == 0) {
            return (false, "EMPTY_VAULT: No BTC liquidity in vault");
        }

        uint256 maxAllowedTrade = (equity * policy.maxSingleTradeBps) / 10000;
        if (amountWei > maxAllowedTrade) {
            return (false, "MAX_TRADE_EXCEEDED: Trade size exceeds maxSingleTradeBps guardrail");
        }

        uint256 maxDailyLossAllowed = (equity * policy.maxDailyDrawdownBps) / 10000;
        if (dailyRealizedLoss >= maxDailyLossAllowed) {
            return (false, "DRAWDOWN_CAP_HIT: Daily drawdown limit reached");
        }

        return (true, "VERIFIED_OK");
    }

    /**
     * @notice Execute an autonomous agent strategy action fenced by the Policy Vault.
     *         Records both successful executions AND blocked policy violations on-chain for auditability.
     */
    function executePolicyFencedAction(
        uint256 agentId,
        ActionType actionType,
        string calldata marketTicker,
        uint256 amountWei,
        uint16 confidenceBps,
        bytes32 reasoningProofHash
    ) external returns (bool passed, uint256 executionId) {
        _rolloverDailyWindowIfNeeded();

        (bool allowed, string memory reason) = checkPolicyGuardrails(agentId, amountWei, confidenceBps);
        executionId = executionHistory.length;

        if (!allowed) {
            executionHistory.push(
                ExecutionRecord({
                    executionId: executionId,
                    agentId: agentId,
                    actionType: actionType,
                    marketTicker: marketTicker,
                    amountWei: amountWei,
                    confidenceBps: confidenceBps,
                    reasoningProofHash: reasoningProofHash,
                    passedPolicy: false,
                    violationReason: reason,
                    timestamp: uint64(block.timestamp)
                })
            );

            emit PolicyViolationBlocked(
                executionId,
                agentId,
                marketTicker,
                amountWei,
                confidenceBps,
                reason
            );
            return (false, executionId);
        }

        lastExecutionTimestamp = uint64(block.timestamp);
        totalActiveAllocated += amountWei;

        executionHistory.push(
            ExecutionRecord({
                executionId: executionId,
                agentId: agentId,
                actionType: actionType,
                marketTicker: marketTicker,
                amountWei: amountWei,
                confidenceBps: confidenceBps,
                reasoningProofHash: reasoningProofHash,
                passedPolicy: true,
                violationReason: "",
                timestamp: uint64(block.timestamp)
            })
        );

        emit AutonomousActionExecuted(
            executionId,
            agentId,
            actionType,
            marketTicker,
            amountWei,
            confidenceBps,
            reasoningProofHash
        );

        return (true, executionId);
    }

    /**
     * @notice Record settlement PnL of an autonomous position and update daily drawdown metrics
     */
    function settleExecutionPnL(uint256 executionId, int256 pnlWei) external {
        _rolloverDailyWindowIfNeeded();
        ExecutionRecord storage rec = executionHistory[executionId];
        require(rec.passedPolicy, "Cannot settle blocked action");

        if (totalActiveAllocated >= rec.amountWei) {
            totalActiveAllocated -= rec.amountWei;
        } else {
            totalActiveAllocated = 0;
        }

        if (pnlWei < 0) {
            uint256 loss = uint256(-pnlWei);
            dailyRealizedLoss += loss;
        }

        emit PositionSettled(executionId, pnlWei, vaultTotalEquity());
    }

    function vaultTotalEquity() public view returns (uint256) {
        return address(this).balance;
    }

    function totalExecutions() external view returns (uint256) {
        return executionHistory.length;
    }

    function getRecentExecutions(uint256 count) external view returns (ExecutionRecord[] memory list) {
        uint256 total = executionHistory.length;
        if (count > total) count = total;
        list = new ExecutionRecord[](count);
        for (uint256 i = 0; i < count; i++) {
            list[i] = executionHistory[total - 1 - i];
        }
    }

    function _rolloverDailyWindowIfNeeded() internal {
        if (block.timestamp >= currentDayTimestamp + 1 days) {
            currentDayTimestamp = uint64(block.timestamp);
            dailyRealizedLoss = 0;
        }
    }

    receive() external payable {
        userDeposits[msg.sender] += msg.value;
        totalPrincipalDeposited += msg.value;
        emit Deposited(msg.sender, msg.value, address(this).balance);
    }
}

