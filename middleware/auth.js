const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_long_random_secret_here';

// Generate JWT token
const generateToken = (userId, email) => {
    const token = jwt.sign(
        { userId, email },
        JWT_SECRET,
        { expiresIn: '7d' }
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

// Middleware to check if user is authenticated
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

    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
};

module.exports = {
    generateToken,
    verifyToken,
    authenticateToken,
};
