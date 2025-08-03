import { WebSocketServer } from 'ws';
import { monitorService } from './monitorService.js';

class WebSocketService {
    constructor() {
        this.connections = new Map(); // orderId -> { maker: ws, resolver: ws }
        console.log('🔧 WebSocket service initialized');
    }

    initialize(server) {
        console.log('🚀 Starting WebSocket server...');
        this.wss = new WebSocketServer({ server });
        this.wss.on('connection', this.handleConnection.bind(this));
        console.log('✅ WebSocket server started');
    }

    handleConnection(ws) {
        console.log('🔌 New WebSocket connection received');

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                console.log('📥 Received message:', data);

                switch (data.type) {
                    case 'register':
                        this.registerConnection(ws, data.orderId, data.role);
                        break;
                    case 'secret':
                        console.log(`🔑 Received secret for order ${data.orderId}`);
                        // First update the database and then notify resolver
                        monitorService.handleSecretShared(data.orderId, data.secret);
                        break;
                }
            } catch (error) {
                console.error('❌ WebSocket message error:', error);
            }
        });

        ws.on('close', () => {
            this.removeConnection(ws);
        });
    }

    registerConnection(ws, orderId, role) {
        console.log(`📝 Registering ${role} for order ${orderId}`);
        
        if (!this.connections.has(orderId)) {
            this.connections.set(orderId, {});
        }
        
        const orderConnections = this.connections.get(orderId);
        orderConnections[role] = ws;
        
        ws.orderId = orderId;
        ws.role = role;

        console.log(`✅ Registered ${role} for order ${orderId}`);
        console.log(`📊 Current connections for order ${orderId}:`, 
            Object.keys(this.connections.get(orderId)));
    }

    removeConnection(ws) {
        if (ws.orderId && ws.role) {
            console.log(`❌ Removing ${ws.role} connection for order ${ws.orderId}`);
            const orderConnections = this.connections.get(ws.orderId);
            if (orderConnections) {
                delete orderConnections[ws.role];
                if (Object.keys(orderConnections).length === 0) {
                    this.connections.delete(ws.orderId);
                }
            }
        }
    }

    requestSecret(orderId) {
        console.log(`🔍 Requesting secret for order ${orderId}`);
        const orderConnections = this.connections.get(orderId);
        if (orderConnections?.maker) {
            console.log(`📤 Sending secret request to maker for order ${orderId}`);
            orderConnections.maker.send(JSON.stringify({
                type: 'requestSecret',
                orderId
            }));
        } else {
            console.log(`⚠️ No maker connection found for order ${orderId}`);
            console.log('Current connections:', this.connections);
        }
    }

    handleSecret(orderId, secret) {
        console.log(`📤 Sending secret to resolver for order ${orderId}`);
        const orderConnections = this.connections.get(orderId);
        if (orderConnections?.resolver) {
            orderConnections.resolver.send(JSON.stringify({
                type: 'secret',
                orderId,
                secret
            }));
            console.log(`✅ Secret sent to resolver for order ${orderId}`);
        } else {
            console.log(`⚠️ No resolver connection found for order ${orderId}`);
            console.log('Current connections:', this.connections);
        }
    }
}

export const websocketService = new WebSocketService();