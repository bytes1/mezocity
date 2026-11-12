// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/MainMUSDVault.sol";
import "../src/MezoTestnetSwapPool.sol";
import "../src/IslandVault.sol";
import "../src/IslandFactory.sol";
import "../src/IslandCreditCouncil.sol";

interface VmTest {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function deal(address who, uint256 newBalance) external;
    function warp(uint256 newTimestamp) external;
    function roll(uint256 newBlock) external;
}

contract MockMUSD {
    string public name = "Mezo USD";
    string public symbol = "MUSD";
    uint8 public decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "MUSD: insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "MUSD: insufficient");
        require(allowance[from][msg.sender] >= amount, "MUSD: allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockPriceFeed {
    uint256 public price;

    constructor(uint256 initialPrice) {
        price = initialPrice;
    }

    function setPrice(uint256 newPrice) external {
        price = newPrice;
    }

    function fetchPrice() external view returns (uint256) {
        return price;
    }
}

contract IslandEcosystemTest {
    VmTest constant vm = VmTest(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockMUSD public musd;
    MockPriceFeed public priceFeed;
    MainMUSDVault public mainVault;
    MezoTestnetSwapPool public swapPool;
    IslandVault public vaultImpl;
    IslandFactory public factory;
    IslandCreditCouncil public council;

    address public admin = address(this);
    address public lp1 = address(0x1111);
    address public lp2 = address(0x2222);
    address public islandOwner = address(0x3333);
    address public agentOp = address(0x4444);
    address public councilOp = address(0x5555);
    address public attacker = address(0x6666);

    function setUp() public {
        vm.warp(1_700_000_000);
        musd = new MockMUSD();
        priceFeed = new MockPriceFeed(90_000 ether); // $90,000 BTC

        mainVault = new MainMUSDVault(address(musd));
        swapPool = new MezoTestnetSwapPool(address(musd), address(priceFeed));
        vaultImpl = new IslandVault(address(musd), address(priceFeed));
        factory = new IslandFactory(
            address(vaultImpl),
            address(musd),
            address(0),
            address(swapPool)
        );
        council = new IslandCreditCouncil(
            address(mainVault),
            address(factory),
            councilOp
        );

        mainVault.setCreditCouncil(address(council));
        factory.setCreditCouncil(address(council));

        // Seed Swap Pool with 2 BTC + 200,000 MUSD
        vm.deal(admin, 50 ether);
        musd.mint(admin, 300_000 ether);
        musd.approve(address(swapPool), 200_000 ether);
        swapPool.fundLiquidity{value: 2 ether}(200_000 ether);

        // Mint test MUSD & BTC to actors
        musd.mint(lp1, 10_000 ether);
        musd.mint(lp2, 10_000 ether);
        musd.mint(islandOwner, 5_000 ether);
        musd.mint(attacker, 5_000 ether);
        vm.deal(lp1, 2 ether);
        vm.deal(islandOwner, 5 ether);
        vm.deal(attacker, 5 ether);
    }

    function testMainMusdVaultSharesAndAntiFrontRunHold() public {
        vm.startPrank(lp1);
        musd.approve(address(mainVault), 1_000 ether);
        uint256 shares1 = mainVault.depositMUSD(1_000 ether);
        require(shares1 > 0, "Should mint vault shares");

        // Immediate same-block withdraw must revert (anti-front-run hold period)
        bool reverted = false;
        try mainVault.withdrawMUSD(shares1) returns (uint256) {
            reverted = false;
        } catch {
            reverted = true;
        }
        require(reverted, "Same-block withdrawal must respect minHoldSeconds");

        vm.warp(block.timestamp + 65);
        uint256 out1 = mainVault.withdrawMUSD(shares1 / 2);
        require(out1 >= 499 ether && out1 <= 501 ether, "Should withdraw half cleanly");
        vm.stopPrank();
    }

    function testCreateEmptyIslandMinimumsAndOwnership() public {
        // Below seed minimum must revert
        vm.startPrank(islandOwner);
        bool reverted = false;
        try factory.createIsland{value: 0.00001 ether}("Too Tiny", "meadow", 0, agentOp) {
            reverted = false;
        } catch {
            reverted = true;
        }
        require(reverted, "Tiny seed must revert");

        // Create Island 1 with 100 MUSD seed
        musd.approve(address(factory), 100 ether);
        (uint256 id1, address vault1) = factory.createIsland("Alpha Island", "meadow", 100 ether, agentOp);
        require(id1 == 1, "First island ID should be 1");
        require(factory.isRegisteredVault(vault1), "Vault must be registered");
        require(IIslandVault(vault1).trackedMusdBalance() == 100 ether, "Seed MUSD tracked");
        require(IIslandVault(vault1).activeCostBasisUsd() == 100 ether, "Cost basis initialized to $100");
        require(IIslandVault(vault1).getNetProfitUsd() == 0, "Initial profit must be 0");

        // Create Island 2 with 0.001 BTC seed
        (uint256 id2, address vault2) = factory.createIsland{value: 0.001 ether}("Bitcoin Peak", "basalt", 0, agentOp);
        require(id2 == 2, "Second island ID should be 2");
        require(IIslandVault(vault2).trackedBtcBalance() == 0.001 ether, "Seed BTC tracked");

        IIslandFactory.IslandSummary[] memory owned = factory.getIslandsByOwner(islandOwner);
        require(owned.length == 2, "Should list both islands for backfill");
        vm.stopPrank();
    }

    function testRejectDirectTransferAndSelfdestructSpoofing() public {
        vm.startPrank(islandOwner);
        musd.approve(address(factory), 100 ether);
        (, address vaultAddr) = factory.createIsland("Secure Island", "meadow", 100 ether, agentOp);
        vm.stopPrank();

        // Attacker tries raw ERC-20 transfer to spoof profit
        vm.startPrank(attacker);
        musd.transfer(vaultAddr, 500 ether);
        // Raw BTC send must revert
        (bool ethSent, ) = vaultAddr.call{value: 0.5 ether}("");
        require(!ethSent, "Direct BTC transfer to IslandVault must revert");
        vm.stopPrank();

        IslandVault iv = IslandVault(payable(vaultAddr));
        require(iv.trackedMusdBalance() == 100 ether, "Tracked MUSD ignores raw transfer");
        require(iv.getCurrentGrossNavUsd() == 100 ether, "Gross NAV ignores raw transfer");
        require(iv.getNetProfitUsd() == 0, "Transfer spoofing yields zero profit");
    }

    function testEndToEndProfitProofCouncilAutoDisburseAndRepay() public {
        // 1. Main Island LPs deposit 5,000 MUSD into MainMUSDVault
        vm.startPrank(lp1);
        musd.approve(address(mainVault), 5_000 ether);
        mainVault.depositMUSD(5_000 ether);
        vm.stopPrank();

        // 2. Owner deploys empty Sub-Island seeded with 100 MUSD
        vm.startPrank(islandOwner);
        musd.approve(address(factory), 100 ether);
        (uint256 islandId, address vaultAddr) = factory.createIsland(
            "Quant Alpha",
            "grid",
            100 ether,
            agentOp
        );
        vm.stopPrank();

        IslandVault iv = IslandVault(payable(vaultAddr));

        // 3. Custom agent buys BTC with 15 MUSD (under 25% maxSingleTradeBps cap)
        vm.prank(agentOp);
        uint256 btcBought = iv.executeWhitelistedSwap(false, 15 ether, 1);
        require(btcBought > 0, "Should receive BTC from swap pool");

        // 4. BTC price rises from $90,000 to $135,000 (+50%)
        priceFeed.setPrice(135_000 ether);

        // Agent swaps BTC back to MUSD (~$22.45 / $107.45 = ~20.9% <= 25% cap) -> ~$7.45 net profit
        vm.prank(agentOp);
        iv.executeWhitelistedSwap(true, btcBought, 1);

        uint256 profitNow = iv.getNetProfitUsd();
        require(profitNow > 7 ether, "Should realize > $7 profit");

        // 5. Record on-chain verifiable Profit Checkpoint
        vm.prank(agentOp);
        uint256 cpId = iv.recordProfitCheckpoint(keccak256("AGENT_QUANT_RUN_01"));

        // 6. Owner applies for a 35 MUSD expansion loan (within 5x profit ~$37 and 80% equity ~$85)
        vm.prank(islandOwner);
        uint256 appId = council.submitLoanApplication(
            islandId,
            cpId,
            35 ether,
            30,
            keccak256("SCALE_BTC_DCA_EXPANSION")
        );

        // 7. Main Island 5-Agent Council records decision (<= 500 MUSD -> Auto-Disbursed)
        vm.prank(councilOp);
        council.recordCouncilDecision(
            appId,
            1, // APPROVED
            35 ether,
            1000, // 10.00% APR
            keccak256("COUNCIL_VERDICT_OPTIMUS_IRONHIDE_APPROVED")
        );

        // CRITICAL INVARIANT: Receiving 35 MUSD loan must NOT inflate vault profit!
        require(iv.trackedMusdBalance() > 142 ether, "Vault received 35 MUSD loan");
        require(iv.outstandingLoanPrincipalMusd() == 35 ether, "Debt liability recorded");
        uint256 profitAfterLoan = iv.getNetProfitUsd();
        require(
            profitAfterLoan <= profitNow + 1 wei && profitAfterLoan + 1 wei >= profitNow,
            "Loan disbursement must not inflate vault net profit"
        );

        // Owner cannot strip collateral below maintenance coverage while loan is active
        vm.startPrank(islandOwner);
        bool withdrawBlocked = false;
        try iv.withdrawMusd(115 ether) {
            withdrawBlocked = false;
        } catch {
            withdrawBlocked = true;
        }
        require(withdrawBlocked, "Withdrawing collateral below coverage must revert");
        vm.stopPrank();

        // 8. Advance 30 days -> Verify O(1) accrued interest & full repayment from Sub-Island Vault
        uint256 assetsBeforeYield = mainVault.totalAssets();
        vm.warp(block.timestamp + 30 days);
        uint256 assetsWithAccruedYield = mainVault.totalAssets();
        require(assetsWithAccruedYield > assetsBeforeYield, "MainMUSDVault accrued linear loan interest");

        uint256 interestOwed = council.getTotalInterestOwed(appId);
        require(interestOwed > 0, "Should accrue non-zero interest over 30 days");

        vm.prank(islandOwner);
        council.repayLoanFromVault(appId, 35 ether + interestOwed);

        (, , , , , , , , , , , , , , , , , , , , , IslandCreditCouncil.LoanStatus finalStatus) = council.applications(appId);
        require(finalStatus == IslandCreditCouncil.LoanStatus.REPAID, "Loan should be fully REPAID");
        require(iv.outstandingLoanPrincipalMusd() == 0, "Vault debt cleared");
        require(council.creditScoreBps(islandId) == 6750, "Sub-Island credit score boosted to 6750");
        require(mainVault.sharePriceE18() > 1 ether, "Main Island LP share price increased from yield");
    }

    function testOwnerApprovalAboveAutoCapAndDefaultLiquidation() public {
        vm.startPrank(lp1);
        musd.approve(address(mainVault), 10_000 ether);
        mainVault.depositMUSD(10_000 ether);
        vm.stopPrank();

        // Seed Island with 1,000 MUSD
        vm.startPrank(islandOwner);
        musd.approve(address(factory), 1_000 ether);
        (uint256 islandId, address vaultAddr) = factory.createIsland("Mega Island", "sand", 1_000 ether, agentOp);
        vm.stopPrank();

        IslandVault iv = IslandVault(payable(vaultAddr));
        vm.prank(agentOp);
        uint256 btcOut = iv.executeWhitelistedSwap(false, 250 ether, 1);

        // Price doubles -> large verified profit (~+$250); sell back in 2 PolicyVault-compliant tranches
        priceFeed.setPrice(180_000 ether);
        uint256 halfBtc = btcOut / 2;
        vm.startPrank(agentOp);
        iv.executeWhitelistedSwap(true, halfBtc, 1);
        iv.executeWhitelistedSwap(true, btcOut - halfBtc, 1);
        uint256 cpId = iv.recordProfitCheckpoint(keccak256("MEGA_PROFIT"));
        vm.stopPrank();

        vm.prank(islandOwner);
        uint256 appId = council.submitLoanApplication(islandId, cpId, 600 ether, 15, keccak256("LARGE_LOAN"));

        // Council approves 600 MUSD (> 500 autoDisburseCap) -> AWAITING_OWNER
        vm.prank(councilOp);
        council.recordCouncilDecision(appId, 1, 600 ether, 1200, keccak256("WAIT_OWNER"));

        (, , , , , , , , , , , , , , , , , , , , , IslandCreditCouncil.LoanStatus st) = council.applications(appId);
        require(st == IslandCreditCouncil.LoanStatus.APPROVED_AWAITING_OWNER, "Large loan must await owner finality");

        // Owner finalizes & disburses
        council.finalizeAndDisburseLoan(appId);

        // Warp past 15-day dueDate -> Permissionless liquidation recovers MainMUSDVault capital
        vm.warp(block.timestamp + 16 days);
        council.liquidateDefaultedLoan(appId);

        (, , , , , , , , , , , , , , , , , , , , , IslandCreditCouncil.LoanStatus postLiq) = council.applications(appId);
        require(postLiq == IslandCreditCouncil.LoanStatus.DEFAULT_LIQUIDATED, "Loan marked LIQUIDATED");
        require(council.creditScoreBps(islandId) == 5000, "Credit score slashed on default");
        require(mainVault.trackedLiquidMusd() > 9_900 ether, "MainMUSDVault recovered principal + interest");
    }

    function testProportionalCostBasisPreventsLossWashing() public {
        // Seed 1,000 MUSD, swap 250 MUSD to BTC, BTC crashes 50% -> portfolio loses ~$125
        vm.startPrank(islandOwner);
        musd.approve(address(factory), 1_000 ether);
        (, address vaultAddr) = factory.createIsland("Loss Test", "meadow", 1_000 ether, agentOp);
        vm.stopPrank();

        IslandVault iv = IslandVault(payable(vaultAddr));
        vm.prank(agentOp);
        iv.executeWhitelistedSwap(false, 250 ether, 1);

        priceFeed.setPrice(45_000 ether); // -50% crash
        require(iv.getNetProfitUsd() == 0, "Loss must yield 0 profit");

        // Withdraw 437.5 MUSD (~50% of ~$875 equity) and re-deposit 437.5 MUSD
        vm.startPrank(islandOwner);
        iv.withdrawMusd(437.5 ether);
        musd.approve(address(vaultAddr), 437.5 ether);
        iv.depositMusd(437.5 ether);
        vm.stopPrank();

        // Cost basis still exceeds equity (~$1000 vs ~$875) -> profit remains 0!
        require(iv.getNetProfitUsd() == 0, "Cannot wash losses via partial withdraw + redeposit");
    }
}
