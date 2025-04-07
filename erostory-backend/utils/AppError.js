// --- START OF FILE utils/AppError.js ---
// utils/AppError.js

/**
 * Клас для створення операційних помилок, які можна безпечно надсилати клієнту.
 * @extends Error
 */
class AppError extends Error {
    /**
     * Створює екземпляр AppError.
     * @param {string} message - Повідомлення про помилку, зрозуміле користувачу.
     * @param {number} statusCode - HTTP статус код (4xx для клієнтських, 5xx для серверних).
     */
    constructor(message, statusCode) {
        super(message); // Викликаємо конструктор батьківського класу Error

        if (typeof statusCode !== 'number' || statusCode < 100 || statusCode > 599) {
            console.error(`AppError: Invalid status code received: ${statusCode}. Defaulting to 500.`);
            this.statusCode = 500;
        } else {
            this.statusCode = statusCode;
        }

        // Визначаємо статус 'fail' (помилка клієнта) або 'error' (помилка сервера)
        this.status = `${this.statusCode}`.startsWith('4') ? 'fail' : 'error';
        // Позначаємо цю помилку як операційну (очікувану), а не програмну
        this.isOperational = true;

        // Захоплюємо стек викликів, виключаючи конструктор AppError
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;
// --- END OF FILE utils/AppError.js ---