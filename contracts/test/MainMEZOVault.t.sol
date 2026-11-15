// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/MainMEZOVault.sol";

interface VmMezoTest {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256 newTimestamp) external;
}

contract MockERC20Token {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "ERC20: insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "ERC20: insufficient");
        require(allowance[from][msg.sender] >= amount, "ERC20: allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MainMEZOVaultTest {
    VmMezoTest constant vm = VmMezoTest(address(uint160(uint256(keccak256("hevm cheat code")))));

    MockERC20Token public mezo;
    MockERC20Token public musd;
    MainMEZOVault public vault;

    address public owner = address(this);
    address public distributor = address(0x5555);
    address public alice = address(0x1111);
    address public bob = address(0x2222);
    address public charlie = address(0x3333);

    function setUp() public {
        vm.warp(1_700_000_000);
        mezo = new MockERC20Token("Mezo", "MEZO");
        musd = new MockERC20Token("Mezo USD", "MUSD");
        vault = new MainMEZOVault(address(mezo), address(musd), distributor);

        mezo.mint(alice, 1_000 ether);
        mezo.mint(bob, 1_000 ether);
        mezo.mint(charlie, 1_000 ether);
        musd.mint(distributor, 10_000 ether);
    }

    function testStakeMultipliersAndFlashLoanHoldResistance() public {
        vm.startPrank(alice);
        mezo.approve(address(vault), 200 ether);
        vault.stakeMezo(200 ether, vault.TIER_FLEXIBLE());
        vm.stopPrank();

        // Coordination power must be 0 immediately after stake (anti-flash-loan hold window)
        require(vault.coordinationPowerOf(alice) == 0, "Immediate power must be 0");

        // Immediate unstake must revert before minHoldSeconds
        bool reverted = false;
        vm.startPrank(alice);
        try vault.unstakeMezo(50 ether) {
            reverted = false;
        } catch {
            reverted = true;
        }
        vm.stopPrank();
        require(reverted, "Immediate unstake should revert");

        // After 60 seconds hold window, full 1.0x weight becomes active
        vm.warp(block.timestamp + 61);
        require(vault.coordinationPowerOf(alice) == 200 ether, "Power should be 200 MEZO");

        // Upgrade Alice to 90d tier (2.5x) by staking 100 more -> 300 * 2.5 = 750 power
        vm.startPrank(alice);
        mezo.approve(address(vault), 100 ether);
        vault.stakeMezo(100 ether, vault.TIER_90_DAYS());
        vm.stopPrank();

        require(vault.coordinationPowerOf(alice) == 0, "Power resets during hold after topup");
        vm.warp(block.timestamp + 61);
        require(vault.coordinationPowerOf(alice) == 750 ether, "Weighted 2.5x power must be 750");
    }

    function testLockEnforcementAndUpgradeVsDowngrade() public {
        vm.startPrank(bob);
        mezo.approve(address(vault), 300 ether);
        vault.stakeMezo(100 ether, vault.TIER_30_DAYS());

        vm.warp(block.timestamp + 120);

        // Cannot downgrade while 30d lock is active
        bool downgradeReverted = false;
        try vault.stakeMezo(50 ether, vault.TIER_FLEXIBLE()) {
            downgradeReverted = false;
        } catch {
            downgradeReverted = true;
        }
        require(downgradeReverted, "Downgrade before lock expiry must revert");

        // Cannot unstake before 30 days lock expiry
        bool earlyUnstakeReverted = false;
        try vault.unstakeMezo(50 ether) {
            earlyUnstakeReverted = false;
        } catch {
            earlyUnstakeReverted = true;
        }
        require(earlyUnstakeReverted, "Early unstake must revert");

        // Wait past 30 days -> unstake half, then convert remaining into Flexible cleanly
        vm.warp(block.timestamp + 30 days + 1);
        vault.unstakeMezo(50 ether);
        require(mezo.balanceOf(bob) == 950 ether, "Bob should receive 50 MEZO back");

        vault.stakeMezo(50 ether, vault.TIER_FLEXIBLE());
        vm.stopPrank();

        (, uint256 weight,,, uint8 tierId,,, bool isLocked) = vault.getPosition(bob);
        require(tierId == vault.TIER_FLEXIBLE(), "Tier should switch to flexible after expiry");
        require(!isLocked, "Position should be unlocked");
        require(weight == 100 ether, "1.0x flexible weight must be 100");
    }

    function testMusdFeeShareRewardsProportionalDistribution() public {
        // Notifying rewards when no stakers exist must revert cleanly
        vm.startPrank(distributor);
        musd.approve(address(vault), 1_000 ether);
        bool noStakerReverted = false;
        try vault.notifyRewardMusd(100 ether) {
            noStakerReverted = false;
        } catch {
            noStakerReverted = true;
        }
        vm.stopPrank();
        require(noStakerReverted, "notifyRewardMusd with 0 weight should revert");

        // Alice stakes 100 Flexible (100 weight), Bob stakes 100 90d (250 weight) => total 350 weight
        vm.startPrank(alice);
        mezo.approve(address(vault), 100 ether);
        vault.stakeMezo(100 ether, vault.TIER_FLEXIBLE());
        vm.stopPrank();

        vm.startPrank(bob);
        mezo.approve(address(vault), 100 ether);
        vault.stakeMezo(100 ether, vault.TIER_90_DAYS());
        vm.stopPrank();

        vm.warp(block.timestamp + 65);

        // Unauthorized caller cannot notify rewards
        bool unauthReverted = false;
        vm.startPrank(charlie);
        try vault.notifyRewardMusd(100 ether) {
            unauthReverted = false;
        } catch {
            unauthReverted = true;
        }
        vm.stopPrank();
        require(unauthReverted, "Unauthorized distributor should revert");

        // Distributor funds 350 MUSD -> Alice gets 100 MUSD, Bob gets 250 MUSD
        vm.startPrank(distributor);
        musd.approve(address(vault), 350 ether);
        vault.notifyRewardMusd(350 ether);
        vm.stopPrank();

        // Charlie enters AFTER reward notification -> must get 0 retroactive MUSD
        vm.startPrank(charlie);
        mezo.approve(address(vault), 100 ether);
        vault.stakeMezo(100 ether, vault.TIER_FLEXIBLE());
        vm.stopPrank();
        require(vault.earnedMusd(charlie) == 0, "Late staker must earn 0 prior rewards");

        vm.startPrank(alice);
        uint256 alicePaid = vault.claimRewards();
        vm.stopPrank();
        vm.startPrank(bob);
        uint256 bobPaid = vault.claimRewards();
        vm.stopPrank();

        require(alicePaid == 100 ether, "Alice must receive exact 100 MUSD");
        require(bobPaid == 250 ether, "Bob must receive exact 250 MUSD");
    }

    function testEmergencyPauseBlocksNewStakesButAllowsUnstake() public {
        vm.startPrank(alice);
        mezo.approve(address(vault), 100 ether);
        vault.stakeMezo(50 ether, vault.TIER_FLEXIBLE());
        vm.stopPrank();

        vm.warp(block.timestamp + 65);
        vault.setGuardrails(60, true);

        bool pausedStakeReverted = false;
        vm.startPrank(alice);
        try vault.stakeMezo(50 ether, vault.TIER_FLEXIBLE()) {
            pausedStakeReverted = false;
        } catch {
            pausedStakeReverted = true;
        }
        require(pausedStakeReverted, "Pause must block new stakes");

        // Principal exit remains open even when paused
        vault.unstakeMezo(50 ether);
        vm.stopPrank();
        require(mezo.balanceOf(alice) == 1_000 ether, "Principal unstake must succeed during pause");
    }
}
