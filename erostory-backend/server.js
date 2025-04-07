// --- START OF FILE server.js ---
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const passport = require('passport');
const session = require('express-session');
const MongoStore = require('connect-mongo');

dotenv.config();
require('colors');

const connectDB = require('./config/db');
const errorMiddleware = require('./middleware/errorMiddleware');
const AppError = require('./utils/AppError');

// Перевірка змінних
const requiredEnvVars = [
    'NODE_ENV', 'PORT', 'MONGO_URI', 'JWT_SECRET', 'JWT_EXPIRES_IN',
    'JWT_COOKIE_EXPIRES_IN_DAYS', 'SERVER_BASE_URL', 'SESSION_SECRET',
    'SESSION_MAX_AGE_MS', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
    'GOOGLE_CALLBACK_URL', 'EMAIL_FROM'
];
requiredEnvVars.forEach(v => {
    if (!process.env[v]) {
        console.error(`ПОМИЛКА: Змінна середовища ${v} не встановлена! Завершення роботи.`.red.bold);
        process.exit(1);
    }
});

connectDB();
const app = express();

// ВИДАЛЕНО 'trust proxy', оскільки проксі не використовується
// app.enable('trust proxy');

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));

// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:63342,http://127.0.0.1:63342')
    .split(',').map(origin => origin.trim());
if (process.env.NODE_ENV === 'development') {
    ['http://localhost:5000', 'http://127.0.0.1:5000', 'http://localhost:63342', 'http://127.0.0.1:63342'].forEach(devOrigin => {
        if (!allowedOrigins.includes(devOrigin)) allowedOrigins.push(devOrigin);
    });
}
console.log('CORS: Дозволені origins:', allowedOrigins);
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) callback(null, true);
        else callback(new AppError(`Політика CORS не дозволяє доступ з origin: ${origin}`, 403));
    },
    credentials: true
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// Rate Limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 200,
    message: { status: 'fail', message: 'Забагато запитів.' },
    standardHeaders: true, legacyHeaders: false
    // ВИДАЛЕНО keyGenerator та trustProxy
});
app.use('/api', apiLimiter);

app.use(express.json({ limit: process.env.BODY_LIMIT || '15mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.BODY_LIMIT || '15mb' }));
app.use(cookieParser());

// Сесії (для OAuth)
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGO_URI,
        ttl: parseInt(process.env.SESSION_MAX_AGE_MS, 10) / 1000,
        autoRemove: 'interval', autoRemoveInterval: 10
    }),
    cookie: {
        maxAge: parseInt(process.env.SESSION_MAX_AGE_MS, 10),
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true, sameSite: 'lax'
    }
});
app.use(sessionMiddleware);

// Passport
app.use(passport.initialize());
require('./config/passport')(passport);

// Безпека
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());
app.use(compression());

// Тест
app.get('/api/ping', (req, res) => res.status(200).json({ status: 'success', message: 'Pong! API is running.' }));

// Маршрути API
const authRoutes = require('./routes/authRoutes');
const storyRoutes = require('./routes/storyRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const tagRoutes = require('./routes/tagRoutes');
const userRoutes = require('./routes/userRoutes');
const likeRoutes = require('./routes/likeRoutes');
const reportRoutes = require('./routes/reportRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { storyCommentRouter, commentByIdRouter } = require('./routes/commentRoutes'); // Імпортуємо обидва

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/stories', storyRoutes); // Включає /stories/:storyId/comments
app.use('/api/v1/comments', commentByIdRouter); // Підключаємо роутер для /comments/:id
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/tags', tagRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/likes', likeRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/admin', adminRoutes);

// Обробка 404 для API
app.all('/api/*', (req, res, next) => {
    next(new AppError(`Маршрут ${req.method} ${req.originalUrl} не знайдено на цьому сервері!`, 404));
});

// Глобальний обробник помилок
app.use(errorMiddleware);

// Запуск Сервера
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
    console.log(`Сервер запущено на порті ${PORT} в режимі ${process.env.NODE_ENV}`.yellow.bold);
});

// Обробка глобальних помилок процесу
process.on('unhandledRejection', err => { console.error('UNHANDLED REJECTION! 💥'.red.bold, err.name, err.message, err.stack); server.close(() => process.exit(1)); setTimeout(()=>process.exit(1), 10000).unref(); });
process.on('uncaughtException', err => { console.error('UNCAUGHT EXCEPTION! 💥'.red.bold, err.name, err.message, err.stack); process.exit(1); });
process.on('SIGTERM', () => { console.log('👋 SIGTERM RECEIVED. Shutting down gracefully'.blue); server.close(() => { console.log('💥 Process terminated!'.blue); process.exit(0); }); setTimeout(() => { console.error('Could not close connections in time, forcefully shutting down'.red); process.exit(1); }, 10000).unref(); });
// --- END OF FILE server.js ---