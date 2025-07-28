// utils.js
const axios = require('axios');
require('dotenv').config();

const sendMessage = async (chatId, message) => {
  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }
    );
    return response.data;
  } catch (error) {
    console.error('Telegramga xabar yuborishda xatolik:', error);
    throw error;
  }
};

module.exports = { sendMessage };
