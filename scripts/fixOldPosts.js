require('dotenv').config();
const mongoose = require('mongoose');
const Post = require('../models/Post');

const runMigration = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not defined');
    }

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log('Connected to MongoDB');

    const result = await Post.updateMany(
      {
        $or: [
          { moderationStatus: { $exists: false } },
          { moderationStatus: null },
          { moderationStatus: undefined },
          { moderationStatus: '' },
        ],
      },
      { $set: { moderationStatus: 'approved' } }
    );

    console.log(`Updated ${result.modifiedCount} posts to approved moderation status`);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

runMigration();
