const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const qrcode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const networkOptimizer = require('./NetworkOptimizer');

class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.qrCodes = new Map();
        this.authDir = path.join(__dirname, '../../auth_sessions');

        // Create auth directory if it doesn't exist
        if (!fs.existsSync(this.authDir)) {
            fs.mkdirSync(this.authDir, { recursive: true });
        }
    }

    /**
     * Handle corrupted session cleanup
     */
    async handleSessionCorruption(sessionId, onDisconnected) {
        console.error(`🚨 Fatal cryptographic error (Bad MAC) for session ${sessionId}. Deleting session to recover.`);
        networkOptimizer.recordEvent(sessionId, 'fatal_error');

        // Use standard removal process to ensure socket closure and file release
        await this.removeSession(sessionId);

        // Notify disconnection with specific reason
        if (onDisconnected) {
            onDisconnected({ error: new Error('Session corrupted (Bad MAC). Please scan QR again.') });
        }
    }

    /**
     * Create or restore a WhatsApp session
     * @param {string} sessionId - Unique identifier for the session
     * @param {Function} onQR - Callback when QR code is generated
     * @param {Function} onConnected - Callback when connected
     * @param {Function} onDisconnected - Callback when disconnected
     */
    async createSession(sessionId, callbacks = {}) {
        try {
            const { onQR, onConnected, onDisconnected, onMessage } = callbacks;

            // Check if session already exists and is connected
            if (this.sessions.has(sessionId) && this.isConnected(sessionId)) {
                console.log(`Session ${sessionId} already connected`);
                return this.sessions.get(sessionId);
            }

            const sessionPath = path.join(this.authDir, sessionId);

            // Only cleanup if explicitly requested and session is not connected
            if (callbacks.isNew && !this.isConnected(sessionId)) {
                console.log(`Cleaning up disconnected session ${sessionId}`);
                await this.removeSession(sessionId);
            }

            // Create session directory
            if (!fs.existsSync(sessionPath)) {
                fs.mkdirSync(sessionPath, { recursive: true });
            }

            // Load auth state with error handling
            let state, saveCreds;
            try {
                console.log(`[SessionManager] Step 1: Loading auth state for ${sessionId}`);
                const authResult = await useMultiFileAuthState(sessionPath);
                state = authResult.state;
                saveCreds = authResult.saveCreds;
                console.log(`[SessionManager] Step 1: Auth state loaded`);
            } catch (authError) {
                console.log(`Auth state corrupted for ${sessionId}, cleaning up...`);
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                    fs.mkdirSync(sessionPath, { recursive: true });
                }
                const authResult = await useMultiFileAuthState(sessionPath);
                state = authResult.state;
                saveCreds = authResult.saveCreds;
            }

            // Get latest Baileys version with enhanced caching
            let version;
            let isLatest = false;
            try {
                console.log(`[SessionManager] Step 2: Fetching latest Baileys version`);
                const result = await fetchLatestBaileysVersion();
                version = result.version;
                isLatest = result.isLatest;
                console.log(`[SessionManager] Step 2: Using Baileys version: ${version.join('.')}`);
            } catch (versionError) {
                console.warn('Using fallback Baileys version due to fetch error:', versionError.message);
                version = [2, 3000, 1015901307]; // Fallback to stable version
            }

            // Get optimal settings from network optimizer
            console.log(`[SessionManager] Step 3: Getting optimal settings`);
            const optimalSettings = networkOptimizer.getOptimalSettings();

            // Start monitoring this session
            networkOptimizer.startMonitoring(sessionId);

            // Custom logger to intercept internal Baileys/Libsignal errors
            const logger = pino({
                level: 'debug', // Capture more logs to catch the error
                timestamp: () => `,"time":"${new Date().toISOString()}"`
            }, {
                write: (msg) => {
                    const msgStr = msg.toString();
                    if (msgStr.includes('Bad MAC') || msgStr.includes('Session error')) {
                        console.error(`🚨 DETECTED BAD MAC IN LOGS for ${sessionId} - Triggering Cleanup`);
                        this.handleSessionCorruption(sessionId, onDisconnected);
                    }
                    // Only print errors or fatal logs to terminal to avoid noise, unless it's the specific error we are looking for
                    const levelMatch = msgStr.match(/"level":(\d+)/);
                    if (levelMatch && parseInt(levelMatch[1]) >= 50) { // 50 is ERROR, 60 is FATAL
                        process.stdout.write(msg);
                    }
                }
            });

            // Create socket with enhanced security and stability
            const sock = makeWASocket({
                version,
                auth: state,
                printQRInTerminal: false,
                logger: logger,
                browser: ['Ubuntu', 'Chrome', '22.04.2'],
                syncFullHistory: false,
                markOnlineOnConnect: false, // Enhanced privacy
                generateHighQualityLinkPreview: false, // Security improvement
                qrTimeout: 60000, // 1 minute QR timeout
                connectTimeoutMs: 60000, // 1 minute connection timeout
                defaultQueryTimeoutMs: 60000,
                keepAliveIntervalMs: 25000, // 25 seconds keep alive
                retryRequestDelayMs: 1000,
                maxMsgRetryCount: 3,
                getMessage: async (key) => {
                    return { conversation: '' };
                }
            });

            // Handle connection updates
            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                // QR Code generated with enhanced security
                if (qr) {
                    console.log(`QR Code generated for session: ${sessionId}`);

                    // Generate secure QR code
                    const qrDataURL = await qrcode.toDataURL(qr, {
                        errorCorrectionLevel: 'H', // High error correction
                        type: 'image/png',
                        quality: 0.95,
                        margin: 2,
                        color: {
                            dark: '#000000',
                            light: '#FFFFFF'
                        },
                        width: 300
                    });

                    this.qrCodes.set(sessionId, qrDataURL);

                    if (onQR) {
                        onQR(qrDataURL, qr);
                    }
                }

                // Connection closed
                if (connection === 'close') {
                    networkOptimizer.recordEvent(sessionId, 'failure');

                    const shouldReconnect = (lastDisconnect?.error instanceof Boom)
                        ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
                        : true;

                    // Enhanced retry logic with exponential backoff
                    const isBadMac = lastDisconnect.error?.message?.includes('Bad MAC') ||
                        lastDisconnect.error?.toString().includes('Bad MAC');

                    if (isBadMac) {
                        await this.handleSessionCorruption(sessionId, onDisconnected);
                        return; // Stop reconnection loop
                    }

                    console.log(`Connection closed for ${sessionId}. Reconnect:`, shouldReconnect);

                    if (shouldReconnect && networkOptimizer.shouldAttemptConnection(sessionId)) {
                        const retryCount = (callbacks.retryCount || 0) + 1;

                        if (retryCount <= 2) { // Reduced max attempts
                            networkOptimizer.recordEvent(sessionId, 'reconnect');
                            const retryDelay = Math.min(3000 * Math.pow(2, retryCount - 1), 10000); // Exponential backoff

                            console.log(`Attempting reconnection ${retryCount}/2 in ${retryDelay}ms`);
                            setTimeout(() => {
                                this.createSession(sessionId, {
                                    ...callbacks,
                                    retryCount
                                });
                            }, retryDelay);
                        } else {
                            console.log(`Max reconnection attempts reached for ${sessionId}`);
                        }
                    } else {
                        console.log(`Session ${sessionId} logged out, cleaning up...`);
                        setTimeout(() => this.removeSession(sessionId), 3000);
                    }

                    if (onDisconnected) {
                        onDisconnected(lastDisconnect);
                    }
                }

                // Connection opened
                if (connection === 'open') {
                    console.log(`✅ Session ${sessionId} connected successfully`);
                    this.qrCodes.delete(sessionId);

                    if (onConnected) {
                        const phoneNumber = sock.user?.id?.split(':')[0];
                        onConnected({
                            sessionId,
                            phoneNumber,
                            name: sock.user?.name,
                            device: sock.user?.device
                        });
                    }
                }
            });

            // Save credentials when updated
            sock.ev.on('creds.update', saveCreds);

            // Handle incoming messages (optional)
            if (onMessage) {
                sock.ev.on('messages.upsert', async ({ messages, type }) => {
                    if (type === 'notify') {
                        for (const msg of messages) {
                            if (!msg.key.fromMe) {
                                try {
                                    onMessage(msg);
                                } catch (msgError) {
                                    // Ignore decryption errors silently
                                    if (!msgError.message?.includes('Bad MAC')) {
                                        console.error('Message handling error:', msgError);
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // Store session
            this.sessions.set(sessionId, sock);

            return sock;

        } catch (error) {
            console.error(`Error creating session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Get existing session
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    /**
     * Get QR code for session
     */
    getQRCode(sessionId) {
        return this.qrCodes.get(sessionId);
    }

    /**
     * Check if session is connected
     */
    isConnected(sessionId) {
        const session = this.sessions.get(sessionId);
        return session && session.user;
    }

    /**
     * Get session info
     */
    getSessionInfo(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.user) {
            return null;
        }

        return {
            sessionId,
            phoneNumber: session.user.id?.split(':')[0],
            name: session.user.name,
            connected: true
        };
    }

    /**
     * Remove session
     */
    async removeSession(sessionId) {
        try {
            if (this.sessions.has(sessionId)) {
                const sock = this.sessions.get(sessionId);
                sock.end(undefined); // Close connection
                this.sessions.delete(sessionId);
            }

            if (this.qrCodes.has(sessionId)) {
                this.qrCodes.delete(sessionId);
            }

            // Clean up network optimizer metrics
            networkOptimizer.cleanup(sessionId);

            const sessionPath = path.join(this.authDir, sessionId);
            if (fs.existsSync(sessionPath)) {
                // Wait a bit for file locks to release
                await new Promise(resolve => setTimeout(resolve, 1000));
                fs.rmSync(sessionPath, { recursive: true, force: true });
            }

            console.log(`Session ${sessionId} removed`);
        } catch (error) {
            console.error(`Error removing session ${sessionId}:`, error);
        }
    }

    /**
     * Get all active sessions
     */
    getAllSessions() {
        const sessions = [];
        for (const [sessionId, sock] of this.sessions.entries()) {
            sessions.push({
                sessionId,
                connected: sock.user ? true : false,
                phoneNumber: sock.user?.id?.split(':')[0],
                name: sock.user?.name
            });
        }
        return sessions;
    }

    /**
     * Disconnect session without removing
     */
    async disconnectSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            await session.end();
            this.sessions.delete(sessionId);
            console.log(`Session ${sessionId} disconnected`);
        }
    }
}

// Singleton instance
const sessionManager = new SessionManager();

module.exports = sessionManager;
