const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const { protect } = require('../middleware/auth');

// @route  POST /api/reports
router.post('/', protect, async (req, res) => {
  try {
    const { targetType, targetId, reason } = req.body;

    const report = await Report.create({
      reportedBy: req.user._id,
      targetType,
      targetId,
      reason,
    });

    res.status(201).json({ message: 'Report submitted, admin will review it', report });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
