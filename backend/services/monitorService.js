import Order from '../models/Order.js';
import { websocketService } from './websocketService.js';
import { Op } from 'sequelize';

class MonitorService {
    constructor() {
        this.isRunning = false;
        this.pollingInterval = 5000; // 5 seconds
    }

    async start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.poll();
        console.log('🟢 Monitor service started - polling every 5 seconds');
    }

    stop() {
        this.isRunning = false;
        console.log('🔴 Monitor service stopped');
    }

    async poll() {
        while (this.isRunning) {
            try {
                await this.checkPendingOrders();
                await new Promise(resolve => setTimeout(resolve, this.pollingInterval));
            } catch (error) {
                console.error('❌ Error in monitor service polling:', error);
                // Continue polling even if there's an error
            }
        }
    }

    async checkPendingOrders() {
        console.log('🔍 Checking for pending orders...');
        // Find all pending orders with both transaction hashes but no secret
        const pendingOrders = await Order.findAll({
            where: {
                status: 'depositing',
                srcEscrowTxHash: { [Op.not]: null },
                dstEscrowTxHash: { [Op.not]: null },
                secret: { [Op.is]: null }
            }
        });

        console.log(`📊 Found ${pendingOrders.length} pending orders ready for secret request`);

        for (const order of pendingOrders) {
            console.log(`🎯 Requesting secret for order ${order.id}`);
            console.log('Order details:', {
                id: order.id,
                srcTxHash: order.srcEscrowTxHash,
                dstTxHash: order.dstEscrowTxHash,
                makerAddress: order.makerSrcAddress,
                resolverAddress: order.resolverAddress
            });
            // Request secret from maker
            websocketService.requestSecret(order.id);
        }
    }

    async handleSecretShared(orderId, secret) {
        try {
            console.log(`🔑 Handling secret share for order ${orderId}`);
            const order = await Order.findByPk(orderId);
            if (!order) {
                console.log(`❌ Order ${orderId} not found`);
                return;
            }

            // Update order with secret
            await order.update({
                secret: secret,
                status: 'withdrawing' // Using existing status from Order model
            });
            console.log(`✅ Updated order ${orderId} with secret and status`);

            // Notify resolver through WebSocket
            websocketService.handleSecret(orderId, secret);
            console.log(`📨 Notified resolver about secret for order ${orderId}`);

        } catch (error) {
            console.error('❌ Error handling secret share:', error);
        }
    }
}

export const monitorService = new MonitorService();