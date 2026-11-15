// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/MainMEZOVault.sol";
import "../src/MezoCityFeeSplitter.sol";
import "../src/MezoCityGovernor.sol";
import "../src/MainMUSDVault.sol";
import "../src/MezoTestnetSwapPool.sol";
import "../src/IslandVault.sol";
import "../src/IslandFactory.sol";
import "../src/IslandCreditCouncil.sol";

interface VmGovTest {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function deal(address who, uint256 newBalance) external;
    function warp(uint256 newTimestamp) external;
}

contract MockGovToken {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "ERC20: balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "ERC20: balance");
        require(allowance[from][msg.sender] >= amount, "ERC20: allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockGovPriceFeed {
    uint256 public price = 90_000 ether;

    function fetchPrice() external view returns (uint256) {
        return price;
    }

    function setPrice(uint256 _p) external {
        price = _p;
    }
}

contract GovernanceAndRevenueTest {
    VmGovTest constant vm =
        VmGovTest(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockGovToken public mezo;
    MockGovToken public musd;
    MockGovPriceFeed public feed;

    MainMEZOVault public mainMezoVault;
    MezoCityFeeSplitter public feeSplitter;
    MezoCityGovernor public governor;

    MainMUSDVault public mainMusdVault;
    MezoTestnetSwapPool public swapPool;
    IslandVault public vaultImpl;
    IslandFactory public islandFactory;
    IslandCreditCouncil public creditCouncil;

    address public treasury = address(0xAAA1);
    address public guardian = address(0xBBB2);
    address public alice = address(0x1111);
    address public bob = address(0x2222);
    address public charlie = address(0x3333);

    function setUp() public {
        vm.warp(1_700_000_000);
        mezo = new MockGovToken("Mezo", "MEZO");
        musd = new MockGovToken("Mezo USD", "MUSD");
        feed = new MockGovPriceFeed();

        mainMezoVault = new MainMEZOVault(address(mezo), address(musd), address(this));
        feeSplitter = new MezoCityFeeSplitter(
            address(musd),
            address(mainMezoVault),
            treasury,
            address(0)
        );
        mainMezoVault.setRewardDistributor(address(feeSplitter));

        governor = new MezoCityGovernor(
            address(mainMezoVault),
            guardian,
            50 ether,  // proposalThresholdPower
            100 ether, // quorumPower
            1 days,    // votingPeriodSeconds
            1 hours    // executionDelaySeconds
        );
        feeSplitter.setGovernance(address(governor));

        mainMusdVault = new MainMUSDVault(address(musd));
        swapPool = new MezoTestnetSwapPool(address(musd), address(feed));
        vaultImpl = new IslandVault(address(musd), address(feed));
        islandFactory = new IslandFactory(
            address(vaultImpl),
            address(musd),
            address(0),
            address(swapPool)
        );
        creditCouncil = new IslandCreditCouncil(
            address(mainMusdVault),
            address(islandFactory),
            address(this)
        );
        mainMusdVault.setCreditCouncil(address(creditCouncil));
        islandFactory.setCreditCouncil(address(creditCouncil));

        mezo.mint(alice, 1_000 ether);
        mezo.mint(bob, 1_000 ether);
        musd.mint(address(this), 50_000 ether);
        musd.mint(alice, 5_000 ether);
        musd.mint(bob, 5_000 ether);
        musd.mint(charlie, 5_000 ether);

        vm.deal(address(this), 20 ether);
        vm.deal(alice, 5 ether);
        vm.deal(bob, 5 ether);
        vm.deal(charlie, 5 ether);

        musd.approve(address(swapPool), 20_000 ether);
        swapPool.fundLiquidity{value: 10 ether}(20_000 ether);
    }

    function testFeeSplitterRoutingBufferAndBadDebtCoverage() public {
        // 1. Revenue collected before any MEZO staker exists buffers cleanly without reverting
        musd.approve(address(feeSplitter), 100 ether);
        feeSplitter.collectRevenue(feeSplitter.STREAM_GUARD_PREMIUM(), 100 ether, "RESCUE_FEE_1");

        require(feeSplitter.totalCollectedMusd() == 100 ether, "Total collected should be 100");
        require(musd.balanceOf(treasury) == 30 ether, "Treasury must receive 30%");
        require(feeSplitter.insuranceReserveBalanceMusd() == 20 ether, "Insurance reserve must hold 20%");
        require(feeSplitter.pendingStakerRewardsMusd() == 50 ether, "50 MUSD buffered while weight == 0");

        // 2. Alice stakes 200 MEZO at 90d (2.5x = 500 weighted power) and flushes buffered rewards
        vm.startPrank(alice);
        mezo.approve(address(mainMezoVault), 200 ether);
        mainMezoVault.stakeMezo(200 ether, mainMezoVault.TIER_90_DAYS());
        vm.stopPrank();

        uint256 flushed = feeSplitter.flushPendingStakerRewards();
        require(flushed == 50 ether, "50 MUSD must flush to MainMEZOVault");
        require(feeSplitter.pendingStakerRewardsMusd() == 0, "Pending buffer cleared");

        vm.warp(block.timestamp + 65);
        vm.prank(alice);
        uint256 claimed = mainMezoVault.claimRewards();
        require(claimed == 50 ether, "Alice should claim full 50 MUSD staker share");

        // 3. Cover bad debt from accumulated internal insurance reserve
        feeSplitter.coverBadDebt(address(mainMusdVault), 15 ether);
        require(feeSplitter.insuranceReserveBalanceMusd() == 5 ether, "Insurance balance reduced to 5");
    }

    function testGovernorProposalVoteTimelockAndParameterExecution() public {
        feeSplitter.transferOwnership(address(governor));
        mainMusdVault.transferOwnership(address(governor));

        // Alice & Bob stake MEZO
        vm.startPrank(alice);
        mezo.approve(address(mainMezoVault), 200 ether);
        mainMezoVault.stakeMezo(200 ether, mainMezoVault.TIER_90_DAYS()); // 500 power
        vm.stopPrank();

        vm.startPrank(bob);
        mezo.approve(address(mainMezoVault), 100 ether);
        mainMezoVault.stakeMezo(100 ether, mainMezoVault.TIER_FLEXIBLE()); // 100 power
        vm.stopPrank();

        // Flash-loan resistance: creating proposal before minHoldSeconds must revert
        bytes memory splitCall = abi.encodeWithSignature(
            "setFeeSplitBps(uint16,uint16,uint16)",
            uint16(6000),
            uint16(2500),
            uint16(1500)
        );
        uint8 catFeeSplit = governor.CATEGORY_FEE_SPLIT();
        uint8 voteFor = governor.VOTE_FOR();
        uint8 voteAgainst = governor.VOTE_AGAINST();

        bool reverted = false;
        vm.prank(alice);
        try governor.createProposal(
            catFeeSplit,
            address(feeSplitter),
            0,
            splitCall,
            "Boost MEZO staker share to 60%",
            "Raise real MUSD fee share from 50% to 60%."
        ) {
            reverted = false;
        } catch {
            reverted = true;
        }
        require(reverted, "Immediate governance action must fail before hold window");

        vm.warp(block.timestamp + 65);

        vm.prank(alice);
        uint256 propId = governor.createProposal(
            catFeeSplit,
            address(feeSplitter),
            0,
            splitCall,
            "Boost MEZO staker share to 60%",
            "Raise real MUSD fee share from 50% to 60%."
        );

        vm.prank(alice);
        governor.castVote(propId, voteFor); // +500

        vm.prank(bob);
        governor.castVote(propId, voteAgainst); // +100

        vm.warp(block.timestamp + 1 days + 1);
        require(
            governor.stateOf(propId) == MezoCityGovernor.ProposalState.SUCCEEDED,
            "Proposal must succeed"
        );

        governor.queueProposal(propId);
        // Execution before ETA must revert
        bool timelockBlocked = false;
        try governor.executeProposal(propId) {
            timelockBlocked = false;
        } catch {
            timelockBlocked = true;
        }
        require(timelockBlocked, "Timelock must block premature execution");

        vm.warp(block.timestamp + 1 hours + 1);
        governor.executeProposal(propId);

        require(feeSplitter.mezoStakersBps() == 6000, "Fee split updated to 60%");
        require(feeSplitter.treasuryBps() == 2500, "Treasury split updated to 25%");
        require(feeSplitter.insuranceBps() == 1500, "Insurance split updated to 15%");
    }

    function testAutomatedFeeHooksCreditSwapAndMezoTierMintDiscount() public {
        // Alice reaches Citadel Council tier (>= 500 coordination power)
        vm.startPrank(alice);
        mezo.approve(address(mainMezoVault), 200 ether);
        mainMezoVault.stakeMezo(200 ether, mainMezoVault.TIER_90_DAYS());
        vm.stopPrank();
        vm.warp(block.timestamp + 65);

        // Configure live fee hooks across Vault, SwapPool, and IslandFactory
        mainMusdVault.setProtocolFeeConfig(address(feeSplitter), 1500); // 15% of loan interest
        swapPool.setFeeSplitterConfig(address(feeSplitter), 5000);     // 50% of 10 bps swap fee
        islandFactory.setCreationFeeConfig(
            address(feeSplitter),
            address(mainMezoVault),
            10 ether,
            100 ether,
            500 ether
        );

        // 1. Citadel member Alice launches Sub-Island for $0 mint fee
        require(islandFactory.effectiveCreationFeeMusd(alice) == 0, "Citadel member pays 0 mint fee");
        vm.startPrank(alice);
        musd.approve(address(islandFactory), 100 ether);
        (uint256 aliceIslandId, address aliceVaultAddr) = islandFactory.createIsland{value: 0.01 ether}(
            "Citadel Quant Isle",
            "meadow",
            100 ether,
            alice
        );
        vm.stopPrank();

        // 2. Standard wallet Charlie pays 10 MUSD mint fee -> routed automatically into FeeSplitter
        require(islandFactory.effectiveCreationFeeMusd(charlie) == 10 ether, "Standard wallet pays 10 MUSD fee");
        vm.startPrank(charlie);
        musd.approve(address(islandFactory), 50 ether);
        islandFactory.createIsland{value: 0.01 ether}("Charlie Carry Isle", "sand", 20 ether, charlie);
        vm.stopPrank();
        require(feeSplitter.streamTotalsMusd(feeSplitter.STREAM_SAAS_MINT()) == 10 ether, "10 MUSD mint fee tracked");

        // 3. LP deposits MUSD -> Alice Sub-Island executes profitable swap -> swap fee auto-routes
        vm.startPrank(bob);
        musd.approve(address(mainMusdVault), 2_000 ether);
        mainMusdVault.depositMUSD(2_000 ether);
        vm.stopPrank();

        vm.prank(alice);
        IslandVault(payable(aliceVaultAddr)).executeWhitelistedSwap(true, 0.002 ether, 1 ether);
        require(feeSplitter.streamTotalsMusd(feeSplitter.STREAM_SWAP_EARN_FEE()) > 0, "Swap fee auto-routed");

        // BTC rises -> profit checkpoint -> borrow 100 MUSD -> warp 30 days -> repay with interest
        feed.setPrice(135_000 ether);
        vm.prank(alice);
        uint256 cpId = IslandVault(payable(aliceVaultAddr)).recordProfitCheckpoint(keccak256("cp1"));

        vm.prank(alice);
        uint256 appId = creditCouncil.submitLoanApplication(aliceIslandId, cpId, 100 ether, 30, keccak256("plan1"));
        creditCouncil.recordCouncilDecision(appId, 1, 100 ether, 1000, keccak256("verdict1")); // 10% APR

        vm.warp(block.timestamp + 30 days);
        vm.prank(alice);
        creditCouncil.repayLoanFromVault(appId, 200 ether);

        uint256 creditFees = feeSplitter.streamTotalsMusd(feeSplitter.STREAM_CREDIT_SPREAD());
        require(creditFees > 0, "Credit interest spread auto-routed to FeeSplitter");
        require(mainMezoVault.earnedMusd(alice) > 0, "Alice earned MUSD rewards from all city fee streams");
    }

    function testCitizenIslandEndorsementsAndGuardianCancel() public {
        vm.startPrank(alice);
        mezo.approve(address(mainMezoVault), 200 ether);
        mainMezoVault.stakeMezo(200 ether, mainMezoVault.TIER_30_DAYS()); // 300 power
        vm.stopPrank();
        vm.warp(block.timestamp + 65);

        vm.prank(alice);
        governor.endorseIsland(1);
        require(governor.islandEndorsementPower(1) == 300 ether, "Island 1 endorsed with 300 power");

        // Switching endorsement moves power cleanly
        vm.prank(alice);
        governor.endorseIsland(2);
        require(governor.islandEndorsementPower(1) == 0, "Island 1 endorsement cleared");
        require(governor.islandEndorsementPower(2) == 300 ether, "Island 2 endorsed with 300 power");

        // Guardian can cancel malicious proposals
        uint8 catCustom = governor.CATEGORY_CUSTOM();
        vm.prank(alice);
        uint256 propId = governor.createProposal(
            catCustom,
            address(feeSplitter),
            0,
            "",
            "Test Cancel Proposal",
            "Guardian test."
        );
        vm.prank(guardian);
        governor.cancelProposal(propId);
        require(governor.stateOf(propId) == MezoCityGovernor.ProposalState.CANCELED, "Guardian canceled");
    }
}
