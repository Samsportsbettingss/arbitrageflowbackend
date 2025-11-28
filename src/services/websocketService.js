const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

class WebSocketService {
    constructor() {
        this.wss = null;
        this.clients = new Map(); // userId -> Set of WebSocket connections
    }

    initialize(server) {
        this.wss = new WebSocket.Server({ server });

        this.wss.on('connection', (ws, req) => {
            console.log('New WebSocket connection');

            // Authenticate connection
            const token = new URL(req.url, 'ws://localhost').searchParams.get('token');
            
            if (token) {
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    ws.userId = decoded.userId;
                    ws.authenticated = true;

                    // Store connection
                    if (!this.clients.has(decoded.userId)) {
                        this.clients.set(decoded.userId, new Set());
                    }
                    this.clients.get(decoded.userId).add(ws);

                    console.log(`User ${decoded.userId} authenticated via WebSocket`);
                } catch (error) {
                    console.error('WebSocket auth error:', error.message);
                    ws.authenticated = false;
                }
            } else {
                ws.authenticated = false;
            }

            // Send welcome message
            ws.send(JSON.stringify({
                type: 'CONNECTED',
                message: 'Connected to Arbitrage Pro',
                authenticated: ws.authenticated
            }));

            // Handle messages from client
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    this.handleMessage(ws, data);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            });

            // Handle disconnection
            ws.on('close', () => {
                if (ws.userId && this.clients.has(ws.userId)) {
                    this.clients.get(ws.userId).delete(ws);
                    if (this.clients.get(ws.userId).size === 0) {
                        this.clients.delete(ws.userId);
                    }
                }
                console.log('WebSocket connection closed');
            });

            // Handle errors
            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
            });

            // Ping-pong for connection health
            ws.isAlive = true;
            ws.on('pong', () => {
                ws.isAlive = true;
            });
        });

        // Heartbeat to detect dead connections
        setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (ws.isAlive === false) {
                    return ws.terminate();
                }
                ws.isAlive = false;
                ws.ping();
            });
        }, 30000); // Every 30 seconds

        console.log('WebSocket server initialized');
    }

    handleMessage(ws, data) {
        switch (data.type) {
            case 'PING':
                ws.send(JSON.stringify({ type: 'PONG' }));
                break;
            
            case 'SUBSCRIBE':
                // Handle subscription to specific sports/markets
                if (!ws.authenticated) {
                    ws.send(JSON.stringify({ 
                        type: 'ERROR', 
                        message: 'Authentication required' 
                    }));
                    return;
                }
                ws.subscriptions = data.subscriptions || [];
                ws.send(JSON.stringify({ 
                    type: 'SUBSCRIBED', 
                    subscriptions: ws.subscriptions 
                }));
                break;

            default:
                console.log('Unknown message type:', data.type);
        }
    }

    // Broadcast to all connected clients
    broadcast(data) {
        const message = JSON.stringify(data);
        this.wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }

    // Send to specific user
    sendToUser(userId, data) {
        if (!this.clients.has(userId)) return;

        const message = JSON.stringify(data);
        this.clients.get(userId).forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        });
    }

    // Send to all authenticated users
    broadcastToAuthenticated(data) {
        const message = JSON.stringify(data);
        this.wss.clients.forEach((client) => {
            if (client.authenticated && client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    }

    // Notify about new opportunity
    notifyNewOpportunity(opportunity) {
        this.broadcastToAuthenticated({
            type: 'NEW_OPPORTUNITY',
            data: opportunity
        });
    }

    // Notify about opportunity update
    notifyOpportunityUpdate(opportunity) {
        this.broadcastToAuthenticated({
            type: 'OPPORTUNITY_UPDATE',
            data: opportunity
        });
    }

    // Notify about opportunity expiry
    notifyOpportunityExpired(opportunityId) {
        this.broadcastToAuthenticated({
            type: 'OPPORTUNITY_EXPIRED',
            opportunityId
        });
    }
}

module.exports = new WebSocketService();

