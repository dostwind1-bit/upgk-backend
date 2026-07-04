const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    postType: {
      type: String,
      enum: ['blog', 'image', 'video', 'question'],
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, unique: true },
    content: { type: String, default: '' }, // blog text / question body
    category: {
      type: String,
      enum: [
        'General',
        'Education',
        'Technology',
        'Health & Fitness',
        'Business & Finance',
        'Career & Jobs',
        'Relationships',
        'Entertainment',
        'Sports',
        'Science',
        'Personal Development',
        'Travel',
        'Food',
        'Sawaal',
      ],
      default: 'General',
    },
    tags: [{ type: String }],

    // Media fields
    images: [{ type: String }], // cloudinary URLs
    videoType: { type: String, enum: ['upload', 'youtube', null], default: null },
    videoUrl: { type: String, default: '' }, // cloudinary URL or youtube URL
    videoThumbnail: { type: String, default: '' },

    // Moderation
    moderationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'flagged_for_review'],
      default: 'pending',
    },
    moderationFlags: [{ type: String }], // e.g. ['toxicity', 'nudity', 'plagiarism']
    moderationScore: { type: Number, default: 0 }, // 0-1, higher = more risky
    moderationNote: { type: String, default: '' },
    rejectedReason: { type: String, default: '' },

    // Engagement
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    views: { type: Number, default: 0 },
    isPinned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

postSchema.index({ slug: 1 }, { unique: true });
postSchema.index({ createdAt: -1 });
postSchema.index({ title: 'text', content: 'text' });

module.exports = mongoose.model('Post', postSchema);
