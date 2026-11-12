// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ReentrancyGuardLite
 * @notice Compact clone-safe reentrancy lock using storage slot 2 (1 = unlocked, 2 = locked) so EIP-1167 clones start safe.
 */
abstract contract ReentrancyGuardLite {
    uint256 private _reentrancyStatus;

    error ReentrantCall();

    modifier nonReentrant() {
        if (_reentrancyStatus == 2) revert ReentrantCall();
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
    }
}
