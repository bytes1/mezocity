// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/AgentRegistry.sol";
import "../src/PolicyVault.sol";
import "../src/MezoDCAEngine.sol";

interface Vm {
    function prank(address) external;
    function deal(address who, uint256 newBalance) external;
    function warp(uint256 newTimestamp) external;
}

/**
 * @title MezoAlphaTest
 * @notice Foundry test suite for the 4-Agent MezoCity architecture (Head Agent, DCA Agent, Error Rectifier Agent, Policy Vault Agent)
 */
contract MezoAlphaTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    AgentRegistry public registry;
    PolicyVault public vault;
    MezoDCAEngine public dcaEngine;

    address public auraOp = address(0xA01);
    address public kronosOp = address(0xA02);
    address public patchOp = address(0xA03);
    address public sentinelOp = address(0xA04);
    address public depositor = address(0xD00D);

    uint256 public auraId;
    uint256 public kronosId;
    uint256 public patchId;
    uint256 public sentinelId;

    function setUp() public {
        registry = new AgentRegistry();
        vault = new PolicyVault(address(registry));
        dcaEngine = new MezoDCAEngine(payable(address(vault)), address(registry));

        registry.setPolicyVault(address(vault));

        auraId = registry.registerAgent(
            "Aura",
            "Head Orchestrator & Strategy Architect",
            auraOp,
            "https://mezocity.4lpha.tech/.well-known/agent-card.json#aura",
            "https://mezocity.4lpha.tech/api/mcp",
            keccak256("AURA_V2")
        );

        kronosId = registry.registerAgent(
            "Kronos",
            "Autonomous BTC DCA & Accumulation Agent",
            kronosOp,
            "https://mezocity.4lpha.tech/.well-known/agent-card.json#kronos",
            "https://mezocity.4lpha.tech/api/mcp",
            keccak256("KRONOS_V2")
        );

        patchId = registry.registerAgent(
            "Patch",
            "Autonomous Error Rectifier & Tx Healer",
            patchOp,
            "https://mezocity.4lpha.tech/.well-known/agent-card.json#patch",
            "https://mezocity.4lpha.tech/api/mcp",
            keccak256("PATCH_V2")
        );

        sentinelId = registry.registerAgent(
            "Sentinel",
            "Policy Vault Guardrail & Security Auditor",
            sentinelOp,
            "https://mezocity.4lpha.tech/.well-known/agent-card.json#sentinel",
            "https://mezocity.4lpha.tech/api/mcp",
            keccak256("SENTINEL_V2")
        );

        vm.deal(depositor, 10 ether);
    }

    function testFourCoreAgentsRegistered() public view {
        require(registry.totalAgents() == 4, "Should have exactly 4 core agents");
    }

    function testDCAExecutionAndSelfHealingErrorRectification() public {
        // 1. User deposits 5 BTC into PolicyVault (10% maxSingleTradeBps = 0.50 BTC max per slice)
        vm.prank(depositor);
        vault.deposit{value: 5 ether}();
        vm.warp(100);

        // 2. Create a DCA Schedule with an oversized slice (1.20 BTC = 24% of vault > 10% cap)
        uint256 schedId = dcaEngine.createDCASchedule(
            "Aggressive BTC DCA",
            "stBTC-MEZO",
            1.2 ether,
            3600,
            50,
            10
        );

        // 3. Kronos attempts to execute the 1.20 BTC slice -> Blocked by PolicyVault!
        (bool passedInitial, ) = dcaEngine.executeDCASlice(
            schedId,
            kronosId,
            8500,
            keccak256("INITIAL_DCA_ATTEMPT")
        );
        require(!passedInitial, "Oversized DCA slice must be blocked initially");

        // 4. Patch (Error Rectifier Agent) diagnoses MAX_TRADE_EXCEEDED and rectifies slice to 0.40 BTC (8% <= 10% cap)
        vm.warp(200);
        (bool passedRectified, uint256 rectId) = dcaEngine.rectifyAndExecuteDCASlice(
            schedId,
            patchId,
            0.4 ether,
            8800,
            "MAX_TRADE_EXCEEDED: 1.20 BTC (24%) > 0.50 BTC (10% PolicyVault cap)",
            "Patch AI resized DCA slice from 1.20 BTC to 0.40 BTC (8.0% of vault) and split remaining into 3 sub-intervals.",
            keccak256("RECTIFIED_BY_PATCH_AI")
        );

        require(passedRectified, "Rectified DCA slice must succeed");
        require(rectId == 0, "First rectification log ID should be 0");
        require(vault.totalActiveAllocated() == 0.4 ether, "0.40 BTC should now be allocated");
    }
}
