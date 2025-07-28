const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Ism va familiya majburiy'],
      trim: true,
      maxlength: [100, 'Ism va familiya 100 belgidan oshmasligi kerak'],
      index: true,
    },
    phone: {
      type: String,
      unique: true,
      sparse: true,
      match: [
        /^\+998[0-9]{9}$/,
        "Telefon raqami +998XXXXXXXXX formatida bo'lishi kerak",
      ],
      index: true,
      validate: {
        validator: (v) => {
          // Telefon raqami bo'sh bo'lsa yoki to'g'ri formatda bo'lsa true qaytarish
          return !v || /^\+998[0-9]{9}$/.test(v);
        },
        message: "Telefon raqami noto'g'ri formatda",
      },
    },
    telegramId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    Username: {
      type: String,
      sparse: true,
    },
    role: {
      type: String,
      enum: {
        values: ['admin', 'teacher', 'student', 'parent'],
        message: "Noto'g'ri rol kiritildi",
      },
      default: 'parent',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastLogin: {
      type: Date,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
    },
    password: {
      type: String,
      required: [true, 'Parol majburiy'],
      minlength: [6, "Parol kamida 6 ta belgidan iborat bo'lishi kerak"],
      maxlength: [128, 'Parol 128 ta belgidan oshmasligi kerak'],
      select: false,
      // validate: {
      //   validator: (v) => {
      //     // Kamida bitta harf va bitta raqam bo'lishi kerak
      //     return /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{6,}$/.test(v);
      //   },
      //   message:
      //     "Parol kamida bitta harf va bitta raqamdan iborat bo'lishi kerak",
      // },
    },
    createdAt: {
      type: Date,
      default: Date.now,
      // TTL indexni schemadan keyin qo'shish
    },
    refreshTokens: [
      {
        token: String,
        createdAt: {
          type: Date,
          default: Date.now,
          index: { expires: 604800 }, // 7 kun TTL
        },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.password;
        delete ret.loginAttempts;
        delete ret.lockUntil;
        delete ret.refreshTokens;
        return ret;
      },
    },
  }
);

// Schema dan keyin TTL index qo'shish
userSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 300, // 5 daqiqa
    partialFilterExpression: { role: 'temp' }, // Faqat temp userlar uchun
  }
);

// Refresh tokens uchun TTL
userSchema.index(
  { 'refreshTokens.createdAt': 1 },
  {
    expireAfterSeconds: 604800, // 7 kun
  }
);

// Indexlar
userSchema.index({ phone: 1, isActive: 1 });
userSchema.index({ telegramId: 1, isActive: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ fullName: 'text', phone: 'text' });

// Virtual
userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Parol hashlash
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Parol solishtirish
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Login urinishlarini boshqarish
userSchema.methods.incrementLoginAttempts = function () {
  // Agar lock muddati o'tgan bo'lsa, reset qilish
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };
  const maxAttempts = 5;
  const lockTime = 2 * 60 * 60 * 1000; // 2 soat

  // Maksimal urinishlar soniga yetganda lock qilish
  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked) {
    updates.$set = {
      lockUntil: Date.now() + lockTime,
      loginAttempts: maxAttempts,
    };
  }

  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
  });
};

// Refresh token qo‘shish/olib tashlash
userSchema.methods.addRefreshToken = function (token) {
  this.refreshTokens.push({ token });
  return this.save();
};

userSchema.methods.removeRefreshToken = function (token) {
  this.refreshTokens = this.refreshTokens.filter((rt) => rt.token !== token);
  return this.save();
};

// Statik metodlar
userSchema.statics.findActiveByPhone = function (phone) {
  if (!phone || !/^\+998[0-9]{9}$/.test(phone)) {
    return null;
  }

  return this.findOne({
    phone,
    isActive: true,
    $or: [
      { lockUntil: { $exists: false } },
      { lockUntil: { $lt: new Date() } },
    ],
  }).select('+password');
};

userSchema.statics.findActiveByTelegramId = function (telegramId) {
  return this.findOne({ telegramId, isActive: true });
};

userSchema.statics.findByRole = function (role, isActive = true) {
  return this.find({ role, isActive }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('User', userSchema);
