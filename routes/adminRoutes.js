const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const User = require('../models/User');
const Comment = require('../models/Comment');
const Report = require('../models/Report');
const { protect, admin } = require('../middleware/auth');

router.use(protect, admin); // every route below requires admin

// @route  GET /api/admin/dashboard  (stats overview)
router.get('/dashboard', async (req, res) => {
  try {
    const [totalUsers, totalPosts, pendingReview, totalReports, bannedUsers] = await Promise.all([
      User.countDocuments(),
      Post.countDocuments(),
      Post.countDocuments({ moderationStatus: 'flagged_for_review' }),
      Report.countDocuments({ status: 'pending' }),
      User.countDocuments({ isBanned: true }),
    ]);

    const postsByStatus = await Post.aggregate([
      { $group: { _id: '$moderationStatus', count: { $sum: 1 } } },
    ]);

    res.json({ totalUsers, totalPosts, pendingReview, totalReports, bannedUsers, postsByStatus });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  GET /api/admin/posts  (all posts with filters - for moderation queue)
router.get('/posts', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = status ? { moderationStatus: status } : {};

    const posts = await Post.find(query)
      .populate('author', 'name email')
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const sortedPosts = posts.sort((a, b) => {
      const order = { flagged_for_review: 0, pending: 1, approved: 2, rejected: 3 };
      const aOrder = order[a.moderationStatus] ?? 99;
      const bOrder = order[b.moderationStatus] ?? 99;

      if (aOrder !== bOrder) return aOrder - bOrder;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const total = await Post.countDocuments(query);
    res.json({ posts: sortedPosts, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  PUT /api/admin/posts/:id/review  (manually approve/reject a flagged post)
router.put('/posts/:id/review', async (req, res) => {
  try {
    const { decision, note } = req.body; // decision: 'approved' | 'rejected'
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    post.moderationStatus = decision;
    post.moderationNote = note || post.moderationNote;
    if (decision === 'rejected') post.rejectedReason = note || 'Rejected by admin';

    await post.save();
    res.json(post);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  PUT /api/admin/posts/:id/pin
router.put('/posts/:id/pin', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });
    post.isPinned = !post.isPinned;
    await post.save();
    res.json(post);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  DELETE /api/admin/posts/:id
router.delete('/posts/:id', async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.id);
    res.json({ message: 'Post deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const query = search ? { $or: [{ name: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }] } : {};

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await User.countDocuments(query);
    res.json({ users, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  PUT /api/admin/users/:id/ban
router.put('/users/:id/ban', async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.isBanned = true;
    user.banReason = reason || 'Violation of community guidelines';
    await user.save();
    res.json({ message: 'User banned', user });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  PUT /api/admin/users/:id/unban
router.put('/users/:id/unban', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.isBanned = false;
    user.banReason = '';
    await user.save();
    res.json({ message: 'User unbanned', user });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  PUT /api/admin/users/:id/make-admin
router.put('/users/:id/make-admin', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.role = user.role === 'admin' ? 'user' : 'admin';
    await user.save();
    res.json({ message: `Role updated to ${user.role}`, user });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  GET /api/admin/reports
router.get('/reports', async (req, res) => {
  try {
    const { status = 'pending' } = req.query;
    const reports = await Report.find({ status }).populate('reportedBy', 'name email').sort({ createdAt: -1 });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  PUT /api/admin/reports/:id
router.put('/reports/:id', async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });

    report.status = status;
    report.adminNote = adminNote || '';
    await report.save();
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  GET /api/admin/comments  (flagged/pending comments)
router.get('/comments', async (req, res) => {
  try {
    const { status = 'rejected' } = req.query;
    const comments = await Comment.find({ moderationStatus: status })
      .populate('author', 'name email')
      .populate('post', 'title slug')
      .sort({ createdAt: -1 });
    res.json(comments);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
