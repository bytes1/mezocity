// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/AgentRegistry.sol";
import "../src/PolicyVault.sol";
import "../src/MezoDCAEngine.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

/**
 * @title DeployMezoTestnet
 * @notice Foundry deployment script for Mezo Testnet (Chain ID: 31611, RPC: https://rpc.test.mezo.org)
 */
contract DeployMezoTestnet {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run()
        external
        returns (
            AgentRegistry registry,
            PolicyVault vault,
            MezoDCAEngine dcaEngine
        )
    {
        vm.startBroadcast();

        registry = new AgentRegistry();
        vault = new PolicyVault(address(registry));
        dcaEngine = new MezoDCAEngine(payable(address(vault)), address(registry));

        registry.setPolicyVault(address(vault));

        // 1. AURA — Head Orchestrator Agent
        registry.registerAgent(
            "Aura",
            "Head Orchestrator & Strategy Architect",
            address(0x3161100000000000000000000000000000000001),
            "https://mezocity.4lpha.tech/.well-known/agent-card.json#aura",
            "https://mezocity.4lpha.tech/api/mcp",
            keccak256("4LPHA_AURA_HEAD_ORCHESTRATOR_V2")
        );

        // 2. KRONOS — Autonomous BTC DCA & Yield Agent
        registry.registerAgent(
            "Kronos",
            "Autonomous BTC DCA & Accumulation Agent",
            address(0x3161100000000000000000000000000000000002),
            "https://mezocity.4lpha.tech/.well-known/agent-card.json#kronos",
            "https://mezocity.4lpha.tech/api/mcp",
            keccak256("4LPHA_KRONOS_DCA_ENGINE_V2")
        );

        // 3. PATCH — Self-Healing Error Rectifier Agent
        registry.registerAgent(
            "Patch",
            "Autonomous Error Rectifier & Tx Healer",
            address(0x3161100000000000000000000000000000000003),
            "https://mezocity.4lpha.tech/.well-known/agent-card.json#patch",
            "https://mezocity.4lpha.tech/api/mcp",
            keccak256("4LPHA_PATCH_ERROR_RECTIFIER_V2")
        );

        // 4. SENTINEL — Policy Vault Guardrail Enforcer
        registry.registerAgent(
            "Sentinel",
            "Policy Vault Guardrail & Security Auditor",
            address(0x3161100000000000000000000000000000000004),
            "https://mezocity.4lpha.tech/.well-known/agent-card.json#sentinel",
            "https://mezocity.4lpha.tech/api/mcp",
            keccak256("4LPHA_SENTINEL_POLICY_GUARD_V2")
        );

        // Create default initial DCA Schedule on Mezo Testnet
        dcaEngine.createDCASchedule(
            "Mezo BTC Accumulator & stBTC Yield Auto-DCA",
            "stBTC-MEZO-VAULT",
            0.25 ether,
            3600,
            50,
            12
        );

        vm.stopBroadcast();
    }
}
