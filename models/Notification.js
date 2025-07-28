const mongoose = require('mongoose');
const { sendMessage } = require('../bot/utils'); // ✅ To‘g‘ri import

const notificationSchema = new mongoose.Schema({
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: false,
  },
  type: {
    type: String,
    enum: [
      'badge_update',
      'payment_reminder',
      'homework',
      'general',
      'bulk_message',
    ],
    default: 'general',
  },
  title: {
    type: String,
    maxLength: 100,
  },
  message: {
    type: String,
    maxLength: 1000,
    required: true,
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
  },
  read: {
    type: Boolean,
    default: false,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

// Telegramga xabar yuborish
notificationSchema.pre('save', async function (next) {
  if (!this.isNew) return next();

  try {
    let telegramId = null;
    let fullName = '';

    if (this.parent) {
      const parent = await mongoose.model('User').findById(this.parent).exec();
      if (parent?.telegramId) {
        telegramId = parent.telegramId;
        fullName = parent.fullName;
      }
    } else if (this.student) {
      const student = await mongoose
        .model('Student')
        .findById(this.student)
        .populate('parent')
        .populate('user')
        .exec();

      if (student?.parent?.telegramId) {
        telegramId = student.parent.telegramId;
        fullName = student.user?.fullName || 'O‘quvchi';
      }
    }

    if (telegramId) {
      const titleText = this.title ? `📢 ${this.title}\n\n` : '';
      const msg = `${titleText}👤 ${fullName}\n\n${this.message}`;
      await sendMessage(telegramId, msg); // ✅ To‘g‘ri chaqiruv
    }
  } catch (error) {
    console.error('🔴 Telegramga xabar yuborishda xatolik:', error);
  }

  next();
});

module.exports = mongoose.model('Notification', notificationSchema);
