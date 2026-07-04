const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const isEnvAdminCredentials = (email, password) => {
  const normalizedEmail = normalizeEmail(email);
  const configuredEmail = normalizeEmail(process.env.ADMIN_EMAIL);
  const configuredPassword = process.env.ADMIN_PASSWORD;

  return Boolean(
    normalizedEmail &&
    configuredEmail &&
    configuredPassword &&
    normalizedEmail === configuredEmail &&
    password === configuredPassword
  );
};

module.exports = {
  normalizeEmail,
  isEnvAdminCredentials,
};
