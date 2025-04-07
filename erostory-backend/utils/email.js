// --- START OF FILE utils/email.js ---
const nodemailer = require('nodemailer');
require('colors'); // Підключаємо тут, якщо ще не підключено глобально

/**
 * Відправляє електронний лист за допомогою Nodemailer.
 * Використовує налаштування SMTP з process.env.
 * @param {object} options - Опції для відправки листа.
 * @param {string} options.email - Email отримувача.
 * @param {string} options.subject - Тема листа.
 * @param {string} options.message - Текстовий вміст листа.
 * @param {string} [options.html] - HTML вміст листа (опціонально).
 * @returns {Promise<void>}
 * @throws {AppError} Якщо сталася помилка конфігурації в production або помилка відправки.
 */
const sendEmail = async options => {
    // 1) Перевірка наявності необхідних змінних середовища
    const requiredEnv = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASSWORD', 'EMAIL_FROM'];
    const missingEnv = requiredEnv.filter(v => !process.env[v]);

    if (missingEnv.length > 0) {
        console.error(`ПОМИЛКА EMAIL: Не всі змінні середовища для SMTP налаштовані! Відсутні: ${missingEnv.join(', ')}`.red.bold);
        if (process.env.NODE_ENV === 'production') {
            // В продакшені це критична помилка
            throw new AppError('Сервіс email тимчасово недоступний через помилку конфігурації.', 500);
        } else {
            // В розробці логуємо вміст листа
            console.warn('Email НЕ буде відправлено через відсутність конфігурації.'.yellow);
            console.log('--- Email Content (Dev Mode) ---');
            console.log(`To: ${options.email}`);
            console.log(`Subject: ${options.subject}`);
            console.log(`Message:\n${options.message}`);
            if (options.html) console.log(`HTML:\n${options.html.substring(0, 200)}...`);
            console.log('---------------------------------');
            return; // Завершуємо без відправки
        }
    }

    // 2) Створення транспортера
    const port = parseInt(process.env.EMAIL_PORT, 10);
    const useSsl = port === 465;

    const transporterOptions = {
        host: process.env.EMAIL_HOST,
        port: port,
        secure: useSsl,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        },
        // Додамо налаштування TLS, які іноді потрібні
        tls: {
            // Не використовуйте це в продакшені, якщо у вас немає самопідписаного сертифіката
            // rejectUnauthorized: process.env.NODE_ENV === 'production'
            ciphers:'SSLv3' // Може знадобитися для старих серверів
        },
        logger: process.env.NODE_ENV === 'development', // Логування тільки в розробці
        debug: process.env.NODE_ENV === 'development', // Детальне логування
    };

    const transporter = nodemailer.createTransport(transporterOptions);

    // 3) Визначення опцій email
    const mailOptions = {
        from: process.env.EMAIL_FROM, // 'Your App Name <youremail@example.com>'
        to: options.email,
        subject: options.subject,
        text: options.message,
        html: options.html // Використовуємо HTML, якщо він є
    };

    // 4) Відправка email
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log(`Email успішно надіслано до ${options.email}. Message ID: ${info.messageId}`.green);
    } catch (error) {
        console.error(`Помилка відправки email до ${options.email}:`.red.bold, error);
        // Кидаємо AppError, щоб його міг обробити глобальний errorMiddleware
        throw new AppError('Сталася помилка під час відправки email.', 500);
    }
};

module.exports = sendEmail;
// --- END OF FILE utils/email.js ---