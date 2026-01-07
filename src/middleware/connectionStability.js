// Connection stability middleware
const connectionStability = (req, res, next) => {
    // Set connection headers for better stability
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Keep-Alive', 'timeout=120, max=1000');
    
    // Handle client disconnection gracefully
    req.on('close', () => {
        console.log('Client disconnected from request');
    });

    req.on('error', (error) => {
        console.error('Request error:', error);
    });

    next();
};

module.exports = connectionStability;