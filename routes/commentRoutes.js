const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Comment = require('../models/Comment');
const Post = require('../models/Post');
const { protect } = require('../middleware/auth');
const { checkTextModeration } = require('../services/moderation');

// @route  POST /api/comments
router.post('/', protect, [
  body('postId').notEmpty().withMessage('Post ID is required'),
  body('content').trim().notEmpty().withMessage('Comment content is required').isLength({ max: 1000 }).withMessage('Comment content must be at most 1000 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { postId, content, parentComment } = req.body;

    const post = await Post.findById(postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const modResult = await checkTextModeration(content);

    const comment = await Comment.create({
      post: postId,
      author: req.user._id,
      content,
      parentComment: parentComment || null,
      moderationStatus: modResult.isSafe ? 'approved' : 'rejected',
      moderationFlags: modResult.flags,
    });

    if (!modResult.isSafe) {
      return res.status(400).json({
        message: 'Comment blocked by AI moderation',
        flags: modResult.flags,
      });
    }

    const populated = await comment.populate('author', 'name avatar');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  GET /api/comments/:postId
router.get('/:postId', async (req, res) => {
  try {
    const comments = await Comment.find({
      post: req.params.postId,
      moderationStatus: 'approved',
    })
      .populate('author', 'name avatar')
      .sort({ createdAt: -1 });

    res.json(comments);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  DELETE /api/comments/:id
router.delete('/:id', protect, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    if (comment.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await comment.deleteOne();
    res.json({ message: 'Comment deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
