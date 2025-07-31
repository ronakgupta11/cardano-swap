import express from 'express';

import { getAllOrders, getOrderById, createOrder, updateOrderStatus } from '../controllers/ordersController.js';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Order:
 *       type: object
 *       required:
 *         - fromAddress
 *         - toAddress
 *         - fromToken
 *         - toToken
 *         - fromAmount
 *         - toAmount
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: The auto-generated id of the order
 *         fromAddress:
 *           type: string
 *           description: The sender's address
 *         toAddress:
 *           type: string
 *           description: The receiver's address
 *         fromToken:
 *           type: string
 *           description: Token to swap from
 *         toToken:
 *           type: string
 *           description: Token to swap to
 *         fromAmount:
 *           type: string
 *           description: Amount to swap from
 *         toAmount:
 *           type: string
 *           description: Amount to receive
 *         status:
 *           type: string
 *           enum: [pending, processing, completed, failed, cancelled]
 *           description: Order status
 *         txHash:
 *           type: string
 *           description: Transaction hash
 *         relayerFee:
 *           type: string
 *           description: Fee for the relayer
 *         expiresAt:
 *           type: string
 *           format: date-time
 *           description: Order expiration time
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/orders:
 *   get:
 *     summary: Retrieve a list of orders
 *     tags: [Orders]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of orders per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, completed, failed, cancelled]
 *         description: Filter by order status
 *     responses:
 *       200:
 *         description: A list of orders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orders:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Order'
 *                 totalCount:
 *                   type: integer
 *                 currentPage:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 */
router.get('/', getAllOrders);

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     summary: Get order by ID
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The order ID
 *     responses:
 *       200:
 *         description: Order details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       404:
 *         description: Order not found
 */
router.get('/:id', getOrderById);

/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Create a new order
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fromChain
 *               - toChain
 *               - fromToken
 *               - toToken
 *               - fromAmount
 *               - toAmount
 *               - makerSrcAddress
 *               - makerDstAddress
 *               - hashlock
 *             properties:
 *               fromChain:
 *                 type: string
 *                 description: The source blockchain (e.g., "EVM", "Cardano").
 *               toChain:
 *                 type: string
 *                 description: The destination blockchain (e.g., "Cardano", "EVM").
 *               fromToken:
 *                 type: string
 *                 description: Token to swap from
 *               toToken:
 *                 type: string
 *                 description: Token to swap to
 *               fromAmount:
 *                 type: string
 *                 description: Amount to swap from
 *               toAmount:
 *                 type: string
 *                 description: Amount to receive
 *               makerSrcAddress:
 *                 type: string
 *                 description: The maker's address on the source chain
 *               makerDstAddress:
 *                 type: string
 *                 description: The maker's address on the destination chain
 *               hashlock:
 *                 type: string
 *                 description: The SHA-256 hash of the secret
 *               relayerFee:
 *                 type: string
 *                 description: Fee for the relayer (optional)
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *                 description: Order expiration time (optional)
 *     responses:
 *       201:
 *         description: Order created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       400:
 *         description: Bad request
 */
router.post('/', createOrder);

/**
 * @swagger
 * /api/orders/{id}/status:
 *   patch:
 *     summary: Update order status
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The order ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, processing, completed, failed, cancelled]
 *               txHash:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order status updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Order'
 *       404:
 *         description: Order not found
 */
router.patch('/:id/status', updateOrderStatus);

export default router;
