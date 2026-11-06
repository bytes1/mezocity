// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IERC8004AgentRegistry.sol";

/**
 * @title AgentRegistry
 * @notice On-chain ERC-8004 registry anchoring Polly.town x 4lpha.tech autonomous agents on Mezo Testnet.
 *         Stores agent identities, MCP endpoints, strategy specification hashes, and verifiable reputation.
 */
contract AgentRegistry is IERC8004AgentRegistry {
    address public owner;
    address public policyVault;
    uint256 private _nextAgentId = 1;

    mapping(uint256 => AgentProfile) private _agents;
    mapping(address => uint256) public operatorToAgentId;
    uint256[] private _allAgentIds;

    struct CouncilDebate {
        uint256 debateId;
        string marketTicker;
        string thesis;
        uint256 bullAgentId;    // e.g. Brutus
        uint256 bearAgentId;    // e.g. Bramble
        uint256 factCheckerId;  // e.g. Hoot
        uint16 councilYesBps;   // Polly Council probability (0 - 10000)
        uint16 marketYesBps;    // External market probability (0 - 10000)
        bytes32 transcriptHash; // Anchored proof of agent reasoning
        uint64 timestamp;
    }

    CouncilDebate[] public debates;

    event CouncilDebateAnchored(
        uint256 indexed debateId,
        string marketTicker,
        uint16 councilYesBps,
        uint16 marketYesBps,
        bytes32 transcriptHash
    );

    error Unauthorized();
    error InvalidAgent();
    error OperatorAlreadyRegistered();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyOwnerOrVault() {
        if (msg.sender != owner && msg.sender != policyVault) revert Unauthorized();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setPolicyVault(address _policyVault) external onlyOwner {
        policyVault = _policyVault;
    }

    function registerAgent(
        string calldata name,
        string calldata role,
        address operator,
        string calldata agentCardURI,
        string calldata mcpEndpoint,
        bytes32 strategySpecHash
    ) external override returns (uint256 agentId) {
        if (operator == address(0)) revert InvalidAgent();
        if (operatorToAgentId[operator] != 0) revert OperatorAlreadyRegistered();

        agentId = _nextAgentId++;
        _agents[agentId] = AgentProfile({
            agentId: agentId,
            name: name,
            role: role,
            operator: operator,
            agentCardURI: agentCardURI,
            mcpEndpoint: mcpEndpoint,
            strategySpecHash: strategySpecHash,
            reputationScore: 8500, // Starts at 85.00% baseline reputation
            totalActions: 0,
            successfulActions: 0,
            active: true,
            registeredAt: uint64(block.timestamp)
        });

        operatorToAgentId[operator] = agentId;
        _allAgentIds.push(agentId);

        emit AgentRegistered(agentId, name, role, operator, agentCardURI, strategySpecHash);
    }

    function updateAgent(
        uint256 agentId,
        string calldata agentCardURI,
        string calldata mcpEndpoint,
        bytes32 strategySpecHash,
        bool active
    ) external {
        AgentProfile storage agent = _agents[agentId];
        if (agent.agentId == 0) revert InvalidAgent();
        if (msg.sender != agent.operator && msg.sender != owner) revert Unauthorized();

        agent.agentCardURI = agentCardURI;
        agent.mcpEndpoint = mcpEndpoint;
        agent.strategySpecHash = strategySpecHash;
        agent.active = active;

        emit AgentUpdated(agentId, agentCardURI, mcpEndpoint, strategySpecHash, active);
    }

    function recordExecutionOutcome(
        uint256 agentId,
        bool success,
        bytes32 proofHash
    ) external onlyOwnerOrVault {
        AgentProfile storage agent = _agents[agentId];
        if (agent.agentId == 0) revert InvalidAgent();

        agent.totalActions += 1;
        if (success) {
            agent.successfulActions += 1;
            if (agent.reputationScore <= 9900) {
                agent.reputationScore += 50;
            }
        } else {
            if (agent.reputationScore >= 200) {
                agent.reputationScore -= 150;
            }
        }

        emit AgentReputationRecorded(agentId, success, agent.reputationScore, proofHash);
    }

    function anchorCouncilDebate(
        string calldata marketTicker,
        string calldata thesis,
        uint256 bullAgentId,
        uint256 bearAgentId,
        uint256 factCheckerId,
        uint16 councilYesBps,
        uint16 marketYesBps,
        bytes32 transcriptHash
    ) external returns (uint256 debateId) {
        debateId = debates.length;
        CouncilDebate storage d = debates.push();
        d.debateId = debateId;
        d.marketTicker = marketTicker;
        d.thesis = thesis;
        d.bullAgentId = bullAgentId;
        d.bearAgentId = bearAgentId;
        d.factCheckerId = factCheckerId;
        d.councilYesBps = councilYesBps;
        d.marketYesBps = marketYesBps;
        d.transcriptHash = transcriptHash;
        d.timestamp = uint64(block.timestamp);

        emit CouncilDebateAnchored(debateId, marketTicker, councilYesBps, marketYesBps, transcriptHash);
    }

    function getAgent(uint256 agentId) external view override returns (AgentProfile memory) {
        return _agents[agentId];
    }

    function getAllAgents() external view returns (AgentProfile[] memory list) {
        uint256 len = _allAgentIds.length;
        list = new AgentProfile[](len);
        for (uint256 i = 0; i < len; i++) {
            list[i] = _agents[_allAgentIds[i]];
        }
    }

    function isAuthorizedOperator(address operator) external view override returns (bool) {
        uint256 id = operatorToAgentId[operator];
        return id != 0 && _agents[id].active;
    }

    function getAgentIdByOperator(address operator) external view override returns (uint256) {
        return operatorToAgentId[operator];
    }

    function totalAgents() external view override returns (uint256) {
        return _allAgentIds.length;
    }

    function totalDebates() external view returns (uint256) {
        return debates.length;
    }
}

