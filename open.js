require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('./models/User');
const Group = require('./models/Group');
const Student = require('./models/Student');
const Badge = require('./models/Badge');
const Lesson = require('./models/Lesson');
const Payment = require('./models/Payment');
const DailyBadge = require('./models/DailyBadge');
const SystemSettings = require('./models/SystemSettings');

async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log('MongoDB ulandi');
}

async function runSeed() {
  await connectDB();

  try {
    const passwordHash = await bcrypt.hash('fe7qyt37T0.12@3!4', 12);

    // 🔧 System Settings
    await SystemSettings.updateOne(
      {},
      {
        academyName: 'Atomic Education',
        academyLocation: 'Toshkent sh., Chilonzor tumani',
        academyPhone: '+998901234567',
        isActive: true,
      },
      { upsert: true }
    );

    // 👥 Users
    const users = await User.insertMany([
      {
        fullName: 'Admin User',
        phone: '+998901111111',
        role: 'admin',
        telegramId: '7269436281',
        password: passwordHash,
        isActive: true,
      },
      {
        fullName: 'Aziz Karimov',
        phone: '+998901234567',
        role: 'teacher',
        password: passwordHash,
        isActive: true,
      },
      {
        fullName: 'Malika Tosheva',
        phone: '+998901234568',
        role: 'teacher',
        password: passwordHash,
        isActive: true,
      },
      {
        fullName: 'Ali Valiyev',
        phone: '+998901234569',
        role: 'student',
        password: passwordHash,
        isActive: true,
      },
      {
        fullName: 'Zarina Ahmadova',
        phone: '+998901234570',
        role: 'student',
        password: passwordHash,
        isActive: true,
      },
      {
        fullName: 'Bobur Valiyev',
        phone: '+998901234571',
        role: 'parent',
        password: passwordHash,
        isActive: true,
        telegramId: '123456789', // Test parent telegram ID
      },
      {
        fullName: 'Gulnora Ahmadova',
        phone: '+998901234572',
        role: 'parent',
        password: passwordHash,
        isActive: true,
        telegramId: '7468306828', // Test parent telegram ID
      },
    ]);

    const admin = users.find((u) => u.role === 'admin');
    const aziz = users.find((u) => u.fullName === 'Aziz Karimov');
    const malika = users.find((u) => u.fullName === 'Malika Tosheva');
    const ali = users.find((u) => u.fullName === 'Ali Valiyev');
    const zarina = users.find((u) => u.fullName === 'Zarina Ahmadova');
    const bobur = users.find((u) => u.fullName === 'Bobur Valiyev');
    const gulnora = users.find((u) => u.fullName === 'Gulnora Ahmadova');

    // 🏅 Badges
    const badges = await Badge.insertMany([
      {
        name: 'Homework',
        description: 'Uy vazifasini bajarish',
        color: 'green',
        isActive: true,
        redBadgeLimit: 2,
      },
      {
        name: 'Participation',
        description: 'Darsda faol ishtirok etish',
        color: 'blue',
        isActive: true,
        redBadgeLimit: 2,
      },
      {
        name: 'Punctuality',
        description: 'Vaqtida kelish',
        color: 'yellow',
        isActive: true,
        redBadgeLimit: 2,
      },
      {
        name: 'Behavior',
        description: 'Yaxshi xulq-atvor',
        color: 'purple',
        isActive: true,
        redBadgeLimit: 2,
      },
      {
        name: 'Test Score',
        description: 'Test natijasi',
        color: 'orange',
        isActive: true,
        redBadgeLimit: 2,
      },
    ]);

    // 👨‍🏫 Groups
    const backend = await new Group({
      name: 'Backend-1',
      teacher: aziz._id,
      schedule: [
        { dayOfWeek: 1, startTime: '09:00', endTime: '11:00' },
        { dayOfWeek: 3, startTime: '09:00', endTime: '11:00' },
        { dayOfWeek: 5, startTime: '09:00', endTime: '11:00' },
      ],
      isActive: true,
    }).save();

    const frontend = await new Group({
      name: 'Frontend-2',
      teacher: malika._id,
      schedule: [
        { dayOfWeek: 2, startTime: '14:00', endTime: '16:00' },
        { dayOfWeek: 4, startTime: '14:00', endTime: '16:00' },
        { dayOfWeek: 6, startTime: '14:00', endTime: '16:00' },
      ],
      isActive: true,
    }).save();

    // 🎓 Students
    const studentAli = await new Student({
      user: ali._id,
      studentCode: '1001',
      group: backend._id,
      parent: bobur._id,
      monthlyFee: 500000,
      status: 'active',
      isActive: true,
    }).save();

    const studentZarina = await new Student({
      user: zarina._id,
      studentCode: '1002',
      group: frontend._id,
      parent: gulnora._id,
      monthlyFee: 450000,
      status: 'active',
      isActive: true,
    }).save();

    // 💰 Payments
    await Payment.insertMany([
      {
        student: studentAli._id,
        amount: 500000,
        month: 1,
        year: 2024,
        status: 'paid',
        dueDate: '2024-01-31',
        createdBy: admin._id,
      },
      {
        student: studentAli._id,
        amount: 500000,
        month: 2,
        year: 2024,
        status: 'pending',
        dueDate: '2024-02-29',
        createdBy: admin._id,
      },
      {
        student: studentZarina._id,
        amount: 450000,
        month: 1,
        year: 2024,
        status: 'paid',
        dueDate: '2024-01-31',
        createdBy: admin._id,
      },
      {
        student: studentZarina._id,
        amount: 450000,
        month: 2,
        year: 2024,
        status: 'overdue',
        dueDate: '2024-02-29',
        createdBy: admin._id,
      },
    ]);

    // 📅 Lessons
    await Lesson.insertMany([
      {
        group: backend._id,
        teacher: aziz._id,
        subject: 'General',
        topic: 'Node.js asoslari',
        date: '2024-01-15',
        startTime: '09:00',
        endTime: '11:00',
        status: 'completed',
      },
      {
        group: backend._id,
        teacher: aziz._id,
        subject: 'General',
        topic: 'Express.js bilan API yaratish',
        date: '2024-01-17',
        startTime: '09:00',
        endTime: '11:00',
        status: 'completed',
      },
      {
        group: frontend._id,
        teacher: malika._id,
        subject: 'General',
        topic: 'React asoslari',
        date: '2024-01-16',
        startTime: '14:00',
        endTime: '16:00',
        status: 'completed',
      },
      {
        group: frontend._id,
        teacher: malika._id,
        subject: 'General',
        topic: 'State management',
        date: '2024-01-18',
        startTime: '14:00',
        endTime: '16:00',
        status: 'scheduled',
      },
    ]);

    // 🏆 DailyBadges
    await DailyBadge.insertMany([
      {
        student: studentAli._id,
        badges: [
          {
            badge: badges.find((b) => b.name === 'Homework')._id,
            status: 'earned',
          },
          {
            badge: badges.find((b) => b.name === 'Participation')._id,
            status: 'earned',
          },
        ],
        date: '2024-01-15',
        createdBy: aziz._id,
      },
      {
        student: studentZarina._id,
        badges: [
          {
            badge: badges.find((b) => b.name === 'Homework')._id,
            status: 'not_earned',
          },
          {
            badge: badges.find((b) => b.name === 'Participation')._id,
            status: 'earned',
          },
        ],
        date: '2024-01-16',
        createdBy: malika._id,
      },
    ]);

    console.log('✅ Barcha seed maʼlumotlar muvaffaqiyatli yaratildi');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed xatolik:', err);
    process.exit(1);
  }
}

runSeed();
