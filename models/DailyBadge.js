const mongoose = require('mongoose');

const dailyBadgeSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    badges: [
      {
        badge: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Badge',
          required: true,
        },
        status: {
          type: String,
          enum: ['earned', 'not_earned', 'absent'],
          default: 'not_earned',
        },
      },
    ],
    date: {
      type: Date,
      default: Date.now,
    },
    notes: String,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

dailyBadgeSchema.index({ student: 1, date: -1 });
dailyBadgeSchema.index({ lesson: 1, date: -1 });

module.exports = mongoose.model('DailyBadge', dailyBadgeSchema);
