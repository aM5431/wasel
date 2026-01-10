const jwt = require('jsonwebtoken');
const SECRET = 'super_secret_key_123'; // In prod, use process.env

const authenticateToken = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        // Check if this is an API request (use originalUrl to get full path)
        if (req.originalUrl.startsWith('/api/')) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        return res.redirect('/login');
    }

    jwt.verify(token, SECRET, (err, user) => {
        if (err) {
            console.error('JWT verification error:', err.message);
            // Check if this is an API request (use originalUrl to get full path)
            if (req.originalUrl.startsWith('/api/')) {
                return res.status(401).json({ error: 'Invalid token: ' + err.message });
            }
            return res.redirect('/login');
        }
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).send('Forbidden');
    }
};

const generateToken = (user) => {
    return jwt.sign({ id: user.id, name: user.name, role: user.role }, SECRET, { expiresIn: '24h' });
};

module.exports = { authenticateToken, isAdmin, generateToken };
