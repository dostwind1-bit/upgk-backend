const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Follow = require('../models/Follow');
const { checkTextModeration } = require('../services/moderation');

function getDmConversationId(userA, userB) {
  return [userA, userB].sort().join('_');
}

function initSocket(io) {
  // Authenticate socket connections using JWT
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');

      if (!user || user.isBanned) return next(new Error('Unauthorized'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.name} (${socket.id})`);

    // Join personal room for DMs
    socket.join(`user_${socket.user._id}`);

    // Join a group room
    socket.on('join_group', (groupId) => {
      socket.join(`group_${groupId}`);
    });

    socket.on('leave_group', (groupId) => {
      socket.leave(`group_${groupId}`);
    });

    // Send DM
    socket.on('send_dm', async ({ toUserId, content }) => {
      try {
        // Live AI moderation check BEFORE saving/broadcasting
        const modResult = await checkTextModeration(content);

        if (!modResult.isSafe) {
          socket.emit('message_blocked', {
            reason: 'Message blocked by AI moderation',
            flags: modResult.flags,
          });
          return;
        }

        const followsBack = await Follow.exists({ follower: toUserId, following: socket.user._id });
        const isFollowing = await Follow.exists({ follower: socket.user._id, following: toUserId });

        if (!followsBack && !isFollowing) {
          socket.emit('error_message', { message: 'You can only chat with users you follow or who follow you' });
          return;
        }

        const conversationId = getDmConversationId(socket.user._id.toString(), toUserId);

        const message = await Message.create({
          sender: socket.user._id,
          chatType: 'dm',
          conversationId,
          content,
          moderationFlags: modResult.flags,
        });

        const populated = await message.populate('sender', 'name avatar');

        // Send to both participants
        io.to(`user_${toUserId}`).to(`user_${socket.user._id}`).emit('receive_dm', populated);
      } catch (error) {
        socket.emit('error_message', { message: 'Failed to send message' });
      }
    });

    // Send group message
    socket.on('send_group_message', async ({ groupId, content }) => {
      try {
        const modResult = await checkTextModeration(content);

        if (!modResult.isSafe) {
          socket.emit('message_blocked', {
            reason: 'Message blocked by AI moderation',
            flags: modResult.flags,
          });
          return;
        }

        const message = await Message.create({
          sender: socket.user._id,
          chatType: 'group',
          conversationId: groupId,
          content,
          moderationFlags: modResult.flags,
        });

        const populated = await message.populate('sender', 'name avatar');

        io.to(`group_${groupId}`).emit('receive_group_message', populated);
      } catch (error) {
        socket.emit('error_message', { message: 'Failed to send message' });
      }
    });

    // Typing indicators
    socket.on('typing_dm', ({ toUserId }) => {
      io.to(`user_${toUserId}`).emit('user_typing', { userId: socket.user._id, name: socket.user.name });
    });

    socket.on('typing_group', ({ groupId }) => {
      socket.to(`group_${groupId}`).emit('user_typing_group', { userId: socket.user._id, name: socket.user.name });
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.name}`);
    });
  });
}

module.exports = initSocket;
