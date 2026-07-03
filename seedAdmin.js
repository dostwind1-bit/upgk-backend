// Run once after deployment: node seedAdmin.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function seedAdmin() {
  await mongoose.connect(process.env.MONGO_URI);

  const existingAdmin = await User.findOne({ email: process.env.ADMIN_EMAIL });

  if (existingAdmin) {
    console.log('Admin already exists:', existingAdmin.email);
  } else {
    const admin = await User.create({
      name: 'Admin',
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      role: 'admin',
      isVerified: true,
    });
    console.log('Admin created successfully:', admin.email);
  }

  mongoose.connection.close();
}

seedAdmin().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
