const express = require('express');
const { 
  getRelayerStatus, 
  getRelayerStats, 
  processOrder 
} = require('../controllers/relayerController');

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     RelayerStatus:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           description: Current relayer status
 *         timestamp:
 *           type: string
 *           format: date-time
 *         version:
 *           type: string
 *           description: Relayer version
 *     RelayerStats:
 *       type: object
 *       properties:
 *         totalTransactions:
 *           type: integer
 *         successfulTransactions:
 *           type: integer
 *         failedTransactions:
 *           type: integer
 *         totalFees:
 *           type: string
 *         uptime:
 *           type: string
 */

/**
 * @swagger
 * /api/relayer/status:
 *   get:
 *     summary: Get relayer status
 *     tags: [Relayer]
 *     responses:
 *       200:
 *         description: Relayer status information
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RelayerStatus'
 */
router.get('/status', getRelayerStatus);

/**
 * @swagger
 * /api/relayer/stats:
 *   get:
 *     summary: Get relayer statistics
 *     tags: [Relayer]
 *     responses:
 *       200:
 *         description: Relayer statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RelayerStats'
 */
router.get('/stats', getRelayerStats);

/**
 * @swagger
 * /api/relayer/process/{orderId}:
 *   post:
 *     summary: Process an order
 *     tags: [Relayer]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         description: The order ID to process
 *     responses:
 *       200:
 *         description: Order processing initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 orderId:
 *                   type: string
 *                 status:
 *                   type: string
 */
router.post('/process/:orderId', processOrder);

module.exports = router;
