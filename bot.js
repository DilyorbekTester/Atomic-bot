const TelegramBot = require("node-telegram-bot-api")
const axios = require("axios")
require("dotenv").config()

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })
const API_BASE = process.env.API_BASE || "http://localhost:3000/api/v1"

// Foydalanuvchi sessiyalari
const userSessions = new Map()

// So'rovlar cheklash
const userLastRequest = new Map()
const RATE_LIMIT_MS = 1000

// Mock data (API ishlamasa)
const mockData = {
  users: {
    7269436281: {
      // Admin
      fullName: "Admin User",
      role: "admin",
      phone: "+998901111111",
      isActive: true,
      createdAt: new Date(),
    },
    123456789: {
      // Teacher
      fullName: "Aziz Karimov",
      role: "teacher",
      phone: "+998901234567",
      isActive: true,
      createdAt: new Date(),
    },
    7468306828: {
      // Parent
      fullName: "Gulnora Ahmadova",
      role: "parent",
      phone: "+998901234572",
      isActive: true,
      createdAt: new Date(),
    },
  },
  students: [
    {
      _id: "1",
      studentCode: "1001",
      user: { fullName: "Ali Valiyev" },
      group: { name: "Backend-1", schedule: [{ dayOfWeek: 1, startTime: "09:00", endTime: "11:00" }] },
      parent: "7468306828",
      status: "active",
      totalDebt: 0,
      monthlyFee: 500000,
    },
    {
      _id: "2",
      studentCode: "1002",
      user: { fullName: "Zarina Ahmadova" },
      group: { name: "Frontend-2", schedule: [{ dayOfWeek: 2, startTime: "14:00", endTime: "16:00" }] },
      parent: "7468306828",
      status: "active",
      totalDebt: 100000,
      monthlyFee: 450000,
    },
  ],
  groups: [
    {
      _id: "1",
      name: "Backend-1",
      teacher: "123456789",
      studentCount: 15,
      schedule: [
        { dayOfWeek: 1, startTime: "09:00", endTime: "11:00" },
        { dayOfWeek: 3, startTime: "09:00", endTime: "11:00" },
        { dayOfWeek: 5, startTime: "09:00", endTime: "11:00" },
      ],
    },
    {
      _id: "2",
      name: "Frontend-2",
      teacher: "123456789",
      studentCount: 12,
      schedule: [
        { dayOfWeek: 2, startTime: "14:00", endTime: "16:00" },
        { dayOfWeek: 4, startTime: "14:00", endTime: "16:00" },
        { dayOfWeek: 6, startTime: "14:00", endTime: "16:00" },
      ],
    },
  ],
  badges: [
    { name: "Homework", color: "green", description: "Uy vazifasini bajarish" },
    { name: "Participation", color: "blue", description: "Darsda faol ishtirok" },
    { name: "Punctuality", color: "yellow", description: "Vaqtida kelish" },
    { name: "Behavior", color: "purple", description: "Yaxshi xulq-atvor" },
  ],
}

function checkRateLimit(userId) {
  const now = Date.now()
  const lastRequest = userLastRequest.get(userId)

  if (lastRequest && now - lastRequest < RATE_LIMIT_MS) {
    return false
  }

  userLastRequest.set(userId, now)
  return true
}

// API so'rov yordamchisi (fallback bilan)
async function makeApiCall(endpoint) {
  try {
    const response = await axios.get(`${API_BASE}${endpoint}`, {
      timeout: 5000,
      headers: { "User-Agent": "AtomicEducationBot/2.0" },
    })
    return response.data
  } catch (error) {
    console.log(`API ishlamayapti, mock data ishlatilmoqda: ${endpoint}`)
    return getMockData(endpoint)
  }
}

// Mock data olish
function getMockData(endpoint) {
  const telegramId = endpoint.split("/").pop()

  if (endpoint.includes("/bot/") && !endpoint.includes("student")) {
    return mockData.users[telegramId] || null
  }

  if (endpoint.includes("/bot/parent/children/")) {
    return mockData.students.filter((s) => s.parent === telegramId)
  }

  if (endpoint.includes("/bot/student/")) {
    const code = endpoint.split("/")[3]
    const student = mockData.students.find((s) => s.studentCode === code)
    if (student) {
      return {
        student,
        badges: [],
        payments: [],
        grades: [],
        homework: [],
      }
    }
  }

  return null
}

// Emoji xaritalari
const GRADE_EMOJIS = {
  5: "5️⃣",
  4: "4️⃣",
  3: "3️⃣",
  2: "2️⃣",
  1: "1️⃣",
}

const SUBJECT_EMOJIS = {
  "Ona tili": "📝",
  Matematika: "🔢",
  Fizika: "⚛️",
  "Ingliz tili": "🇬🇧",
  Informatika: "💻",
}

// Formatlovchi funksiyalar
function formatDate(dateString) {
  const date = new Date(dateString)
  const days = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"]
  const months = [
    "yanvar",
    "fevral",
    "mart",
    "aprel",
    "may",
    "iyun",
    "iyul",
    "avgust",
    "sentabr",
    "oktabr",
    "noyabr",
    "dekabr",
  ]

  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
}

function formatStudentInfo(data) {
  const student = data.student
  let message = `✅ O'quvchi ma'lumotlari:\n\n`
  message += `👤 Ism: ${student.user?.fullName || "Ma'lumot yo'q"}\n`
  message += `🆔 Kod: ${student.studentCode}\n`
  message += `📚 Guruh: ${student.group?.name || "Ma'lumot yo'q"}\n`
  message += `📊 Holat: ${getStatusEmoji(student.status)} ${getStatusText(student.status)}\n`
  message += `💰 Qarz: ${(student.totalDebt || 0).toLocaleString()} so'm\n\n`

  if (student.group?.schedule && student.group.schedule.length > 0) {
    message += formatSchedule(student.group.schedule) + "\n\n"
  }

  return message
}

function formatSchedule(schedule) {
  if (!schedule || schedule.length === 0) {
    return "📅 Dars jadvali ma'lumotlari yo'q"
  }

  const days = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"]
  let result = "📅 Dars jadvali:\n\n"

  schedule.forEach((item) => {
    result += `📚 ${days[item.dayOfWeek]}: ${item.startTime} - ${item.endTime}\n`
  })

  return result
}

function getStatusEmoji(status) {
  const emojis = {
    active: "✅",
    inactive: "❌",
    graduated: "🎓",
    dropped: "❌",
  }
  return emojis[status] || "❓"
}

function getStatusText(status) {
  const texts = {
    active: "Faol",
    inactive: "Nofaol",
    graduated: "Bitirgan",
    dropped: "Tashlab ketgan",
  }
  return texts[status] || status
}

// Menyu generatorlari
function getMainMenu(userSession = null) {
  if (!userSession) {
    return {
      reply_markup: {
        keyboard: [["👤 Mening ma'lumotlarim"], ["📞 Bog'lanish", "🔄 Yangilash"]],
        resize_keyboard: true,
      },
    }
  }

  const role = userSession.user.role

  if (role === "admin") {
    return {
      reply_markup: {
        keyboard: [
          ["👥 Foydalanuvchilar", "📊 Statistika"],
          ["🏫 Guruhlar", "🏆 Badge boshqaruvi"],
          ["💰 To'lov hisoboti", "📢 Xabar yuborish"],
          ["⚙️ Sozlamalar", "📞 Bog'lanish"],
        ],
        resize_keyboard: true,
      },
    }
  }

  if (role === "teacher") {
    return {
      reply_markup: {
        keyboard: [
          ["👥 Mening guruhlarim", "📊 O'quvchilar"],
          ["🏆 Badge berish", "📝 Davomat"],
          ["📚 Uy vazifasi", "📈 Hisobotlar"],
          ["💬 Ota-onalarga xabar", "📞 Bog'lanish"],
        ],
        resize_keyboard: true,
      },
    }
  }

  if (role === "parent") {
    return {
      reply_markup: {
        keyboard: [
          ["👤 Mening ma'lumotlarim", "📊 Farzandlarim"],
          ["📈 Kunlik baholar", "📚 Uy vazifalari"],
          ["🏆 Badge hisoboti", "💰 To'lov holati"],
          ["📅 Dars jadvali", "📞 Bog'lanish"],
        ],
        resize_keyboard: true,
      },
    }
  }

  return getMainMenu()
}

function getBackMenu() {
  return {
    reply_markup: {
      keyboard: [["🔙 Orqaga"]],
      resize_keyboard: true,
    },
  }
}

// Foydalanuvchi sessiyasini boshlash
async function initializeUserSession(telegramId) {
  try {
    const userData = await makeApiCall(`/bot/${telegramId}`)

    if (!userData) {
      return null
    }

    const session = {
      user: userData,
      children: [],
      lastActivity: Date.now(),
    }

    if (userData.role === "parent") {
      const childrenData = await makeApiCall(`/bot/parent/children/${telegramId}`)
      session.children = childrenData
        ? childrenData.map((child) => ({
            id: child._id,
            name: child.user?.fullName,
            code: child.studentCode,
          }))
        : []
    }

    userSessions.set(telegramId, session)
    return session
  } catch (error) {
    console.error("Sessiya boshlash xatosi:", error)
    return null
  }
}

function getUserSession(telegramId) {
  const session = userSessions.get(telegramId)
  if (session) {
    session.lastActivity = Date.now()
    return session
  }
  return null
}

// Asosiy xabar ishlovchisi
bot.on("message", async (msg) => {
  const chatId = msg.chat.id
  const text = msg.text?.trim()
  const telegramId = msg.from.id.toString()

  if (!checkRateLimit(telegramId)) {
    return bot.sendMessage(chatId, "⏳ Iltimos, bir soniya kuting va qaytadan urinib ko'ring.")
  }

  const fullName = `${msg.from.first_name || ""} ${msg.from.last_name || ""}`.trim()
  console.log(`📨 Xabar: ${text} | Foydalanuvchi: ${fullName} (${telegramId})`)

  try {
    let userSession = getUserSession(telegramId)
    if (!userSession) {
      userSession = await initializeUserSession(telegramId)
    }

    // /start buyrug'i
    if (text === "/start") {
      return await handleStart(chatId, userSession, fullName)
    }

    // Orqaga qaytish
    if (text === "🔙 Orqaga") {
      return bot.sendMessage(chatId, "🏠 Bosh menyu", getMainMenu(userSession))
    }

    // Umumiy buyruqlar
    if (text === "👤 Mening ma'lumotlarim") {
      return await showUserInfo(chatId, userSession)
    }
    if (text === "📞 Bog'lanish") {
      return await showContactInfo(chatId, userSession)
    }
    if (text === "🔄 Yangilash") {
      userSessions.delete(telegramId)
      userSession = await initializeUserSession(telegramId)
      return bot.sendMessage(chatId, "✅ Ma'lumotlar yangilandi!", getMainMenu(userSession))
    }

    if (!userSession) {
      return bot.sendMessage(
        chatId,
        "❌ Sizning ma'lumotlaringiz topilmadi.\n\n" +
          "📝 Iltimos, administrator bilan bog'laning yoki /start buyrug'ini bosing.",
      )
    }

    // Rol asosida buyruqlarni boshqarish
    const role = userSession.user.role

    if (role === "admin") {
      return await handleAdminCommands(chatId, text, userSession)
    }

    if (role === "teacher") {
      return await handleTeacherCommands(chatId, text, userSession)
    }

    if (role === "parent") {
      return await handleParentCommands(chatId, text, userSession)
    }

    // O'quvchi kodi tekshirish
    if (/^\d{3,4}$/.test(text)) {
      return await showStudentInfo(chatId, text, userSession)
    }

    // Standart javob
    return bot.sendMessage(
      chatId,
      `❓ Noma'lum buyruq: "${text}"\n\n💡 Iltimos, quyidagi tugmalardan foydalaning:`,
      getMainMenu(userSession),
    )
  } catch (error) {
    console.error("Bot xabar xatosi:", error)
    return bot.sendMessage(
      chatId,
      "❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.\n\n🔄 /start buyrug'ini bosib qaytadan boshlang.",
    )
  }
})

// Start buyrug'ini boshqarish
async function handleStart(chatId, userSession, fullName) {
  const welcomeMessage = userSession
    ? `🎓 Atomic Education botiga xush kelibsiz!\n\nAssalomu alaykum ${userSession.user.fullName}! 👋\n\n`
    : `🎓 Atomic Education botiga xush kelibsiz!\n\nAssalomu alaykum ${fullName}! 👋\n\n`

  let message = welcomeMessage

  if (userSession) {
    const role = userSession.user.role

    if (role === "admin") {
      message += `👑 Siz administrator sifatida kirdingiz.\n\n`
      message += `Bu bot orqali siz quyidagilarni amalga oshirishingiz mumkin:\n\n`
      message += `• 👥 Barcha foydalanuvchilarni boshqarish\n`
      message += `• 📊 Tizim statistikasini ko'rish\n`
      message += `• 🏫 Guruhlarni boshqarish\n`
      message += `• 🏆 Badge tizimini sozlash\n`
      message += `• 💰 To'lov hisobotlarini ko'rish\n`
      message += `• 📢 Ommaviy xabar yuborish\n`
      message += `• ⚙️ Tizim sozlamalarini o'zgartirish\n`
    } else if (role === "teacher") {
      message += `👨‍🏫 Siz o'qituvchi sifatida kirdingiz.\n\n`
      message += `Bu bot orqali siz quyidagilarni amalga oshirishingiz mumkin:\n\n`
      message += `• 👥 O'z guruhlaringizni boshqarish\n`
      message += `• 🏆 O'quvchilarga badge berish/olish\n`
      message += `• 📝 Davomat belgilash\n`
      message += `• 📚 Uy vazifasi berish\n`
      message += `• 📈 O'quvchi hisobotlarini ko'rish\n`
      message += `• 💬 Ota-onalarga xabar yuborish\n`
    } else if (role === "parent") {
      message += `👨‍👩‍👧‍👦 Siz ota-ona sifatida kirdingiz.\n\n`
      message += `Bu bot orqali siz quyidagilarni amalga oshirishingiz mumkin:\n\n`
      message += `• 👤 Farzandingiz haqida to'liq ma'lumot olish\n`
      message += `• 📈 Kunlik baholarni kuzatish\n`
      message += `• 📚 Uy vazifalarini bilish\n`
      message += `• 🏆 Badge hisobotlarini ko'rish\n`
      message += `• 💰 To'lov holatini nazorat qilish\n`
      message += `• 📅 Dars jadvalini ko'rish\n`
    }
  } else {
    message += `📝 Iltimos, administrator bilan bog'lanib, Telegram ID'ingizni ro'yxatdan o'tkazing.\n\n`
    message += `🆔 Sizning Telegram ID: ${chatId}\n\n`
    message += `📞 Administrator bilan bog'lanish uchun quyidagi tugmani bosing.`
  }

  return bot.sendMessage(chatId, message, getMainMenu(userSession))
}

// Admin buyruqlarini boshqarish
async function handleAdminCommands(chatId, text, userSession) {
  switch (text) {
    case "👥 Foydalanuvchilar":
      return await showAllUsers(chatId)

    case "📊 Statistika":
      return await showSystemStats(chatId)

    case "🏫 Guruhlar":
      return await showAllGroups(chatId)

    case "🏆 Badge boshqaruvi":
      return await showBadgeManagement(chatId)

    case "💰 To'lov hisoboti":
      return await showPaymentReport(chatId)

    case "📢 Xabar yuborish":
      return await showBulkMessage(chatId)

    case "⚙️ Sozlamalar":
      return await showSystemSettings(chatId)

    default:
      return bot.sendMessage(chatId, "❓ Noma'lum admin buyrug'i. Iltimos, menyudan tanlang.", getMainMenu(userSession))
  }
}

// Teacher buyruqlarini boshqarish
async function handleTeacherCommands(chatId, text, userSession) {
  switch (text) {
    case "👥 Mening guruhlarim":
      return await showTeacherGroups(chatId, userSession)

    case "📊 O'quvchilar":
      return await showTeacherStudents(chatId, userSession)

    case "🏆 Badge berish":
      return await showBadgeGiving(chatId, userSession)

    case "📝 Davomat":
      return await showAttendance(chatId, userSession)

    case "📚 Uy vazifasi":
      return await showHomeworkAssignment(chatId, userSession)

    case "📈 Hisobotlar":
      return await showTeacherReports(chatId, userSession)

    case "💬 Ota-onalarga xabar":
      return await showParentMessaging(chatId, userSession)

    default:
      return bot.sendMessage(
        chatId,
        "❓ Noma'lum o'qituvchi buyrug'i. Iltimos, menyudan tanlang.",
        getMainMenu(userSession),
      )
  }
}

// Parent buyruqlarini boshqarish
async function handleParentCommands(chatId, text, userSession) {
  switch (text) {
    case "📊 Farzandlarim":
      return await showChildrenList(chatId, userSession)

    case "📈 Kunlik baholar":
      return await showGradesMenu(chatId, userSession)

    case "📚 Uy vazifalari":
      return await showHomeworkMenu(chatId, userSession)

    case "🏆 Badge hisoboti":
      return await showBadgeMenu(chatId, userSession)

    case "💰 To'lov holati":
      return await showPaymentMenu(chatId, userSession)

    case "📅 Dars jadvali":
      return await showScheduleMenu(chatId, userSession)

    default:
      return bot.sendMessage(chatId, "❓ Noma'lum buyruq. Iltimos, menyudan tanlang.", getMainMenu(userSession))
  }
}

// Admin funksiyalari
async function showAllUsers(chatId) {
  let message = "👥 Barcha foydalanuvchilar:\n\n"

  const users = Object.values(mockData.users)
  const roleEmojis = { admin: "👑", teacher: "👨‍🏫", parent: "👨‍👩‍👧‍👦", student: "🎓" }

  users.forEach((user, index) => {
    const emoji = roleEmojis[user.role] || "👤"
    message += `${index + 1}. ${emoji} ${user.fullName}\n`
    message += `   📱 ${user.phone}\n`
    message += `   📊 ${user.isActive ? "✅ Faol" : "❌ Nofaol"}\n\n`
  })

  message += `📊 Jami: ${users.length} ta foydalanuvchi\n`
  message += `✅ Faol: ${users.filter((u) => u.isActive).length} ta\n`
  message += `❌ Nofaol: ${users.filter((u) => !u.isActive).length} ta`

  return bot.sendMessage(chatId, message, getBackMenu())
}

async function showSystemStats(chatId) {
  const users = Object.values(mockData.users)
  const students = mockData.students
  const groups = mockData.groups

  let message = "📊 Tizim statistikasi:\n\n"
  message += `👥 Foydalanuvchilar:\n`
  message += `   👑 Adminlar: ${users.filter((u) => u.role === "admin").length}\n`
  message += `   👨‍🏫 O'qituvchilar: ${users.filter((u) => u.role === "teacher").length}\n`
  message += `   👨‍👩‍👧‍👦 Ota-onalar: ${users.filter((u) => u.role === "parent").length}\n\n`

  message += `🎓 O'quvchilar:\n`
  message += `   📚 Jami: ${students.length}\n`
  message += `   ✅ Faol: ${students.filter((s) => s.status === "active").length}\n`
  message += `   💰 Qarzli: ${students.filter((s) => s.totalDebt > 0).length}\n\n`

  message += `🏫 Guruhlar:\n`
  message += `   📚 Jami: ${groups.length}\n`
  message += `   👥 Jami o'quvchilar: ${groups.reduce((sum, g) => sum + g.studentCount, 0)}\n\n`

  const totalDebt = students.reduce((sum, s) => sum + s.totalDebt, 0)
  message += `💰 Moliyaviy:\n`
  message += `   💸 Jami qarz: ${totalDebt.toLocaleString()} so'm\n`
  message += `   📈 O'rtacha qarz: ${Math.round(totalDebt / students.length).toLocaleString()} so'm`

  return bot.sendMessage(chatId, message, getBackMenu())
}

async function showAllGroups(chatId) {
  let message = "🏫 Barcha guruhlar:\n\n"

  mockData.groups.forEach((group, index) => {
    const teacher = Object.values(mockData.users).find((u) => u.role === "teacher")
    message += `${index + 1}. 📚 ${group.name}\n`
    message += `   👨‍🏫 O'qituvchi: ${teacher?.fullName || "Tayinlanmagan"}\n`
    message += `   👥 O'quvchilar: ${group.studentCount} ta\n`
    message += `   📅 Darslar: ${group.schedule.length} kun/hafta\n\n`
  })

  return bot.sendMessage(chatId, message, getBackMenu())
}

async function showBadgeManagement(chatId) {
  let message = "🏆 Badge boshqaruvi:\n\n"

  mockData.badges.forEach((badge, index) => {
    const emoji = getBadgeEmoji(badge.color)
    message += `${index + 1}. ${emoji} ${badge.name}\n`
    message += `   📝 ${badge.description}\n`
    message += `   🎨 Rang: ${badge.color}\n\n`
  })

  message += "💡 Badge qo'shish yoki o'zgartirish uchun web paneldan foydalaning."

  return bot.sendMessage(chatId, message, getBackMenu())
}

async function showPaymentReport(chatId) {
  const students = mockData.students
  const totalDebt = students.reduce((sum, s) => sum + s.totalDebt, 0)
  const debtorCount = students.filter((s) => s.totalDebt > 0).length

  let message = "💰 To'lov hisoboti:\n\n"
  message += `📊 Umumiy ma'lumot:\n`
  message += `   💸 Jami qarz: ${totalDebt.toLocaleString()} so'm\n`
  message += `   👥 Qarzli o'quvchilar: ${debtorCount} ta\n`
  message += `   📈 O'rtacha qarz: ${Math.round(totalDebt / students.length).toLocaleString()} so'm\n\n`

  message += `🔴 Eng ko'p qarzli o'quvchilar:\n`
  const topDebtors = students
    .filter((s) => s.totalDebt > 0)
    .sort((a, b) => b.totalDebt - a.totalDebt)
    .slice(0, 5)

  topDebtors.forEach((student, index) => {
    message += `${index + 1}. ${student.user.fullName} (${student.studentCode})\n`
    message += `   💰 ${student.totalDebt.toLocaleString()} so'm\n`
  })

  return bot.sendMessage(chatId, message, getBackMenu())
}

async function showBulkMessage(chatId) {
  const message =
    "📢 Ommaviy xabar yuborish:\n\n" +
    "Bu funksiya orqali siz quyidagilarga xabar yuborishingiz mumkin:\n\n" +
    "• 👨‍👩‍👧‍👦 Barcha ota-onalarga\n" +
    "• 👨‍🏫 Barcha o'qituvchilarga\n" +
    "• 🏫 Ma'lum guruh ota-onalariga\n" +
    "• 🎓 Ma'lum o'quvchi ota-onasiga\n\n" +
    "💡 Batafsil sozlash uchun web paneldan foydalaning."

  return bot.sendMessage(chatId, message, getBackMenu())
}

async function showSystemSettings(chatId) {
  const message =
    "⚙️ Tizim sozlamalari:\n\n" +
    "🏢 Akademiya nomi: Atomic Education\n" +
    "📍 Manzil: Toshkent sh., Chilonzor tumani\n" +
    "📱 Telefon: +998 90 123 45 67\n" +
    "🌐 Veb-sayt: www.atomic-edu.uz\n\n" +
    "📊 Bot statistikasi:\n" +
    `• Faol foydalanuvchilar: ${userSessions.size}\n` +
    "• So'nggi yangilanish: Bugun\n" +
    "• Bot versiyasi: 2.0\n\n" +
    "💡 Sozlamalarni o'zgartirish uchun web paneldan foydalaning."

  return bot.sendMessage(chatId, message, getBackMenu())
}

// Teacher funksiyalari
async function showTeacherGroups(chatId, userSession) {
  const teacherGroups = mockData.groups.filter((g) => g.teacher === userSession.user.telegramId)

  if (teacherGroups.length === 0) {
    return bot.sendMessage(
      chatId,
      "📚 Sizga hech qanday guruh tayinlanmagan.\n\n" + "📞 Administrator bilan bog'laning.",
      getBackMenu(),
    )
  }

  let message = "👥 Mening guruhlarim:\n\n"

  teacherGroups.forEach((group, index) => {
    message += `${index + 1}. 📚 ${group.name}\n`
    message += `   👥 O'quvchilar: ${group.studentCount} ta\n`
    message += `   📅 Darslar:\n`

    const days = ["Yak", "Dush", "Sesh", "Chor", "Pay", "Juma", "Shan"]
    group.schedule.forEach((s) => {
      message += `      ${days[s.dayOfWeek]}: ${s.startTime}-${s.endTime}\n`
    })
    message += "\n"
  })

  return bot.sendMessage(chatId, message, getBackMenu())
}

async function showTeacherStudents(chatId, userSession) {
  const teacherGroups = mockData.groups.filter((g) => g.teacher === userSession.user.telegramId)
  const groupIds = teacherGroups.map((g) => g._id)
  const students = mockData.students.filter((s) => groupIds.includes(s.group._id))

  if (students.length === 0) {
    return bot.sendMessage(chatId, "👥 Sizning guruhlaringizda o'quvchilar topilmadi.", getBackMenu())
  }

  let message = "👥 Mening o'quvchilarim:\n\n"

  students.forEach((student, index) => {
    message += `${index + 1}. 👤 ${student.user.fullName}\n`
    message += `   🆔 ${student.studentCode}\n`
    message += `   📚 ${student.group.name}\n`
    message += `   📊 ${getStatusEmoji(student.status)} ${getStatusText(student.status)}\n`
    if (student.totalDebt > 0) {
      message += `   💰 Qarz: ${student.totalDebt.toLocaleString()} so'm\n`
    }
    message += "\n"
  })

  return bot.sendMessage(chatId, message, getBackMenu())
}

async function showBadgeGiving(chatId, userSession) {
  let message =
    "🏆 Badge berish:\n\n" +
    "Bu funksiya orqali siz o'quvchilarga badge berishingiz mumkin:\n\n" +
    "📝 Qadamlar:\n" +
    "1. O'quvchi kodini kiriting\n" +
    "2. Badge turini tanlang\n" +
    "3. Holat belgilang (oldi/olmadi)\n" +
    "4. Izoh qo'shing (ixtiyoriy)\n\n" +
    "🏆 Mavjud badge'lar:\n"

  mockData.badges.forEach((badge, index) => {
    const emoji = getBadgeEmoji(badge.color)
    message += `${index + 1}. ${emoji} ${badge.name}\n`
  })

  message += "\n💡 Badge berish uchun o'quvchi kodini kiriting:"

  return bot.sendMessage(chatId, message, getBackMenu())
}

async function showAttendance(chatId, userSession) {
  const message =
    "📝 Davomat belgilash:\n\n" +
    "Bu funksiya orqali siz dars davomatini belgilashingiz mumkin:\n\n" +
    "📊 Davomat turlari:\n" +
    "• ✅ Keldi\n" +
    "• ❌ Kelmadi\n" +
    "• ⏰ Kech keldi\n\n" +
    "📝 Qadamlar:\n" +
    "1. Guruhni tanlang\n" +
    "2. Sanani belgilang\n" +
    "3. Har bir o'quvchi uchun davomat belgilang\n\n" +
    "💡 Batafsil sozlash uchun web paneldan foydalaning."

  return bot.sendMessage(chatId, message, getBackMenu())
}

async function showHomeworkAssignment(chatId, userSession) {
  const message =
    "📚 Uy vazifasi berish:\n\n" +
    "Bu funksiya orqali siz o'quvchilarga uy vazifasi berishingiz mumkin:\n\n" +
    "📝 Qadamlar:\n" +
    "1. Guruhni tanlang\n" +
    "2. Fanni belgilang\n" +
    "3. Vazifa matnini kiriting\n" +
    "4. Muddatni belgilang\n\n" +
    "📢 Uy vazifasi avtomatik ravishda:\n" +
    "• O'quvchilarga yuboriladi\n" +
    "• Ota-onalarga xabar beriladi\n" +
    "• Tizimda saqlanadi\n\n" +
    "💡 Batafsil sozlash uchun web paneldan foydalaning."

  return bot.sendMessage(chatId, message, getBackMenu())
}

async function showTeacherReports(chatId, userSession) {
  const message =
    "📈 O'qituvchi hisobotlari:\n\n" +
    "Bu bo'limda siz quyidagi hisobotlarni ko'rishingiz mumkin:\n\n" +
    "📊 Mavjud hisobotlar:\n" +
    "• 👥 Guruh statistikasi\n" +
    "• 🏆 Badge hisoboti\n" +
    "• 📝 Davomat hisoboti\n" +
    "• 📚 Uy vazifasi bajarilishi\n" +
    "• 📈 O'quvchi rivojlanishi\n" +
    "• 💰 To'lov holati\n\n" +
    "📅 Vaqt oralig'i:\n" +
    "• Kunlik\n" +
    "• Haftalik\n" +
    "• Oylik\n" +
    "• Choraklik\n\n" +
    "💡 Batafsil hisobotlar uchun web paneldan foydalaning."

  return bot.sendMessage(chatId, message, getBackMenu())
}

async function showParentMessaging(chatId, userSession) {
  const message =
    "💬 Ota-onalarga xabar yuborish:\n\n" +
    "Bu funksiya orqali siz ota-onalarga xabar yuborishingiz mumkin:\n\n" +
    "📢 Xabar turlari:\n" +
    "• 🏆 Badge yangilanishi\n" +
    "• 📚 Uy vazifasi haqida\n" +
    "• 📝 Davomat haqida\n" +
    "• 📈 Baholar haqida\n" +
    "• 💰 To'lov eslatmasi\n" +
    "• 📞 Umumiy xabar\n\n" +
    "👥 Qamrov:\n" +
    "• Bitta ota-onaga\n" +
    "• Guruh ota-onalariga\n" +
    "• Barcha ota-onalarga\n\n" +
    "💡 Xabar yuborish uchun o'quvchi kodini kiriting:"

  return bot.sendMessage(chatId, message, getBackMenu())
}

// Parent funksiyalari (oldingi koddan)
async function showUserInfo(chatId, userSession) {
  if (!userSession) {
    return bot.sendMessage(chatId, "❌ Sizning ma'lumotlaringiz topilmadi. Iltimos, /start buyrug'ini bosing.")
  }

  const roleText = {
    parent: "Ota-ona",
    teacher: "O'qituvchi",
    student: "O'quvchi",
    admin: "Administrator",
  }

  const message =
    `👤 Sizning shaxsiy ma'lumotlaringiz:\n\n` +
    `📝 To'liq ism: ${userSession.user.fullName}\n` +
    `📱 Telefon: ${userSession.user.phone}\n` +
    `👥 Lavozim: ${roleText[userSession.user.role] || userSession.user.role}\n` +
    `✅ Holat: ${userSession.user.isActive ? "Faol" : "Nofaol"}\n\n` +
    `👶 Bog'langan farzandlar: ${userSession.children.length} ta\n\n` +
    `📅 Ro'yxatdan o'tgan: ${new Date(userSession.user.createdAt).toLocaleDateString("uz-UZ")}`

  return bot.sendMessage(chatId, message, getMainMenu(userSession))
}

async function showChildrenList(chatId, userSession) {
  if (!userSession || userSession.children.length === 0) {
    return bot.sendMessage(
      chatId,
      "👶 Sizga bog'langan farzandlar topilmadi.\n\n" +
        "📞 Iltimos, administrator bilan bog'laning yoki to'g'ridan-to'g'ri o'quvchi kodini kiriting.\n\n" +
        "💡 Masalan: 1001",
      getMainMenu(userSession),
    )
  }

  let message = "👶 Sizning farzandlaringiz:\n\n"
  userSession.children.forEach((child, index) => {
    message += `${index + 1}. 👤 ${child.name}\n`
    message += `   🆔 O'quvchi kodi: ${child.code}\n`
    message += `   📊 Batafsil ma'lumot: /${child.code}\n\n`
  })

  message += "💡 Batafsil ma'lumot olish uchun:\n"
  message += "• Farzandingiz kodini kiriting\n"
  message += "• Yoki yuqoridagi tugmalardan foydalaning"

  return bot.sendMessage(chatId, message, getMainMenu(userSession))
}

async function showGradesMenu(chatId, userSession) {
  if (!userSession || userSession.children.length === 0) {
    return bot.sendMessage(
      chatId,
      "📈 Baholarni ko'rish uchun avval farzandingiz kodini kiriting.\n\n💡 Masalan: 1001",
      getMainMenu(userSession),
    )
  }

  if (userSession.children.length === 1) {
    return await showStudentInfo(chatId, userSession.children[0].code, userSession)
  }

  let message = "📈 Qaysi farzandingizning baholarini ko'rmoqchisiz?\n\n"
  userSession.children.forEach((child, index) => {
    message += `${index + 1}. ${child.name} (${child.code})\n`
  })
  message += "\n💡 Farzandingiz kodini kiriting:"

  return bot.sendMessage(chatId, message, getMainMenu(userSession))
}

async function showHomeworkMenu(chatId, userSession) {
  if (!userSession || userSession.children.length === 0) {
    return bot.sendMessage(
      chatId,
      "📚 Uy vazifalarini ko'rish uchun avval farzandingiz kodini kiriting.\n\n💡 Masalan: 1001",
      getMainMenu(userSession),
    )
  }

  if (userSession.children.length === 1) {
    return await showStudentInfo(chatId, userSession.children[0].code, userSession)
  }

  let message = "📚 Qaysi farzandingizning uy vazifalarini ko'rmoqchisiz?\n\n"
  userSession.children.forEach((child, index) => {
    message += `${index + 1}. ${child.name} (${child.code})\n`
  })
  message += "\n💡 Farzandingiz kodini kiriting:"

  return bot.sendMessage(chatId, message, getMainMenu(userSession))
}

async function showBadgeMenu(chatId, userSession) {
  if (!userSession || userSession.children.length === 0) {
    return bot.sendMessage(
      chatId,
      "🏆 Badge hisobotini ko'rish uchun farzandingiz kodini kiriting.\n\n💡 Masalan: 1001",
      getMainMenu(userSession),
    )
  }

  if (userSession.children.length === 1) {
    return await showStudentInfo(chatId, userSession.children[0].code, userSession)
  }

  let message = "🏆 Qaysi farzandingizning badge hisobotini ko'rmoqchisiz?\n\n"
  userSession.children.forEach((child, index) => {
    message += `${index + 1}. ${child.name} (${child.code})\n`
  })
  message += "\n💡 Farzandingiz kodini kiriting:"

  return bot.sendMessage(chatId, message, getMainMenu(userSession))
}

async function showPaymentMenu(chatId, userSession) {
  if (!userSession || userSession.children.length === 0) {
    return bot.sendMessage(
      chatId,
      "💰 To'lov holatini ko'rish uchun farzandingiz kodini kiriting.\n\n💡 Masalan: 1001",
      getMainMenu(userSession),
    )
  }

  if (userSession.children.length === 1) {
    return await showStudentInfo(chatId, userSession.children[0].code, userSession)
  }

  let message = "💰 Qaysi farzandingizning to'lov holatini ko'rmoqchisiz?\n\n"
  userSession.children.forEach((child, index) => {
    message += `${index + 1}. ${child.name} (${child.code})\n`
  })
  message += "\n💡 Farzandingiz kodini kiriting:"

  return bot.sendMessage(chatId, message, getMainMenu(userSession))
}

async function showScheduleMenu(chatId, userSession) {
  if (!userSession || userSession.children.length === 0) {
    return bot.sendMessage(
      chatId,
      "📅 Dars jadvalini ko'rish uchun farzandingiz kodini kiriting.\n\n💡 Masalan: 1001",
      getMainMenu(userSession),
    )
  }

  if (userSession.children.length === 1) {
    return await showStudentInfo(chatId, userSession.children[0].code, userSession)
  }

  let message = "📅 Qaysi farzandingizning dars jadvalini ko'rmoqchisiz?\n\n"
  userSession.children.forEach((child, index) => {
    message += `${index + 1}. ${child.name} (${child.code})\n`
  })
  message += "\n💡 Farzandingiz kodini kiriting:"

  return bot.sendMessage(chatId, message, getMainMenu(userSession))
}

async function showContactInfo(chatId, userSession) {
  const message =
    "📞 Bog'lanish ma'lumotlari:\n\n" +
    "🏢 Atomic Education\n" +
    "📱 Telefon: +998 90 123 45 67\n" +
    "📧 Email: info@atomic-edu.uz\n" +
    "🌐 Veb-sayt: www.atomic-edu.uz\n\n" +
    "📍 Manzil: Toshkent sh., Chilonzor tumani\n" +
    "🏠 Mo'ljal: Metro bekati yaqinida\n\n" +
    "🕒 Ish vaqti:\n" +
    "• Dushanba - Juma: 9:00 - 18:00\n" +
    "• Shanba: 9:00 - 15:00\n" +
    "• Yakshanba: Dam olish kuni\n\n" +
    "💬 Savollaringiz bo'lsa, bemalol murojaat qiling!"

  return bot.sendMessage(chatId, message, getMainMenu(userSession))
}

async function showStudentInfo(chatId, studentCode, userSession) {
  try {
    const loadingMsg = await bot.sendMessage(chatId, "🔄 Ma'lumotlar yuklanmoqda...")

    const data = await makeApiCall(`/bot/student/${studentCode}?parent=${chatId}`)

    if (!data) {
      await bot.deleteMessage(chatId, loadingMsg.message_id)
      return bot.sendMessage(
        chatId,
        `❌ ${studentCode} kodli o'quvchi topilmadi.\n\n` +
          `💡 Iltimos:\n` +
          `• To'g'ri kodni kiriting (masalan: 1001)\n` +
          `• Yoki administrator bilan bog'laning`,
        getMainMenu(userSession),
      )
    }

    const message = formatStudentInfo(data)

    await bot.deleteMessage(chatId, loadingMsg.message_id)
    return bot.sendMessage(chatId, message, getMainMenu(userSession))
  } catch (error) {
    return bot.sendMessage(
      chatId,
      `❌ Ma'lumotlar yuklanmadi: ${error.message}\n\n` +
        `🆔 Kiritilgan kod: ${studentCode}\n\n` +
        `💡 Iltimos:\n` +
        `• To'g'ri kodni kiriting (masalan: 1001)\n` +
        `• Yoki administrator bilan bog'laning`,
      getMainMenu(userSession),
    )
  }
}

function getBadgeEmoji(color) {
  const emojis = {
    green: "🟢",
    blue: "🔵",
    yellow: "🟡",
    purple: "🟣",
    orange: "🟠",
    red: "🔴",
  }
  return emojis[color] || "⚪"
}

// Eski sessiyalarni tozalash
setInterval(
  () => {
    const now = Date.now()
    const maxAge = 24 * 60 * 60 * 1000 // 24 soat

    for (const [telegramId, session] of userSessions.entries()) {
      if (now - session.lastActivity > maxAge) {
        userSessions.delete(telegramId)
      }
    }
  },
  60 * 60 * 1000,
) // Har soat tekshirish

console.log("🤖 Mukammal Telegram bot ishga tushdi!")

const sendMessage = (chatId, text, options = {}) => {
  return bot.sendMessage(chatId, text, {
    parse_mode: "HTML",
    ...options,
  })
}

module.exports = { bot, sendMessage }
