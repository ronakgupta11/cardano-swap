// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title IAtomicSwapLOP
 * @notice Interface for Limit Order Protocol atomic swap orders
 */
interface IAtomicSwapLOP {
    struct Order {
        address maker;
        address makerAsset;
        address takerAsset;
        uint256 makingAmount;
        uint256 takingAmount;
        address receiver;
        bytes32 hashlock;
        uint256 salt;
    }
}

/**
 * @title IPostInteraction
 * @notice A generic interface for post-fill actions.
 * @dev Your EscrowFactory will implement this to be called by the LOP.
 */
interface IPostInteraction {
    function postInteraction(
        IAtomicSwapLOP.Order calldata order,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 safetyDeposit
    ) external payable;
}