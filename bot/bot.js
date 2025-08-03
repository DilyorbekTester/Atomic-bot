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

// Formatlovchi funksiyalar
function formatStudentInfo(data) {
  const student = data.student;
  const badges = data.badges || [];
  const payments = data.payments || [];

  let message = `✅ O'quvchi ma'lumotlari:\n\n`;
  message += `👤 Ism: ${student.user?.fullName || "Ma'lumot yo'q"}\n`;
  message += `🆔 Kod: ${student.studentCode}\n`;
  message += `📚 Guruh: ${student.group?.name || "Ma'lumot yo'q"}\n`;
  message += `📊 Holat: ${getStatusEmoji(student.status)} ${getStatusText(
    student.status
  )}\n`;
  message += `💰 Qarz: ${(student.totalDebt || 0).toLocaleString()} so'm\n\n`;

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

// Menyu generatorlari
function getMainMenu(userSession = null) {
  if (!userSession) {
    return {
      reply_markup: {
        keyboard: [
          ["👤 Mening ma'lumotlarim"],
          ["📞 Bog'lanish", '🔄 Yangilash'],
        ],
        resize_keyboard: true,
      },
    };
  }

  const role = userSession.user.role;

  if (role === 'parent') {
    const baseMenu = [
      ["👤 Mening ma'lumotlarim", '📊 Farzandlarim'],
      ['🏆 Badge hisoboti', "💰 To'lov holati"],
      ['📅 Dars jadvali', "📞 Bog'lanish"],
    ];

    // Tez kirish tugmalari
    if (userSession.children && userSession.children.length > 0) {
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
      },
    };
  }

  // Default menu for other roles
  return {
    reply_markup: {
      keyboard: [["👤 Mening ma'lumotlarim"], ["📞 Bog'lanish"]],
      resize_keyboard: true,
    },
  };
}

// Foydalanuvchi sessiyasini boshlash
async function initializeUserSession(telegramId) {
  try {
    const userData = await makeApiCall(`/bot/${telegramId}`);

    if (!userData.success) {
      return null;
    }

    const session = {
      user: userData,
      children: [],
      lastActivity: Date.now(),
    };

    if (userData.role === 'parent') {
      try {
        const childrenData = await makeApiCall(
          `/bot/parent/children/${telegramId}`
        );
        if (childrenData.success) {
          session.children = childrenData.children.map((child) => ({
            id: child._id,
            name: child.user?.fullName,
            code: child.studentCode,
          }));
        }
      } catch (error) {
        console.log('Children data not found for parent:', telegramId);
      }
    }

    userSessions.set(telegramId, session);
    return session;
  } catch (error) {
    console.error('Sessiya boshlash xatosi:', error);
    return null;
  }
}

function getUserSession(telegramId) {
  const session = userSessions.get(telegramId);
  if (session) {
    session.lastActivity = Date.now();
    return session;
  }
  return null;
}

// Asosiy xabar ishlovchisi
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  const telegramId = msg.from.id.toString();

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
    let userSession = getUserSession(telegramId);
    if (!userSession) {
      userSession = await initializeUserSession(telegramId);
    }

    // /start buyrug'i
    if (text === '/start') {
      return await handleStart(chatId, userSession, fullName);
    }

    // Tez kirish tugmalari
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

      case '🏆 Badge hisoboti':
        return await showBadgeMenu(chatId, userSession);

      case "💰 To'lov holati":
        return await showPaymentMenu(chatId, userSession);

      case '📅 Dars jadvali':
        return await showScheduleMenu(chatId, userSession);

      case "📞 Bog'lanish":
        return await showContactInfo(chatId);

      case '🔄 Yangilash':
        userSessions.delete(telegramId);
        userSession = await initializeUserSession(telegramId);
        return bot.sendMessage(
          chatId,
          "✅ Ma'lumotlar yangilandi!",
          getMainMenu(userSession)
        );

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

// Start buyrug'ini boshqarish
async function handleStart(chatId, userSession, fullName) {
  const welcomeMessage = userSession
    ? `🎓 Atomic Education botiga xush kelibsiz!\n\nAssalomu alaykum ${userSession.user.fullName}! 👋\n\n`
    : `🎓 Atomic Education botiga xush kelibsiz!\n\nAssalomu alaykum ${fullName}! 👋\n\n`;

  let message = welcomeMessage;

  if (userSession) {
    const role = userSession.user.role;

    if (role === 'parent') {
      message += `👨‍👩‍👧‍👦 Siz ota-ona sifatida kirdingiz.\n\n`;
      message += `Bu bot orqali siz quyidagilarni amalga oshirishingiz mumkin:\n\n`;
      message += `• 👤 Farzandingiz haqida to'liq ma'lumot olish\n`;
      message += `• 🏆 Badge hisobotlarini ko'rish\n`;
      message += `• 💰 To'lov holatini nazorat qilish\n`;
      message += `• 📅 Dars jadvalini ko'rish\n`;
      message += `• 🔔 Muhim yangiliklar haqida xabardor bo'lish\n\n`;

      if (userSession.children.length > 0) {
        message += `👶 Sizning farzandlaringiz:\n`;
        userSession.children.forEach((child) => {
          message += `• ${child.name} (${child.code})\n`;
        });
        message += `\n💡 Tez kirish uchun pastdagi tugmalardan foydalaning!`;
      } else {
        message += `📝 Farzandingiz ma'lumotlarini ko'rish uchun o'quvchi kodini kiriting.`;
      }
    } else {
      message += `📝 Quyidagi tugmalardan foydalanib kerakli ma'lumotni oling:`;
    }
  } else {
    message += `📝 Iltimos, administrator bilan bog'lanib, Telegram ID'ingizni ro'yxatdan o'tkazing.\n\n`;
    message += `🆔 Sizning Telegram ID: ${chatId}\n\n`;
    message += `📞 Administrator bilan bog'lanish uchun quyidagi tugmani bosing.`;
  }

  return bot.sendMessage(chatId, message, getMainMenu(userSession));
}

// Ishlovchi funksiyalar
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
    `👤 Sizning ma'lumotlaringiz:\n\n` +
    `📝 Ism: ${userSession.user.fullName}\n` +
    `👥 Rol: ${roleText[userSession.user.role] || userSession.user.role}\n` +
    `✅ Holat: ${userSession.user.isActive ? 'Faol' : 'Nofaol'}\n\n` +
    `👶 Bog'langan farzandlar: ${userSession.children.length} ta`;

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
    message += `   🆔 O'quvchi kodi: ${child.code}\n\n`;
  });

  message += "💡 Batafsil ma'lumot olish uchun farzandingiz kodini kiriting.";

  return bot.sendMessage(chatId, message, getMainMenu(userSession));
}

async function showBadgeMenu(chatId, userSession) {
  if (!userSession || userSession.children.length === 0) {
    return bot.sendMessage(
      chatId,
      "🏆 Badge hisobotini ko'rish uchun o'quvchi kodini kiriting:\n\n" +
        'Masalan: STU001 yoki 1001\n\n' +
        "📊 Hisobotda ko'rsatiladi:\n" +
        "• Har bir badge turi bo'yicha statistika\n" +
        '• Rangli emoji bilan badge turlari\n' +
        "• Olingan/olinmagan badge'lar soni\n" +
        "• Umumiy foiz ko'rsatkichi\n" +
        "• Qizil badge'lar haqida ogohlantirish",
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
      "💳 To'lov holatini ko'rish uchun o'quvchi kodini kiriting:\n\n" +
        'Masalan: STU001 yoki 1001',
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
      "📚 Dars jadvalini ko'rish uchun o'quvchi kodini kiriting:\n\n" +
        'Masalan: STU001 yoki 1001',
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

    if (!data.success) {
      await bot.deleteMessage(chatId, loadingMsg.message_id);
      return bot.sendMessage(
        chatId,
        `❌ ${studentCode} kodli o'quvchi topilmadi.\n\n` +
          `💡 Iltimos:\n` +
          `• To'g'ri kodni kiriting (masalan: 1001)\n` +
          `• Yoki administrator bilan bog'laning`,
        getMainMenu(userSession)
      );
    }

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
