// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MezoPredictionArena
 * @notice Polly.town-inspired On-Chain Prediction Market & Agent Council Arena on Mezo Testnet (BTC 18 decimals).
 */
contract MezoPredictionArena {
    struct Market {
        uint256 marketId;
        string question;
        string category;
        uint16 councilYesBps; // Polly Town Council consensus probability (0 - 10000)
        uint256 yesPoolWei;
        uint256 noPoolWei;
        uint64 expiresAt;
        bool resolved;
        bool outcomeYes;
    }

    struct Position {
        uint256 yesAmountWei;
        uint256 noAmountWei;
    }

    address public owner;
    Market[] public markets;
    mapping(uint256 => mapping(address => Position)) public positions;

    event MarketCreated(
        uint256 indexed marketId,
        string question,
        string category,
        uint16 councilYesBps,
        uint64 expiresAt
    );
    event PositionPlaced(
        uint256 indexed marketId,
        address indexed trader,
        bool isYes,
        uint256 amountBtcWei,
        bytes32 agentProofHash
    );
    event CouncilConsensusUpdated(uint256 indexed marketId, uint16 newCouncilYesBps, bytes32 debateProofHash);

    constructor() {
        owner = msg.sender;
    }

    function createMarket(
        string calldata question,
        string calldata category,
        uint16 councilYesBps,
        uint64 durationSeconds
    ) external returns (uint256 marketId) {
        marketId = markets.length;
        markets.push(
            Market({
                marketId: marketId,
                question: question,
                category: category,
                councilYesBps: councilYesBps,
                yesPoolWei: 0,
                noPoolWei: 0,
                expiresAt: uint64(block.timestamp) + durationSeconds,
                resolved: false,
                outcomeYes: false
            })
        );

        emit MarketCreated(marketId, question, category, councilYesBps, uint64(block.timestamp) + durationSeconds);
    }

    function takePosition(
        uint256 marketId,
        bool isYes,
        bytes32 agentProofHash
    ) external payable {
        require(marketId < markets.length, "Invalid market");
        require(msg.value > 0, "Stake required");
        Market storage m = markets[marketId];
        require(!m.resolved, "Market resolved");

        if (isYes) {
            m.yesPoolWei += msg.value;
            positions[marketId][msg.sender].yesAmountWei += msg.value;
        } else {
            m.noPoolWei += msg.value;
            positions[marketId][msg.sender].noAmountWei += msg.value;
        }

        emit PositionPlaced(marketId, msg.sender, isYes, msg.value, agentProofHash);
    }

    function updateCouncilConsensus(
        uint256 marketId,
        uint16 newCouncilYesBps,
        bytes32 debateProofHash
    ) external {
        require(marketId < markets.length, "Invalid market");
        markets[marketId].councilYesBps = newCouncilYesBps;
        emit CouncilConsensusUpdated(marketId, newCouncilYesBps, debateProofHash);
    }

    function getAllMarkets() external view returns (Market[] memory) {
        return markets;
    }

    function totalMarkets() external view returns (uint256) {
        return markets.length;
    }
}

