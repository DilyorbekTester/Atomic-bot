const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Student = require('../models/Student');
const Group = require('../models/Group');
const Badge = require('../models/Badge');
const DailyBadge = require('../models/DailyBadge');
const Payment = require('../models/Payment');
const Lesson = require('../models/Lesson');
const SystemSettings = require('../models/SystemSettings');
const Notification = require('../models/Notification');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const cron = require('node-cron');

// .env dan sozlamalarni olish
const {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_EXPIRES_IN = '15m',
  JWT_REFRESH_EXPIRES_IN = '7d',
} = process.env;

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token talab qilinadi' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token yaroqsiz' });
    req.user = user;
    next();
  });
};

// Role check middleware
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Ruxsat yo'q" });
    }
    next();
  };
};

// CORS middleware
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Root endpoint
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Atomic Education ERP API v1.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/login, /refresh',
      users: '/users',
      students: '/students',
      groups: '/groups',
      badges: '/badges',
      'daily-badges': '/daily-badges',
      payments: '/payments',
      lessons: '/lessons',
      stats: '/stats/dashboard',
      bot: '/bot/*',
      notifications: '/notifications',
    },
  });
});

// 🔐 AUTH ROUTES
router.post('/login', async (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: 'Telefon va parol majburiy' });
  }

  try {
    const user = await User.findActiveByPhone(phone);
    if (!user)
      return res
        .status(401)
        .json({ error: 'Foydalanuvchi topilmadi yoki faolsiz' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incrementLoginAttempts();
      return res.status(401).json({ error: "Parol noto'g'ri" });
    }

    if (user.isLocked) {
      return res
        .status(403)
        .json({ error: "Kirish bloklangan. Keyinroq urinib ko'ring" });
    }

    await user.resetLoginAttempts();
    user.lastLogin = new Date();
    await user.save();

    const accessToken = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const refreshToken = jwt.sign({ id: user._id }, JWT_REFRESH_SECRET, {
      expiresIn: JWT_REFRESH_EXPIRES_IN,
    });

    await user.addRefreshToken(refreshToken);

    res.json({
      success: true,
      message: 'Kirish muvaffaqiyatli',
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token talab qilinadi' });
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || !user.refreshTokens.some((rt) => rt.token === refreshToken)) {
      return res.status(403).json({ error: 'Yaroqsiz refresh token' });
    }

    const accessToken = jwt.sign(
      { id: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({ accessToken });
  } catch (err) {
    res.status(403).json({ error: 'Yaroqsiz refresh token' });
  }
});

// Logout
router.post('/logout', authenticateToken, async (req, res) => {
  const { refreshToken } = req.body;

  try {
    const user = await User.findById(req.user.id);
    if (user && refreshToken) {
      await user.removeRefreshToken(refreshToken);
    }
    res.json({ message: 'Chiqish muvaffaqiyatli' });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// 👥 USERS ROUTES
router.get(
  '/users',
  authenticateToken,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const { role, page = 1, limit = 10, search } = req.query;
      const query = { isActive: true };

      if (role) query.role = role;

      if (search) {
        query.$or = [
          { fullName: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } },
        ];
      }

      const users = await User.find(query)
        .select('-password -refreshTokens')
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit))
        .sort({ createdAt: -1 });

      const total = await User.countDocuments(query);

      res.json({
        success: true,
        users,
        pagination: {
          totalPages: Math.ceil(total / limit),
          currentPage: Number(page),
          total,
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      });
    } catch (err) {
      res.status(500).json({ error: 'Server xatosi' });
    }
  }
);

router.post(
  '/users',
  authenticateToken,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const user = new User(req.body);
      await user.save();
      res.status(201).json({
        success: true,
        message: 'Foydalanuvchi yaratildi',
        user: {
          id: user._id,
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
          isActive: user.isActive,
        },
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

router.put(
  '/users/:id',
  authenticateToken,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const user = await User.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
      }).select('-password -refreshTokens');

      if (!user) {
        return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
      }

      res.json({
        success: true,
        message: 'Foydalanuvchi yangilandi',
        user,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// 🎓 STUDENTS ROUTES
router.get('/students', authenticateToken, async (req, res) => {
  try {
    const {
      group,
      status = 'active',
      page = 1,
      limit = 10,
      search,
    } = req.query;

    const query = { isActive: true };

    if (status && status !== 'all') query.status = status;
    if (group) query.group = group;

    // Search functionality
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      const users = await User.find({
        $or: [{ fullName: searchRegex }, { phone: searchRegex }],
      }).select('_id');

      const userIds = users.map((u) => u._id);
      query.$or = [{ user: { $in: userIds } }, { studentCode: searchRegex }];
    }

    const students = await Student.find(query)
      .populate('user', 'fullName phone')
      .populate('group', 'name')
      .populate('parent', 'fullName phone')
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .sort({ createdAt: -1 });

    const total = await Student.countDocuments(query);

    res.json({
      success: true,
      students,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (err) {
    console.error('Students fetch error:', err);
    res.status(500).json({ error: "O'quvchilarni yuklashda xatolik" });
  }
});

router.get('/students/:code', authenticateToken, async (req, res) => {
  try {
    const student = await Student.findByCode(req.params.code);
    if (!student) {
      return res.status(404).json({ error: "O'quvchi topilmadi" });
    }
    res.json({ success: true, student });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.post(
  '/students',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  async (req, res) => {
    try {
      const { fullName, phone, group, monthlyFee, status, parentPhone } =
        req.body;

      // Validate required fields
      if (!fullName || !group || !monthlyFee) {
        return res.status(400).json({
          error: "Ism, guruh va oylik to'lov majburiy",
        });
      }

      // Create or find parent
      let parent;
      if (parentPhone) {
        parent = await User.findOne({ phone: parentPhone, role: 'parent' });
        if (!parent) {
          parent = new User({
            fullName: `${fullName} ota-onasi`,
            phone: parentPhone,
            role: 'parent',
            password: 'parent123', // Default password
            isActive: true,
          });
          await parent.save();
        }
      }

      // Create student user
      const user = new User({
        fullName,
        phone,
        role: 'student',
        password: 'student123', // Default password
        isActive: true,
      });
      await user.save();

      // Create student
      const student = new Student({
        user: user._id,
        group,
        parent: parent?._id,
        monthlyFee,
        status: status || 'active',
        isActive: true,
      });
      await student.save();

      await student.populate(['user', 'group', 'parent']);

      res.status(201).json({
        success: true,
        message: "O'quvchi ro'yxatga olindi",
        student,
      });
    } catch (err) {
      console.error('Student creation error:', err);
      res.status(400).json({ error: err.message });
    }
  }
);

router.put(
  '/students/:id',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  async (req, res) => {
    try {
      const { fullName, phone, group, monthlyFee, status } = req.body;
      const student = await Student.findById(req.params.id);

      if (!student) {
        return res.status(404).json({ error: "O'quvchi topilmadi" });
      }

      // Update user info
      await User.findByIdAndUpdate(student.user, {
        fullName,
        phone,
      });

      // Update student info
      student.group = group;
      student.monthlyFee = monthlyFee;
      student.status = status;
      await student.save();

      await student.populate(['user', 'group', 'parent']);
      res.json({
        success: true,
        message: "O'quvchi yangilandi",
        student,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

router.delete(
  '/students/:id',
  authenticateToken,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const student = await Student.findById(req.params.id);
      if (!student) {
        return res.status(404).json({ error: "O'quvchi topilmadi" });
      }

      // Soft delete
      student.isActive = false;
      await student.save();

      // Also deactivate user
      await User.findByIdAndUpdate(student.user, { isActive: false });

      res.json({
        success: true,
        message: "O'quvchi o'chirildi",
      });
    } catch (err) {
      res.status(500).json({ error: 'Server xatosi' });
    }
  }
);

// 📚 GROUPS ROUTES
router.get('/groups', authenticateToken, async (req, res) => {
  try {
    const groups = await Group.find({ isActive: true })
      .populate('teacher', 'fullName')
      .sort({ name: 1 });

    // Add student count to each group
    const groupsWithCount = await Promise.all(
      groups.map(async (group) => {
        const studentCount = await Student.countDocuments({
          group: group._id,
          isActive: true,
          status: 'active',
        });
        return {
          ...group.toObject(),
          studentCount,
        };
      })
    );

    res.json({ success: true, groups: groupsWithCount });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.post(
  '/groups',
  authenticateToken,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const group = new Group(req.body);
      await group.save();
      await group.populate('teacher', 'fullName');
      res.status(201).json({
        success: true,
        message: 'Guruh yaratildi',
        group,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

router.put(
  '/groups/:id',
  authenticateToken,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const group = await Group.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
      }).populate('teacher', 'fullName');

      if (!group) {
        return res.status(404).json({ error: 'Guruh topilmadi' });
      }

      res.json({
        success: true,
        message: 'Guruh yangilandi',
        group,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

router.delete(
  '/groups/:id',
  authenticateToken,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const group = await Group.findById(req.params.id);
      if (!group) {
        return res.status(404).json({ error: 'Guruh topilmadi' });
      }

      // Check if group has students
      const studentCount = await Student.countDocuments({
        group: req.params.id,
        isActive: true,
      });
      if (studentCount > 0) {
        return res.status(400).json({
          error:
            "Guruhda o'quvchilar mavjud. Avval ularni boshqa guruhga o'tkazing.",
        });
      }

      group.isActive = false;
      await group.save();

      res.json({
        success: true,
        message: "Guruh o'chirildi",
      });
    } catch (err) {
      res.status(500).json({ error: 'Server xatosi' });
    }
  }
);

// 🏆 BADGES ROUTES
router.get('/badges', authenticateToken, async (req, res) => {
  try {
    const badges = await Badge.find({ isActive: true }).sort({
      priority: -1,
      name: 1,
    });
    res.json({ success: true, badges });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.post(
  '/badges',
  authenticateToken,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const badge = new Badge(req.body);
      await badge.save();
      res.status(201).json({
        success: true,
        message: 'Badge yaratildi',
        badge,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

router.put(
  '/badges/:id',
  authenticateToken,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const badge = await Badge.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
      });

      if (!badge) {
        return res.status(404).json({ error: 'Badge topilmadi' });
      }

      res.json({
        success: true,
        message: 'Badge yangilandi',
        badge,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

router.delete(
  '/badges/:id',
  authenticateToken,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const badge = await Badge.findById(req.params.id);
      if (!badge) {
        return res.status(404).json({ error: 'Badge topilmadi' });
      }

      badge.isActive = false;
      await badge.save();

      res.json({
        success: true,
        message: "Badge o'chirildi",
      });
    } catch (err) {
      res.status(500).json({ error: 'Server xatosi' });
    }
  }
);

// 📊 DAILY BADGES ROUTES
router.get('/daily-badges', authenticateToken, async (req, res) => {
  try {
    const { student, date, group, page = 1, limit = 10 } = req.query;
    const query = {};

    if (student) query.student = student;
    if (group) {
      const students = await Student.find({ group, isActive: true }).select(
        '_id'
      );
      query.student = { $in: students.map((s) => s._id) };
    }
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      query.date = { $gte: startDate, $lt: endDate };
    }

    const dailyBadges = await DailyBadge.find(query)
      .populate({
        path: 'student',
        select: 'studentCode',
        populate: { path: 'user', select: 'fullName' },
      })
      .populate('badges.badge', 'name color emoji')
      .populate('createdBy', 'fullName')
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .sort({ date: -1 });

    const total = await DailyBadge.countDocuments(query);

    res.json({
      success: true,
      dailyBadges,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        total,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.post(
  '/daily-badges',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  async (req, res) => {
    try {
      const { student, badges, date, notes } = req.body;

      // Validate required fields
      if (!student || !badges || !Array.isArray(badges)) {
        return res.status(400).json({
          error: 'Student va badges majburiy',
        });
      }

      const badgeDate = date ? new Date(date) : new Date();
      badgeDate.setHours(0, 0, 0, 0);

      // Check if daily badge already exists for this student and date
      const existingBadge = await DailyBadge.findOne({
        student,
        date: {
          $gte: badgeDate,
          $lt: new Date(badgeDate.getTime() + 24 * 60 * 60 * 1000),
        },
      });

      let dailyBadge;
      if (existingBadge) {
        // Update existing badges
        existingBadge.badges = badges;
        existingBadge.notes = notes;
        existingBadge.createdBy = req.user.id;
        dailyBadge = await existingBadge.save();
      } else {
        // Create new daily badge
        dailyBadge = new DailyBadge({
          student,
          badges,
          date: badgeDate,
          notes,
          createdBy: req.user.id,
        });
        await dailyBadge.save();
      }

      await dailyBadge.populate([
        {
          path: 'student',
          select: 'studentCode',
          populate: [
            { path: 'user', select: 'fullName' },
            { path: 'parent', select: 'fullName telegramId' },
          ],
        },
        { path: 'badges.badge', select: 'name color emoji' },
        { path: 'createdBy', select: 'fullName' },
      ]);

      // ✅ BADGE BERILGANDA XABAR YUBORISH
      if (dailyBadge.student?.parent) {
        const earnedCount = badges.filter((b) => b.status === 'earned').length;
        const totalCount = badges.length;
        const percentage =
          totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0;

        const badgeList = badges
          .map((b) => {
            const badgeInfo = dailyBadge.badges.find(
              (db) => db.badge._id.toString() === b.badge
            );
            const emoji = badgeInfo?.badge?.emoji || '🏆';
            const name = badgeInfo?.badge?.name || 'Badge';
            const status =
              b.status === 'earned'
                ? '✅'
                : b.status === 'absent'
                ? '⚪'
                : '❌';
            return `${emoji} ${name}: ${status}`;
          })
          .join('\n');

        await new Notification({
          parent: dailyBadge.student.parent._id,
          student: dailyBadge.student._id,
          type: 'badge_update',
          title: '🏆 Badge Yangilanishi',
          message: `${dailyBadge.student.user.fullName} bugun ${earnedCount}/${totalCount} badge oldi (${percentage}%)\n\n${badgeList}`,
          data: { badges, date: badgeDate, percentage },
        }).save();
      }

      res.status(201).json({
        success: true,
        message: existingBadge ? 'Badge yangilandi' : 'Kunlik badge saqlandi',
        dailyBadge,
      });
    } catch (err) {
      console.error('Daily badge save error:', err);
      res.status(400).json({ error: err.message });
    }
  }
);

// ✅ BULK BADGE BERISH
router.post(
  '/daily-badges/bulk',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  async (req, res) => {
    try {
      const { students, badges, date, notes } = req.body;

      if (
        !students ||
        !Array.isArray(students) ||
        !badges ||
        !Array.isArray(badges)
      ) {
        return res.status(400).json({
          error: 'Students va badges majburiy',
        });
      }

      const badgeDate = date ? new Date(date) : new Date();
      badgeDate.setHours(0, 0, 0, 0);

      const results = [];

      for (const studentId of students) {
        try {
          // Check if daily badge already exists
          const existingBadge = await DailyBadge.findOne({
            student: studentId,
            date: {
              $gte: badgeDate,
              $lt: new Date(badgeDate.getTime() + 24 * 60 * 60 * 1000),
            },
          });

          let dailyBadge;
          if (existingBadge) {
            existingBadge.badges = badges;
            existingBadge.notes = notes;
            existingBadge.createdBy = req.user.id;
            dailyBadge = await existingBadge.save();
          } else {
            dailyBadge = new DailyBadge({
              student: studentId,
              badges,
              date: badgeDate,
              notes,
              createdBy: req.user.id,
            });
            await dailyBadge.save();
          }

          await dailyBadge.populate([
            {
              path: 'student',
              populate: [
                { path: 'user', select: 'fullName' },
                { path: 'parent', select: 'fullName telegramId' },
              ],
            },
            { path: 'badges.badge', select: 'name color emoji' },
          ]);

          // Send notification to parent
          if (dailyBadge.student?.parent) {
            const earnedCount = badges.filter(
              (b) => b.status === 'earned'
            ).length;
            const totalCount = badges.length;
            const percentage =
              totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0;

            await new Notification({
              parent: dailyBadge.student.parent._id,
              student: dailyBadge.student._id,
              type: 'badge_update',
              title: '🏆 Badge Yangilanishi',
              message: `${dailyBadge.student.user.fullName} bugun ${earnedCount}/${totalCount} badge oldi (${percentage}%)`,
              data: { badges, date: badgeDate, percentage },
            }).save();
          }

          results.push(dailyBadge);
        } catch (error) {
          console.error(`Error processing student ${studentId}:`, error);
        }
      }

      res.json({
        success: true,
        message: `${results.length} ta o'quvchiga badge berildi`,
        results: results.length,
      });
    } catch (err) {
      console.error('Bulk badge error:', err);
      res.status(400).json({ error: err.message });
    }
  }
);

// 💰 PAYMENTS ROUTES
router.get('/payments', authenticateToken, async (req, res) => {
  try {
    const { student, status, month, year, page = 1, limit = 10 } = req.query;
    const query = {};

    if (student) query.student = student;
    if (status) query.status = status;
    if (month) query.month = Number(month);
    if (year) query.year = Number(year);

    const payments = await Payment.find(query)
      .populate({
        path: 'student',
        select: 'studentCode',
        populate: { path: 'user', select: 'fullName' },
      })
      .populate('createdBy', 'fullName')
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .sort({ createdAt: -1 });

    const total = await Payment.countDocuments(query);

    res.json({
      success: true,
      payments,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        total,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.post(
  '/payments',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  async (req, res) => {
    try {
      const { student, amount, month, year, status = 'pending' } = req.body;

      if (!student || !amount || !month || !year) {
        return res.status(400).json({
          error: 'Student, amount, month va year majburiy',
        });
      }

      const dueDate = new Date(year, month, 0); // Last day of the month

      const payment = new Payment({
        student,
        amount,
        month,
        year,
        status,
        dueDate,
        createdBy: req.user.id,
        paidDate: status === 'paid' ? new Date() : null,
      });

      await payment.save();

      await payment.populate([
        {
          path: 'student',
          select: 'studentCode',
          populate: [
            { path: 'user', select: 'fullName' },
            { path: 'parent', select: 'fullName telegramId' },
          ],
        },
        { path: 'createdBy', select: 'fullName' },
      ]);

      // ✅ TO'LOV YARATILGANDA XABAR YUBORISH
      if (payment.student?.parent) {
        const monthNames = [
          'Yanvar',
          'Fevral',
          'Mart',
          'Aprel',
          'May',
          'Iyun',
          'Iyul',
          'Avgust',
          'Sentabr',
          'Oktabr',
          'Noyabr',
          'Dekabr',
        ];
        const monthName = monthNames[month - 1];

        await new Notification({
          parent: payment.student.parent._id,
          student: payment.student._id,
          type: 'payment_reminder',
          title: "💰 To'lov Eslatmasi",
          message: `${
            payment.student.user.fullName
          } uchun ${monthName} ${year} oylik to'lov: ${amount.toLocaleString()} so'm\nHolat: ${
            status === 'paid' ? "✅ To'langan" : '⏳ Kutilmoqda'
          }`,
          data: { payment: payment._id, amount, month, year, status },
        }).save();
      }

      res.status(201).json({
        success: true,
        message: "To'lov saqlandi",
        payment,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

router.put(
  '/payments/:id',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  async (req, res) => {
    try {
      const { status, paidDate } = req.body;
      const payment = await Payment.findByIdAndUpdate(
        req.params.id,
        {
          ...req.body,
          paidDate: status === 'paid' ? paidDate || new Date() : null,
        },
        { new: true }
      ).populate([
        {
          path: 'student',
          select: 'studentCode',
          populate: [
            { path: 'user', select: 'fullName' },
            { path: 'parent', select: 'fullName telegramId' },
          ],
        },
        { path: 'createdBy', select: 'fullName' },
      ]);

      if (!payment) {
        return res.status(404).json({ error: "To'lov topilmadi" });
      }

      // ✅ TO'LOV HOLATI O'ZGARGANDA XABAR YUBORISH
      if (payment.student?.parent && status) {
        const monthNames = [
          'Yanvar',
          'Fevral',
          'Mart',
          'Aprel',
          'May',
          'Iyun',
          'Iyul',
          'Avgust',
          'Sentabr',
          'Oktabr',
          'Noyabr',
          'Dekabr',
        ];
        const monthName = monthNames[payment.month - 1];
        const statusText =
          status === 'paid'
            ? "✅ To'landi"
            : status === 'overdue'
            ? "❌ Muddati o'tdi"
            : '⏳ Kutilmoqda';

        await new Notification({
          parent: payment.student.parent._id,
          student: payment.student._id,
          type: 'payment_reminder',
          title: "💰 To'lov Holati",
          message: `${payment.student.user.fullName} - ${monthName} ${
            payment.year
          } to'lov holati: ${statusText}\nMiqdor: ${payment.amount.toLocaleString()} so'm`,
          data: { payment: payment._id, status },
        }).save();
      }

      res.json({
        success: true,
        message: "To'lov yangilandi",
        payment,
      });
    } catch (err) {
      res.status(400).json({
        error: err.message,
      });
    }
  }
);

router.delete(
  '/payments/:id',
  authenticateToken,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const payment = await Payment.findByIdAndDelete(req.params.id);
      if (!payment) {
        return res.status(404).json({ error: "To'lov topilmadi" });
      }

      res.json({
        success: true,
        message: "To'lov o'chirildi",
      });
    } catch (err) {
      res.status(500).json({ error: 'Server xatosi' });
    }
  }
);

// ✅ OYLIK TO'LOV AVTOMATIK YARATISH\
router.post(
  '/payments/monthly-auto',
  authenticateToken,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();

      // Faol o'quvchilarni olish
      const activeStudents = await Student.find({
        isActive: true,
        status: 'active',
      }).populate([
        { path: 'user', select: 'fullName' },
        { path: 'parent', select: 'fullName telegramId' },
      ]);

      let createdCount = 0;
      const monthNames = [
        'Yanvar',
        'Fevral',
        'Mart',
        'Aprel',
        'May',
        'Iyun',
        'Iyul',
        'Avgust',
        'Sentabr',
        'Oktabr',
        'Noyabr',
        'Dekabr',
      ];

      for (const student of activeStudents) {
        try {
          // Tekshirish - bu oy uchun to'lov mavjudmi
          const existingPayment = await Payment.findOne({
            student: student._id,
            month: currentMonth,
            year: currentYear,
          });

          if (!existingPayment) {
            // Yangi to'lov yaratish
            const payment = new Payment({
              student: student._id,
              amount: student.monthlyFee,
              month: currentMonth,
              year: currentYear,
              status: 'pending',
              dueDate: new Date(currentYear, currentMonth, 0), // Oyning oxirgi kuni
              createdBy: req.user.id,
            });

            await payment.save();
            createdCount++;

            // Ota-onaga xabar yuborish
            if (student.parent) {
              await new Notification({
                parent: student.parent._id,
                student: student._id,
                type: 'payment_reminder',
                title: "💰 Yangi Oylik To'lov",
                message: `${student.user.fullName} uchun ${
                  monthNames[currentMonth - 1]
                } ${currentYear} oylik to'lov yaratildi\nMiqdor: ${student.monthlyFee.toLocaleString()} so'm\nMuddat: ${new Date(
                  currentYear,
                  currentMonth,
                  0
                ).toLocaleDateString('uz-UZ')}`,
                data: {
                  payment: payment._id,
                  amount: student.monthlyFee,
                  month: currentMonth,
                  year: currentYear,
                },
              }).save();
            }
          }
        } catch (error) {
          console.error(
            `Error creating payment for student ${student._id}:`,
            error
          );
        }
      }

      res.json({
        success: true,
        message: `${createdCount} ta oylik to'lov yaratildi`,
        created: createdCount,
        total: activeStudents.length,
      });
    } catch (err) {
      console.error('Auto payment creation error:', err);
      res.status(500).json({ error: "Oylik to'lov yaratishda xatolik" });
    }
  }
);

// 📅 LESSONS ROUTES
router.get('/lessons', authenticateToken, async (req, res) => {
  try {
    const { group, teacher, date, status, page = 1, limit = 10 } = req.query;
    const query = {};
    if (group) query.group = group;
    if (teacher) query.teacher = teacher;
    if (status) query.status = status;
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      query.date = { $gte: startDate, $lt: endDate };
    }

    const lessons = await Lesson.find(query)
      .populate('group', 'name')
      .populate('teacher', 'fullName')
      .populate('attendance.student', 'studentCode')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ date: -1 });

    const total = await Lesson.countDocuments(query);

    res.json({
      success: true,
      lessons,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        total,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.post(
  '/lessons',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  async (req, res) => {
    try {
      const lesson = new Lesson(req.body);
      await lesson.save();

      await lesson.populate([
        { path: 'group', select: 'name' },
        { path: 'teacher', select: 'fullName' },
      ]);

      res.status(201).json({
        success: true,
        message: 'Dars yaratildi',
        lesson,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

router.put(
  '/lessons/:id',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  async (req, res) => {
    try {
      const lesson = await Lesson.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
      }).populate([
        { path: 'group', select: 'name' },
        { path: 'teacher', select: 'fullName' },
      ]);

      if (!lesson) {
        return res.status(404).json({ error: 'Dars topilmadi' });
      }

      res.json({
        success: true,
        message: 'Dars yangilandi',
        lesson,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

router.delete(
  '/lessons/:id',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  async (req, res) => {
    try {
      const lesson = await Lesson.findByIdAndDelete(req.params.id);
      if (!lesson) {
        return res.status(404).json({ error: 'Dars topilmadi' });
      }

      res.json({
        success: true,
        message: "Dars o'chirildi",
      });
    } catch (err) {
      res.status(500).json({ error: 'Server xatosi' });
    }
  }
);

// 📊 STATISTICS ROUTES
router.get('/stats/dashboard', authenticateToken, async (req, res) => {
  try {
    const [
      totalStudents,
      activeStudents,
      totalGroups,
      totalTeachers,
      totalParents,
      monthlyPayments,
      recentBadges,
      overduePayments,
    ] = await Promise.all([
      Student.countDocuments({ isActive: true }),
      Student.countDocuments({ isActive: true, status: 'active' }),
      Group.countDocuments({ isActive: true }),
      User.countDocuments({ role: 'teacher', isActive: true }),
      User.countDocuments({ role: 'parent', isActive: true }),
      Payment.aggregate([
        {
          $match: {
            month: new Date().getMonth() + 1,
            year: new Date().getFullYear(),
          },
        },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            total: { $sum: '$amount' },
          },
        },
      ]),
      DailyBadge.find()
        .populate({
          path: 'student',
          select: 'studentCode',
          populate: { path: 'user', select: 'fullName' },
        })
        .populate('badges.badge', 'name color')
        .sort({ date: -1 })
        .limit(10),
      Payment.countDocuments({ status: 'overdue' }),
    ]);

    // Calculate badge statistics
    const badgeStats = {
      totalEarned: 0,
      totalPossible: 0,
      successRate: 0,
    };

    recentBadges.forEach((daily) => {
      daily.badges.forEach((badge) => {
        badgeStats.totalPossible++;
        if (badge.status === 'earned') {
          badgeStats.totalEarned++;
        }
      });
    });

    if (badgeStats.totalPossible > 0) {
      badgeStats.successRate = Math.round(
        (badgeStats.totalEarned / badgeStats.totalPossible) * 100
      );
    }

    res.json({
      success: true,
      stats: {
        students: {
          total: totalStudents,
          active: activeStudents,
          inactive: totalStudents - activeStudents,
        },
        groups: totalGroups,
        teachers: totalTeachers,
        parents: totalParents,
        payments: {
          monthly: monthlyPayments,
          overdue: overduePayments,
        },
        badges: badgeStats,
        recentActivity: recentBadges.slice(0, 5),
      },
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Statistika yuklashda xatolik' });
  }
});

// 📱 NOTIFICATIONS ROUTES
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const { parent, type, read, page = 1, limit = 20 } = req.query;
    const query = {};

    if (parent) query.parent = parent;
    if (type) query.type = type;
    if (read !== undefined) query.read = read === 'true';

    const notifications = await Notification.find(query)
      .populate('parent', 'fullName')
      .populate('student', 'studentCode')
      .sort({ created_at: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({
      ...query,
      read: false,
    });

    res.json({
      success: true,
      notifications,
      pagination: {
        totalPages: Math.ceil(total / limit),
        currentPage: Number(page),
        total,
        unreadCount,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.put('/notifications/:id/read', authenticateToken, async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ error: 'Notification topilmadi' });
    }

    res.json({
      success: true,
      message: "Notification o'qildi deb belgilandi",
      notification,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ✅ BULK XABAR YUBORISH
router.post(
  '/notifications/bulk',
  authenticateToken,
  requireRole(['admin', 'teacher']),
  async (req, res) => {
    try {
      const {
        recipientType,
        recipients,
        title,
        message,
        type = 'general',
      } = req.body;

      if (!title || !message) {
        return res.status(400).json({ error: 'Title va message majburiy' });
      }

      let targetUsers = [];

      if (recipientType === 'parents') {
        targetUsers = await User.find({ role: 'parent', isActive: true });
      } else if (recipientType === 'teachers') {
        targetUsers = await User.find({ role: 'teacher', isActive: true });
      } else if (
        recipientType === 'specific' &&
        recipients &&
        recipients.length > 0
      ) {
        targetUsers = await User.find({
          _id: { $in: recipients },
          isActive: true,
        });
      } else {
        return res
          .status(400)
          .json({ error: "Noto'g'ri recipient type yoki recipients" });
      }

      const notifications = [];
      for (const user of targetUsers) {
        notifications.push({
          parent: user.role === 'parent' ? user._id : null,
          type: 'bulk_message',
          title,
          message,
          data: { sentBy: req.user.id, recipientType },
        });
      }

      await Notification.insertMany(notifications);

      res.json({
        success: true,
        message: `${notifications.length} ta xabar yuborildi`,
        sent: notifications.length,
      });
    } catch (err) {
      console.error('Bulk message error:', err);
      res.status(500).json({ error: 'Bulk xabar yuborishda xatolik' });
    }
  }
);

// 🤖 BOT ROUTES
router.get('/bot/:tgid', async (req, res) => {
  try {
    const tgid = req.params.tgid;
    const user = await User.findOne({ telegramId: tgid }).select(
      'role fullName isActive phone createdAt'
    );

    if (!user) {
      return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });
    }

    res.json({ success: true, ...user.toObject() });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.get('/bot/student/:code', async (req, res) => {
  try {
    const student = await Student.findByCode(req.params.code);
    if (!student) {
      return res.status(404).json({ error: "O'quvchi topilmadi" });
    }

    const chatId = req.query.parent;

    // Auto-assign parent if needed
    if (chatId && !student.parent) {
      const parent = await User.findOne({
        telegramId: chatId,
        role: 'parent',
        isActive: true,
      });

      if (parent) {
        student.parent = parent._id;
        await student.save();
        console.log(
          `Auto-parent assigned: ${parent.fullName} -> ${student.studentCode}`
        );
      }
    }

    await student.populate([
      { path: 'user', select: 'fullName phone' },
      {
        path: 'group',
        select: 'name schedule',
        populate: { path: 'teacher', select: 'fullName' },
      },
      { path: 'parent', select: 'fullName phone telegramId' },
    ]);

    // Get recent badges
    const badges = await DailyBadge.find({ student: student._id })
      .populate('badges.badge', 'name color emoji description')
      .sort({ date: -1 })
      .limit(30);

    // Get recent payments
    const payments = await Payment.find({ student: student._id })
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      success: true,
      student,
      badges,
      payments,
    });
  } catch (err) {
    console.error('Student fetch error:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

router.get('/bot/parent/children/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;

    const parent = await User.findOne({
      telegramId,
      role: 'parent',
      isActive: true,
    });

    if (!parent) {
      return res.status(404).json({ error: 'Ota-ona topilmadi' });
    }

    const children = await Student.find({
      parent: parent._id,
      isActive: true,
    })
      .populate('user', 'fullName phone')
      .populate('group', 'name')
      .sort({ createdAt: -1 });

    res.json({ success: true, children });
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ✅ CRON JOB - HAR OY BOSHIDA AVTOMATIK TO'LOV YARATISH
cron.schedule(
  '0 0 1 * *',
  async () => {
    console.log("🕐 Oylik to'lovlar yaratilmoqda...");

    try {
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth() + 1;
      const currentYear = currentDate.getFullYear();

      const activeStudents = await Student.find({
        isActive: true,
        status: 'active',
      }).populate([
        { path: 'user', select: 'fullName' },
        { path: 'parent', select: 'fullName telegramId' },
      ]);

      let createdCount = 0;
      const monthNames = [
        'Yanvar',
        'Fevral',
        'Mart',
        'Aprel',
        'May',
        'Iyun',
        'Iyul',
        'Avgust',
        'Sentabr',
        'Oktabr',
        'Noyabr',
        'Dekabr',
      ];

      for (const student of activeStudents) {
        try {
          const existingPayment = await Payment.findOne({
            student: student._id,
            month: currentMonth,
            year: currentYear,
          });

          if (!existingPayment) {
            const payment = new Payment({
              student: student._id,
              amount: student.monthlyFee,
              month: currentMonth,
              year: currentYear,
              status: 'pending',
              dueDate: new Date(currentYear, currentMonth, 0),
              createdBy: null, // System created
            });

            await payment.save();
            createdCount++;

            // Ota-onaga xabar yuborish
            if (student.parent) {
              await new Notification({
                parent: student.parent._id,
                student: student._id,
                type: 'payment_reminder',
                title: "💰 Yangi Oylik To'lov",
                message: `${student.user.fullName} uchun ${
                  monthNames[currentMonth - 1]
                } ${currentYear} oylik to'lov yaratildi\nMiqdor: ${student.monthlyFee.toLocaleString()} so'm\nMuddat: ${new Date(
                  currentYear,
                  currentMonth,
                  0
                ).toLocaleDateString('uz-UZ')}`,
                data: {
                  payment: payment._id,
                  amount: student.monthlyFee,
                  month: currentMonth,
                  year: currentYear,
                  autoCreated: true,
                },
              }).save();
            }
          }
        } catch (error) {
          console.error(
            `Error creating payment for student ${student._id}:`,
            error
          );
        }
      }

      console.log(`✅ ${createdCount} ta oylik to'lov avtomatik yaratildi`);
    } catch (error) {
      console.error("❌ Avtomatik to'lov yaratishda xatolik:", error);
    }
  },
  {
    timezone: 'Asia/Tashkent',
  }
);

// Global error handler
router.use((err, req, res, next) => {
  console.error('Global error:', err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: "Ma'lumotlar noto'g'ri formatda",
      details: Object.values(err.errors).map((e) => e.message),
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      error: "Noto'g'ri ID formati",
    });
  }

  if (err.code === 11000) {
    return res.status(400).json({
      error: "Bu ma'lumot allaqachon mavjud",
    });
  }

  res.status(500).json({
    error: 'Server ichki xatosi',
  });
});

module.exports = router;
