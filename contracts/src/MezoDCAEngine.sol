// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PolicyVault.sol";
import "./interfaces/IERC8004AgentRegistry.sol";

/**
 * @title MezoDCAEngine
 * @notice Autonomous Dollar-Cost Averaging (DCA) & Self-Healing Error Rectification Engine on Mezo Testnet (Chain ID: 31611).
 *         Works alongside PolicyVault.sol so that:
 *         1. Aura (Head Agent) & Kronos (DCA Agent) schedule and trigger periodic BTC DCA executions.
 *         2. If an execution payload violates a PolicyVault guardrail or slippage limit, Patch (Error Rectifier Agent)
 *            diagnoses the revert condition, rectifies the parameters on-chain, and executes the healed order.
 */
contract MezoDCAEngine {
    struct DCASchedule {
        uint256 scheduleId;
        address creator;
        string strategyName;       // e.g. "Accumulate tBTC -> stBTC Yield Vault"
        string targetAsset;        // e.g. "stBTC-MEZO"
        uint256 sliceAmountWei;    // Amount of BTC per DCA interval (18 decimals)
        uint32 intervalSeconds;    // Seconds between DCA executions
        uint16 maxSlippageBps;     // Max allowed slippage in bps (e.g., 100 = 1.00%)
        uint32 totalSlices;
        uint32 executedSlices;
        uint64 lastExecutionTime;
        bool active;
    }

    struct RectificationLog {
        uint256 rectificationId;
        uint256 scheduleId;
        uint256 rectifierAgentId;  // Patch (Error Rectifier Agent)
        string originalError;      // e.g. "MAX_TRADE_EXCEEDED: 22.0% > 10.0% PolicyVault cap"
        uint256 originalAmountWei;
        uint256 rectifiedAmountWei;
        string aiDiagnosis;        // AI model root-cause & fix summary
        bytes32 proofHash;
        uint64 timestamp;
    }

    address public owner;
    PolicyVault public immutable policyVault;
    IERC8004AgentRegistry public immutable registry;

    DCASchedule[] public schedules;
    RectificationLog[] public rectifications;

    event DCAScheduleCreated(
        uint256 indexed scheduleId,
        address indexed creator,
        string strategyName,
        string targetAsset,
        uint256 sliceAmountWei,
        uint32 intervalSeconds,
        uint32 totalSlices
    );

    event DCASliceExecuted(
        uint256 indexed scheduleId,
        uint256 indexed dcaAgentId,
        uint256 executionId,
        uint256 sliceAmountWei,
        uint32 executedSlices,
        bytes32 aiProofHash
    );

    event ErrorRectifiedAndExecuted(
        uint256 indexed rectificationId,
        uint256 indexed scheduleId,
        uint256 indexed rectifierAgentId,
        string originalError,
        uint256 originalAmountWei,
        uint256 rectifiedAmountWei,
        bytes32 proofHash
    );

    constructor(address payable _policyVault, address _registry) {
        owner = msg.sender;
        policyVault = PolicyVault(_policyVault);
        registry = IERC8004AgentRegistry(_registry);
    }

    function createDCASchedule(
        string calldata strategyName,
        string calldata targetAsset,
        uint256 sliceAmountWei,
        uint32 intervalSeconds,
        uint16 maxSlippageBps,
        uint32 totalSlices
    ) external returns (uint256 scheduleId) {
        require(sliceAmountWei > 0, "Invalid slice amount");
        require(totalSlices > 0, "Invalid total slices");

        scheduleId = schedules.length;
        schedules.push(
            DCASchedule({
                scheduleId: scheduleId,
                creator: msg.sender,
                strategyName: strategyName,
                targetAsset: targetAsset,
                sliceAmountWei: sliceAmountWei,
                intervalSeconds: intervalSeconds,
                maxSlippageBps: maxSlippageBps,
                totalSlices: totalSlices,
                executedSlices: 0,
                lastExecutionTime: 0,
                active: true
            })
        );

        emit DCAScheduleCreated(
            scheduleId,
            msg.sender,
            strategyName,
            targetAsset,
            sliceAmountWei,
            intervalSeconds,
            totalSlices
        );
    }

    /**
     * @notice Execute a scheduled DCA slice through the PolicyVault.
     *         If the configured slice violates a PolicyVault guardrail, returns passed=false so Patch (Error Rectifier) can heal it.
     */
    function executeDCASlice(
        uint256 scheduleId,
        uint256 dcaAgentId,
        uint16 confidenceBps,
        bytes32 aiProofHash
    ) external returns (bool passed, uint256 executionId) {
        require(scheduleId < schedules.length, "Invalid schedule");
        DCASchedule storage sched = schedules[scheduleId];
        require(sched.active, "Schedule inactive");
        require(sched.executedSlices < sched.totalSlices, "Schedule completed");

        (passed, executionId) = policyVault.executePolicyFencedAction(
            dcaAgentId,
            PolicyVault.ActionType.REBALANCE_BASKET,
            sched.targetAsset,
            sched.sliceAmountWei,
            confidenceBps,
            aiProofHash
        );

        if (passed) {
            sched.executedSlices += 1;
            sched.lastExecutionTime = uint64(block.timestamp);
            if (sched.executedSlices >= sched.totalSlices) {
                sched.active = false;
            }
            emit DCASliceExecuted(
                scheduleId,
                dcaAgentId,
                executionId,
                sched.sliceAmountWei,
                sched.executedSlices,
                aiProofHash
            );
        }
    }

    /**
     * @notice Called by Patch (Error Rectifier Agent) after diagnosing a PolicyVault or slippage error.
     *         Automatically resizes the DCA slice to comply with the PolicyVault mathematical cap and executes it.
     */
    function rectifyAndExecuteDCASlice(
        uint256 scheduleId,
        uint256 rectifierAgentId,
        uint256 rectifiedAmountWei,
        uint16 rectifiedConfidenceBps,
        string calldata originalError,
        string calldata aiDiagnosis,
        bytes32 proofHash
    ) external returns (bool passed, uint256 rectificationId) {
        require(scheduleId < schedules.length, "Invalid schedule");
        DCASchedule storage sched = schedules[scheduleId];
        require(sched.active, "Schedule inactive");

        uint256 originalAmount = sched.sliceAmountWei;
        sched.sliceAmountWei = rectifiedAmountWei;

        (passed, ) = policyVault.executePolicyFencedAction(
            rectifierAgentId,
            PolicyVault.ActionType.REBALANCE_BASKET,
            sched.targetAsset,
            rectifiedAmountWei,
            rectifiedConfidenceBps,
            proofHash
        );

        require(passed, "Rectified slice still blocked by PolicyVault");

        sched.executedSlices += 1;
        sched.lastExecutionTime = uint64(block.timestamp);
        if (sched.executedSlices >= sched.totalSlices) {
            sched.active = false;
        }

        rectificationId = rectifications.length;
        RectificationLog storage logEntry = rectifications.push();
        logEntry.rectificationId = rectificationId;
        logEntry.scheduleId = scheduleId;
        logEntry.rectifierAgentId = rectifierAgentId;
        logEntry.originalError = originalError;
        logEntry.originalAmountWei = originalAmount;
        logEntry.rectifiedAmountWei = rectifiedAmountWei;
        logEntry.aiDiagnosis = aiDiagnosis;
        logEntry.proofHash = proofHash;
        logEntry.timestamp = uint64(block.timestamp);

        emit ErrorRectifiedAndExecuted(
            rectificationId,
            scheduleId,
            rectifierAgentId,
            originalError,
            originalAmount,
            rectifiedAmountWei,
            proofHash
        );
    }

    function getAllSchedules() external view returns (DCASchedule[] memory) {
        return schedules;
    }

    function getAllRectifications() external view returns (RectificationLog[] memory) {
        return rectifications;
    }
}

