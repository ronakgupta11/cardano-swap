// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { AddressLib, Address } from "./libraries/AddressLib.sol";
import { Timelocks, TimelocksLib } from "./libraries/TimelocksLib.sol";

import { IBaseEscrow } from "./interfaces/IBaseEscrow.sol";
import { BaseEscrow } from "./BaseEscrow.sol";
import { Escrow } from "./Escrow.sol";

/**
 * @title cardano Source Escrow for EVM→cardano atomic swaps
 * @notice Escrow contract for EVM→cardano swaps - holds ERC20/ETH, releases when taker provides secret
 * @dev Used when EVM tokens are the source and cardano is the destination
 * @custom:security-contact security@atomicswap.io
 */
contract EscrowSrc is Escrow {
    using SafeERC20 for IERC20;
    using AddressLib for Address;
    using TimelocksLib for Timelocks;

    /// @notice cardano address where funds should be sent
    mapping(bytes32 => string) public cardanoAddresses;
    
    /// @notice cardano transaction hash for verification (optional)
    mapping(bytes32 => string) public cardanoTxHashes;

    event cardanoAddressRecorded(bytes32 indexed hashlock, string cardanoAddress);
    event cardanoTxHashRecorded(bytes32 indexed hashlock, string cardanoTxHash);

    constructor(uint32 rescueDelay, IERC20 accessToken) BaseEscrow(rescueDelay, accessToken) {}

    // Allow contract to receive ETH
    receive() external payable {}

    /**
     * @notice Private withdrawal by taker using secret
     * @dev Taker reveals secret to claim EVM tokens after providing cardano to maker
     * @param secret The secret that matches the hashlock
     * @param immutables The escrow immutables
     */
             // onlyAfter(immutables.timelocks.get(TimelocksLib.Stage.DstWithdrawal))
        /* onlyBefore(immutables.timelocks.get(TimelocksLib.Stage.DstCancellation)) */
    function withdraw(bytes32 secret, Immutables calldata immutables)
        external
        override
        onlyValidImmutables(immutables)
        onlyValidSecret(secret, immutables)
    {
        // Allow both maker and taker to withdraw in private period
        if (msg.sender != immutables.maker.get() && msg.sender != immutables.taker.get()) {
            revert InvalidCaller();
        }

        _withdraw( immutables);
    }

    /**
     * @notice Public withdrawal by anyone with access token
     * @dev Anyone with access token can trigger withdrawal in public period
     * @param secret The secret that matches the hashlock
     * @param immutables The escrow immutables
     */
    function publicWithdraw(bytes32 secret, Immutables calldata immutables)
        external
        onlyAccessTokenHolder()
        onlyValidImmutables(immutables)
        onlyValidSecret(secret, immutables)
        onlyAfter(immutables.timelocks.get(TimelocksLib.Stage.DstPublicWithdrawal))
        onlyBefore(immutables.timelocks.get(TimelocksLib.Stage.DstCancellation))
    {
        _withdraw( immutables);
    }

    /**
     * @notice Cancels escrow and returns funds to maker
     * @dev Can only be called after cancellation period starts
     * @param immutables The escrow immutables
     */
    function cancel(Immutables calldata immutables)
        external
        override
        onlyMaker(immutables)
        onlyValidImmutables(immutables)
        onlyAfter(immutables.timelocks.get(TimelocksLib.Stage.DstCancellation))
    {
        // Return tokens to maker
        _uniTransfer(immutables.token.get(), immutables.maker.get(), immutables.amount);
        // Return safety deposit to maker
        _ethTransfer(immutables.maker.get(), immutables.safetyDeposit);
        
        emit EscrowCancelled();
    }

    /**
     * @notice Records cardano address for the swap
     * @dev Links cardano address to escrow for verification
     * @param hashlock The escrow hashlock
     * @param cardanoAddress The cardano address where funds should be sent
     * @param immutables The escrow immutables
     */
    function recordcardanoAddress(
        bytes32 hashlock,
        string calldata cardanoAddress,
        Immutables calldata immutables
    )
        external
        onlyValidImmutables(immutables)
    {
        // Only maker can record cardano address
        if (msg.sender != immutables.maker.get()) {
            revert InvalidCaller();
        }

        cardanoAddresses[hashlock] = cardanoAddress;
        emit cardanoAddressRecorded(hashlock, cardanoAddress);
    }

    /**
     * @notice Records cardano transaction hash for verification
     * @dev Optional function to link cardano transaction to escrow
     * @param hashlock The escrow hashlock
     * @param cardanoTxHash The cardano transaction hash
     * @param immutables The escrow immutables
     */
    function recordcardanoTx(
        bytes32 hashlock,
        string calldata cardanoTxHash,
        Immutables calldata immutables
    )
        external
        onlyValidImmutables(immutables)
    {
        // Only taker can record cardano tx (proof of payment)
        if (msg.sender != immutables.taker.get()) {
            revert InvalidCaller();
        }

        cardanoTxHashes[hashlock] = cardanoTxHash;
        emit cardanoTxHashRecorded(hashlock, cardanoTxHash);
    }

    /**
     * @notice Gets recorded cardano address
     * @param hashlock The escrow hashlock
     * @return The cardano address
     */
    function getcardanoAddress(bytes32 hashlock) external view returns (string memory) {
        return cardanoAddresses[hashlock];
    }

    /**
     * @notice Gets recorded cardano transaction hash
     * @param hashlock The escrow hashlock
     * @return The cardano transaction hash
     */
    function getcardanoTxHash(bytes32 hashlock) external view returns (string memory) {
        return cardanoTxHashes[hashlock];
    }

    /**
     * @dev Internal withdrawal logic
     * @param immutables The escrow immutables
     */
    function _withdraw( Immutables calldata immutables) internal {

        // Transfer tokens to taker
        _uniTransfer(immutables.token.get(), immutables.taker.get(), immutables.amount);
        
        // Return safety deposit to maker
        _ethTransfer(immutables.taker.get(), immutables.safetyDeposit);
        
        emit EscrowWithdrawal();
    }
} 