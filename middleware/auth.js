const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_long_random_secret_here';
const COOKIE_NAME = 'authToken';

// Generate JWT token with 1 day expiration
const generateToken = (user) => {
    const token = jwt.sign(
        {
            id: user._id.toString(),
            userId: user._id.toString(),
            email: user.email,
            name: user.name
        },
        JWT_SECRET,
        { expiresIn: '1d' }
    );
    return token;
};

// Verify JWT token
const verifyToken = (token) => {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded;
    } catch (error) {
        return null;
    }
};

// Protect routes middleware - extracts JWT from HTTP-Only cookie
const protectRoute = (req, res, next) => {
    const token = req.cookies[COOKIE_NAME];

    if (!token) {
        return res.status(401).json({ message: 'Access token required. Please login.' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ message: 'Invalid or expired token. Please login again.' });
    }

    // Attach user data to request object for use in route handlers
    req.user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name,
    };

    next();
};

// Legacy middleware for Authorization header (for backward compatibility if needed)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Access token required' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(403).json({ message: 'Invalid or expired token' });
    }

    req.user = {
        id: decoded.id,
        userId: decoded.userId,
        email: decoded.email,
        name: decoded.name,
    };
    next();
};

module.exports = {
    generateToken,
    verifyToken,
    protectRoute,
    authenticateToken,
    COOKIE_NAME,
};
