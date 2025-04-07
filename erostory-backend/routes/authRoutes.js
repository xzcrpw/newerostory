// --- START OF FILE routes/authRoutes.js ---
const express = require('express');
const authController = require('../controllers/authController');
const validationMiddleware = require('../middleware/validationMiddleware');
const rateLimit = require('express-rate-limit');
const passport = require('passport'); // Розкоментовано

// Налаштування Rate Limiter для маршрутів автентифікації
const authWindowMs = parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS || 15 * 60 * 1000); // 15 хвилин
const authMaxRequests = parseInt(process.env.RATE_LIMIT_AUTH_MAX || 10); // Макс спроб

const authLimiter = rateLimit({
    windowMs: authWindowMs,
    max: authMaxRequests,
    message: {
        status: 'fail',
        message: `Занадто багато спроб з цієї IP-адреси, будь ласка, спробуйте через ${Math.ceil(authWindowMs / 60000)} хвилин.`
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip // Використовуємо IP
});

const router = express.Router();

// --- Стандартні маршрути ---
router.post('/register', authLimiter, validationMiddleware.validateRegister, authController.register);
router.post('/login', authLimiter, validationMiddleware.validateLogin, authController.login);
router.post('/forgot-password', authLimiter, validationMiddleware.validateForgotPassword, authController.forgotPassword);
router.patch('/reset-password/:token', authLimiter, validationMiddleware.validateResetPassword, authController.resetPassword);

// --- Маршрути для Google OAuth ---
// 1. Перенаправлення користувача на Google
router.get(
    '/google',
    // authLimiter, // Можна додати окремий лімітер для OAuth
    passport.authenticate('google', {
        scope: ['profile', 'email'], // Запитуємо дані
        session: false // Не використовуємо сесію Passport для зберігання користувача
    })
);

// 2. Google перенаправляє сюди після успішної автентифікації
router.get(
    '/google/callback',
    passport.authenticate('google', {
        // Редірект на фронтенд у разі помилки аутентифікації на стороні Google
        failureRedirect: `${process.env.FRONTEND_URL || '/'}login.html?error=google-auth-failed`,
        session: false // Не використовуємо сесію Passport
    }),
    authController.googleCallback // Обробляємо користувача та видаємо JWT cookie
);
// --- Кінець Маршрутів Google OAuth ---

// Маршрути Facebook видалені

module.exports = router;
// --- END OF FILE routes/authRoutes.js ---