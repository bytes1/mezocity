// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IMezoCoreInterfaces.sol";
import "./utils/CloneLib.sol";
import "./utils/ReentrancyGuardLite.sol";

interface IIslandVaultInit {
    function initialize(
        uint256 _islandId,
        address _owner,
        address _operator,
        address _creditCouncil,
        address _approvedSwapPool
    ) external;
    function depositBtc() external payable;
    function depositMusd(uint256 musdAmount) external;
}

/**
 * @title IslandFactory
 * @notice Creates user Sub-Islands starting as empty plots seeded with native BTC and/or MUSD.
 *         Deploys isolated IslandVault instances via EIP-1167 minimal proxies for ~85% gas savings.
 */
contract IslandFactory is ReentrancyGuardLite, IIslandFactory {
    address public owner;
    address public immutable vaultImplementation;
    IERC20Minimal public immutable musd;
    address public creditCouncil;
    address public approvedSwapPool;

    uint256 public minSeedBtc = 0.0001 ether; // 10,000 sats
    uint256 public minSeedMusd = 10 ether;    // 10 MUSD

    uint256 private _nextIslandId = 1;
    mapping(uint256 => IslandSummary) private _islands;
    mapping(address => uint256[]) private _ownerIslandIds;
    mapping(address => bool) public override isRegisteredVault;
    uint256[] private _allIslandIds;

    event IslandCreated(
        uint256 indexed islandId,
        address indexed owner,
        address indexed vault,
        address operator,
        string name,
        string biomeTheme,
        uint256 seedBtcWei,
        uint256 seedMusd
    );
    event IslandAgentAnchored(
        uint256 indexed islandId,
        bytes32 indexed agentSpecHash,
        string agentName,
        string role
    );
    event SeedMinimumsUpdated(uint256 minSeedBtc, uint256 minSeedMusd);

    error Unauthorized();
    error InvalidParameters();
    error InsufficientSeedCapital();
    error UnknownIsland();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(
        address _vaultImplementation,
        address _musd,
        address _creditCouncil,
        address _approvedSwapPool
    ) {
        if (_vaultImplementation == address(0) || _musd == address(0) || _approvedSwapPool == address(0)) {
            revert InvalidParameters();
        }
        owner = msg.sender;
        vaultImplementation = _vaultImplementation;
        musd = IERC20Minimal(_musd);
        creditCouncil = _creditCouncil;
        approvedSwapPool = _approvedSwapPool;
    }

    function setCreditCouncil(address _creditCouncil) external onlyOwner {
        if (_creditCouncil == address(0)) revert InvalidParameters();
        creditCouncil = _creditCouncil;
    }

    function setApprovedSwapPool(address _swapPool) external onlyOwner {
        if (_swapPool == address(0)) revert InvalidParameters();
        approvedSwapPool = _swapPool;
    }

    function setSeedMinimums(uint256 _minSeedBtc, uint256 _minSeedMusd) external onlyOwner {
        minSeedBtc = _minSeedBtc;
        minSeedMusd = _minSeedMusd;
        emit SeedMinimumsUpdated(_minSeedBtc, _minSeedMusd);
    }

    /**
     * @notice Deploy a new empty Sub-Island seeded with native BTC and/or MUSD.
     */
    function createIsland(
        string calldata name,
        string calldata biomeTheme,
        uint256 initialMusdAmount,
        address operatorWallet
    ) external payable nonReentrant returns (uint256 islandId, address vaultAddr) {
        if (bytes(name).length == 0) revert InvalidParameters();
        if (creditCouncil == address(0)) revert InvalidParameters();
        if (msg.value < minSeedBtc && initialMusdAmount < minSeedMusd) {
            revert InsufficientSeedCapital();
        }

        islandId = _nextIslandId++;
        address op = operatorWallet == address(0) ? msg.sender : operatorWallet;
        bytes32 salt = keccak256(abi.encodePacked(msg.sender, islandId, block.number));
        vaultAddr = CloneLib.cloneDeterministic(vaultImplementation, salt);

        IIslandVaultInit(vaultAddr).initialize(
            islandId,
            msg.sender,
            op,
            creditCouncil,
            approvedSwapPool
        );

        if (msg.value > 0) {
            IIslandVaultInit(vaultAddr).depositBtc{value: msg.value}();
        }

        if (initialMusdAmount > 0) {
            bool ok = musd.transferFrom(msg.sender, address(this), initialMusdAmount);
            if (!ok) revert TransferFailed();
            musd.approve(vaultAddr, 0);
            musd.approve(vaultAddr, initialMusdAmount);
            IIslandVaultInit(vaultAddr).depositMusd(initialMusdAmount);
            musd.approve(vaultAddr, 0);
        }

        _islands[islandId] = IslandSummary({
            islandId: islandId,
            owner: msg.sender,
            operator: op,
            vault: vaultAddr,
            name: name,
            biomeTheme: biomeTheme,
            createdAt: uint64(block.timestamp),
            active: true
        });
        isRegisteredVault[vaultAddr] = true;
        _ownerIslandIds[msg.sender].push(islandId);
        _allIslandIds.push(islandId);

        emit IslandCreated(
            islandId,
            msg.sender,
            vaultAddr,
            op,
            name,
            biomeTheme,
            msg.value,
            initialMusdAmount
        );
    }

    function anchorIslandAgentSpec(
        uint256 islandId,
        string calldata agentName,
        string calldata role,
        bytes32 agentSpecHash
    ) external {
        IslandSummary storage info = _islands[islandId];
        if (info.islandId == 0) revert UnknownIsland();
        if (msg.sender != info.owner && msg.sender != info.operator) revert Unauthorized();
        emit IslandAgentAnchored(islandId, agentSpecHash, agentName, role);
    }

    function getIsland(uint256 islandId) external view override returns (IslandSummary memory) {
        return _islands[islandId];
    }

    function getIslandsByOwner(address ownerAddr) external view returns (IslandSummary[] memory list) {
        uint256[] memory ids = _ownerIslandIds[ownerAddr];
        list = new IslandSummary[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            list[i] = _islands[ids[i]];
        }
    }

    function getAllIslands() external view returns (IslandSummary[] memory list) {
        uint256 len = _allIslandIds.length;
        list = new IslandSummary[](len);
        for (uint256 i = 0; i < len; i++) {
            list[i] = _islands[_allIslandIds[i]];
        }
    }

    function totalIslands() external view override returns (uint256) {
        return _allIslandIds.length;
    }
}
