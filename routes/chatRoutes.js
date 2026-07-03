const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Group = require('../models/Group');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// Helper: consistent conversationId for a DM between two users
function getDmConversationId(userA, userB) {
  return [userA, userB].sort().join('_');
}

// @route  GET /api/chat/dm/:userId  (get DM history with a user)
router.get('/dm/:userId', protect, async (req, res) => {
  try {
    const conversationId = getDmConversationId(req.user._id.toString(), req.params.userId);
    const messages = await Message.find({ chatType: 'dm', conversationId, isDeleted: false })
      .populate('sender', 'name avatar')
      .sort({ createdAt: 1 })
      .limit(200);

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  GET /api/chat/dm  (list of DM conversations for sidebar)
router.get('/dm', protect, async (req, res) => {
  try {
    const messages = await Message.aggregate([
      { $match: { chatType: 'dm', conversationId: { $regex: req.user._id.toString() } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$conversationId', lastMessage: { $first: '$$ROOT' } } },
    ]);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  POST /api/chat/groups  (create group)
router.post('/groups', protect, async (req, res) => {
  try {
    const { name, description, isPublic } = req.body;
    const group = await Group.create({
      name,
      description,
      isPublic: isPublic !== false,
      createdBy: req.user._id,
      members: [req.user._id],
      admins: [req.user._id],
    });
    res.status(201).json(group);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  GET /api/chat/groups  (public groups + my groups)
router.get('/groups', protect, async (req, res) => {
  try {
    const groups = await Group.find({
      $or: [{ isPublic: true }, { members: req.user._id }],
    }).populate('createdBy', 'name avatar');
    res.json(groups);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  PUT /api/chat/groups/:id/join
router.put('/groups/:id/join', protect, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    if (!group.members.includes(req.user._id)) {
      group.members.push(req.user._id);
      await group.save();
    }
    res.json(group);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route  GET /api/chat/groups/:id/messages
router.get('/groups/:id/messages', protect, async (req, res) => {
  try {
    const messages = await Message.find({
      chatType: 'group',
      conversationId: req.params.id,
      isDeleted: false,
    })
      .populate('sender', 'name avatar')
      .sort({ createdAt: 1 })
      .limit(200);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
