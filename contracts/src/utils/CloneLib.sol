// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title CloneLib
 * @notice Minimal dependency-free EIP-1167 minimal proxy deployer (CREATE2).
 */
library CloneLib {
    error CloneFailed();

    function cloneDeterministic(address implementation, bytes32 salt) internal returns (address instance) {
        /// @solidity memory-safe-assembly
        assembly {
            let ptr := mload(0x40)
            mstore(0x40, add(ptr, 0x60))
            // Bytes 0..19: EIP-1167 creation header (10B) + runtime prefix (10B)
            mstore(ptr, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
            // Bytes 20..39: 20-byte implementation address
            mstore(add(ptr, 0x14), shl(0x60, implementation))
            // Bytes 40..54: 15-byte runtime delegatecall suffix
            mstore(add(ptr, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
            instance := create2(0, ptr, 0x37, salt)
        }
        if (instance == address(0)) revert CloneFailed();
    }
}
