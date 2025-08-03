// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IAtomicSwapLOP, IPostInteraction } from "./interfaces/IAtomicSwapLOP.sol";

/**
 * @title LimitOrderProtocol
 * @notice Two-phase atomic swap protocol with preInteraction (maker) and postInteraction (resolver)
 * @dev Phase 1: Maker calls preInteraction to validate order and provide funds
 *      Phase 2: Resolver calls postInteraction to transfer funds to escrow
 */
contract LimitOrderProtocol is EIP712, Ownable {
    using SafeERC20 for IERC20;

    // Track validated orders to prevent replay attacks
    mapping(bytes32 => bool) public validatedOrders;
    
    // Store order details for validated orders
    mapping(bytes32 => IAtomicSwapLOP.Order) public orders;

    event OrderValidated(bytes32 indexed orderHash, address indexed maker);
    event OrderFilled(bytes32 indexed orderHash, address indexed resolver);

    constructor(string memory name, string memory version) EIP712(name, version) Ownable(msg.sender) {}

    /**
     * @notice Phase 1: Called by the maker to validate their order and provide ETH if needed
     * @param order The complete order struct created by the maker
     * @param signature The maker's EIP-712 signature of the order
     */
    function preInteraction(
        IAtomicSwapLOP.Order calldata order,
        bytes calldata signature
    ) external payable {
        // 1. Verify the signature to ensure the order is authentic
        bytes32 orderHash = _hashTypedDataV4(keccak256(abi.encode(
            keccak256("Order(address maker,address makerAsset,address takerAsset,uint256 makingAmount,uint256 takingAmount,address receiver,bytes32 hashlock,uint256 salt)"),
            order.maker,
            order.makerAsset,
            order.takerAsset,
            order.makingAmount,
            order.takingAmount,
            order.receiver,
            order.hashlock,
            order.salt
        )));

        address recoveredMaker = ECDSA.recover(orderHash, signature);
        if (recoveredMaker != order.maker) {
            revert("Invalid signature");
        }

        // 2. Only the maker can call this function
        if (msg.sender != order.maker) {
            revert("Only maker can call preInteraction");
        }

        // 3. Prevent replay attacks
        if (validatedOrders[orderHash]) {
            revert("Order already validated");
        }

        // 4. Handle ETH vs ERC20 transfers
        if (order.makerAsset == address(0)) {
            // ETH swap: Maker sends ETH with this transaction
            if (msg.value != order.makingAmount) {
                revert("Incorrect ETH amount sent");
            }
        } else {
            // ERC20 swap: Pull the maker's tokens using their prior approval
            // IERC20(order.makerAsset).safeTransferFrom(order.maker, address(this), order.makingAmount);
            
            // For ERC20 swaps, no ETH should be sent
            if (msg.value != 0) {
                revert("ETH sent for ERC20 swap");
            }
        }

        // 5. Mark order as validated and store it
        validatedOrders[orderHash] = true;
        orders[orderHash] = order;

        emit OrderValidated(orderHash, order.maker);
    }

    /**
     * @notice Phase 2: Called by the resolver to transfer funds from LOP to escrow and complete the swap
     * @param orderHash The hash of the validated order
     * @param factory The address of the EscrowFactory
     * @param safetyDeposit The amount of safety deposit the resolver has pre-funded
     */
    function postInteraction(
        bytes32 orderHash,
        address factory,
        uint256 safetyDeposit
    ) external {
        // 1. Check that the order was validated in preInteraction
        if (!validatedOrders[orderHash]) {
            revert("Order not validated");
        }

        // 2. Get the stored order
        IAtomicSwapLOP.Order memory order = orders[orderHash];

        // 3. Transfer funds from this contract to the EscrowFactory
        if (order.makerAsset == address(0)) {
            // For ETH: Forward ETH to factory
            IPostInteraction(factory).postInteraction{value: order.makingAmount}(
                order,
                orderHash,
                msg.sender, // The resolver calling this function
                order.makingAmount,
                order.takingAmount,
                safetyDeposit
            );
        } else {
            IPostInteraction(factory).postInteraction(
                order,
                orderHash,
                msg.sender, // The resolver calling this function
                order.makingAmount,
                order.takingAmount,
                safetyDeposit
            );
            // For ERC20: Transfer tokens to factory
            IERC20(order.makerAsset).safeTransferFrom(order.maker, factory, order.makingAmount);

        }

        // 4. Mark order as filled (prevent replay)
        delete validatedOrders[orderHash];
        delete orders[orderHash];

        emit OrderFilled(orderHash, msg.sender);
    }
}