const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    studentCode: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
      index: true,
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    enrollmentDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'graduated', 'dropped'],
      default: 'active',
      index: true,
    },
    monthlyFee: {
      type: Number,
      required: [true, "Oylik to'lov majburiy"],
      min: [0, "Oylik to'lov manfiy bo'lishi mumkin emas"],
      max: [10000000, "Oylik to'lov juda katta"],
      validate: {
        validator: (v) => Number.isInteger(v) && v >= 0,
        message: "Oylik to'lov butun son bo'lishi kerak",
      },
    },
    totalDebt: {
      type: Number,
      default: 0,
      min: [0, "Qarz manfiy bo'lishi mumkin emas"],
      max: [100000000, 'Qarz juda katta'],
      validate: {
        validator: (v) => Number.isInteger(v) && v >= 0,
        message: "Qarz butun son bo'lishi kerak",
      },
    },
    notes: {
      type: String,
      maxlength: 1000,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
studentSchema.index({ group: 1, status: 1 });
studentSchema.index({ parent: 1, isActive: 1 });
studentSchema.index({ status: 1, isActive: 1 });
studentSchema.index({ createdAt: -1 });

// Generate student code automatically
studentSchema.pre('save', async function (next) {
  if (!this.studentCode) {
    try {
      // Unique code generation with retry logic
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        const count = await mongoose.model('Student').countDocuments();
        const newCode = String(count + 1000 + attempts).padStart(4, '0');

        // Check if code already exists
        const existingStudent = await mongoose.model('Student').findOne({
          studentCode: newCode,
        });

        if (!existingStudent) {
          this.studentCode = newCode;
          break;
        }

        attempts++;
      }

      if (!this.studentCode) {
        throw new Error('Student code generation failed');
      }
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Virtual for full student info
studentSchema.virtual('fullInfo').get(function () {
  return {
    id: this._id,
    code: this.studentCode,
    name: this.user?.fullName,
    group: this.group?.name,
    status: this.status,
  };
});

// Virtual for debt status
studentSchema.virtual('debtStatus').get(function () {
  if (this.totalDebt === 0) return 'clear';
  if (this.totalDebt <= this.monthlyFee) return 'low';
  if (this.totalDebt <= this.monthlyFee * 2) return 'medium';
  return 'high';
});

// Virtual for enrollment duration
studentSchema.virtual('enrollmentDuration').get(function () {
  const now = new Date();
  const enrollment = new Date(this.enrollmentDate);
  const diffTime = Math.abs(now - enrollment);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Static methods
studentSchema.statics.findByCode = function (code) {
  if (!code || !/^\d{3,4}$/.test(code)) {
    return null;
  }

  return this.findOne({
    studentCode: code,
    isActive: true,
  })
    .populate('user', 'fullName phone telegramId')
    .populate({
      path: 'group',
      select: 'name schedule',
      populate: { path: 'teacher', select: 'fullName' },
    })
    .populate('parent', 'fullName phone telegramId');
};

studentSchema.statics.findByGroup = function (groupId, status = 'active') {
  return this.find({ group: groupId, status, isActive: true })
    .populate('user', 'fullName phone')
    .sort({ 'user.fullName': 1 });
};

studentSchema.statics.findByParent = function (parentId) {
  return this.find({ parent: parentId, isActive: true })
    .populate('user', 'fullName phone')
    .populate('group', 'name')
    .sort({ createdAt: -1 });
};

studentSchema.statics.getDebtStatistics = async function () {
  return this.aggregate([
    { $match: { isActive: true, status: 'active' } },
    {
      $group: {
        _id: null,
        totalStudents: { $sum: 1 },
        totalDebt: { $sum: '$totalDebt' },
        averageDebt: { $avg: '$totalDebt' },
        studentsWithDebt: {
          $sum: { $cond: [{ $gt: ['$totalDebt', 0] }, 1, 0] },
        },
      },
    },
  ]);
};

// Instance methods
studentSchema.methods.updateDebt = async function (amount) {
  this.totalDebt = Math.max(0, this.totalDebt + amount);
  return this.save();
};

studentSchema.methods.payDebt = async function (amount) {
  this.totalDebt = Math.max(0, this.totalDebt - amount);
  return this.save();
};

module.exports = mongoose.model('Student', studentSchema);
