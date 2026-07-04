const express = require('express');
const router = express.Router();
const Follow = require('../models/Follow');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const isSameUser = (a, b) => a.toString() === b.toString();

router.post('/:id/follow', protect, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    if (isSameUser(targetUserId, req.user._id)) {
      return res.status(400).json({ message: 'You cannot follow yourself' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

    const existing = await Follow.findOne({ follower: req.user._id, following: targetUserId });
    if (existing) return res.status(200).json({ message: 'Already following', following: true });

    await Follow.create({ follower: req.user._id, following: targetUserId });
    res.status(201).json({ message: 'Followed', following: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.post('/:id/unfollow', protect, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    await Follow.deleteOne({ follower: req.user._id, following: targetUserId });
    res.json({ message: 'Unfollowed', following: false });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/:id/followers', async (req, res) => {
  try {
    const followers = await Follow.find({ following: req.params.id }).populate('follower', '_id name avatar').sort({ createdAt: -1 });
    res.json(followers.map((entry) => entry.follower));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

router.get('/:id/following', async (req, res) => {
  try {
    const following = await Follow.find({ follower: req.params.id }).populate('following', '_id name avatar').sort({ createdAt: -1 });
    res.json(following.map((entry) => entry.following));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
