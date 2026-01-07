const os = require('os');
const { performance } = require('perf_hooks');

class NetworkOptimizer {
    constructor() {
        this.connectionMetrics = new Map();
        this.retryStrategies = new Map();
    }

    /**
     * Get optimal connection settings based on system resources
     */
    getOptimalSettings() {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const cpuCount = os.cpus().length;
        
        // Base settings for low-resource systems
        let settings = {
            connectTimeoutMs: 30000,
            defaultQueryTimeoutMs: 30000,
            keepAliveIntervalMs: 15000,
            retryRequestDelayMs: 1000,
            maxMsgRetryCount: 2
        };

        // Optimize based on available resources
        if (freeMemory > 2 * 1024 * 1024 * 1024) { // > 2GB free
            settings.connectTimeoutMs = 20000;
            settings.defaultQueryTimeoutMs = 20000;
            settings.keepAliveIntervalMs = 10000;
            settings.retryRequestDelayMs = 500;
            settings.maxMsgRetryCount = 3;
        }

        if (cpuCount >= 4) {
            settings.retryRequestDelayMs = Math.max(250, settings.retryRequestDelayMs / 2);
        }

        return settings;
    }

    /**
     * Monitor connection performance
     */
    startMonitoring(sessionId) {
        const startTime = performance.now();
        
        this.connectionMetrics.set(sessionId, {
            startTime,
            reconnectCount: 0,
            lastReconnect: null,
            avgResponseTime: 0,
            failureCount: 0
        });
    }

    /**
     * Record connection event
     */
    recordEvent(sessionId, eventType, data = {}) {
        const metrics = this.connectionMetrics.get(sessionId);
        if (!metrics) return;

        const now = performance.now();

        switch (eventType) {
            case 'reconnect':
                metrics.reconnectCount++;
                metrics.lastReconnect = now;
                break;
            case 'failure':
                metrics.failureCount++;
                break;
            case 'response':
                if (data.responseTime) {
                    metrics.avgResponseTime = (metrics.avgResponseTime + data.responseTime) / 2;
                }
                break;
        }
    }

    /**
     * Get adaptive retry delay based on connection history
     */
    getRetryDelay(sessionId, attemptCount = 0) {
        const metrics = this.connectionMetrics.get(sessionId);
        
        // Base exponential backoff
        let delay = Math.min(1000 * Math.pow(1.5, attemptCount), 15000);
        
        if (metrics) {
            // Increase delay if frequent failures
            if (metrics.failureCount > 5) {
                delay *= 1.5;
            }
            
            // Reduce delay if connection is generally stable
            if (metrics.reconnectCount < 3 && metrics.failureCount < 2) {
                delay *= 0.7;
            }
        }
        
        return Math.floor(delay);
    }

    /**
     * Check if connection should be attempted based on recent failures
     */
    shouldAttemptConnection(sessionId) {
        const metrics = this.connectionMetrics.get(sessionId);
        if (!metrics) return true;

        const now = performance.now();
        const timeSinceLastReconnect = now - (metrics.lastReconnect || 0);
        
        // Don't attempt if too many recent failures
        if (metrics.failureCount > 10 && timeSinceLastReconnect < 60000) {
            return false;
        }
        
        return true;
    }

    /**
     * Clean up metrics for removed session
     */
    cleanup(sessionId) {
        this.connectionMetrics.delete(sessionId);
        this.retryStrategies.delete(sessionId);
    }

    /**
     * Get connection health status
     */
    getHealthStatus(sessionId) {
        const metrics = this.connectionMetrics.get(sessionId);
        if (!metrics) return 'unknown';

        const now = performance.now();
        const uptime = now - metrics.startTime;
        
        if (metrics.failureCount === 0 && metrics.reconnectCount <= 1) {
            return 'excellent';
        } else if (metrics.failureCount < 3 && metrics.reconnectCount < 5) {
            return 'good';
        } else if (metrics.failureCount < 8) {
            return 'fair';
        } else {
            return 'poor';
        }
    }
}

module.exports = new NetworkOptimizer();