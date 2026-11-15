// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IMezoCoreInterfaces.sol";
import "./utils/ReentrancyGuardLite.sol";

/**
 * @title MezoTestnetSwapPool
 * @notice Oracle-calibrated BTC <-> MUSD swap venue for Mezo Testnet (Chain ID: 31611).
 *         Sub-Island IslandVaults execute real swaps moving live tracked BTC & MUSD balances.
 */
contract MezoTestnetSwapPool is ReentrancyGuardLite, IMezoTestnetSwapPool {
    uint256 private constant BPS_DENOM = 10_000;

    IERC20Minimal public immutable musd;
    IPriceFeed public immutable priceFeed;
    address public owner;

    uint16 public feeBps = 10;       // 0.10% swap fee
    int16 public oracleTiltBps = 0;  // Optional testnet spread bias (-500..+500 bps) set strictly by admin

    address public feeSplitter;
    uint16 public protocolFeeShareBps; // Portion of swap fee routed to FeeSplitter (0..10000)
    uint256 public cumulativeProtocolFeesMusd;

    uint256 public trackedBtcReserve;
    uint256 public trackedMusdReserve;

    event LiquidityFunded(address indexed funder, uint256 btcAdded, uint256 musdAdded);
    event LiquidityWithdrawn(address indexed to, uint256 btcOut, uint256 musdOut);
    event SwappedBtcForMusd(address indexed caller, address indexed recipient, uint256 btcIn, uint256 musdOut, uint256 effectivePrice);
    event SwappedMusdForBtc(address indexed caller, address indexed recipient, uint256 musdIn, uint256 btcOut, uint256 effectivePrice);
    event PoolParametersUpdated(uint16 feeBps, int16 oracleTiltBps);
    event FeeSplitterUpdated(address indexed feeSplitter, uint16 protocolFeeShareBps);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error Unauthorized();
    error InvalidAmount();
    error InvalidParameters();
    error SlippageExceeded();
    error InsufficientPoolLiquidity();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address _musd, address _priceFeed) {
        if (_musd == address(0) || _priceFeed == address(0)) revert InvalidParameters();
        musd = IERC20Minimal(_musd);
        priceFeed = IPriceFeed(_priceFeed);
        owner = msg.sender;
    }

    receive() external payable {
        trackedBtcReserve += msg.value;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidParameters();
        address prev = owner;
        owner = newOwner;
        emit OwnershipTransferred(prev, newOwner);
    }

    function setFeeSplitterConfig(address _feeSplitter, uint16 _protocolFeeShareBps) external onlyOwner {
        if (_protocolFeeShareBps > BPS_DENOM) revert InvalidParameters();
        feeSplitter = _feeSplitter;
        protocolFeeShareBps = _protocolFeeShareBps;
        emit FeeSplitterUpdated(_feeSplitter, _protocolFeeShareBps);
    }

    function setPoolParameters(uint16 _feeBps, int16 _oracleTiltBps) external onlyOwner {
        if (_feeBps > 500 || _oracleTiltBps < -500 || _oracleTiltBps > 500) {
            revert InvalidParameters();
        }
        feeBps = _feeBps;
        oracleTiltBps = _oracleTiltBps;
        emit PoolParametersUpdated(_feeBps, _oracleTiltBps);
    }

    function fundLiquidity(uint256 musdAmount) external payable onlyOwner nonReentrant {
        if (msg.value == 0 && musdAmount == 0) revert InvalidAmount();
        if (msg.value > 0) {
            trackedBtcReserve += msg.value;
        }
        if (musdAmount > 0) {
            bool ok = musd.transferFrom(msg.sender, address(this), musdAmount);
            if (!ok) revert TransferFailed();
            trackedMusdReserve += musdAmount;
        }
        emit LiquidityFunded(msg.sender, msg.value, musdAmount);
    }

    function withdrawLiquidity(uint256 btcAmount, uint256 musdAmount) external onlyOwner nonReentrant {
        if (btcAmount > trackedBtcReserve || musdAmount > trackedMusdReserve) {
            revert InsufficientPoolLiquidity();
        }
        if (btcAmount > 0) {
            trackedBtcReserve -= btcAmount;
            (bool ok, ) = msg.sender.call{value: btcAmount}("");
            if (!ok) revert TransferFailed();
        }
        if (musdAmount > 0) {
            trackedMusdReserve -= musdAmount;
            bool ok = musd.transfer(msg.sender, musdAmount);
            if (!ok) revert TransferFailed();
        }
        emit LiquidityWithdrawn(msg.sender, btcAmount, musdAmount);
    }

    function getEffectivePrice() public view returns (uint256) {
        uint256 oraclePrice = priceFeed.fetchPrice();
        if (oracleTiltBps >= 0) {
            return (oraclePrice * (BPS_DENOM + uint256(int256(oracleTiltBps)))) / BPS_DENOM;
        }
        return (oraclePrice * (BPS_DENOM - uint256(int256(-oracleTiltBps)))) / BPS_DENOM;
    }

    function quoteBtcForMusd(uint256 btcAmountWei) public view override returns (uint256 musdOut) {
        uint256 price = getEffectivePrice();
        uint256 grossMusd = (btcAmountWei * price) / 1 ether;
        musdOut = (grossMusd * (BPS_DENOM - feeBps)) / BPS_DENOM;
    }

    function quoteMusdForBtc(uint256 musdAmount) public view override returns (uint256 btcOutWei) {
        uint256 price = getEffectivePrice();
        uint256 netMusd = (musdAmount * (BPS_DENOM - feeBps)) / BPS_DENOM;
        btcOutWei = (netMusd * 1 ether) / price;
    }

    function swapBtcForMusd(
        uint256 minMusdOut,
        address recipient
    ) external payable override nonReentrant returns (uint256 musdOut) {
        if (msg.value == 0 || recipient == address(0)) revert InvalidAmount();
        uint256 price = getEffectivePrice();
        uint256 grossMusd = (msg.value * price) / 1 ether;
        musdOut = (grossMusd * (BPS_DENOM - feeBps)) / BPS_DENOM;
        if (musdOut < minMusdOut) revert SlippageExceeded();
        if (musdOut > trackedMusdReserve) revert InsufficientPoolLiquidity();

        trackedBtcReserve += msg.value;
        trackedMusdReserve -= musdOut;

        uint256 totalFeeMusd = grossMusd - musdOut;
        if (totalFeeMusd > 0 && feeSplitter != address(0) && protocolFeeShareBps > 0) {
            uint256 protocolCut = (totalFeeMusd * protocolFeeShareBps) / BPS_DENOM;
            if (protocolCut > trackedMusdReserve) {
                protocolCut = trackedMusdReserve;
            }
            if (protocolCut > 0) {
                trackedMusdReserve -= protocolCut;
                cumulativeProtocolFeesMusd += protocolCut;
                musd.approve(feeSplitter, 0);
                musd.approve(feeSplitter, protocolCut);
                IMezoFeeSplitter(feeSplitter).collectRevenue(
                    2,
                    protocolCut,
                    "SWAP_BTC_TO_MUSD_FEE"
                );
                musd.approve(feeSplitter, 0);
            }
        }

        bool ok = musd.transfer(recipient, musdOut);
        if (!ok) revert TransferFailed();

        emit SwappedBtcForMusd(msg.sender, recipient, msg.value, musdOut, price);
    }

    function swapMusdForBtc(
        uint256 musdAmountIn,
        uint256 minBtcOutWei,
        address recipient
    ) external override nonReentrant returns (uint256 btcOutWei) {
        if (musdAmountIn == 0 || recipient == address(0)) revert InvalidAmount();
        uint256 price = getEffectivePrice();
        uint256 netMusd = (musdAmountIn * (BPS_DENOM - feeBps)) / BPS_DENOM;
        btcOutWei = (netMusd * 1 ether) / price;
        if (btcOutWei < minBtcOutWei) revert SlippageExceeded();
        if (btcOutWei > trackedBtcReserve) revert InsufficientPoolLiquidity();

        bool okIn = musd.transferFrom(msg.sender, address(this), musdAmountIn);
        if (!okIn) revert TransferFailed();

        uint256 protocolCut = 0;
        uint256 totalFeeMusd = musdAmountIn - netMusd;
        if (totalFeeMusd > 0 && feeSplitter != address(0) && protocolFeeShareBps > 0) {
            protocolCut = (totalFeeMusd * protocolFeeShareBps) / BPS_DENOM;
            if (protocolCut > 0) {
                cumulativeProtocolFeesMusd += protocolCut;
                musd.approve(feeSplitter, 0);
                musd.approve(feeSplitter, protocolCut);
                IMezoFeeSplitter(feeSplitter).collectRevenue(
                    2,
                    protocolCut,
                    "SWAP_MUSD_TO_BTC_FEE"
                );
                musd.approve(feeSplitter, 0);
            }
        }

        trackedMusdReserve += (musdAmountIn - protocolCut);
        trackedBtcReserve -= btcOutWei;

        (bool okOut, ) = recipient.call{value: btcOutWei}("");
        if (!okOut) revert TransferFailed();

        emit SwappedMusdForBtc(msg.sender, recipient, musdAmountIn, btcOutWei, price);
    }
}
