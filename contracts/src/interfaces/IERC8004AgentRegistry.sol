// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IERC8004AgentRegistry
 * @notice 4lpha-compatible ERC-8004 On-Chain Autonomous Agent Identity & Capability Registry for Mezo Testnet (Chain ID: 31611)
 */
interface IERC8004AgentRegistry {
    struct AgentProfile {
        uint256 agentId;
        string name;
        string role;
        address operator;
        string agentCardURI; // e.g., https://mezocity.4lpha.tech/.well-known/agent-card.json
        string mcpEndpoint;  // e.g., https://mezocity.4lpha.tech/api/mcp
        bytes32 strategySpecHash;
        uint256 reputationScore; // Basis points 0 - 10000 (e.g., 9450 = 94.5%)
        uint256 totalActions;
        uint256 successfulActions;
        bool active;
        uint64 registeredAt;
    }

    event AgentRegistered(
        uint256 indexed agentId,
        string name,
        string role,
        address indexed operator,
        string agentCardURI,
        bytes32 strategySpecHash
    );

    event AgentUpdated(
        uint256 indexed agentId,
        string agentCardURI,
        string mcpEndpoint,
        bytes32 strategySpecHash,
        bool active
    );

    event AgentReputationRecorded(
        uint256 indexed agentId,
        bool success,
        uint256 newReputationScore,
        bytes32 proofHash
    );

    function registerAgent(
        string calldata name,
        string calldata role,
        address operator,
        string calldata agentCardURI,
        string calldata mcpEndpoint,
        bytes32 strategySpecHash
    ) external returns (uint256 agentId);

    function getAgent(uint256 agentId) external view returns (AgentProfile memory);
    function isAuthorizedOperator(address operator) external view returns (bool);
    function getAgentIdByOperator(address operator) external view returns (uint256);
    function totalAgents() external view returns (uint256);
}

