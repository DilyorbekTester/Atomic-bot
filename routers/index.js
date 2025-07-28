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
const jwt = require('jsonwebtoken');
const Joi = require('joi');

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

// Input validation middleware
const validateInput = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: error.details[0].message,
      });
    }
    next();
  };
};

// Har bir route dan oldin CORS headers qo'shish
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

// Asosiy sahifa
router.get('/', (req, res) => {
  res.header('Content-Type', 'application/json');
  res.json({
    status: 'ok',
    message: 'ERP API v1.0',
    timestamp: new Date().toISOString(),
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

// 👥 USERS ROUTES
router.get(
  '/users',
  authenticateToken,
  requireRole(['admin']),
  async (req, res) => {
    try {
      const { role, page = 1, limit = 10 } = req.query;
      const query = { isActive: true };
      if (role) query.role = role;

      const users = await User.find(query)
        .select('-password -refreshTokens')
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort({ createdAt: -1 });

      const total = await User.countDocuments(query);

      res.json({
        users,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total,
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
      res.status(201).json({ message: 'Foydalanuvchi yaratildi', user });
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
      .limit(Number.parseInt(limit))
      .skip((Number.parseInt(page) - 1) * Number.parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Student.countDocuments(query);

    res.json({
      students,
      totalPages: Math.ceil(total / limit),
      currentPage: Number.parseInt(page),
      total,
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
    res.json(student);
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
      const { fullName, phone, group, monthlyFee, status } = req.body;

      const studentCode = Math.floor(1000 + Math.random() * 9000);

      // Create user first
      const user = new User({
        fullName,
        phone,
        role: 'student',
        password: 'student123', // Default password
        isActive: true,
        studentCode: studentCode,
      });
      await user.save();

      // Create student
      const student = new Student({
        user: user._id,
        group,
        parent: user._id, // Temporary, should be updated later
        monthlyFee,
        status,
        studentCode: studentCode,
        isActive: true,
      });
      await student.save();

      await student.populate(['user', 'group', 'parent']);
      res.status(201).json({ message: "O'quvchi ro'yxatga olindi", student });
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
      res.json({ message: "O'quvchi yangilandi", student });
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

      res.json({ message: "O'quvchi o'chirildi" });
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
    res.json(groups);
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
      res.status(201).json({ message: 'Guruh yaratildi', group });
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

      res.json({ message: 'Guruh yangilandi', group });
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

      res.json({ message: "Guruh o'chirildi" });
    } catch (err) {
      res.status(500).json({ error: 'Server xatosi' });
    }
  }
);

// 🏆 BADGES ROUTES
router.get('/badges', authenticateToken, async (req, res) => {
  try {
    const badges = await Badge.find({ isActive: true }).sort({ name: 1 });
    res.json(badges);
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
      res.status(201).json({ message: 'Badge yaratildi', badge });
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

      res.json({ message: 'Badge yangilandi', badge });
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

      res.json({ message: "Badge o'chirildi" });
    } catch (err) {
      res.status(500).json({ error: 'Server xatosi' });
    }
  }
);

// 📊 DAILY BADGES ROUTES
router.get('/daily-badges', authenticateToken, async (req, res) => {
  try {
    const { student, date, page = 1, limit = 10 } = req.query;
    const query = {};
    if (student) query.student = student;
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      query.date = { $gte: startDate, $lt: endDate };
    }

    const dailyBadges = await DailyBadge.find(query)
      .populate('student', 'studentCode')
      .populate('student.user', 'fullName')
      .populate('badges.badge', 'name color')
      .populate('createdBy', 'fullName')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ date: -1 });

    res.json(dailyBadges);
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

      // Check if daily badge already exists for this student and date
      const existingBadge = await DailyBadge.findOne({
        student,
        date: {
          $gte: new Date(date),
          $lt: new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000),
        },
      });

      if (existingBadge) {
        // Update existing badges
        existingBadge.badges = badges;
        existingBadge.notes = notes;
        existingBadge.createdBy = req.user.id;
        await existingBadge.save();

        res.json({ message: 'Badge yangilandi', dailyBadge: existingBadge });
      } else {
        // Create new daily badge
        const dailyBadge = new DailyBadge({
          student,
          badges,
          date,
          notes,
          createdBy: req.user.id,
        });
        await dailyBadge.save();

        res.status(201).json({ message: 'Kunlik badge saqlandi', dailyBadge });
      }
    } catch (err) {
      console.error('Daily badge save error:', err);
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
    if (month) query.month = month;
    if (year) query.year = year;

    const payments = await Payment.find(query)
      .populate({
        path: 'student',
        select: 'studentCode',
        populate: { path: 'user', select: 'fullName' },
      })
      .populate('createdBy', 'fullName')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Payment.countDocuments(query);

    res.json({
      payments,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
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
      const createdAt = new Date(); // hozirgi vaqt
      const dueDate = new Date(
        createdAt.getFullYear(),
        createdAt.getMonth() + 2, // keyingi oyning oxirgi kuni
        0
      );

      const payment = new Payment({
        ...req.body,
        createdBy: req.user.id,
        dueDate,
        createdAt,
      });

      await payment.save();

      await payment.populate([
        {
          path: 'student',
          select: 'studentCode',
          populate: { path: 'user', select: 'fullName' },
        },
        { path: 'createdBy', select: 'fullName' },
      ]);

      res.status(201).json({ message: "To'lov saqlandi", payment });
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
      const payment = await Payment.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
      }).populate([
        {
          path: 'student',
          select: 'studentCode',
          populate: { path: 'user', select: 'fullName' },
        },
        { path: 'createdBy', select: 'fullName' },
      ]);

      if (!payment) {
        return res.status(404).json({ error: "To'lov topilmadi" });
      }

      res.json({ message: "To'lov yangilandi", payment });
    } catch (err) {
      res.status(400).json({ error: err.message });
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

      res.json({ message: "To'lov o'chirildi" });
    } catch (err) {
      res.status(500).json({ error: 'Server xatosi' });
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

    res.json(lessons);
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

      res.status(201).json({ message: 'Dars yaratildi', lesson });
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

      res.json({ message: 'Dars yangilandi', lesson });
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

      res.json({ message: "Dars o'chirildi" });
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
      totalGroups,
      totalTeachers,
      monthlyPayments,
      recentLessons,
    ] = await Promise.all([
      Student.countDocuments({ isActive: true, status: 'active' }),
      Group.countDocuments({ isActive: true }),
      User.countDocuments({ role: 'teacher', isActive: true }),
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
      Lesson.find()
        .populate('group', 'name')
        .populate('teacher', 'fullName')
        .sort({ date: -1 })
        .limit(5),
    ]);

    res.json({
      totalStudents,
      totalGroups,
      totalTeachers,
      monthlyPayments,
      recentLessons,
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Statistika yuklashda xatolik' });
  }
});

// 🤖 BOT ROUTES
router.get('/bot/:tgid', async (req, res) => {
  try {
    const tgid = req.params.tgid;
    const user = await User.findOne({ telegramId: tgid }).select(
      'role fullName isActive'
    );

    if (!user)
      return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// router.get('/bot/student/:code', async (req, res) => {
//   try {
//     const student = await Student.findByCode(req.params.code);
//     if (!student) {
//       return res.status(404).json({ error: "O'quvchi topilmadi" });
//     }
// if(req.query.parent) {
//       // Agar parent so'rov bo'lsa, faqat ota-onaga tegishli ma'lumotlarni ko'rsatish
//       if (student.parent) {}
//     // AUTO PARENT ASSIGNMENT
//     if (!student.parent && req.user && req.user.role === 'parent') {
//       student.parent = req.user._id;
//       await student.save();
//       console.log(
//         `Auto-parent assigned: ${req.user.fullName} -> ${student.code}`
//       );
//     }

//     // To'liq populate qilish
//     await student.populate([
//       { path: 'user', select: 'fullName phone' },
//       {
//         path: 'group',
//         select: 'name schedule',
//         populate: { path: 'teacher', select: 'fullName' },
//       },
//       { path: 'parent', select: 'fullName phone' },
//     ]);

//     // Badge statistikasi
//     const badges = await DailyBadge.find({ student: student._id })
//       .populate('badges.badge', 'name color')
//       .sort({ date: -1 })
//       .limit(30);

//     // To'lov ma'lumotlari
//     const payments = await Payment.find({ student: student._id })
//       .sort({ createdAt: -1 })
//       .limit(5);

//     res.json({
//       student,
//       badges,
//       payments,
//     });
//   } catch (err) {
//     console.error('Student fetch error:', err);
//     res.status(500).json({ error: 'Server xatosi' });
//   }
// });

router.get('/bot/student/:code', async (req, res) => {
  try {
    const student = await Student.findByCode(req.params.code);
    if (!student) {
      return res.status(404).json({ error: "O'quvchi topilmadi" });
    }

    const chatId = req.query.parent;

    // Telegram chatId bo'yicha ota-onani topish
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
      } else {
        return res.status(404).json({ error: 'Ota/ona topilmadi' });
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

    const badges = await DailyBadge.find({ student: student._id })
      .populate('badges.badge', 'name color')
      .sort({ date: -1 })
      .limit(30);

    const payments = await Payment.find({ student: student._id })
      .sort({ createdAt: -1 })
      .limit(5);

    res.json({
      student,
      badges,
      payments,
    });
  } catch (err) {
    console.error('Student fetch error:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// 👨‍👩‍👧‍👦 AUTO PARENT ASSIGNMENT
router.post('/bot/assign-parent/:studentCode/:telegramId', async (req, res) => {
  try {
    const { studentCode, telegramId } = req.params;

    // Telegram user topish
    const telegramUser = await User.findOne({ telegramId, role: 'parent' });
    if (!telegramUser) {
      return res.status(404).json({ error: 'Parent foydalanuvchi topilmadi' });
    }

    // Student topish
    const student = await Student.findOne({ studentCode, isActive: true });
    if (!student) {
      return res.status(404).json({ error: "O'quvchi topilmadi" });
    }

    // Agar student da parent yo'q bo'lsa, assign qilish
    if (
      !student.parent ||
      student.parent.toString() !== telegramUser._id.toString()
    ) {
      student.parent = telegramUser._id;
      await student.save();

      console.log(
        `Parent assigned: ${telegramUser.fullName} -> Student ${studentCode}`
      );
      res.json({
        message: 'Parent muvaffaqiyatli biriktirildi',
        parent: telegramUser.fullName,
        student: studentCode,
      });
    } else {
      res.json({ message: 'Parent allaqachon biriktirilgan' });
    }
  } catch (err) {
    console.error('Parent assignment error:', err);
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// 📱 PARENT NOTIFICATION ENDPOINT
router.post('/bot/notify-parents', async (req, res) => {
  try {
    const { lesson, date, students } = req.body;

    // Prepare notification messages for each student's parent
    const notifications = [];

    for (const studentData of students) {
      // Find student and parent info
      const student = await Student.findOne({ studentCode: studentData.code })
        .populate('parent', 'telegramId fullName')
        .populate('user', 'fullName');

      if (student && student.parent && student.parent.telegramId) {
        // Format badge summary
        const earnedCount = studentData.badges.filter(
          (b) => b.status === 'earned'
        ).length;
        const notEarnedCount = studentData.badges.filter(
          (b) => b.status === 'not_earned'
        ).length;
        const absentCount = studentData.badges.filter(
          (b) => b.status === 'absent'
        ).length;

        const message =
          `🎓 Kunlik Badge Hisoboti\n\n` +
          `👤 O'quvchi: ${student.user.fullName}\n` +
          `📚 Dars: ${lesson}\n` +
          `📅 Sana: ${date}\n\n` +
          `📊 Natijalar:\n` +
          `✅ Olgan badge'lar: ${earnedCount}\n` +
          `❌ Olmagan badge'lar: ${notEarnedCount}\n` +
          `⚪ Yo'q bo'lgan: ${absentCount}\n\n` +
          `📈 Muvaffaqiyat foizi: ${Math.round(
            (earnedCount / (earnedCount + notEarnedCount + absentCount)) * 100
          )}%\n\n` +
          `💡 Batafsil ma'lumot uchun botdan foydalaning: /start`;

        notifications.push({
          telegramId: student.parent.telegramId,
          message: message,
          studentName: student.user.fullName,
        });
      }
    }

    // Send notifications via telegram bot
    // This would integrate with your existing bot system
    if (notifications.length > 0) {
      console.log(
        `Sending ${notifications.length} parent notifications for lesson: ${lesson}`
      );

      // Here you would call your telegram bot to send messages
      // For now, we'll just log the notifications
      notifications.forEach((notification) => {
        console.log(
          `Notification to parent (${notification.telegramId}) for ${notification.studentName}`
        );
        // In production, you'd use your bot instance:
        // bot.sendMessage(notification.telegramId, notification.message);
      });
    }

    res.json({
      success: true,
      message: `${notifications.length} ta ota-onaga xabar yuborildi`,
      notificationCount: notifications.length,
    });
  } catch (error) {
    console.error('Parent notification error:', error);
    res.status(500).json({ error: 'Xabar yuborishda xatolik' });
  }
});

// 📊 PARENT DASHBOARD DATA
router.get(
  '/parent/dashboard/:parentId',
  authenticateToken,
  async (req, res) => {
    try {
      const parentId = req.params.parentId;

      // Get parent's students
      const students = await Student.find({ parent: parentId, isActive: true })
        .populate('user', 'fullName phone')
        .populate('group', 'name');

      // Get recent badges for all parent's students
      const studentIds = students.map((s) => s._id);
      const recentBadges = await DailyBadge.find({
        student: { $in: studentIds },
      })
        .populate('student', 'studentCode')
        .populate('badges.badge', 'name color description')
        .sort({ date: -1 })
        .limit(50);

      // Calculate statistics
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const weeklyStats = {
        earned: 0,
        notEarned: 0,
        absent: 0,
        total: 0,
      };

      recentBadges
        .filter((db) => new Date(db.date) >= weekAgo)
        .forEach((dailyBadge) => {
          dailyBadge.badges.forEach((badge) => {
            weeklyStats.total++;
            weeklyStats[badge.status]++;
          });
        });

      weeklyStats.successRate =
        weeklyStats.total > 0
          ? Math.round((weeklyStats.earned / weeklyStats.total) * 100)
          : 0;

      res.json({
        students,
        recentBadges,
        weeklyStats,
      });
    } catch (error) {
      console.error('Parent dashboard error:', error);
      res.status(500).json({ error: "Ma'lumotlarni yuklashda xatolik" });
    }
  }
);

// Global error handler
router.use((err, req, res, next) => {
  console.error('Global error:', err);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: "Ma'lumotlar noto'g'ri formatda",
    });
  }

  if (err.name === 'CastError') {
    return res.status(400).json({
      error: "Noto'g'ri ID formati",
    });
  }

  res.status(500).json({
    error: 'Server ichki xatosi',
  });
});

module.exports = router;
