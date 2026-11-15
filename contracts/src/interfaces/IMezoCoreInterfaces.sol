// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IPriceFeed {
    function fetchPrice() external view returns (uint256);
}

interface IMezoTestnetSwapPool {
    function quoteBtcForMusd(uint256 btcAmountWei) external view returns (uint256 musdOut);
    function quoteMusdForBtc(uint256 musdAmount) external view returns (uint256 btcOutWei);
    function swapBtcForMusd(uint256 minMusdOut, address recipient) external payable returns (uint256 musdOut);
    function swapMusdForBtc(uint256 musdAmountIn, uint256 minBtcOutWei, address recipient) external returns (uint256 btcOutWei);
}

interface IMainMUSDVault {
    function musd() external view returns (IERC20Minimal);
    function totalAssets() external view returns (uint256);
    function trackedLiquidMusd() external view returns (uint256);
    function maxEligibleLoanMusd() external view returns (uint256);
    function disburseLoan(address islandVault, uint256 principalMusd, uint16 aprBps, bool isAutoDisburse) external;
    function receiveLoanRepayment(uint256 principalPaid, uint256 interestPaid, uint16 aprBps) external;
    function recordDefaultRecovery(uint256 originalPrincipal, uint16 aprBps, uint256 recoveredMusd) external;
}

interface IIslandVault {
    function islandId() external view returns (uint256);
    function owner() external view returns (address);
    function operator() external view returns (address);
    function trackedBtcBalance() external view returns (uint256);
    function trackedMusdBalance() external view returns (uint256);
    function activeCostBasisUsd() external view returns (uint256);
    function outstandingLoanPrincipalMusd() external view returns (uint256);
    function getCurrentGrossNavUsd() external view returns (uint256);
    function getNetEquityUsd() external view returns (uint256);
    function getNetProfitUsd() external view returns (uint256);
    function getCheckpoint(uint256 checkpointId)
        external
        view
        returns (
            uint256 id,
            uint256 blockNumber,
            uint64 timestamp,
            uint256 grossNavUsd,
            uint256 loanLiabilityUsd,
            uint256 netEquityUsd,
            uint256 costBasisUsd,
            uint256 netProfitUsd,
            uint256 roiBps,
            uint32 tradeCount,
            bytes32 transcriptHash
        );
    function totalCheckpoints() external view returns (uint256);
    function isLoanUndercollateralized() external view returns (bool);
    function onLoanDisbursed(uint256 loanId, uint256 principalMusd) external;
    function repayActiveLoanFromVault(uint256 principalToReduce, uint256 totalTransferMusd, address recipient) external;
    function notifyExternalRepayment(uint256 principalReduced) external;
    function seizeDefaultedCollateral(uint256 targetRecoveryMusd, address musdRecipient) external returns (uint256 recoveredMusd);
}

interface IIslandFactory {
    struct IslandSummary {
        uint256 islandId;
        address owner;
        address operator;
        address vault;
        string name;
        string biomeTheme;
        uint64 createdAt;
        bool active;
    }

    function getIsland(uint256 islandId) external view returns (IslandSummary memory);
    function isRegisteredVault(address vault) external view returns (bool);
    function totalIslands() external view returns (uint256);
}

interface IMezoFeeSplitter {
    function collectRevenue(uint8 streamId, uint256 musdAmount, string calldata memo) external;
}

interface IMainMEZOVaultCoord {
    function totalWeightedPower() external view returns (uint256);
    function coordinationPowerOf(address account) external view returns (uint256);
    function notifyRewardMusd(uint256 musdAmount) external;
}
