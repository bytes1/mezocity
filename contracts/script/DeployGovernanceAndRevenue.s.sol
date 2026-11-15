// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../src/MainMEZOVault.sol";
import "../src/MezoCityFeeSplitter.sol";
import "../src/MezoCityGovernor.sol";

interface VmDeployGov {
    function startBroadcast() external;
    function stopBroadcast() external;
    function envOr(string calldata name, address defaultValue) external view returns (address);
    function envOr(string calldata name, uint256 defaultValue) external view returns (uint256);
}

/**
 * @title DeployGovernanceAndRevenue
 * @notice Additive deployment script for MezoCityFeeSplitter and MezoCityGovernor
 *         connecting MainMEZOVault and all revenue/governance streams on Mezo Testnet (31611).
 */
contract DeployGovernanceAndRevenue {
    VmDeployGov constant vm =
        VmDeployGov(address(uint160(uint256(keccak256("hevm cheat code")))));

    address constant DEFAULT_MUSD_TOKEN = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;

    function run() external returns (MezoCityFeeSplitter feeSplitter, MezoCityGovernor governor) {
        address musdAddr = vm.envOr("MEZO_MUSD_ADDRESS", DEFAULT_MUSD_TOKEN);
        address mainMezoVaultAddr = vm.envOr("MAIN_MEZO_VAULT_ADDRESS", address(0));
        address treasuryAddr = vm.envOr("PROTOCOL_TREASURY_ADDRESS", msg.sender);
        address insuranceAddr = vm.envOr("INSURANCE_RESERVE_ADDRESS", address(0));
        address guardianAddr = vm.envOr("GOVERNANCE_GUARDIAN_ADDRESS", msg.sender);

        uint256 thresholdPower = vm.envOr("GOV_PROPOSAL_THRESHOLD_WEI", uint256(50 ether));
        uint256 quorumPower = vm.envOr("GOV_QUORUM_POWER_WEI", uint256(100 ether));
        uint32 votingSecs = uint32(vm.envOr("GOV_VOTING_SECONDS", uint256(3 days)));
        uint32 timelockSecs = uint32(vm.envOr("GOV_TIMELOCK_SECONDS", uint256(1 hours)));

        require(mainMezoVaultAddr != address(0), "MAIN_MEZO_VAULT_ADDRESS is required");

        vm.startBroadcast();

        feeSplitter = new MezoCityFeeSplitter(
            musdAddr,
            mainMezoVaultAddr,
            treasuryAddr,
            insuranceAddr
        );

        governor = new MezoCityGovernor(
            mainMezoVaultAddr,
            guardianAddr,
            thresholdPower,
            quorumPower,
            votingSecs,
            timelockSecs
        );

        feeSplitter.setGovernance(address(governor));
        MainMEZOVault(mainMezoVaultAddr).setRewardDistributor(address(feeSplitter));

        vm.stopBroadcast();
    }
}
