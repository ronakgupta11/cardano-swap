import { websocketService } from '../services/websocketService.js';
import Order from '../models/Order.js';

export const monitorOrder = async (req, res) => {
    const { orderId } = req.params;
    const { srcEscrowTxHash, dstEscrowTxHash } = req.body;

    try {
        const order = await Order.findByPk(orderId);
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        await order.update({
            srcEscrowTxHash,
            dstEscrowTxHash
        });

        // If both hashes are present, request secret from maker
        if (srcEscrowTxHash && dstEscrowTxHash) {
            websocketService.requestSecret(orderId);
        }

        res.json({ status: 'success' });
    } catch (error) {
        console.error('Error monitoring order:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
};

// Note: We don't need createOrder endpoint as it's handled by your existing order creation flow