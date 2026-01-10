const sessionManager = require('./SessionManager');
const fs = require('fs');
const path = require('path');

class MessageService {
    constructor() {
        this.messageQueue = [];
        this.processing = false;
    }

    /**
     * Send a text message
     * @param {string} sessionId - Session ID to use
     * @param {string} phoneNumber - Recipient phone number (with country code)
     * @param {string} message - Message text
     */
    /**
     * Send a text message with smart error handling
     * @param {string} sessionId - Session ID to use
     * @param {string} phoneNumber - Recipient phone number (with country code)
     * @param {string} message - Message text
     * @param {number} retryCount - Current retry attempt (internal use)
     */
    async sendMessage(sessionId, phoneNumber, message, retryCount = 0) {
        try {
            const session = sessionManager.getSession(sessionId);

            if (!session) {
                console.error(`[MessageService] Session ${sessionId} not found`);
                return false;
            }

            if (!session.user) {
                console.error(`[MessageService] Session ${sessionId} not connected`);
                return false;
            }

            // Format phone number
            const jid = this.formatPhoneNumber(phoneNumber);

            try {
                // Send message
                const result = await session.sendMessage(jid, { text: message });
                console.log(`✅ Message sent to ${jid} via session ${sessionId}`);
                return result;
            } catch (innerError) {
                const errString = innerError.toString();

                // Smart Error Handling
                if (errString.includes('Bad MAC')) {
                    console.error(`🚨 ENCRYPTION DESYNC (Bad MAC) for ${sessionId}: ${errString}`);
                    sessionManager.handleSessionCorruption(sessionId);
                    throw new Error('ENCRYPTION_DESYNC: Bad MAC');
                }

                // If recoverable error and we haven't retried yet
                if (retryCount < 2) {
                    console.log(`⚠️ Send failed, retrying (${retryCount + 1}/2)...`);
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
                    return this.sendMessage(sessionId, phoneNumber, message, retryCount + 1);
                }

                throw innerError;
            }

        } catch (error) {
            console.error(`❌ Failed to send message to ${phoneNumber}:`, error.message);
            // Return null instead of throwing to prevent crashing the scheduler loop
            return null;
        }
    }

    /**
     * Send a message with buttons
     * @param {string} sessionId - Session ID
     * @param {string} phoneNumber - Recipient
     * @param {string} text - Message text
     * @param {Array} buttons - Array of button objects [{id, text}]
     */
    async sendButtonMessage(sessionId, phoneNumber, text, buttons) {
        try {
            const session = sessionManager.getSession(sessionId);

            if (!session) {
                throw new Error(`Session ${sessionId} not found`);
            }

            const jid = this.formatPhoneNumber(phoneNumber);

            // Format buttons for Baileys
            const buttonMessage = {
                text: text,
                footer: 'منصة واصل',
                buttons: buttons.map((btn, index) => ({
                    buttonId: btn.id || `btn_${index}`,
                    buttonText: { displayText: btn.text },
                    type: 1
                })),
                headerType: 1
            };

            const result = await session.sendMessage(jid, buttonMessage);

            console.log(`✅ Button message sent to ${phoneNumber}`);
            return result;

        } catch (error) {
            console.error('❌ Error sending button message:', error.message || error);
            return null;
        }
    }

    /**
     * Send media (image, video, document)
     * @param {string} sessionId - Session ID
     * @param {string} phoneNumber - Recipient
     * @param {Buffer|string} media - Media buffer or URL
     * @param {string} caption - Caption text
     * @param {string} type - Media type: 'image', 'video', 'document'
     */
    async sendMedia(sessionId, phoneNumber, media, caption = '', type = 'image') {
        try {
            const session = sessionManager.getSession(sessionId);

            if (!session) {
                throw new Error(`Session ${sessionId} not found`);
            }

            const jid = this.formatPhoneNumber(phoneNumber);

            const mediaMessage = {
                caption: caption
            };

            // Helper to format media payload
            const formatMedia = (content) => {
                if (typeof content === 'string') {
                    const s = String(content);
                    if (s.startsWith('http') || s.startsWith('https')) {
                        return { url: s };
                    }
                    if (s.startsWith('/uploads/')) {
                        const basePublic = path.join(__dirname, '../../../public');
                        const rel = s.replace(/^\/+/, '');
                        const abs = path.normalize(path.join(basePublic, rel));
                        const baseNorm = path.normalize(basePublic);
                        if (abs.toLowerCase().startsWith(baseNorm.toLowerCase()) && fs.existsSync(abs)) {
                            return fs.readFileSync(abs);
                        }
                    }
                }
                return content; // Buffer or already formatted object
            };

            // Set media based on type
            if (type === 'image') {
                mediaMessage.image = formatMedia(media);
            } else if (type === 'video') {
                mediaMessage.video = formatMedia(media);
                mediaMessage.mimetype = 'video/mp4';
            } else if (type === 'audio') {
                mediaMessage.audio = formatMedia(media);
                mediaMessage.mimetype = 'audio/mpeg';
                mediaMessage.ptt = false;
            } else if (type === 'document') {
                mediaMessage.document = formatMedia(media);
                mediaMessage.mimetype = 'application/pdf';
                mediaMessage.fileName = caption || 'document.pdf';
            }

            const result = await session.sendMessage(jid, mediaMessage);

            console.log(`✅ ${type} sent to ${phoneNumber}`);
            return result;

        } catch (error) {
            if (error.response?.status === 404) {
                console.error(`❌ Media not found (404): ${typeof media === 'string' ? media : 'Buffer'}`);
            } else {
                console.error('❌ Error sending media:', error.message || error);
            }
            return null;
        }
    }

    /**
     * Add message to queue
     */
    addToQueue(sessionId, phoneNumber, message, type = 'text', options = {}) {
        console.log(`[MessageService] Adding ${type} message to queue for ${phoneNumber} (Session: ${sessionId})`);
        this.messageQueue.push({
            sessionId,
            phoneNumber,
            message,
            type,
            options,
            timestamp: Date.now()
        });

        // Start processing if not already
        if (!this.processing) {
            this.processQueue();
        }
    }

    /**
     * Process message queue with rate limiting
     */
    async processQueue() {
        if (this.messageQueue.length === 0) {
            this.processing = false;
            return;
        }

        this.processing = true;
        const item = this.messageQueue.shift();

        try {
            if (item.type === 'text') {
                await this.sendMessage(item.sessionId, item.phoneNumber, item.message);
            } else if (item.type === 'button') {
                await this.sendButtonMessage(
                    item.sessionId,
                    item.phoneNumber,
                    item.message,
                    item.options.buttons || []
                );
            } else if (item.type === 'media') {
                await this.sendMedia(
                    item.sessionId,
                    item.phoneNumber,
                    item.options.mediaUrl,
                    item.message, // caption
                    item.options.mediaType || 'image'
                );
            }

            // Rate limiting: wait 1 second between messages
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            console.error('Error processing queue item:', error);
        }

        // Process next item
        this.processQueue();
    }

    /**
     * Format phone number to WhatsApp JID
     * Automatically converts Egyptian local numbers to international format
     */
    formatPhoneNumber(phoneNumber) {
        if (!phoneNumber) return '';
        
        // If it's already a full JID (contains @), return it as is
        if (String(phoneNumber).includes('@')) {
            return phoneNumber;
        }

        // Remove all non-digit characters
        let cleaned = String(phoneNumber).replace(/\D/g, '');

        // Convert Egyptian local numbers to international format
        // If starts with 0 (like 01066284516), replace leading 0 with 20
        if (cleaned.startsWith('0') && cleaned.length === 11) {
            cleaned = '20' + cleaned.substring(1);
        }

        // Add 20 if it's an Egyptian number missing the country code (e.g. 1066284516)
        if (cleaned.length === 10 && (cleaned.startsWith('10') || cleaned.startsWith('11') || cleaned.startsWith('12') || cleaned.startsWith('15'))) {
            cleaned = '20' + cleaned;
        }

        const jid = cleaned + '@s.whatsapp.net';
        console.log(`[MessageService] Formatted ${phoneNumber} -> ${jid}`);
        return jid;
    }

    /**
     * Check if number is on WhatsApp
     */
    async checkNumberExists(sessionId, phoneNumber) {
        try {
            const session = sessionManager.getSession(sessionId);

            if (!session) {
                throw new Error(`Session ${sessionId} not found`);
            }

            const jid = this.formatPhoneNumber(phoneNumber);
            const [result] = await session.onWhatsApp(jid);

            return result?.exists || false;

        } catch (error) {
            console.error('Error checking number:', error);
            return false;
        }
    }

    /**
     * Get all participating groups
     * @param {string} sessionId - Session ID
     */
    async getGroups(sessionId) {
        try {
            const session = sessionManager.getSession(sessionId);

            if (!session) {
                throw new Error(`Session ${sessionId} not found`);
            }

            if (!session.user) {
                throw new Error(`Session ${sessionId} is not connected`);
            }

            // Fetch all participating groups
            const groups = await session.groupFetchAllParticipating();

            // Convert to array and map essential fields
            return Object.values(groups).map(group => ({
                id: group.id,
                subject: group.subject,
                desc: group.desc,
                participants: group.participants.length
            }));

        } catch (error) {
            console.error('Error fetching groups:', error);
            throw error;
        }
    }
}

// Singleton instance
const messageService = new MessageService();

module.exports = messageService;
