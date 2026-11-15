// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/MainMEZOVault.sol";

interface VmDeployMezo {
    function startBroadcast() external;
    function stopBroadcast() external;
    function envOr(string calldata name, address defaultValue) external view returns (address);
}

/**
 * @title DeployMainMezoVault
 * @notice Additive deployment script for MainMEZOVault on Mezo Testnet (Chain ID: 31611).
 */
contract DeployMainMezoVault {
    VmDeployMezo constant vm =
        VmDeployMezo(address(uint160(uint256(keccak256("hevm cheat code")))));

    address constant DEFAULT_MEZO_TOKEN = 0x7B7c000000000000000000000000000000000001;
    address constant DEFAULT_MUSD_TOKEN = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;

    function run() external returns (MainMEZOVault mainMezoVault) {
        address mezoAddr = vm.envOr("MEZO_TOKEN_ADDRESS", DEFAULT_MEZO_TOKEN);
        address musdAddr = vm.envOr("MEZO_MUSD_ADDRESS", DEFAULT_MUSD_TOKEN);
        address distributor = vm.envOr("REWARD_DISTRIBUTOR_ADDRESS", msg.sender);

        vm.startBroadcast();
        mainMezoVault = new MainMEZOVault(mezoAddr, musdAddr, distributor);
        vm.stopBroadcast();
    }
}
