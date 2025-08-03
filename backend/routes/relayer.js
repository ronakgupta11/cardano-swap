import express from 'express';
import { monitorOrder } from '../controllers/relayerController.js';

const router = express.Router();

// Endpoint to update transaction hashes and trigger secret request if needed
router.post('/monitor/:orderId', monitorOrder);

export default router;