const express = require('express');
const router = express.Router();
const slugify = require('slugify');
const Post = require('../models/Post');
const User = require('../models/User');
const { protect, admin, optionalAuth } = require('../middleware/auth');
const { uploadImage, uploadVideo } = require('../middleware/upload');
const { moderatePost } = require('../services/moderation');

// @route  POST /api/posts  (create blog/image/question post)
router.post('/', protect, uploadImage.array('images', 5), async (req, res) => {
  try {
    const { postType, title, content, category, tags, videoType, videoUrl } = req.body;

    if (!['blog', 'image', 'video', 'question'].includes(postType)) {
      return res.status(400).json({ message: 'Invalid post type' });
    }

    const images = req.files ? req.files.map((f) => f.path) : [];

    // For plagiarism check, pull recent approved text posts in same category
    let existingTexts = [];
    if (postType === 'blog' || postType === 'question') {
      const recentPosts = await Post.find({
        category: category || 'general',
        moderationStatus: 'approved',
      })
        .select('content')
        .limit(200)
        .lean();
      existingTexts = recentPosts.map((p) => p.content).filter(Boolean);
    }

    // Run AI moderation
    const modResult = await moderatePost({
      postType,
      title,
      content: content || '',
      images,
      videoThumbnail: '',
      existingTexts,
    });

    const slug = `${slugify(title, { lower: true, strict: true })}-${Date.now().toString(36)}`;

    const post = await Post.create({
      author: req.user._id,
      postType,
      title,
      slug,
      content: content || '',
      category: category || 'general',
      tags: tags ? tags.split(',').map((t) => t.trim()) : [],
      images,
      videoType: videoType || null,
      videoUrl: videoUrl || '',
      ...modResult,
    });

    // Track warnings for repeatedly rejected content
    if (modResult.moderationStatus === 'rejected') {
      await User.findByIdAndUpdate(req.user._id, { $inc: { warningCount: 1 } });
    }

    res.status(201).json(post);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  POST /api/posts/video  (video post - upload or youtube link)
router.post('/video', protect, uploadVideo.single('video'), async (req, res) => {
  try {
    const { title, content, category, tags, videoType, videoUrl, thumbnail } = req.body;

    let finalVideoUrl = videoUrl;
    let videoThumbnail = thumbnail || '';

    if (videoType === 'upload' && req.file) {
      finalVideoUrl = req.file.path;
      // Cloudinary auto-generates a thumbnail for uploaded videos
      videoThumbnail = req.file.path.replace(/\.(mp4|mov|webm)$/, '.jpg');
    }

    if (!finalVideoUrl) {
      return res.status(400).json({ message: 'Video file or YouTube URL required' });
    }

    const modResult = await moderatePost({
      postType: 'video',
      title,
      content: content || '',
      images: [],
      videoThumbnail: videoType === 'upload' ? videoThumbnail : '', // YouTube links skip image check
      existingTexts: [],
    });

    const slug = `${slugify(title, { lower: true, strict: true })}-${Date.now().toString(36)}`;

    const post = await Post.create({
      author: req.user._id,
      postType: 'video',
      title,
      slug,
      content: content || '',
      category: category || 'general',
      tags: tags ? tags.split(',').map((t) => t.trim()) : [],
      videoType,
      videoUrl: finalVideoUrl,
      videoThumbnail,
      ...modResult,
    });

    res.status(201).json(post);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  GET /api/posts  (public feed - only approved posts)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { category, postType, page = 1, limit = 10, search } = req.query;
    const query = { moderationStatus: 'approved' };

    if (category) query.category = category;
    if (postType) query.postType = postType;
    if (search) query.$text = { $search: search };

    const posts = await Post.find(query)
      .populate('author', 'name avatar')
      .sort({ isPinned: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Post.countDocuments(query);

    res.json({ posts, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  GET /api/posts/:slug
router.get('/:slug', optionalAuth, async (req, res) => {
  try {
    const post = await Post.findOne({ slug: req.params.slug }).populate('author', 'name avatar bio');

    if (!post) return res.status(404).json({ message: 'Post not found' });

    // Only show non-approved posts to their author or admin
    if (post.moderationStatus !== 'approved') {
      const isOwner = req.user && post.author._id.toString() === req.user._id.toString();
      const isAdmin = req.user && req.user.role === 'admin';
      if (!isOwner && !isAdmin) return res.status(404).json({ message: 'Post not found' });
    }

    post.views += 1;
    await post.save();

    res.json(post);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  PUT /api/posts/:id/like
router.put('/:id/like', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const alreadyLiked = post.likes.includes(req.user._id);
    if (alreadyLiked) {
      post.likes = post.likes.filter((id) => id.toString() !== req.user._id.toString());
    } else {
      post.likes.push(req.user._id);
    }
    await post.save();
    res.json({ likes: post.likes.length, liked: !alreadyLiked });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  DELETE /api/posts/:id  (owner or admin)
router.delete('/:id', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    if (post.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized' });
    }

    await post.deleteOne();
    res.json({ message: 'Post deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  GET /api/posts/user/my-posts
router.get('/user/my-posts', protect, async (req, res) => {
  try {
    const posts = await Post.find({ author: req.user._id }).sort({ createdAt: -1 });
    res.json(posts);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
