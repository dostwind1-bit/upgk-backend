const buildPublicProfilePayload = (user, posts) => ({
  user: {
    _id: user._id,
    name: user.name,
    avatar: user.avatar,
    bio: user.bio,
    role: user.role,
  },
  posts: posts.filter((post) => post.moderationStatus === 'approved'),
});

module.exports = { buildPublicProfilePayload };
