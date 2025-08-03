import { useEffect, useRef, useCallback } from 'react';

interface WebSocketMessage {
    type: string;
    orderId: string;
    secret?: string;
}

export const useWebSocket = (orderId: string, role: 'maker' | 'resolver') => {
    const ws = useRef<WebSocket | null>(null);
    const secret = useRef<string | null>(null);
    const reconnectAttempts = useRef(0);
    const maxReconnectAttempts = 5;
    const reconnectDelay = 3000;

    const connect = useCallback(() => {
        // Don't create multiple connections for the same orderId and role
        if (ws.current?.readyState === WebSocket.OPEN) {
            console.log(`🟢 WebSocket already connected for ${role} on order ${orderId}`);
            return;
        }

        if (!orderId) {
            console.log('⚠️ No orderId provided, skipping connection');
            return;
        }

        console.log(`🔄 Creating WebSocket connection for ${role} on order ${orderId}`);
        ws.current = new WebSocket('ws://localhost:3000');

        ws.current.onopen = () => {
            console.log(`✅ WebSocket connected, registering as ${role} for order ${orderId}`);
            reconnectAttempts.current = 0; // Reset reconnect attempts on successful connection
            
            // Register the connection with orderId and role
            ws.current?.send(JSON.stringify({
                type: 'register',
                orderId,
                role
            }));
            console.log(`📝 Sent registration message for ${role} on order ${orderId}`);
        };

        ws.current.onmessage = (event) => {
            const data: WebSocketMessage = JSON.parse(event.data);
            console.log(`📥 Received WebSocket message for ${role}:`, data);

            switch (data.type) {
                case 'requestSecret':
                    if (role === 'maker') {
                        console.log(`🔍 Maker received secret request for order ${orderId}`);
                        // Get secret from local storage and send it
                        const storedSecret = localStorage.getItem(`secret_${orderId}`);
                        console.log(`🔑 Retrieved secret for order ${orderId}:`, storedSecret ? '(found)' : '(not found)');
                        if (storedSecret) {
                            ws.current?.send(JSON.stringify({
                                type: 'secret',
                                orderId,
                                secret: storedSecret
                            }));
                            console.log(`📤 Sent secret for order ${orderId}`);
                        }
                    }
                    break;
                case 'secret':
                    if (role === 'resolver') {
                        console.log(`🔐 Resolver received secret for order ${orderId}`);
                        secret.current = data.secret || null;
                    }
                    break;
            }
        };

        ws.current.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
        };

        ws.current.onclose = () => {
            console.log(`🔌 WebSocket connection closed for ${role} on order ${orderId}`);
            
            // Only attempt to reconnect if we haven't exceeded max attempts
            if (reconnectAttempts.current < maxReconnectAttempts) {
                reconnectAttempts.current += 1;
                console.log(`🔄 Attempting reconnection ${reconnectAttempts.current} of ${maxReconnectAttempts}`);
                setTimeout(connect, reconnectDelay);
            } else {
                console.log('⛔ Max reconnection attempts reached');
            }
        };
    }, [orderId, role]);

    // For maker: store secret in local storage
    const storeSecret = useCallback((newSecret: string) => {
        if (role === 'maker') {
            localStorage.setItem(`secret_${orderId}`, newSecret);
            console.log(`💾 Stored secret for order ${orderId} in localStorage`);
        }
    }, [orderId, role]);

    // For resolver: get the received secret
    const getSecret = useCallback(() => {
        if (secret.current) {
            console.log(`🔑 Retrieved secret for order ${orderId} from WebSocket storage`);
        }
        return secret.current;
    }, [orderId]);

    // Connect when orderId changes and is not empty
    useEffect(() => {
        if (orderId) {
            console.log(`🔄 Initializing WebSocket connection for ${role} on order ${orderId}`);
            connect();
        }
        
        // Cleanup function
        return () => {
            if (ws.current) {
                console.log(`🧹 Cleaning up WebSocket connection for ${role} on order ${orderId}`);
                // Only close if we're not planning to reconnect
                if (reconnectAttempts.current >= maxReconnectAttempts) {
                    ws.current.close();
                }
            }
        };
    }, [connect, orderId, role]);

    return {
        connect,
        storeSecret,
        getSecret
    };
};