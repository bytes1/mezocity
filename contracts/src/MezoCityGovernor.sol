// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IMezoCoreInterfaces.sol";
import "./utils/ReentrancyGuardLite.sol";

/**
 * @title MezoCityGovernor
 * @notice On-chain MEZO Citizen Governance for MezoCity Main Island & Sub-Islands.
 *         Reads flash-loan-resistant coordination power directly from MainMEZOVault,
 *         governs protocol fee splits, risk guardrails, large-loan approvals, and
 *         Sub-Island Leaderboard endorsements on Mezo Testnet (Chain ID: 31611).
 */
contract MezoCityGovernor is ReentrancyGuardLite {
    uint8 public constant VOTE_AGAINST = 0;
    uint8 public constant VOTE_FOR = 1;
    uint8 public constant VOTE_ABSTAIN = 2;

    uint8 public constant CATEGORY_FEE_SPLIT = 0;
    uint8 public constant CATEGORY_MUSD_VAULT = 1;
    uint8 public constant CATEGORY_CREDIT_COUNCIL = 2;
    uint8 public constant CATEGORY_SWAP_POOL = 3;
    uint8 public constant CATEGORY_LARGE_LOAN = 4;
    uint8 public constant CATEGORY_INSURANCE = 5;
    uint8 public constant CATEGORY_CUSTOM = 6;
    uint8 public constant MAX_CATEGORY = 6;

    enum ProposalState {
        ACTIVE,
        DEFEATED,
        SUCCEEDED,
        QUEUED,
        EXECUTED,
        CANCELED
    }

    struct Proposal {
        uint256 id;
        uint8 category;
        address proposer;
        address target;
        uint256 value;
        bytes callData;
        string title;
        string summary;
        uint64 startTime;
        uint64 endTime;
        uint64 eta;
        uint256 forVotes;
        uint256 againstVotes;
        uint256 abstainVotes;
        bool queued;
        bool executed;
        bool canceled;
    }

    IMainMEZOVaultCoord public immutable mainMezoVault;
    address public guardian;

    uint256 public proposalThresholdPower = 50 ether;
    uint256 public quorumPower = 100 ether;
    uint32 public votingPeriodSeconds = 3 days;
    uint32 public executionDelaySeconds = 1 hours;

    uint256 private _nextProposalId = 1;
    mapping(uint256 => Proposal) private _proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => uint8)) public voteChoiceOf;
    mapping(uint256 => mapping(address => uint256)) public votedWeightOf;
    uint256[] private _allProposalIds;

    // On-chain Sub-Island Citizen Endorsement Gauge
    mapping(address => uint256) public endorsedIslandOf;
    mapping(address => uint256) public endorsedWeightOf;
    mapping(uint256 => uint256) public islandEndorsementPower;

    event ProposalCreated(
        uint256 indexed proposalId,
        uint8 indexed category,
        address indexed proposer,
        address target,
        uint64 startTime,
        uint64 endTime,
        string title
    );
    event VoteCast(
        uint256 indexed proposalId,
        address indexed voter,
        uint8 support,
        uint256 weight
    );
    event ProposalQueued(uint256 indexed proposalId, uint64 eta);
    event ProposalExecuted(uint256 indexed proposalId, address indexed executor);
    event ProposalCanceled(uint256 indexed proposalId, address indexed caller);
    event GovernanceParamsUpdated(
        uint256 proposalThresholdPower,
        uint256 quorumPower,
        uint32 votingPeriodSeconds,
        uint32 executionDelaySeconds
    );
    event GuardianUpdated(address indexed previousGuardian, address indexed newGuardian);
    event IslandEndorsed(
        address indexed voter,
        uint256 indexed previousIslandId,
        uint256 indexed newIslandId,
        uint256 weight
    );

    error Unauthorized();
    error InvalidParameters();
    error InsufficientGovernancePower();
    error UnknownProposal();
    error InvalidState();
    error AlreadyVoted();
    error TimelockNotReady();
    error ExecutionFailed(bytes reason);

    modifier onlySelf() {
        if (msg.sender != address(this)) revert Unauthorized();
        _;
    }

    constructor(
        address _mainMezoVault,
        address _guardian,
        uint256 _proposalThresholdPower,
        uint256 _quorumPower,
        uint32 _votingPeriodSeconds,
        uint32 _executionDelaySeconds
    ) {
        if (_mainMezoVault == address(0)) revert InvalidParameters();
        if (_votingPeriodSeconds < 10 || _votingPeriodSeconds > 30 days) revert InvalidParameters();
        if (_executionDelaySeconds > 7 days) revert InvalidParameters();

        mainMezoVault = IMainMEZOVaultCoord(_mainMezoVault);
        guardian = _guardian == address(0) ? msg.sender : _guardian;
        proposalThresholdPower = _proposalThresholdPower;
        quorumPower = _quorumPower;
        votingPeriodSeconds = _votingPeriodSeconds;
        executionDelaySeconds = _executionDelaySeconds;
    }

    receive() external payable {}

    function setGovernanceParams(
        uint256 _proposalThresholdPower,
        uint256 _quorumPower,
        uint32 _votingPeriodSeconds,
        uint32 _executionDelaySeconds
    ) external onlySelf {
        if (_votingPeriodSeconds < 10 || _votingPeriodSeconds > 30 days) revert InvalidParameters();
        if (_executionDelaySeconds > 7 days) revert InvalidParameters();
        proposalThresholdPower = _proposalThresholdPower;
        quorumPower = _quorumPower;
        votingPeriodSeconds = _votingPeriodSeconds;
        executionDelaySeconds = _executionDelaySeconds;
        emit GovernanceParamsUpdated(
            _proposalThresholdPower,
            _quorumPower,
            _votingPeriodSeconds,
            _executionDelaySeconds
        );
    }

    function setGuardian(address newGuardian) external {
        if (msg.sender != guardian && msg.sender != address(this)) revert Unauthorized();
        if (newGuardian == address(0)) revert InvalidParameters();
        address prev = guardian;
        guardian = newGuardian;
        emit GuardianUpdated(prev, newGuardian);
    }

    /**
     * @notice Current flash-loan-resistant governance power for `account`.
     */
    function votingPowerOf(address account) public view returns (uint256) {
        return mainMezoVault.coordinationPowerOf(account);
    }

    function createProposal(
        uint8 category,
        address target,
        uint256 value,
        bytes calldata callData,
        string calldata title,
        string calldata summary
    ) external returns (uint256 proposalId) {
        if (category > MAX_CATEGORY) revert InvalidParameters();
        if (target == address(0) || bytes(title).length == 0) revert InvalidParameters();

        uint256 proposerPower = votingPowerOf(msg.sender);
        if (proposerPower < proposalThresholdPower) revert InsufficientGovernancePower();

        proposalId = _nextProposalId++;
        uint64 startTs = uint64(block.timestamp);
        uint64 endTs = uint64(block.timestamp + votingPeriodSeconds);

        _proposals[proposalId] = Proposal({
            id: proposalId,
            category: category,
            proposer: msg.sender,
            target: target,
            value: value,
            callData: callData,
            title: title,
            summary: summary,
            startTime: startTs,
            endTime: endTs,
            eta: 0,
            forVotes: 0,
            againstVotes: 0,
            abstainVotes: 0,
            queued: false,
            executed: false,
            canceled: false
        });

        _allProposalIds.push(proposalId);
        emit ProposalCreated(proposalId, category, msg.sender, target, startTs, endTs, title);
    }

    function castVote(uint256 proposalId, uint8 support) external {
        Proposal storage p = _proposals[proposalId];
        if (p.id == 0) revert UnknownProposal();
        if (stateOf(proposalId) != ProposalState.ACTIVE) revert InvalidState();
        if (support > VOTE_ABSTAIN) revert InvalidParameters();
        if (hasVoted[proposalId][msg.sender]) revert AlreadyVoted();

        uint256 weight = votingPowerOf(msg.sender);
        if (weight == 0) revert InsufficientGovernancePower();

        hasVoted[proposalId][msg.sender] = true;
        voteChoiceOf[proposalId][msg.sender] = support;
        votedWeightOf[proposalId][msg.sender] = weight;

        if (support == VOTE_AGAINST) {
            p.againstVotes += weight;
        } else if (support == VOTE_FOR) {
            p.forVotes += weight;
        } else {
            p.abstainVotes += weight;
        }

        emit VoteCast(proposalId, msg.sender, support, weight);
    }

    function queueProposal(uint256 proposalId) external {
        Proposal storage p = _proposals[proposalId];
        if (p.id == 0) revert UnknownProposal();
        if (stateOf(proposalId) != ProposalState.SUCCEEDED) revert InvalidState();

        uint64 eta = uint64(block.timestamp + executionDelaySeconds);
        p.queued = true;
        p.eta = eta;
        emit ProposalQueued(proposalId, eta);
    }

    function executeProposal(uint256 proposalId) external nonReentrant {
        Proposal storage p = _proposals[proposalId];
        if (p.id == 0) revert UnknownProposal();
        if (stateOf(proposalId) != ProposalState.QUEUED) revert InvalidState();
        if (block.timestamp < p.eta) revert TimelockNotReady();

        p.executed = true;
        (bool ok, bytes memory ret) = p.target.call{value: p.value}(p.callData);
        if (!ok) revert ExecutionFailed(ret);

        emit ProposalExecuted(proposalId, msg.sender);
    }

    function cancelProposal(uint256 proposalId) external {
        Proposal storage p = _proposals[proposalId];
        if (p.id == 0) revert UnknownProposal();
        if (msg.sender != p.proposer && msg.sender != guardian) revert Unauthorized();
        if (p.executed || p.canceled) revert InvalidState();

        p.canceled = true;
        emit ProposalCanceled(proposalId, msg.sender);
    }

    /**
     * @notice Pledge active MEZO governance weight toward a Sub-Island on the Leaderboard (0 to clear).
     */
    function endorseIsland(uint256 islandId) external {
        uint256 prevIsland = endorsedIslandOf[msg.sender];
        uint256 prevWeight = endorsedWeightOf[msg.sender];
        if (prevIsland != 0 && prevWeight > 0) {
            uint256 cur = islandEndorsementPower[prevIsland];
            islandEndorsementPower[prevIsland] = prevWeight >= cur ? 0 : cur - prevWeight;
        }

        if (islandId == 0) {
            endorsedIslandOf[msg.sender] = 0;
            endorsedWeightOf[msg.sender] = 0;
            emit IslandEndorsed(msg.sender, prevIsland, 0, 0);
            return;
        }

        uint256 weight = votingPowerOf(msg.sender);
        if (weight == 0) revert InsufficientGovernancePower();

        endorsedIslandOf[msg.sender] = islandId;
        endorsedWeightOf[msg.sender] = weight;
        islandEndorsementPower[islandId] += weight;

        emit IslandEndorsed(msg.sender, prevIsland, islandId, weight);
    }

    function stateOf(uint256 proposalId) public view returns (ProposalState) {
        Proposal storage p = _proposals[proposalId];
        if (p.id == 0) revert UnknownProposal();
        if (p.canceled) return ProposalState.CANCELED;
        if (p.executed) return ProposalState.EXECUTED;
        if (p.queued) return ProposalState.QUEUED;
        if (block.timestamp < p.endTime) return ProposalState.ACTIVE;

        uint256 turnout = p.forVotes + p.abstainVotes;
        if (p.forVotes > p.againstVotes && turnout >= quorumPower) {
            return ProposalState.SUCCEEDED;
        }
        return ProposalState.DEFEATED;
    }

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        if (_proposals[proposalId].id == 0) revert UnknownProposal();
        return _proposals[proposalId];
    }

    function totalProposals() external view returns (uint256) {
        return _allProposalIds.length;
    }

    function getAllProposals() external view returns (Proposal[] memory list) {
        uint256 len = _allProposalIds.length;
        list = new Proposal[](len);
        for (uint256 i = 0; i < len; i++) {
            list[i] = _proposals[_allProposalIds[i]];
        }
    }

    function getIslandEndorsements(uint256[] calldata islandIds)
        external
        view
        returns (uint256[] memory powers)
    {
        powers = new uint256[](islandIds.length);
        for (uint256 i = 0; i < islandIds.length; i++) {
            powers[i] = islandEndorsementPower[islandIds[i]];
        }
    }
}
