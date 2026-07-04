const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEmail, isEnvAdminCredentials } = require('../utils/authHelpers');

test('normalizeEmail lowercases and trims input', () => {
  assert.equal(normalizeEmail('  Admin@Upgk.Online  '), 'admin@upgk.online');
});

test('env admin credentials are accepted even without database access', () => {
  process.env.ADMIN_EMAIL = 'Admin@Upgk.Online';
  process.env.ADMIN_PASSWORD = 'Secret123';

  assert.equal(isEnvAdminCredentials('ADMIN@UPGK.ONLINE', 'Secret123'), true);
  assert.equal(isEnvAdminCredentials('admin@upgk.online', 'WrongPass'), false);
});
