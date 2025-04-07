// --- START OF FILE controllers/authController.js ---
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { promisify } = require('util');
const mongoose = require('mongoose'); // Додано для перевірки ObjectId
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const sendEmail = require('../utils/email');
require('colors'); // Для логування

// --- Допоміжні функції ---

/**
 * Генерує JWT токен.
 * @param {string} id - ID користувача.
 * @returns {string} - Згенерований JWT токен.
 * @throws {Error} Якщо змінні середовища JWT_SECRET або JWT_EXPIRES_IN не встановлено.
 */
const signToken = id => {
    if (!process.env.JWT_SECRET || !process.env.JWT_EXPIRES_IN) {
        console.error('ПОМИЛКА JWT: JWT_SECRET або JWT_EXPIRES_IN не встановлено!'.red.bold);
        throw new Error('Помилка конфігурації сервера JWT.');
    }
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN,
    });
};

/**
 * Встановлює httpOnly cookie з JWT та відправляє дані користувача (без чутливих полів).
 * @param {mongoose.Document} user - Об'єкт користувача Mongoose.
 * @param {number} statusCode - HTTP статус код відповіді.
 * @param {express.Response} res - Об'єкт відповіді Express.
 */
exports.createSendToken = (user, statusCode, res) => {
    const token = signToken(user._id);
    let expiresInDays = parseInt(process.env.JWT_COOKIE_EXPIRES_IN_DAYS || '90', 10);

    if (isNaN(expiresInDays) || expiresInDays <= 0) {
        console.error('ПОМИЛКА: Некоректне значення JWT_COOKIE_EXPIRES_IN_DAYS, використано 90 днів.'.red.bold);
        expiresInDays = 90; // Fallback
    }

    const cookieOptions = {
        expires: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
    };

    res.cookie('jwt', token, cookieOptions);

    // Створюємо об'єкт користувача для відповіді без чутливих полів
    // Важливо викликати toObject() перед видаленням полів, якщо user - це Mongoose документ
    const userResponse = user.toObject ? user.toObject() : { ...user };

    delete userResponse.passwordHash;
    delete userResponse.passwordChangedAt;
    delete userResponse.passwordResetToken;
    delete userResponse.passwordResetExpires;
    delete userResponse.__v;
    // Видаляємо потенційно великі масиви з відповіді логіну/реєстрації
    delete userResponse.bookmarks;
    delete userResponse.following;
    delete userResponse.categorySubscriptions;
    delete userResponse.favoriteCategories;
    // Можна видалити й статистику, якщо вона не потрібна одразу після логіну
    // delete userResponse.stats;

    res.status(statusCode).json({
        status: 'success',
        // Не повертаємо токен у тілі відповіді
        data: {
            user: userResponse,
        },
    });
};

// --- Контролери Маршрутів ---

exports.register = catchAsync(async (req, res, next) => {
    const { name, email, password, confirmPassword } = req.body; // Додано confirmPassword

    // Валідація вже є в middleware, але дублюємо основні перевірки
    if (!name || !email || !password || !confirmPassword) {
        return next(new AppError('Будь ласка, надайте ім\'я, email, пароль та підтвердження пароля.', 400));
    }
    if (password !== confirmPassword) {
        return next(new AppError('Паролі не співпадають.', 400));
    }

    const lowerCaseEmail = email.toLowerCase();
    const existingUser = await User.findOne({ email: lowerCaseEmail });
    if (existingUser) {
        return next(new AppError('Користувач з таким email вже існує.', 409)); // Conflict
    }

    // Створення нового користувача. Пароль хешується в pre-save hook.
    const newUser = await User.create({
        name: name.trim(),
        email: lowerCaseEmail,
        passwordHash: password, // Передаємо пароль для хешування
        provider: 'local', // Явно вказуємо провайдера
        // Роль за замовчуванням 'user', isActive 'true'
    });

    console.log(`Новий користувач зареєстрований: ${newUser.email} (ID: ${newUser._id})`.green);

    // Відправка токена та даних користувача (автоматичний вхід)
    exports.createSendToken(newUser, 201, res); // 201 Created
});

exports.login = catchAsync(async (req, res, next) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return next(new AppError('Будь ласка, надайте email та пароль!', 400));
    }

    const lowerCaseEmail = email.toLowerCase();
    // Обов'язково вибираємо passwordHash та isActive
    const user = await User.findOne({ email: lowerCaseEmail }).select('+passwordHash +isActive');

    if (!user || !(await user.comparePassword(password))) {
        console.warn(`Невдала спроба входу для email: ${lowerCaseEmail}`.yellow);
        return next(new AppError('Невірний email або пароль.', 401)); // Unauthorized
    }

    if (!user.isActive) {
        console.warn(`Спроба входу для неактивного користувача: ${user.email}`.yellow);
        return next(new AppError('Ваш обліковий запис заблоковано.', 403)); // Forbidden
    }

    // Якщо все гаразд, відправляємо токен клієнту
    console.log(`Користувач увійшов: ${user.email} (ID: ${user._id})`.blue);
    exports.createSendToken(user, 200, res); // OK
});

exports.forgotPassword = catchAsync(async (req, res, next) => {
    const userEmail = req.body.email;
    if (!userEmail) {
        return next(new AppError('Будь ласка, введіть email.', 400));
    }

    const lowerCaseEmail = userEmail.toLowerCase();
    // Шукаємо тільки активних користувачів
    const user = await User.findOne({ email: lowerCaseEmail, isActive: true });

    if (!user) {
        console.log(`Спроба відновлення пароля для неіснуючого/неактивного email: ${lowerCaseEmail}`.yellow);
        // Безпечна відповідь
        return res.status(200).json({
            status: 'success',
            message: 'Якщо такий email зареєстровано та активний, інструкції з відновлення пароля надіслано.'
        });
    }

    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false }); // Зберігаємо хеш токена та час

    const resetPageUrl = `${process.env.FRONTEND_URL || req.protocol + '://' + req.get('host')}/reset-password.html`;
    const resetURL = `${resetPageUrl}?token=${resetToken}`; // Передаємо НЕхешований токен

    const message = `Забули пароль для EroStory?\n\nПерейдіть за цим посиланням, щоб встановити новий пароль: ${resetURL}\n\nЯкщо ви не робили цей запит, проігноруйте цей лист.\n\nПосилання дійсне протягом 10 хвилин.`;
    const subject = 'Відновлення паролю EroStory (дійсний 10 хв)';

    try {
        await sendEmail({ email: user.email, subject, message });
        console.log(`Токен скидання пароля надіслано на ${user.email}`.green);
        res.status(200).json({
            status: 'success',
            message: 'Інструкції для скидання паролю надіслано на ваш email!',
        });
    } catch (err) {
        console.error("Помилка відправки email для скидання пароля:".red.bold, err);
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save({ validateBeforeSave: false }); // Скидаємо токен при помилці
        return next(new AppError('Не вдалося надіслати email для відновлення пароля. Спробуйте ще раз пізніше!', 500));
    }
});

exports.resetPassword = catchAsync(async (req, res, next) => {
    const { password, confirmPassword } = req.body;
    const { token } = req.params; // НЕхешований токен

    // Перевірки (мінімальна довжина та співпадіння) вже є в validationMiddleware
    if (!password || password !== confirmPassword) {
        return next(new AppError('Будь ласка, введіть та підтвердіть новий пароль (мін. 8 символів). Паролі повинні співпадати.', 400));
    }

    // 1) Хешуємо токен з URL для пошуку в БД
    const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

    // 2) Знаходимо користувача
    const user = await User.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: Date.now() }, // Токен ще дійсний
        isActive: true // Тільки активний
    }); // Не вибираємо пароль явно, він буде оновлений

    if (!user) {
        return next(new AppError('Токен недійсний, прострочений або обліковий запис неактивний.', 400));
    }

    // 3) Встановлюємо новий пароль та очищаємо поля скидання
    user.passwordHash = password; // pre-save hook хешує та оновлює passwordChangedAt
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    // 4) Зберігаємо користувача (запускає валідацію та хуки)
    await user.save();

    // 5) Логінимо користувача та відправляємо новий JWT
    console.log(`Пароль успішно скинуто для користувача ${user.email}`.green);
    exports.createSendToken(user, 200, res);
});

// Обробка колбеку від Google OAuth
exports.googleCallback = catchAsync(async (req, res, next) => {
    // `req.user` має бути встановлено middleware `passport.authenticate`
    const user = req.user;

    if (!user) {
        // Ця ситуація не мала б виникнути, якщо authenticate спрацював
        console.error('Google Callback: req.user не встановлено після passport.authenticate'.red);
        return res.redirect(`${process.env.FRONTEND_URL || '/'}login.html?error=google-auth-unexpected-error`);
    }

    // Ми вже маємо об'єкт користувача (або щойно створений, або знайдений)
    // Потрібно просто видати JWT токен через cookie і перенаправити на фронтенд

    console.log(`Успішна автентифікація через Google для: ${user.email} (ID: ${user._id})`.blue);

    // Створюємо JWT та встановлюємо cookie
    exports.createSendToken(user, 200, res);

    // Після встановлення cookie, робимо редірект на фронтенд
    // Можна додати параметр, що вказує на успішний OAuth логін
    // const redirectUrl = `${process.env.FRONTEND_URL || '/'}?loginsuccess=google`;
    // res.redirect(redirectUrl);
    // ВАЖЛИВО: createSendToken вже відправляє відповідь (res.status().json()),
    // тому редірект тут НЕ ПОТРІБЕН. Фронтенд має обробити відповідь JSON.
});
// --- END OF FILE controllers/authController.js ---