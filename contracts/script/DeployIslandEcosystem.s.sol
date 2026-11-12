// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/MainMUSDVault.sol";
import "../src/MezoTestnetSwapPool.sol";
import "../src/IslandVault.sol";
import "../src/IslandFactory.sol";
import "../src/IslandCreditCouncil.sol";

interface VmDeploy {
    function startBroadcast() external;
    function stopBroadcast() external;
    function envOr(string calldata name, address defaultValue) external view returns (address);
}

/**
 * @title DeployIslandEcosystem
 * @notice Additive deployment script for Main Island MUSD Vault, SwapPool, IslandFactory (Clones), and IslandCreditCouncil
 *         on Mezo Testnet (Chain ID: 31611) without altering existing Main Island contracts.
 */
contract DeployIslandEcosystem {
    VmDeploy constant vm = VmDeploy(address(uint160(uint256(keccak256("hevm cheat code")))));

    // Official Mezo Testnet (31611) MUSD & PriceFeed addresses
    address constant DEFAULT_MEZO_MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
    address constant DEFAULT_MEZO_PRICE_FEED = 0x86bCF0841622a5dAC14A313a15f96A95421b9366;

    function run()
        external
        returns (
            MainMUSDVault mainMusdVault,
            MezoTestnetSwapPool swapPool,
            IslandVault islandVaultImpl,
            IslandFactory islandFactory,
            IslandCreditCouncil creditCouncil
        )
    {
        address musdAddr = vm.envOr("MEZO_MUSD_ADDRESS", DEFAULT_MEZO_MUSD);
        address feedAddr = vm.envOr("MEZO_PRICE_FEED_ADDRESS", DEFAULT_MEZO_PRICE_FEED);
        address councilOp = vm.envOr("COUNCIL_OPERATOR_ADDRESS", msg.sender);

        vm.startBroadcast();

        mainMusdVault = new MainMUSDVault(musdAddr);
        swapPool = new MezoTestnetSwapPool(musdAddr, feedAddr);
        islandVaultImpl = new IslandVault(musdAddr, feedAddr);
        islandFactory = new IslandFactory(
            address(islandVaultImpl),
            musdAddr,
            address(0),
            address(swapPool)
        );
        creditCouncil = new IslandCreditCouncil(
            address(mainMusdVault),
            address(islandFactory),
            councilOp
        );

        mainMusdVault.setCreditCouncil(address(creditCouncil));
        islandFactory.setCreditCouncil(address(creditCouncil));

        vm.stopBroadcast();
    }
}
