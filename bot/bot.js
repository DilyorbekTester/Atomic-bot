const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
require('dotenv').config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const API_BASE = process.env.API_BASE || 'http://localhost:3000/api/v1';

// Foydalanuvchi sessiyalari
const userSessions = new Map();

// So'rovlar cheklash
const userLastRequest = new Map();
const RATE_LIMIT_MS = 1000;

function checkRateLimit(userId) {
  const now = Date.now();
  const lastRequest = userLastRequest.get(userId);

  if (lastRequest && now - lastRequest < RATE_LIMIT_MS) {
    return false;
  }

  userLastRequest.set(userId, now);
  return true;
}

// Yaxshilangan emoji xaritasi
const GRADE_EMOJIS = {
  5: '5️⃣',
  4: '4️⃣',
  3: '3️⃣',
  2: '2️⃣',
  1: '1️⃣',
};

const SUBJECT_EMOJIS = {
  'Ona tili': '📝',
  Adabiyot: '📚',
  Matematika: '🔢',
  Algebra: '📊',
  Geometriya: '📐',
  Fizika: '⚛️',
  Kimyo: '🧪',
  Biologiya: '🧬',
  Tarix: '🏛️',
  'Jahon tarixi': '🌍',
  Geografiya: '🗺️',
  'Ingliz tili': '🇬🇧',
  'Rus tili': '🇷🇺',
  Tarbiya: '💝',
  'Jismoniy tarbiya': '🏃‍♂️',
  Informatika: '💻',
  ChQBT: '🛡️',
};

// API so'rov yordamchisi
async function makeApiCall(endpoint) {
  try {
    const response = await axios.get(`${API_BASE}${endpoint}`, {
      timeout: 15000,
      headers: { 'User-Agent': 'AtomicEducationBot/2.0' },
    });
    return response.data;
  } catch (error) {
    console.error(`API so'rov xatosi ${endpoint}:`, error.message);
    throw new Error(
      error.response?.data?.error || "Server bilan aloqa o'rnatilmadi"
    );
  }
}

// Yaxshilangan formatlovchi funksiyalar
function formatDailyGrades(grades) {
  if (!grades || grades.length === 0) {
    return '📊 Bugun baholar berilmagan';
  }

  let result = `📊 Kunlik baholar\n${formatDate(grades[0].date)}\n\n`;

  grades[0].grades.forEach((gradeEntry, index) => {
    const emoji = SUBJECT_EMOJIS[gradeEntry.subject] || '📖';
    const gradeEmoji = GRADE_EMOJIS[gradeEntry.grade] || gradeEntry.grade;

    result += `${index + 1} - ${gradeEntry.subject} — ${gradeEmoji}`;
    if (gradeEntry.notes) {
      result += ` (${gradeEntry.notes})`;
    }
    result += '\n';
  });

  // O'rtachani hisoblash
  const average = grades[0].getDayAverage();
  result += `\n📈 Kunlik o'rtacha: ${average}`;

  return result;
}

function formatHomework(homework) {
  if (!homework || homework.length === 0) {
    return '📚 Uy vazifalari berilmagan';
  }

  let result = `📚 Kunlik uy vazifalari:\n${formatDate(homework[0].date)}\n\n`;

  homework[0].assignments.forEach((assignment) => {
    const emoji = SUBJECT_EMOJIS[assignment.subject] || '📖';
    result += `${emoji} ${assignment.subject}:\n${assignment.task};\n\n`;
  });

  return result;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const days = [
    'Yakshanba',
    'Dushanba',
    'Seshanba',
    'Chorshanba',
    'Payshanba',
    'Juma',
    'Shanba',
  ];
  const months = [
    'yanvar',
    'fevral',
    'mart',
    'aprel',
    'may',
    'iyun',
    'iyul',
    'avgust',
    'sentabr',
    'oktabr',
    'noyabr',
    'dekabr',
  ];

  return `${days[date.getDay()]}, ${date.getDate()} ${
    months[date.getMonth()]
  } ${date.getFullYear()}`;
}

function formatStudentInfo(data) {
  const student = data.student;
  const badges = data.badges || [];
  const payments = data.payments || [];
  const grades = data.grades || [];
  const homework = data.homework || [];

  let message = `✅ O'quvchi ma'lumotlari:\n\n`;
  message += `👤 Ism: ${student.user?.fullName || "Ma'lumot yo'q"}\n`;
  message += `🆔 Kod: ${student.studentCode}\n`;
  message += `📚 Guruh: ${student.group?.name || "Ma'lumot yo'q"}\n`;
  message += `📊 Holat: ${getStatusEmoji(student.status)} ${getStatusText(
    student.status
  )}\n`;
  message += `💰 Qarz: ${(student.totalDebt || 0).toLocaleString()} so'm\n\n`;

  // Kunlik baholar
  if (grades.length > 0) {
    message += formatDailyGrades(grades) + '\n\n';
  }

  // Uy vazifalari
  if (homework.length > 0) {
    message += formatHomework(homework) + '\n\n';
  }

  // Dars jadvali
  if (student.group?.schedule && student.group.schedule.length > 0) {
    message += formatSchedule(student.group.schedule) + '\n\n';
  }

  // Badge statistikasi
  if (badges.length > 0) {
    message += formatBadgeStats(badges) + '\n\n';
  }

  // To'lov ma'lumotlari
  if (payments.length > 0) {
    message += formatPayments(payments);
  }

  return message;
}

function formatSchedule(schedule) {
  if (!schedule || schedule.length === 0) {
    return "📅 Dars jadvali ma'lumotlari yo'q";
  }

  const days = [
    'Yakshanba',
    'Dushanba',
    'Seshanba',
    'Chorshanba',
    'Payshanba',
    'Juma',
    'Shanba',
  ];
  let result = '📅 Dars jadvali:\n\n';

  schedule.forEach((item) => {
    result += `📚 ${days[item.dayOfWeek]}: ${item.startTime} - ${
      item.endTime
    }\n`;
  });

  return result;
}

function formatBadgeStats(badges) {
  if (!badges || badges.length === 0) {
    return "📊 Hozircha badge ma'lumotlari yo'q";
  }

  let result = '🏆 Badge hisoboti:\n\n';
  const badgeStats = {};
  let totalEarned = 0;
  let totalPossible = 0;

  badges.forEach((daily) => {
    daily.badges.forEach((badgeEntry) => {
      const badgeName = badgeEntry.badge?.name || "Noma'lum";
      const badgeColor = badgeEntry.badge?.color || 'gray';
      const status = badgeEntry.status;

      if (!badgeStats[badgeName]) {
        badgeStats[badgeName] = {
          earned: 0,
          notEarned: 0,
          absent: 0,
          color: badgeColor,
          total: 0,
        };
      }

      badgeStats[badgeName][
        status === 'earned'
          ? 'earned'
          : status === 'absent'
          ? 'absent'
          : 'notEarned'
      ]++;
      badgeStats[badgeName].total++;
      totalPossible++;

      if (status === 'earned') totalEarned++;
    });
  });

  // Badge statistikasi
  Object.keys(badgeStats).forEach((badgeName) => {
    const stats = badgeStats[badgeName];
    const emoji = getBadgeEmoji(stats.color);
    const percentage =
      stats.total > 0 ? Math.round((stats.earned / stats.total) * 100) : 0;

    result += `${emoji} ${badgeName}:\n`;
    result += `   ✅ Olgan: ${stats.earned}\n`;
    result += `   ❌ Olmagan: ${stats.notEarned}\n`;
    if (stats.absent > 0) {
      result += `   ⚪ Yo'q: ${stats.absent}\n`;
    }
    result += `   📈 ${percentage}%\n\n`;
  });

  // Umumiy statistika
  const overallPercentage =
    totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 100) : 0;
  result += '📊 Umumiy:\n';
  result += `✅ Jami olgan: ${totalEarned}\n`;
  result += `📝 Jami imkoniyat: ${totalPossible}\n`;
  result += `📈 Umumiy foiz: ${overallPercentage}%\n`;

  return result;
}

function formatPayments(payments) {
  if (!payments || payments.length === 0) {
    return "💰 To'lov ma'lumotlari yo'q";
  }

  let result = "💰 So'nggi to'lovlar:\n\n";
  let paidCount = 0;
  let overdueCount = 0;

  payments.slice(0, 5).forEach((payment) => {
    const status =
      payment.status === 'paid'
        ? '✅'
        : payment.status === 'pending'
        ? '⏳'
        : '❌';
    const amount = payment.amount ? payment.amount.toLocaleString() : '0';
    result += `${status} ${payment.month}/${payment.year} - ${amount} so'm\n`;

    if (payment.status === 'paid') paidCount++;
    if (payment.status === 'overdue') overdueCount++;
  });

  result += "\n📊 To'lov holati:\n";
  result += `✅ To'langan: ${paidCount}\n`;
  if (overdueCount > 0) {
    result += `❌ Muddati o'tgan: ${overdueCount}\n`;
  }

  return result;
}

function getBadgeEmoji(color) {
  const emojis = {
    green: '🟢',
    blue: '🔵',
    yellow: '🟡',
    purple: '🟣',
    orange: '🟠',
    red: '🔴',
  };
  return emojis[color] || '⚪';
}

function getStatusEmoji(status) {
  const emojis = {
    active: '✅',
    inactive: '❌',
    graduated: '🎓',
    dropped: '❌',
  };
  return emojis[status] || '❓';
}

function getStatusText(status) {
  const texts = {
    active: 'Faol',
    inactive: 'Nofaol',
    graduated: 'Bitirgan',
    dropped: 'Tashlab ketgan',
  };
  return texts[status] || status;
}

// Yaxshilangan asosiy menyu
function getMainMenu(userSession = null) {
  const baseMenu = [
    ["👤 Mening ma'lumotlarim", '📊 Farzandlarim'],
    ['📈 Kunlik baholar', '📚 Uy vazifalari'],
    ['🏆 Badge hisoboti', "💰 To'lov holati"],
    ['📅 Dars jadvali', "📞 Bog'lanish"],
  ];

  // Ma'lum farzandlar uchun tez kirish tugmalarini qo'shish
  if (userSession && userSession.children && userSession.children.length > 0) {
    const quickButtons = [];
    userSession.children.slice(0, 2).forEach((child) => {
      quickButtons.push(`👶 ${child.name} (${child.code})`);
    });

    if (quickButtons.length > 0) {
      baseMenu.unshift(quickButtons);
    }
  }

  return {
    reply_markup: {
      keyboard: baseMenu,
      resize_keyboard: true,
      one_time_keyboard: false,
    },
  };
}

// Foydalanuvchi sessiyasini boshlash
async function initializeUserSession(telegramId) {
  try {
    // Foydalanuvchi ma'lumotlarini olish
    const userData = await makeApiCall(`/bot/${telegramId}`);

    if (userData.role === 'parent') {
      // Ota-onaning farzandlarini olish
      const childrenData = await makeApiCall(
        `/bot/parent/children/${telegramId}`
      );

      const session = {
        user: userData,
        children: childrenData.map((child) => ({
          id: child._id,
          name: child.user?.fullName,
          code: child.studentCode,
        })),
        lastActivity: Date.now(),
      };

      userSessions.set(telegramId, session);
      return session;
    } else {
      const session = {
        user: userData,
        children: [],
        lastActivity: Date.now(),
      };

      userSessions.set(telegramId, session);
      return session;
    }
  } catch (error) {
    console.error('Sessiya boshlash xatosi:', error);
    return null;
  }
}

// Foydalanuvchi sessiyasini olish
function getUserSession(telegramId) {
  const session = userSessions.get(telegramId);
  if (session) {
    session.lastActivity = Date.now();
    return session;
  }
  return null;
}

// Yaxshilangan xabar ishlovchisi
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  const telegramId = msg.from.id.toString();

  // So'rovlarni cheklash
  if (!checkRateLimit(telegramId)) {
    return bot.sendMessage(
      chatId,
      "⏳ Iltimos, bir soniya kuting va qaytadan urinib ko'ring."
    );
  }

  const fullName = `${msg.from.first_name || ''} ${
    msg.from.last_name || ''
  }`.trim();
  console.log(`📨 Xabar: ${text} | Foydalanuvchi: ${fullName} (${telegramId})`);

  try {
    // Foydalanuvchi sessiyasini olish yoki boshlash
    let userSession = getUserSession(telegramId);
    if (!userSession) {
      userSession = await initializeUserSession(telegramId);
    }

    // /start buyrug'i
    if (text === '/start') {
      const welcomeMessage = userSession
        ? `🎓 Atomic Education botiga xush kelibsiz!\n\nAssalomu alaykum ${userSession.user.fullName}! 👋\n\n`
        : `🎓 Atomic Education botiga xush kelibsiz!\n\nAssalomu alaykum ${fullName}! 👋\n\n`;

      let message = welcomeMessage;
      message += `Bu bot orqali siz quyidagilarni amalga oshirishingiz mumkin:\n\n`;
      message += `• 👤 Farzandingiz haqida to'liq ma'lumot olish\n`;
      message += `• 📈 Kunlik baholarni real vaqtda kuzatish\n`;
      message += `• 📚 Uy vazifalarini darhol bilish\n`;
      message += `• 🏆 Badge hisobotlarini ko'rish\n`;
      message += `• 💰 To'lov holatini nazorat qilish\n`;
      message += `• 📅 Dars jadvalini ko'rish\n`;
      message += `• 🔔 Muhim yangiliklar haqida xabardor bo'lish\n\n`;

      if (userSession && userSession.children.length > 0) {
        message += `👶 Sizning farzandlaringiz:\n`;
        userSession.children.forEach((child) => {
          message += `• ${child.name} (${child.code})\n`;
        });
        message += `\n💡 Tez kirish uchun pastdagi tugmalardan foydalaning!`;
      } else {
        message += `📝 Quyidagi tugmalardan foydalanib kerakli ma'lumotni oling:`;
      }

      return bot.sendMessage(chatId, message, getMainMenu(userSession));
    }

    // Farzandlar uchun tez kirish
    if (
      text.startsWith('👶 ') &&
      userSession &&
      userSession.children.length > 0
    ) {
      const childCode = text.match(/$$(\d+)$$/)?.[1];
      if (childCode) {
        return await showStudentInfo(chatId, childCode, userSession);
      }
    }

    // Menyu variantlarini boshqarish
    switch (text) {
      case "👤 Mening ma'lumotlarim":
        return await showUserInfo(chatId, userSession);

      case '📊 Farzandlarim':
        return await showChildrenList(chatId, userSession);

      case '📈 Kunlik baholar':
        return await showGradesMenu(chatId, userSession);

      case '📚 Uy vazifalari':
        return await showHomeworkMenu(chatId, userSession);

      case '🏆 Badge hisoboti':
        return await showBadgeMenu(chatId, userSession);

      case "💰 To'lov holati":
        return await showPaymentMenu(chatId, userSession);

      case '📅 Dars jadvali':
        return await showScheduleMenu(chatId, userSession);

      case "📞 Bog'lanish":
        return await showContactInfo(chatId);

      default:
        // O'quvchi kodini tekshirish
        if (/^\d{3,4}$/.test(text)) {
          return await showStudentInfo(chatId, text, userSession);
        }

        // Standart javob
        return bot.sendMessage(
          chatId,
          `❓ Noma'lum buyruq: "${text}"\n\n💡 Iltimos, quyidagi tugmalardan foydalaning:`,
          getMainMenu(userSession)
        );
    }
  } catch (error) {
    console.error('Bot xabar xatosi:', error);
    return bot.sendMessage(
      chatId,
      "❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring yoki administrator bilan bog'laning.\n\n🔄 /start buyrug'ini bosib qaytadan boshlang.",
      getMainMenu()
    );
  }
});

// Yaxshilangan ishlovchi funksiyalar
async function showUserInfo(chatId, userSession) {
  if (!userSession) {
    return bot.sendMessage(
      chatId,
      "❌ Sizning ma'lumotlaringiz topilmadi. Iltimos, /start buyrug'ini bosing."
    );
  }

  const roleText = {
    parent: 'Ota-ona',
    teacher: "O'qituvchi",
    student: "O'quvchi",
    admin: 'Administrator',
  };

  const message =
    `👤 Sizning shaxsiy ma'lumotlaringiz:\n\n` +
    `📝 To'liq ism: ${userSession.user.fullName}\n` +
    `📱 Telefon: ${userSession.user.phone}\n` +
    `👥 Lavozim: ${
      roleText[userSession.user.role] || userSession.user.role
    }\n` +
    `✅ Holat: ${userSession.user.isActive ? 'Faol' : 'Nofaol'}\n\n` +
    `👶 Bog'langan farzandlar: ${userSession.children.length} ta\n\n` +
    `📅 Ro'yxatdan o'tgan: ${new Date(
      userSession.user.createdAt
    ).toLocaleDateString('uz-UZ')}`;

  return bot.sendMessage(chatId, message, getMainMenu(userSession));
}

async function showChildrenList(chatId, userSession) {
  if (!userSession || userSession.children.length === 0) {
    return bot.sendMessage(
      chatId,
      "👶 Sizga bog'langan farzandlar topilmadi.\n\n" +
        "📞 Iltimos, administrator bilan bog'laning yoki to'g'ridan-to'g'ri o'quvchi kodini kiriting.\n\n" +
        '💡 Masalan: 1001',
      getMainMenu(userSession)
    );
  }

  let message = '👶 Sizning farzandlaringiz:\n\n';
  userSession.children.forEach((child, index) => {
    message += `${index + 1}. 👤 ${child.name}\n`;
    message += `   🆔 O'quvchi kodi: ${child.code}\n`;
    message += `   📊 Batafsil ma'lumot: /${child.code}\n\n`;
  });

  message += "💡 Batafsil ma'lumot olish uchun:\n";
  message += '• Farzandingiz kodini kiriting\n';
  message += '• Yoki yuqoridagi tugmalardan foydalaning';

  return bot.sendMessage(chatId, message, getMainMenu(userSession));
}

async function showGradesMenu(chatId, userSession) {
  if (!userSession || userSession.children.length === 0) {
    return bot.sendMessage(
      chatId,
      "📈 Baholarni ko'rish uchun avval farzandingiz kodini kiriting.\n\n" +
        '💡 Masalan: 1001',
      getMainMenu(userSession)
    );
  }

  if (userSession.children.length === 1) {
    // Yagona farzand uchun to'g'ridan-to'g'ri baholarni ko'rsatish
    return await showStudentGrades(chatId, userSession.children[0].code);
  }

  let message = "📈 Qaysi farzandingizning baholarini ko'rmoqchisiz?\n\n";
  userSession.children.forEach((child, index) => {
    message += `${index + 1}. ${child.name} (${child.code})\n`;
  });
  message += '\n💡 Farzandingiz kodini kiriting:';

  return bot.sendMessage(chatId, message, getMainMenu(userSession));
}

async function showHomeworkMenu(chatId, userSession) {
  if (!userSession || userSession.children.length === 0) {
    return bot.sendMessage(
      chatId,
      "📚 Uy vazifalarini ko'rish uchun avval farzandingiz kodini kiriting.\n\n" +
        '💡 Masalan: 1001',
      getMainMenu(userSession)
    );
  }

  if (userSession.children.length === 1) {
    return await showStudentHomework(chatId, userSession.children[0].code);
  }

  let message = "📚 Qaysi farzandingizning uy vazifalarini ko'rmoqchisiz?\n\n";
  userSession.children.forEach((child, index) => {
    message += `${index + 1}. ${child.name} (${child.code})\n`;
  });
  message += '\n💡 Farzandingiz kodini kiriting:';

  return bot.sendMessage(chatId, message, getMainMenu(userSession));
}

async function showBadgeMenu(chatId, userSession) {
  if (!userSession || userSession.children.length === 0) {
    return bot.sendMessage(
      chatId,
      "🏆 Badge hisobotini ko'rish uchun farzandingiz kodini kiriting.\n\n" +
        '💡 Masalan: 1001',
      getMainMenu(userSession)
    );
  }

  if (userSession.children.length === 1) {
    return await showStudentInfo(
      chatId,
      userSession.children[0].code,
      userSession
    );
  }

  let message = "🏆 Qaysi farzandingizning badge hisobotini ko'rmoqchisiz?\n\n";
  userSession.children.forEach((child, index) => {
    message += `${index + 1}. ${child.name} (${child.code})\n`;
  });
  message += '\n💡 Farzandingiz kodini kiriting:';

  return bot.sendMessage(chatId, message, getMainMenu(userSession));
}

async function showPaymentMenu(chatId, userSession) {
  if (!userSession || userSession.children.length === 0) {
    return bot.sendMessage(
      chatId,
      "💰 To'lov holatini ko'rish uchun farzandingiz kodini kiriting.\n\n" +
        '💡 Masalan: 1001',
      getMainMenu(userSession)
    );
  }

  if (userSession.children.length === 1) {
    return await showStudentInfo(
      chatId,
      userSession.children[0].code,
      userSession
    );
  }

  let message = "💰 Qaysi farzandingizning to'lov holatini ko'rmoqchisiz?\n\n";
  userSession.children.forEach((child, index) => {
    message += `${index + 1}. ${child.name} (${child.code})\n`;
  });
  message += '\n💡 Farzandingiz kodini kiriting:';

  return bot.sendMessage(chatId, message, getMainMenu(userSession));
}

async function showScheduleMenu(chatId, userSession) {
  if (!userSession || userSession.children.length === 0) {
    return bot.sendMessage(
      chatId,
      "📅 Dars jadvalini ko'rish uchun farzandingiz kodini kiriting.\n\n" +
        '💡 Masalan: 1001',
      getMainMenu(userSession)
    );
  }

  if (userSession.children.length === 1) {
    return await showStudentInfo(
      chatId,
      userSession.children[0].code,
      userSession
    );
  }

  let message = "📅 Qaysi farzandingizning dars jadvalini ko'rmoqchisiz?\n\n";
  userSession.children.forEach((child, index) => {
    message += `${index + 1}. ${child.name} (${child.code})\n`;
  });
  message += '\n💡 Farzandingiz kodini kiriting:';

  return bot.sendMessage(chatId, message, getMainMenu(userSession));
}

async function showContactInfo(chatId) {
  const message =
    "📞 Bog'lanish ma'lumotlari:\n\n" +
    '🏢 Atomic Education\n' +
    '📱 Telefon: +998 90 123 45 67\n' +
    '📧 Email: info@atomic-edu.uz\n' +
    '🌐 Veb-sayt: www.atomic-edu.uz\n\n' +
    '📍 Manzil: Toshkent sh., Chilonzor tumani\n' +
    "🏠 Mo'ljal: Metro bekati yaqinida\n\n" +
    '🕒 Ish vaqti:\n' +
    '• Dushanba - Juma: 9:00 - 18:00\n' +
    '• Shanba: 9:00 - 15:00\n' +
    '• Yakshanba: Dam olish kuni\n\n' +
    "💬 Savollaringiz bo'lsa, bemalol murojaat qiling!";

  return bot.sendMessage(chatId, message, getMainMenu());
}

async function showStudentInfo(chatId, studentCode, userSession) {
  try {
    const loadingMsg = await bot.sendMessage(
      chatId,
      "🔄 Ma'lumotlar yuklanmoqda..."
    );

    const data = await makeApiCall(
      `/bot/student/${studentCode}?parent=${chatId}`
    );
    const message = formatStudentInfo(data);

    await bot.deleteMessage(chatId, loadingMsg.message_id);
    return bot.sendMessage(chatId, message, getMainMenu(userSession));
  } catch (error) {
    return bot.sendMessage(
      chatId,
      `❌ ${error.message}\n\n` +
        `🆔 Kiritilgan kod: ${studentCode}\n\n` +
        `💡 Iltimos:\n` +
        `• To'g'ri kodni kiriting (masalan: 1001)\n` +
        `• Yoki administrator bilan bog'laning`,
      getMainMenu(userSession)
    );
  }
}

async function showStudentGrades(chatId, studentCode) {
  try {
    const data = await makeApiCall(`/bot/student/${studentCode}/grades`);
    const message = formatDailyGrades(data.grades);
    return bot.sendMessage(chatId, message);
  } catch (error) {
    return bot.sendMessage(chatId, `❌ Baholar yuklanmadi: ${error.message}`);
  }
}

async function showStudentHomework(chatId, studentCode) {
  try {
    const data = await makeApiCall(`/bot/student/${studentCode}/homework`);
    const message = formatHomework(data.homework);
    return bot.sendMessage(chatId, message);
  } catch (error) {
    return bot.sendMessage(
      chatId,
      `❌ Uy vazifalari yuklanmadi: ${error.message}`
    );
  }
}

// Eski sessiyalarni tozalash
setInterval(() => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 soat

  for (const [telegramId, session] of userSessions.entries()) {
    if (now - session.lastActivity > maxAge) {
      userSessions.delete(telegramId);
    }
  }
}, 60 * 60 * 1000); // Har soat tekshirish

console.log('🤖 Yaxshilangan Telegram bot ishga tushdi!');

const sendMessage = (chatId, text, options = {}) => {
  return bot.sendMessage(chatId, text, {
    parse_mode: 'HTML',
    ...options,
  });
};

module.exports = { bot, sendMessage };
