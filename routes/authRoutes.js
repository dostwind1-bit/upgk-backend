const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Post = require('../models/Post');
const { protect, optionalAuth } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const { normalizeEmail, isEnvAdminCredentials } = require('../utils/authHelpers');
const Follow = require('../models/Follow');
const { buildPublicProfilePayload } = require('../utils/publicProfile');

const generateToken = (id) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '30d' });
};

// @route  POST /api/auth/register
router.post(
  '/register',
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { name, email, password } = req.body;

      const existingUser = await User.findOne({ email });
      if (existingUser) return res.status(400).json({ message: 'Email already registered' });

      const user = await User.create({ name, email, password });

      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        token: generateToken(user._id),
      });
    } catch (error) {
      res.status(500).json({ message: 'Server error', error: error.message });
    }
  }
);

// @route  POST /api/auth/login
router.post('/login', [
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);

    console.log('[auth/login] Incoming request', {
      email: email || '',
      normalizedEmail,
      passwordProvided: Boolean(password),
    });

    if (isEnvAdminCredentials(normalizedEmail, password)) {
      console.log('[auth/login] Matched env admin credentials');
      return res.json({
        _id: 'env-admin',
        name: 'Admin',
        email: process.env.ADMIN_EMAIL,
        role: 'admin',
        avatar: '',
        token: generateToken('env-admin'),
      });
    }

    const user = await User.findOne({ email: normalizedEmail });
    console.log('[auth/login] User from DB', user ? {
      id: user._id,
      email: user.email,
      role: user.role,
      hasPassword: Boolean(user.password),
      isBanned: user.isBanned,
    } : null);

    if (!user) {
      console.log('[auth/login] No user found for normalized email');
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const passwordMatch = await user.matchPassword(password);
    console.log('[auth/login] Password compare result', passwordMatch);

    if (!passwordMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.isBanned) {
      return res.status(403).json({ message: `Account banned. Reason: ${user.banReason || 'Policy violation'}` });
    }

    const token = generateToken(user._id);
    console.log('[auth/login] JWT generated successfully');

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      token,
    });
  } catch (error) {
    console.error('[auth/login] Login error', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  GET /api/auth/me
router.get('/me', protect, async (req, res) => {
  res.json(req.user);
});

// @route  GET /api/auth/users
router.get('/users', protect, async (req, res) => {
  try {
    const users = await User.find({}, '_id name avatar bio role').sort({ name: 1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  GET /api/auth/profile/:userId
router.get('/profile/:userId', optionalAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid user id' });
    }

    const user = await User.findById(userId).select('_id name avatar bio role');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const [posts, followersCount, followingCount, isFollowing] = await Promise.all([
      Post.find({ author: user._id }).sort({ createdAt: -1 }).lean(),
      Follow.countDocuments({ following: user._id }),
      Follow.countDocuments({ follower: user._id }),
      Follow.exists({ follower: req.user?._id, following: user._id }),
    ]);

    res.json({
      ...buildPublicProfilePayload(user, posts),
      followersCount,
      followingCount,
      isFollowing: Boolean(isFollowing),
    });
  } catch (error) {
    console.error('[auth/profile] Public profile lookup failed', {
      userId: req.params.userId,
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  PUT /api/auth/profile
router.put('/profile', protect, [
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('bio').optional().isLength({ max: 300 }).withMessage('Bio must be at most 300 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { name, bio, avatar } = req.body;
    const user = await User.findById(req.user._id);

    if (name) user.name = name;
    if (bio !== undefined) user.bio = bio;
    if (avatar) user.avatar = avatar;

    await user.save();
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
