const jwt = require('jsonwebtoken');
const { getSingleRow } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      username: user.username, 
      email: user.email, 
      role: user.role 
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Verify JWT token
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      message: 'Access denied. No token provided.' 
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      message: 'Invalid or expired token.' 
    });
  }
};

// Role-based access control
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required.' 
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Insufficient permissions.' 
      });
    }

    next();
  };
};

// Check if user exists
const checkUserExists = async (req, res, next) => {
  const { id } = req.user;
  
  const result = await getSingleRow(
    'SELECT id, username, email, role FROM users WHERE id = ?',
    [id]
  );

  if (!result.success || !result.data) {
    return res.status(404).json({ 
      success: false, 
      message: 'User not found.' 
    });
  }

  req.userDb = result.data;
  next();
};

module.exports = {
  JWT_SECRET,
  generateToken,
  verifyToken,
  authorize,
  checkUserExists
};
