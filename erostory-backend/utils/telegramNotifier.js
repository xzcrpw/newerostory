// --- START OF FILE utils/telegramNotifier.js ---
const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');
require('colors'); // Підключаємо colors

// Завантажуємо змінні один раз, якщо ще не завантажені
if (!process.env.TELEGRAM_BOT_TOKEN) {
    dotenv.config();
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const defaultChatId = process.env.TELEGRAM_CHAT_ID; // ID чату за замовчуванням

let bot;
let botInitialized = false; // Прапорець успішної ініціалізації

if (token) {
    try {
        // Ініціалізуємо бота без polling
        bot = new TelegramBot(token);
        botInitialized = true;
        console.log('Telegram бот ініціалізовано для відправки сповіщень.'.cyan);
    } catch (error) {
        console.error('Помилка ініціалізації Telegram бота:'.red.bold, error.message);
        bot = null;
    }
} else {
    console.warn('TELEGRAM_BOT_TOKEN не знайдено в .env. Сповіщення Telegram вимкнено.'.yellow);
    bot = null;
}

/**
 * Асинхронно відправляє повідомлення в Telegram чат.
 * @param {string} message - Текст повідомлення.
 * @param {object} [options={}] - Додаткові опції для sendMessage API (напр., parse_mode, disable_web_page_preview).
 * @param {string|number} [chatId] - ID чату для відправки. Якщо не вказано, використовується TELEGRAM_CHAT_ID з .env.
 * @returns {Promise<void>}
 */
const sendTelegramNotification = async (message, options = {}, chatId = defaultChatId) => {
    if (!botInitialized || !bot) {
        console.warn(`Telegram бот не ініціалізований. Повідомлення НЕ надіслано до ${chatId || 'default chat'}:`.yellow, message.substring(0, 100) + '...');
        return; // Нічого не робимо
    }
    if (!chatId) {
        console.warn('Не вказано chatId для Telegram сповіщення. Повідомлення не надіслано:'.yellow, message.substring(0, 100) + '...');
        return;
    }

    // Встановлюємо опції за замовчуванням, якщо вони не передані
    const defaultOptions = {
        disable_web_page_preview: true, // Вимикаємо прев'ю за замовчуванням
        parse_mode: undefined, // Явно вказуємо, що форматування немає за замовчуванням
    };
    const sendOptions = { ...defaultOptions, ...options };

    try {
        // Екранування для MarkdownV2 (якщо потрібно)
        let safeMessage = message;
        if (sendOptions.parse_mode === 'MarkdownV2') {
            safeMessage = message.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
        }

        await bot.sendMessage(chatId, safeMessage, sendOptions);
        // Логуємо тільки якщо це не дефолтний чат (щоб не спамити логи)
        if (chatId !== defaultChatId) {
            console.log(`Telegram сповіщення надіслано до ${chatId}`.green);
        }

    } catch (error) {
        console.error(`Помилка відправки Telegram сповіщення до ${chatId}:`.red.bold, error.response?.body || error.message);
        // Можна додати логіку обробки специфічних помилок Telegram API
    }
};

module.exports = sendTelegramNotification;
// --- END OF FILE utils/telegramNotifier.js ---