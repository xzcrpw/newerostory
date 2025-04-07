// --- START OF FILE middleware/errorMiddleware.js ---
const AppError = require('../utils/AppError');
require('colors'); // Додаємо для кольорового виводу

// --- Обробники специфічних помилок ---

const handleCastErrorDB = err => {
    const message = `Невірний формат для поля ${err.path}: ${err.value}.`;
    return new AppError(message, 400); // Bad Request
};

const handleDuplicateFieldsDB = err => {
    // Витягуємо значення з повідомлення про помилку (може бути не завжди надійним)
    // Краще отримувати з err.keyValue, якщо воно завжди є
    const value = err.message.match(/(["'])(\\?.)*?\1/)?.[0] || JSON.stringify(err.keyValue);
    const field = Object.keys(err.keyValue || {})[0] || 'поле'; // Отримуємо назву поля

    let message = `Дублююче значення для поля ${field}: ${value}. Будь ласка, використайте інше значення.`;

    // Спеціальна обробка для помилки дублювання перекладу
    if (err.keyValue?.refModel && err.keyValue?.lang) {
        message = `Переклад для сутності (${err.keyValue.refModel}) та мови ('${err.keyValue.lang}') вже існує.`;
    }

    return new AppError(message, 409); // 409 Conflict
};

const handleValidationErrorDB = err => {
    const errors = Object.values(err.errors).map(el => el.message);
    const message = `Невірні вхідні дані. ${errors.join('. ')}`;
    return new AppError(message, 400); // Bad Request
};

// Помилки JWT
const handleJWTError = () => new AppError('Недійсний токен. Будь ласка, увійдіть знову!', 401);
const handleJWTExpiredError = () => new AppError('Термін дії сесії закінчився. Будь ласка, увійдіть знову!', 401);

// Помилки Multer (обробка додана тут)
const handleMulterError = err => {
    let message = `Помилка завантаження файлу: ${err.message}`;
    if (err.code === 'LIMIT_FILE_SIZE') {
        message = `Файл занадто великий.`; // Деталі про ліміт краще додати в uploadMiddleware
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        message = `Неочікуване поле файлу: ${err.field}.`;
    } else if (err.code === 'LIMIT_FILE_COUNT') {
        message = 'Занадто багато файлів.';
    }
    return new AppError(message, 400); // Bad Request
};


// --- Функції відправки відповіді про помилку ---

const sendErrorDev = (err, req, res) => {
    console.error('ПОМИЛКА 💥 (Development):'.red, err);

    // API помилка
    if (req.originalUrl.startsWith('/api')) {
        return res.status(err.statusCode).json({
            status: err.status,
            error: err, // Включаємо об'єкт помилки
            message: err.message,
            stack: err.stack // Включаємо стек для дебагу
        });
    }
    // Рендеринг сторінки помилки (якщо є) - поки не актуально
    // console.error('ПОМИЛКА 💥', err);
    // return res.status(err.statusCode).render('error', {
    //     title: 'Щось пішло не так!',
    //     msg: err.message
    // });
    // Або просто JSON
    return res.status(err.statusCode).json({
        status: err.status,
        message: `Помилка рендерингу або не-API запит: ${err.message}`
    });
};

const sendErrorProd = (err, req, res) => {
    // Логуємо помилку завжди
    console.error('ПОМИЛКА 💥 (Production):'.red, err.name, err.message, err.stack ? `\nStack: ${err.stack.split('\n')[1]}` : ''); // Логуємо менше деталей стеку

    // Відповідь для API запитів
    if (req.originalUrl.startsWith('/api')) {
        if (err.isOperational) {
            // Операційна, довірена помилка: надсилаємо повідомлення клієнту
            return res.status(err.statusCode).json({
                status: err.status,
                message: err.message
            });
        }
        // Програмна або невідома помилка: не розкриваємо деталі
        return res.status(500).json({
            status: 'error',
            message: 'Виникла внутрішня помилка сервера.' // Загальне повідомлення
        });
    }

    // Відповідь для не-API запитів (наприклад, рендеринг сторінки помилки)
    if (err.isOperational) {
        // return res.status(err.statusCode).render('error', {
        //     title: 'Щось пішло не так!',
        //     msg: err.message
        // });
        return res.status(err.statusCode).json({ // Поки що JSON
            status: err.status,
            message: err.message
        });
    }
    // Програмна або невідома помилка
    // return res.status(err.statusCode).render('error', {
    //     title: 'Щось пішло не так!',
    //     msg: 'Будь ласка, спробуйте ще раз пізніше.'
    // });
    return res.status(500).json({
        status: 'error',
        message: 'Виникла внутрішня помилка сервера.'
    });
};

// --- Головний Middleware обробки помилок ---
module.exports = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    // Створюємо копію помилки для обробки
    let error = { ...err, message: err.message, name: err.name };
    // Копіюємо додаткові поля, які можуть бути корисними для обробників
    if (err.code) error.code = err.code;
    if (err.path) error.path = err.path;
    if (err.value) error.value = err.value;
    if (err.keyValue) error.keyValue = err.keyValue;
    if (err.errors) error.errors = err.errors; // Для ValidationError
    if (err.field) error.field = err.field; // Для MulterError

    // --- Обробка специфічних помилок для Production ---
    if (process.env.NODE_ENV !== 'development') {
        if (error.name === 'CastError') error = handleCastErrorDB(error);
        if (error.code === 11000 || error.code === 11001) error = handleDuplicateFieldsDB(error);
        if (error.name === 'ValidationError') error = handleValidationErrorDB(error);
        if (error.name === 'JsonWebTokenError') error = handleJWTError();
        if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();
        if (error.name === 'MulterError') error = handleMulterError(error);
    }

    // Відправляємо відповідь залежно від середовища
    if (process.env.NODE_ENV === 'development') {
        sendErrorDev(err, req, res); // В DEV відправляємо оригінальну помилку для повного стеку
    } else {
        sendErrorProd(error, req, res); // В PROD відправляємо оброблену (error)
    }
};
// --- END OF FILE middleware/errorMiddleware.js ---