const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    chatType: { type: String, enum: ['dm', 'group'], required: true },
    // for DM: conversationId = sorted userId1_userId2
    // for group: conversationId = group's _id as string
    conversationId: { type: String, required: true, index: true },
    content: { type: String, required: true, maxlength: 2000 },
    isFlagged: { type: Boolean, default: false },
    moderationFlags: [{ type: String }],
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Message', messageSchema);
