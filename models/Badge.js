const mongoose = require('mongoose');

const badgeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Badge nomi majburiy'],
      unique: true,
      trim: true,
      maxlength: [50, 'Badge nomi 50 belgidan oshmasligi kerak'],
    },
    description: {
      type: String,
      required: [true, 'Badge tavsifi majburiy'],
      maxlength: [200, 'Tavsif 200 belgidan oshmasligi kerak'],
    },
    color: {
      type: String,
      enum: {
        values: ['green', 'blue', 'yellow', 'purple', 'orange', 'red'],
        message:
          "Rang green, blue, yellow, purple, orange yoki red bo'lishi kerak",
      },
      default: 'green',
    },
    emoji: {
      type: String,
      default: function () {
        const emojis = {
          green: '🟢',
          blue: '🔵',
          yellow: '🟡',
          purple: '🟣',
          orange: '🟠',
          red: '🔴',
        };
        return emojis[this.color] || '⚪';
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    redBadgeLimit: {
      type: Number,
      default: 2,
      min: [1, "Qizil badge limiti kamida 1 bo'lishi kerak"],
      max: [10, 'Qizil badge limiti 10 dan oshmasligi kerak'],
    },
    warnMessage: {
      type: String,
      default: function () {
        return `${this.name} bo'yicha ${this.redBadgeLimit} marta qizil badge olindi!`;
      },
    },
    // Badge priority (yuqori raqam = muhimroq)
    priority: {
      type: Number,
      default: 1,
      min: 1,
      max: 10,
    },
    // Badge category
    category: {
      type: String,
      enum: ['academic', 'behavior', 'attendance', 'participation', 'homework'],
      default: 'academic',
    },
  },
  {
    timestamps: true,
  }
);

// Index for performance
badgeSchema.index({ isActive: 1, priority: -1 });
badgeSchema.index({ category: 1, isActive: 1 });

// Virtual for emoji based on color
badgeSchema.virtual('colorEmoji').get(function () {
  const emojis = {
    green: '🟢',
    blue: '🔵',
    yellow: '🟡',
    purple: '🟣',
    orange: '🟠',
    red: '🔴',
  };
  return emojis[this.color] || '⚪';
});

// Static method to get badges with statistics
badgeSchema.statics.getBadgesWithStats = async function () {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $lookup: {
        from: 'dailybadges',
        localField: '_id',
        foreignField: 'badges.badge',
        as: 'dailyBadges',
      },
    },
    {
      $addFields: {
        totalUsage: { $size: '$dailyBadges' },
        earnedCount: {
          $size: {
            $filter: {
              input: '$dailyBadges',
              cond: { $eq: ['$$this.badges.status', 'earned'] },
            },
          },
        },
      },
    },
    { $sort: { priority: -1, name: 1 } },
  ]);
};

// Instance method to check if badge limit exceeded
badgeSchema.methods.checkWarnLimit = async function (studentId) {
  const DailyBadge = mongoose.model('DailyBadge');

  const redBadgeCount = await DailyBadge.countDocuments({
    student: studentId,
    'badges.badge': this._id,
    'badges.status': 'not_earned',
  });

  return {
    exceeded: redBadgeCount >= this.redBadgeLimit,
    count: redBadgeCount,
    limit: this.redBadgeLimit,
    message: redBadgeCount >= this.redBadgeLimit ? this.warnMessage : null,
  };
};

// Pre-save middleware to set emoji based on color
badgeSchema.pre('save', function (next) {
  if (this.isModified('color')) {
    const emojis = {
      green: '🟢',
      blue: '🔵',
      yellow: '🟡',
      purple: '🟣',
      orange: '🟠',
      red: '🔴',
    };
    this.emoji = emojis[this.color] || '⚪';
  }
  next();
});

module.exports = mongoose.model('Badge', badgeSchema);
