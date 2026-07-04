require('dotenv').config();
const mongoose = require('mongoose');
const Post = require('../models/Post');

const CATEGORY_MAP = {
  python: 'Technology',
  ai: 'Technology',
  'ai/ml': 'Technology',
  sql: 'Technology',
  general: 'General',
};

const runMigration = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not defined');
    }

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
    });

    const posts = await Post.find({
      $or: [
        { category: { $in: Object.keys(CATEGORY_MAP) } },
        { category: { $exists: false } },
        { category: null },
        { category: '' },
      ],
    });

    let updatedCount = 0;

    for (const post of posts) {
      const normalizedCategory = CATEGORY_MAP[post.category] || 'General';
      const tags = new Set(post.tags || []);
      const legacyTopic = post.category && post.category !== 'general' ? post.category : null;
      if (legacyTopic && legacyTopic !== 'general') {
        tags.add(legacyTopic.toLowerCase());
      }

      await Post.updateOne(
        { _id: post._id },
        {
          $set: {
            category: normalizedCategory,
            tags: Array.from(tags),
          },
        }
      );
      updatedCount += 1;
    }

    console.log(`Migration complete. Updated ${updatedCount} posts.`);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

runMigration();
