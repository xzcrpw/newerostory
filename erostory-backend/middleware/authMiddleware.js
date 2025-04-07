// --- START OF FILE middleware/authMiddleware.js ---
const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
require('colors'); // Додаємо для логування

// Захист маршрутів - перевірка автентифікації користувача
exports.protect = catchAsync(async (req, res, next) => {
    // 1) Отримуємо токен і перевіряємо, чи він існує
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
        // console.log('[AUTH] Token found in Authorization header.'); // Debug log
    } else if (req.cookies?.jwt) {
        token = req.cookies.jwt;
        // console.log('[AUTH] Token found in cookie.'); // Debug log
    }

    if (!token) {
        console.warn('[AUTH] No token found in request.');
        // 401 Unauthorized - Означає, що потрібна автентифікація
        return next(new AppError('Ви не авторизовані! Будь ласка, увійдіть, щоб отримати доступ.', 401));
    }

    // 2) Верифікація токена
    let decoded;
    try {
        // Перевіряємо секретний ключ
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is not defined in environment variables.');
        }
        // Використовуємо promisify для асинхронної верифікації
        decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
        // console.log('[AUTH] Token verified successfully. Decoded:', decoded); // Debug log
    } catch (err) {
        console.warn('[AUTH] Token verification failed:', err.name, err.message);
        if (err.name === 'JsonWebTokenError') {
            return next(new AppError('Недійсний токен. Будь ласка, увійдіть знову!', 401));
        }
        if (err.name === 'TokenExpiredError') {
            // Видаляємо застарілий cookie, якщо він є
            res.cookie('jwt', 'expired', { expires: new Date(0), httpOnly: true, secure: process.env.NODE_ENV === 'production', path: '/' });
            return next(new AppError('Термін дії сесії закінчився. Будь ласка, увійдіть знову!', 401));
        }
        // Інші можливі помилки (включаючи відсутність JWT_SECRET)
        console.error('[AUTH] Unexpected JWT verification error:', err);
        return next(new AppError('Помилка автентифікації.', 500)); // Повертаємо 500 для неочікуваних помилок
    }

    // Перевіряємо наявність ID в декодованому токені
    if (!decoded.id || !mongoose.Types.ObjectId.isValid(decoded.id)) {
        console.error('[AUTH] Invalid token payload: ID missing or invalid.');
        return next(new AppError('Некоректний формат токена.', 401));
    }

    // 3) Перевіряємо, чи користувач все ще існує та активний
    // Вибираємо поле passwordChangedAt та isActive
    // Використовуємо { includeInactive: true } щоб знайти навіть неактивних, і потім перевірити статус
    const currentUser = await User.findById(decoded.id)
        .select('+passwordChangedAt +isActive')
        .setOptions({ includeInactive: true }); // Дозволяємо знайти неактивних

    if (!currentUser) {
        console.warn(`[AUTH] User with token ID ${decoded.id} not found.`);
        return next(new AppError('Користувач, що належить цьому токену, більше не існує.', 401));
    }

    // Перевіряємо, чи користувач активний
    if (!currentUser.isActive) {
        console.warn(`[AUTH] User ${currentUser.email} (ID: ${currentUser._id}) is inactive.`);
        return next(new AppError('Ваш обліковий запис заблоковано.', 403)); // 403 Forbidden
    }

    // 4) Перевіряємо, чи користувач не змінив пароль ПІСЛЯ видачі токену
    if (currentUser.changedPasswordAfter && currentUser.changedPasswordAfter(decoded.iat)) {
        console.warn(`[AUTH] User ${currentUser.email} changed password after token was issued.`);
        // Видаляємо застарілий cookie
        res.cookie('jwt', 'expired', { expires: new Date(0), httpOnly: true, secure: process.env.NODE_ENV === 'production', path: '/' });
        return next(new AppError('Пароль було нещодавно змінено! Будь ласка, увійдіть знову.', 401));
    }

    // 5) Надання доступу до захищеного маршруту
    // Видаляємо службові поля перед передачею далі
    currentUser.passwordChangedAt = undefined;
    currentUser.isActive = undefined; // Не передаємо далі, статус перевірено
    req.user = currentUser; // Додаємо об'єкт користувача до запиту
    res.locals.user = currentUser; // Робимо користувача доступним і в шаблонах (якщо використовуються)
    // console.log(`[AUTH] Access granted for user: ${currentUser.email} (Role: ${currentUser.role})`); // Debug log

    next(); // Передаємо управління наступному middleware/контролеру
});

// Middleware для перевірки ролей
exports.restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            // Це не повинно статися, якщо protect викликається перед restrictTo
            console.error('[AUTH] restrictTo called without req.user being set.');
            return next(new AppError('Помилка авторизації.', 500));
        }
        if (!roles.includes(req.user.role)) {
            console.warn(`[AUTH] User ${req.user.email} (Role: ${req.user.role}) tried to access restricted route. Allowed roles: ${roles.join(', ')}`);
            return next(new AppError('У вас немає дозволу для виконання цієї дії.', 403)); // 403 Forbidden
        }
        // Якщо роль дозволена, йдемо далі
        next();
    };
};
// --- END OF FILE middleware/authMiddleware.js ---