// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;


import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Create2 } from "@openzeppelin/contracts/utils/Create2.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

import { AddressLib, Address } from "./libraries/AddressLib.sol";
import { ImmutablesLib } from "./libraries/ImmutablesLib.sol";
import { TimelocksLib, Timelocks } from "./libraries/TimelocksLib.sol";
import { ProxyHashLib } from "./libraries/ProxyHashLib.sol";

import { IBaseEscrow } from "./interfaces/IBaseEscrow.sol";
import { IEscrowFactory } from "./interfaces/IEscrowFactory.sol";
import { EscrowDst } from "./EscrowDst.sol";
import { EscrowSrc } from "./EscrowSrc.sol";


/**
 * @title Escrow Factory for EVM-cardano atomic swaps
 * @notice Factory contract for creating cardano atomic swap escrows
 * @dev Supports both EVM→cardano and cardano→EVM swap directions
 */
contract EscrowFactorylOld is IEscrowFactory, Ownable{
    using SafeERC20 for IERC20;
    using AddressLib for Address;
    using TimelocksLib for Timelocks;

    /// @notice Implementation contract for source escrows (EVM→BTC)
    address public immutable ESCROW_SRC_IMPLEMENTATION;
    
    /// @notice Implementation contract for destination escrows (BTC→EVM)
    address public immutable ESCROW_DST_IMPLEMENTATION;
    
    /// @notice Proxy bytecode hash for source escrows
    bytes32 private immutable _PROXY_SRC_BYTECODE_HASH;
    
    /// @notice Proxy bytecode hash for destination escrows
    bytes32 private immutable _PROXY_DST_BYTECODE_HASH;

    /// @notice Access token for public operations
    IERC20 public immutable ACCESS_TOKEN;

    error InvalidCardanoAmount();
    error InvalidCardanoAddress();

    event EscrowSrcDeployed(address indexed proxy, address indexed maker, address indexed resolver);
    event EscrowDstDeployed(address indexed proxy, address indexed resolver, address indexed maker);

    constructor(
        IERC20 accessToken,
        address owner,
        uint32 rescueDelaySrc,
        uint32 rescueDelayDst
    ) Ownable(owner) {
        ACCESS_TOKEN = accessToken;
        // Deploy implementations
        ESCROW_SRC_IMPLEMENTATION = address(new EscrowSrc(rescueDelaySrc, accessToken));
        ESCROW_DST_IMPLEMENTATION = address(new EscrowDst(rescueDelayDst, accessToken));
        
        // Compute proxy bytecode hashes
        _PROXY_SRC_BYTECODE_HASH = ProxyHashLib.computeProxyBytecodeHash(ESCROW_SRC_IMPLEMENTATION);
        _PROXY_DST_BYTECODE_HASH = ProxyHashLib.computeProxyBytecodeHash(ESCROW_DST_IMPLEMENTATION);
    }


    /**
     * @notice Creates source escrow for EVM→BTC swaps
     * @param immutables Escrow immutables including Bitcoin details
     */
    function createSrcEscrow(IBaseEscrow.Immutables calldata immutables) external payable override {
        // Note: Bitcoin validation handled at application level
        
        address token = immutables.token.get();
        
        // Calculate required ETH
        uint256 requiredForEscrow = token == address(0) 
            ? immutables.amount + immutables.safetyDeposit
            : immutables.safetyDeposit;
            
        
        if (msg.value != requiredForEscrow) {
            revert InsufficientEscrowBalance();
        }

        // Deploy escrow
        address escrow = _deployEscrow(immutables, _PROXY_SRC_BYTECODE_HASH, requiredForEscrow);

        // Transfer ERC20 tokens if needed
        if (token != address(0)) {
            IERC20(token).safeTransferFrom(msg.sender, escrow, immutables.amount);
        }

        
        emit SrcEscrowCreated(escrow, immutables.hashlock, immutables.maker, msg.sender);
    }

    /**
     * @notice Creates destination escrow for BTC→EVM swaps  
     * @param immutables Escrow immutables including Bitcoin details
     */
    function createDstEscrow(IBaseEscrow.Immutables calldata immutables) external payable override {
        // Note: Bitcoin validation handled at application level
        
        address token = immutables.token.get();
        
        // Calculate required ETH
        uint256 requiredForEscrow = token == address(0) 
            ? immutables.amount + immutables.safetyDeposit
            : immutables.safetyDeposit;
            

        
        if (msg.value != requiredForEscrow) {
            revert InsufficientEscrowBalance();
        }

        // Deploy escrow
        address escrow = _deployEscrow(immutables, _PROXY_DST_BYTECODE_HASH, requiredForEscrow);

        // Transfer ERC20 tokens if needed
        if (token != address(0)) {
            IERC20(token).safeTransferFrom(msg.sender, escrow, immutables.amount);
        }

        
        emit DstEscrowCreated(escrow, immutables.hashlock, immutables.taker, msg.sender);
    }

    /**
     * @notice Returns address of source escrow
     */
    function addressOfEscrowSrc(IBaseEscrow.Immutables calldata immutables) external view override returns (address) {
        IBaseEscrow.Immutables memory modifiedImmutables = immutables;
        modifiedImmutables.timelocks = immutables.timelocks.setDeployedAt(block.timestamp);
        
        bytes32 salt = ImmutablesLib.hashMem(modifiedImmutables);
        return Create2.computeAddress(salt, _PROXY_SRC_BYTECODE_HASH, address(this));
    }

    /**
     * @notice Returns address of destination escrow
     */
    function addressOfEscrowDst(IBaseEscrow.Immutables calldata immutables) external view override returns (address) {
        IBaseEscrow.Immutables memory modifiedImmutables = immutables;
        modifiedImmutables.timelocks = immutables.timelocks.setDeployedAt(block.timestamp);
        
        bytes32 salt = ImmutablesLib.hashMem(modifiedImmutables);
        return Create2.computeAddress(salt, _PROXY_DST_BYTECODE_HASH, address(this));
    }

    function getEscrowSrcImplementation() external view override returns (address) {
        return ESCROW_SRC_IMPLEMENTATION;
    }
    function getEscrowDstImplementation() external view override returns (address) {
        return ESCROW_DST_IMPLEMENTATION;
    }


    /**
     * @dev Deploys escrow using Create2
     */
    function _deployEscrow(
        IBaseEscrow.Immutables calldata immutables,
        bytes32 proxyBytecodeHash,
        uint256 ethAmount
    ) internal returns (address) {
        // Set deployment timestamp
        IBaseEscrow.Immutables memory modifiedImmutables = immutables;
        modifiedImmutables.timelocks = immutables.timelocks.setDeployedAt(block.timestamp);

        // Compute salt and deploy escrow with Create2
        bytes32 salt = ImmutablesLib.hashMem(modifiedImmutables);
        
        // Create minimal proxy bytecode
        bytes memory bytecode = abi.encodePacked(
            hex"3d602d80600a3d3981f3363d3d373d3d3d363d73",
            proxyBytecodeHash == _PROXY_SRC_BYTECODE_HASH 
                ? ESCROW_SRC_IMPLEMENTATION 
                : ESCROW_DST_IMPLEMENTATION,
            hex"5af43d82803e903d91602b57fd5bf3"
        );

        // Deploy escrow with required ETH
        return Create2.deploy(ethAmount, salt, bytecode);
    }



} 