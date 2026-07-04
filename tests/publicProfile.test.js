const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPublicProfilePayload } = require('../utils/publicProfile');

test('buildPublicProfilePayload excludes sensitive fields and keeps approved posts', () => {
  const user = {
    _id: 'user-1',
    name: 'Ayesha',
    avatar: 'avatar.png',
    bio: 'Hello world',
    email: 'secret@example.com',
    password: 'hashed',
    role: 'user',
  };

  const posts = [
    { _id: 'p1', title: 'Public post', content: 'hello', moderationStatus: 'approved', author: 'user-1' },
    { _id: 'p2', title: 'Pending post', content: 'private', moderationStatus: 'pending', author: 'user-1' },
  ];

  const payload = buildPublicProfilePayload(user, posts);

  assert.equal(payload.user.name, 'Ayesha');
  assert.equal(payload.user.bio, 'Hello world');
  assert.equal(payload.user.email, undefined);
  assert.equal(payload.user.password, undefined);
  assert.equal(payload.posts.length, 1);
  assert.equal(payload.posts[0]._id, 'p1');
});
