const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT token, attach user to req
exports.protect = async (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  console.log('[auth/protect] Authorization header:', authHeader);

  let token = '';

  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    token = authHeader.split(' ')[1];
    console.log('[auth/protect] Extracted token:', token);
  } else {
    console.log('[auth/protect] No bearer token found');
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({ message: 'User not found' });
    }

    if (req.user.isBanned) {
      return res.status(403).json({ message: 'Your account has been banned. Contact support.' });
    }

    next();
  } catch (error) {
    console.error('[auth/protect] Token verification failed', error.message);
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

// Admin-only routes
exports.admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({ message: 'Admin access required' });
  }
};

// Optional auth - attaches user if token present, doesn't block if not
exports.optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
    } catch (error) {
      req.user = null;
    }
  }
  next();
};
