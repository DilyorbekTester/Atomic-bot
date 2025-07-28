require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const path = require('path');
const main = require('./routers/index');
const bot = require('./bot/bot'); // Botni import qilamiz
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('trust proxy', 1);

// CORS sozlamalarini yangilash
app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'production'
        ? ['https://yourdomain.com']
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Rate limiting (package.json ga express-rate-limit qo'shish kerak)
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: "Juda ko'p so'rov yuborildi, keyinroq urinib ko'ring",
  },
});

app.use('/api/', limiter);

// Updated Helmet configuration for Alpine.js and development
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdnjs.cloudflare.com',
          'https://fonts.googleapis.com',
        ],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'", // Required for Alpine.js
          'https://unpkg.com',
          'https://cdn.jsdelivr.net',
        ],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: [
          "'self'",
          'https://cdnjs.cloudflare.com',
          'https://fonts.gstatic.com',
        ],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// JSON parsing with error handling
app.use(
  express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
      try {
        JSON.parse(buf);
      } catch (e) {
        res.status(400).json({ error: "Noto'g'ri JSON format" });
        throw new Error('Invalid JSON');
      }
    },
  })
);

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('json spaces', 2); // 2 bo'shliq bilan chiroyli chiqaradi

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

app.use('/api/v1', main);

// Global error handler (main routes dan keyin)
app.use((err, req, res, next) => {
  console.error('Global error:', err);

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: "Noto'g'ri JSON format" });
  }

  if (err.name === 'ValidationError') {
    return res
      .status(400)
      .json({ error: "Ma'lumotlar validatsiyadan o'tmadi" });
  }

  res.status(500).json({ error: 'Server ichki xatosi' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Sahifa topilmadi' });
});

// DB + Server start
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server ${PORT} portda ishlamoqda`);
    });
  })
  .catch((err) => {
    console.error('MongoDB ulanish xatosi:', err);
    process.exit(1);
  });

// Error handling
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
