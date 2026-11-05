// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/AgentRegistry.sol";
import "../src/PolicyVault.sol";
import "../src/MezoPredictionArena.sol";

interface Vm {
    function prank(address) external;
    function deal(address who, uint256 newBalance) external;
    function warp(uint256 newTimestamp) external;
}

/**
 * @title MezoAlphaTest
 * @notice Foundry unit & integration test suite for MezoCity (4lpha x Polly.town on Mezo Testnet)
 */
contract MezoAlphaTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    AgentRegistry public registry;
    PolicyVault public vault;
    MezoPredictionArena public arena;

    address public pollyOperator = address(0xA11CE);
    address public pipOperator = address(0xB0B);
    address public hootOperator = address(0xC0DE);
    address public depositor = address(0xD00D);

    uint256 public pollyId;
    uint256 public pipId;
    uint256 public hootId;

    function setUp() public {
        registry = new AgentRegistry();
        vault = new PolicyVault(address(registry));
        arena = new MezoPredictionArena();

        registry.setPolicyVault(address(vault));

        pollyId = registry.registerAgent(
            "Polly",
            "Lead Strategist & Council Chair",
            pollyOperator,
            "https://mezocity.4lpha.tech/.well-known/agent-card.json",
            "https://mezocity.4lpha.tech/api/mcp",
            keccak256("STRATEGY_POLLY_COUNCIL_V1")
        );

        pipId = registry.registerAgent(
            "Pip",
            "Mezo Signal & X Listener",
            pipOperator,
            "https://mezocity.4lpha.tech/.well-known/agent-card.json#pip",
            "https://mezocity.4lpha.tech/api/mcp",
            keccak256("STRATEGY_PIP_SIGNALS_V1")
        );

        hootId = registry.registerAgent(
            "Hoot",
            "On-Chain Fact Checker & Proof Verifier",
            hootOperator,
            "https://mezocity.4lpha.tech/.well-known/agent-card.json#hoot",
            "https://mezocity.4lpha.tech/api/mcp",
            keccak256("STRATEGY_HOOT_VERIFIER_V1")
        );

        vm.deal(depositor, 10 ether); // 10 Mezo Testnet BTC (18 decimals)
    }

    function testAgentRegistrationAndERC8004Metadata() public view {
        require(registry.totalAgents() == 3, "Expected 3 registered agents");
        IERC8004AgentRegistry.AgentProfile memory polly = registry.getAgent(pollyId);
        require(polly.operator == pollyOperator, "Operator mismatch");
        require(polly.reputationScore == 8500, "Initial reputation should be 8500 bps");
        require(registry.isAuthorizedOperator(pollyOperator), "Polly should be authorized");
    }

    function testVaultDepositAndPolicyFencedExecution() public {
        vm.prank(depositor);
        vault.deposit{value: 5 ether}(); // 5 BTC deposit
        require(vault.vaultTotalEquity() == 5 ether, "Vault equity should be 5 BTC");

        // Advance time past cooldown
        vm.warp(100);

        // Polly executes a valid 0.4 BTC trade (8% of 5 BTC vault <= 10% maxSingleTradeBps) with 82% confidence (>= 70%)
        (bool passed, uint256 execId) = vault.executePolicyFencedAction(
            pollyId,
            PolicyVault.ActionType.LONG_POSITION,
            "BTC-MEZO-PERP",
            0.4 ether,
            8200,
            keccak256("PROOF_COUNCIL_DEBATE_ROUND_1")
        );

        require(passed, "Valid trade within policy guardrails should pass");
        require(execId == 0, "First execution ID should be 0");
        require(vault.totalActiveAllocated() == 0.4 ether, "Allocated BTC should be 0.4 ether");
    }

    function testPolicyGuardrailBlocksOversizedTrade() public {
        vm.prank(depositor);
        vault.deposit{value: 5 ether}(); // 5 BTC deposit
        vm.warp(200);

        // Attempt 1.25 BTC trade (25% of vault > 10% maxSingleTradeBps limit)
        (bool passed, ) = vault.executePolicyFencedAction(
            pollyId,
            PolicyVault.ActionType.LONG_POSITION,
            "BTC-MEZO-PERP",
            1.25 ether,
            8500,
            keccak256("PROOF_OVERSIZED_ATTEMPT")
        );

        require(!passed, "Oversized trade must be blocked by PolicyVault");
        require(vault.totalActiveAllocated() == 0, "No funds should be allocated on blocked trade");
    }

    function testPolicyGuardrailBlocksLowConfidenceTrade() public {
        vm.prank(depositor);
        vault.deposit{value: 5 ether}();
        vm.warp(300);

        // Attempt trade with 58% Council confidence (< 70% minConfidenceBps limit)
        (bool passed, ) = vault.executePolicyFencedAction(
            pollyId,
            PolicyVault.ActionType.PREDICTION_BET,
            "MEZO-TVL-500M",
            0.2 ether,
            5800,
            keccak256("PROOF_LOW_CONFIDENCE")
        );

        require(!passed, "Low confidence trade must be blocked by PolicyVault");
    }

    function testPredictionArenaAndCouncilDebateAnchor() public {
        uint256 debateId = registry.anchorCouncilDebate(
            "MEZO-MAINNET-TVL",
            "Will Mezo BTC Fi Vaults surpass 15,000 BTC staked this quarter?",
            pipId,
            hootId,
            pollyId,
            7800, // 78% Council YES
            6100, // 61% Market YES
            keccak256("TRANSCRIPT_BRUTUS_VS_BRAMBLE_01")
        );
        require(debateId == 0, "First debate ID should be 0");

        uint256 marketId = arena.createMarket(
            "Will Mezo BTC Fi Vaults surpass 15,000 BTC staked this quarter?",
            "Mezo Ecosystem",
            7800,
            7 days
        );

        vm.prank(depositor);
        arena.takePosition{value: 0.25 ether}(marketId, true, keccak256("PROOF_BET_YES"));

        MezoPredictionArena.Market[] memory markets = arena.getAllMarkets();
        require(markets.length == 1, "Should have 1 market");
        require(markets[0].yesPoolWei == 0.25 ether, "YES pool should have 0.25 BTC");
    }
}

