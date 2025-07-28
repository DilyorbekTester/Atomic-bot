const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
    },
    schedule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LessonSchedule',
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subject: {
      type: String,
      required: true,
      default: 'General',
    },
    topic: {
      type: String,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    startTime: String,
    endTime: String,
    homework: String,
    notes: String,
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'cancelled', 'rescheduled'],
      default: 'scheduled',
    },
    originalDate: Date, // For rescheduled lessons
    rescheduleReason: String,
    attendance: [
      {
        student: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Student',
        },
        status: {
          type: String,
          enum: ['present', 'absent', 'late'],
          default: 'present',
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

lessonSchema.index({ group: 1, date: -1 });
lessonSchema.index({ teacher: 1, date: -1 });

module.exports = mongoose.model('Lesson', lessonSchema);
