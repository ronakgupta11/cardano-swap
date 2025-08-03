// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IBaseEscrow } from "./interfaces/IBaseEscrow.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import { AddressLib, Address } from "./libraries/AddressLib.sol";
import { ImmutablesLib } from "./libraries/ImmutablesLib.sol";
import { TimelocksLib, Timelocks } from "./libraries/TimelocksLib.sol";
import { ProxyHashLib } from "./libraries/ProxyHashLib.sol";
import { EscrowDst } from "./EscrowDst.sol";
import { EscrowSrc } from "./EscrowSrc.sol";
import { IEscrowFactory } from "./interfaces/IEscrowFactory.sol";
import { IAtomicSwapLOP, IPostInteraction } from "./interfaces/IAtomicSwapLOP.sol";
/**
 * @title Escrow Factory for EVM-Cardano atomic swaps
 * @notice Factory contract for creating Cardano atomic swap escrows.
 * @dev Simplified implementation with consistent hashing.
 */
contract EscrowFactory is IEscrowFactory, IPostInteraction, Ownable {
    using SafeERC20 for IERC20;
    using AddressLib for Address;
    using TimelocksLib for Timelocks;
    using Clones for address;

    address public immutable ESCROW_SRC_IMPLEMENTATION;
    address public immutable ESCROW_DST_IMPLEMENTATION;
    bytes32 private immutable _PROXY_SRC_BYTECODE_HASH;
    bytes32 private immutable _PROXY_DST_BYTECODE_HASH;

    address public limitOrderProtocol;

    error OnlyLimitOrderProtocol();
    error InsufficientPrefundedDeposit();

    event EscrowSrcDeployed(address indexed proxy, address indexed maker, address indexed resolver);
    event EscrowDstDeployed(address indexed proxy, address indexed resolver, address indexed maker);

    constructor(
        address owner,
        uint32 rescueDelaySrc,
        uint32 rescueDelayDst,
        address accessToken
    ) Ownable(owner) {
        // Deploy implementations
        ESCROW_SRC_IMPLEMENTATION = address(new EscrowSrc(rescueDelaySrc, IERC20(accessToken)));
        ESCROW_DST_IMPLEMENTATION = address(new EscrowDst(rescueDelayDst, IERC20(accessToken)));

        // Compute proxy bytecode hashes
        _PROXY_SRC_BYTECODE_HASH = ProxyHashLib.computeProxyBytecodeHash(ESCROW_SRC_IMPLEMENTATION);
        _PROXY_DST_BYTECODE_HASH = ProxyHashLib.computeProxyBytecodeHash(ESCROW_DST_IMPLEMENTATION);
    }

    function setLimitOrderProtocol(address _lopAddress) external onlyOwner {
        limitOrderProtocol = _lopAddress;
    }

    /**
     * @notice Called by the LOP after it has secured the Maker's funds.
     * @dev Validates the pre-funded safety deposit.
     */
    function postInteraction(
        IAtomicSwapLOP.Order calldata order,
        bytes32 orderHash,
        address taker,
        uint256 makingAmount,
        uint256 /* takingAmount */,
        uint256 safetyDeposit
    ) external payable override {
        if (msg.sender != limitOrderProtocol) {
            revert OnlyLimitOrderProtocol();
        }

        IBaseEscrow.Immutables memory immutables = IBaseEscrow.Immutables({
            orderHash: orderHash,
            hashlock: order.hashlock,
            maker: AddressLib.wrap(order.maker),
            taker: AddressLib.wrap(taker),
            token: AddressLib.wrap(order.makerAsset),
            amount: makingAmount,
            safetyDeposit: safetyDeposit,
            timelocks: Timelocks.wrap(0)
        });


        // Deploy the EscrowSrc clone
        bytes32 salt = ImmutablesLib.hashMem(immutables);
        uint256 ethToSend = immutables.token.get() == address(0) ? makingAmount : 0;
        address escrow = _deployEscrow(salt, ethToSend, ESCROW_SRC_IMPLEMENTATION);

        // Validate pre-funded safety deposit
        if (address(escrow).balance < safetyDeposit + ethToSend) {
            revert InsufficientPrefundedDeposit();
        }

        if(immutables.token.get() != address(0)) {
            // For ERC20: Transfer tokens from the maker
            IERC20(immutables.token.get()).safeTransferFrom(order.maker, escrow, makingAmount);
        }
        
        emit EscrowSrcDeployed(escrow, order.maker, taker);
    }

    /**
     * @notice Creates source escrow for EVM→Cardano swaps.
     */
    function createSrcEscrow(IBaseEscrow.Immutables calldata immutables) external payable override {
        address token = immutables.token.get();
        uint256 nativeAmount = immutables.safetyDeposit;
        if (token == address(0)) {
            nativeAmount += immutables.amount;
        }
        if (msg.value != nativeAmount) revert InsufficientEscrowBalance();

        IBaseEscrow.Immutables memory _immutables = immutables;

        bytes32 salt = ImmutablesLib.hashMem(_immutables);
        address escrow = _deployEscrow(salt, msg.value, ESCROW_SRC_IMPLEMENTATION);
        
        if (token != address(0)) {
            IERC20(token).safeTransferFrom(msg.sender, escrow, immutables.amount);
        }

        emit SrcEscrowCreated(escrow, immutables.hashlock, immutables.maker, msg.sender);
    }

    /**
     * @notice Creates destination escrow for Cardano→EVM swaps.
     */
    function createDstEscrow(IBaseEscrow.Immutables calldata immutables) external payable override {
        address token = immutables.token.get();
        uint256 nativeAmount = immutables.safetyDeposit;
        if (token == address(0)) {
            nativeAmount += immutables.amount;
        }
        if (msg.value != nativeAmount) revert InsufficientEscrowBalance();

        IBaseEscrow.Immutables memory _immutables = immutables;

        bytes32 salt = ImmutablesLib.hashMem(_immutables);
        address escrow = _deployEscrow(salt, msg.value, ESCROW_DST_IMPLEMENTATION);
        
        if (token != address(0)) {
            IERC20(token).safeTransferFrom(msg.sender, escrow, immutables.amount);
        }

        emit DstEscrowCreated(escrow, immutables.hashlock, immutables.taker, msg.sender);
    }

    /**
     * @notice See {IEscrowFactory-addressOfEscrowSrc}.
     */
    function addressOfEscrowSrc(IBaseEscrow.Immutables calldata immutables) external view override returns (address) {
        // To match deployment behavior, we need to set the deployment timestamp
        IBaseEscrow.Immutables memory _immutables = immutables;
        return Create2.computeAddress(ImmutablesLib.hashMem(_immutables), _PROXY_SRC_BYTECODE_HASH);
    }

    /**
     * @notice See {IEscrowFactory-addressOfEscrowDst}.
     */
    function addressOfEscrowDst(IBaseEscrow.Immutables calldata immutables) external view override returns (address) {
        // To match deployment behavior, we need to set the deployment timestamp
        IBaseEscrow.Immutables memory _immutables = immutables;
        return Create2.computeAddress(ImmutablesLib.hashMem(_immutables), _PROXY_DST_BYTECODE_HASH);
    }

    function getEscrowSrcImplementation() external view override returns (address) {
        return ESCROW_SRC_IMPLEMENTATION;
    }

    function getEscrowDstImplementation() external view override returns (address) {
        return ESCROW_DST_IMPLEMENTATION;
    }

    /**
     * @notice Deploys a new escrow contract.
     * @param salt The salt for the deterministic address computation.
     * @param value The value to be sent to the escrow contract.
     * @param implementation Address of the implementation.
     * @return escrow The address of the deployed escrow contract.
     */
    function _deployEscrow(bytes32 salt, uint256 value, address implementation) internal returns (address escrow) {
        escrow = implementation.cloneDeterministic(salt);
        if (value > 0) {
            (bool success, ) = escrow.call{value: value}("");
            require(success, "Failed to send ETH to escrow");
        }
    }
}
