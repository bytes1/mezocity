// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/AgentRegistry.sol";
import "../src/PolicyVault.sol";
import "../src/MezoPredictionArena.sol";

interface Vm {
    function envUint(string calldata name) external view returns (uint256);
    function startBroadcast(uint256 privateKey) external;
    function startBroadcast() external;
    function stopBroadcast() external;
}

/**
 * @title DeployMezoTestnet
 * @notice Foundry deployment script for Mezo Testnet (Chain ID: 31611, RPC: https://rpc.test.mezo.org)
 *
 * Usage in WSL:
 *   cd /mnt/e/frontend/mezocity/contracts
 *   forge script script/DeployMezoTestnet.s.sol:DeployMezoTestnet --rpc-url https://rpc.test.mezo.org --broadcast
 */
contract DeployMezoTestnet {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function run()
        external
        returns (
            AgentRegistry registry,
            PolicyVault vault,
            MezoPredictionArena arena
        )
    {
        vm.startBroadcast();

        registry = new AgentRegistry();
        vault = new PolicyVault(address(registry));
        arena = new MezoPredictionArena();

        registry.setPolicyVault(address(vault));

        // Seed the core Polly.town x 4lpha crew on Mezo Testnet
        registry.registerAgent(
            "Polly",
            "Council Chair & Execution Lead",
            address(0x3161100000000000000000000000000000000001),
            "https://mezocity.4lpha.tech/.well-known/agent-card.json#polly",
            "https://mezocity.4lpha.tech/api/mcp",
            keccak256("4LPHA_POLLY_COUNCIL_V1")
        );

        registry.registerAgent(
            "Pip",
            "Web, X & Mezo Mempool Signal Listener",
            address(0x3161100000000000000000000000000000000002),
            "https://mezocity.4lpha.tech/.well-known/agent-card.json#pip",
            "https://mezocity.4lpha.tech/api/mcp",
            keccak256("4LPHA_PIP_LISTENER_V1")
        );

        registry.registerAgent(
            "Hoot",
            "On-Chain Fact Checker & Proof Verifier",
            address(0x3161100000000000000000000000000000000003),
            "https://mezocity.4lpha.tech/.well-known/agent-card.json#hoot",
            "https://mezocity.4lpha.tech/api/mcp",
            keccak256("4LPHA_HOOT_FACTCHECK_V1")
        );

        registry.registerAgent(
            "Brutus",
            "Bull Thesis Advocate & Momentum Strategist",
            address(0x3161100000000000000000000000000000000004),
            "https://mezocity.4lpha.tech/.well-known/agent-card.json#brutus",
            "https://mezocity.4lpha.tech/api/mcp",
            keccak256("4LPHA_BRUTUS_BULL_V1")
        );

        registry.registerAgent(
            "Bramble",
            "Bear Thesis Contrarian & Tail-Risk Auditor",
            address(0x3161100000000000000000000000000000000005),
            "https://mezocity.4lpha.tech/.well-known/agent-card.json#bramble",
            "https://mezocity.4lpha.tech/api/mcp",
            keccak256("4LPHA_BRAMBLE_BEAR_V1")
        );

        registry.registerAgent(
            "Sentinel",
            "Policy Vault Guardrail Enforcer",
            address(0x3161100000000000000000000000000000000006),
            "https://mezocity.4lpha.tech/.well-known/agent-card.json#sentinel",
            "https://mezocity.4lpha.tech/api/mcp",
            keccak256("4LPHA_SENTINEL_POLICY_V1")
        );

        registry.registerAgent(
            "SatoshiQuant",
            "Mezo BTC Yield & Liquidity Rebalancer",
            address(0x3161100000000000000000000000000000000007),
            "https://mezocity.4lpha.tech/.well-known/agent-card.json#satoshiquant",
            "https://mezocity.4lpha.tech/api/mcp",
            keccak256("4LPHA_SATOSHI_QUANT_V1")
        );

        arena.createMarket(
            "Will Mezo Testnet daily active BTC Policy Vault transactions exceed 250k this week?",
            "Mezo L2",
            7900,
            7 days
        );

        arena.createMarket(
            "Will BTC/USD break above $105,000 before Friday 16:00 UTC settlement?",
            "Macro BTC",
            7400,
            5 days
        );

        vm.stopBroadcast();
    }
}

