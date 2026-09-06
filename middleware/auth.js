const jwt = require('jwt-simple');
const bcryptjs = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Generate JWT Token
const generateToken = (userId, role) => {
  const payload = {
    userId,
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
  };
  return jwt.encode(payload, JWT_SECRET);
};

// Verify JWT Token
const verifyToken = (token) => {
  try {
    return jwt.decode(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Hash Password
const hashPassword = async (password) => {
  const salt = await bcryptjs.genSalt(10);
  return await bcryptjs.hash(password, salt);
};

// Compare Password
const comparePassword = async (password, hash) => {
  return await bcryptjs.compare(password, hash);
};

// Middleware: Verify Auth
const verifyAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'No token provided'
    });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }

  req.user = decoded;
  next();
};

// Middleware: Verify Role
const verifyRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access forbidden'
      });
    }
    next();
  };
};

module.exports = {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  verifyAuth,
  verifyRole
};
