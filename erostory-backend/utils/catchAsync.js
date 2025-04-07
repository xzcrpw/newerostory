// --- START OF FILE utils/catchAsync.js ---
// utils/catchAsync.js

/**
 * Обгортка для асинхронних функцій обробки маршрутів Express.
 * Автоматично ловить помилки та передає їх у next() для глобального обробника.
 * @param {Function} fn - Асинхронна функція (контролер) для обгортання.
 * @returns {Function} - Нова функція, яка обробляє маршрут.
 */
module.exports = fn => {
    return (req, res, next) => {
        // Викликаємо оригінальну функцію і ловимо будь-які помилки (rejected promises)
        fn(req, res, next).catch(err => next(err));
        // Якщо fn виконається успішно, promise зарезолвиться, і catch не спрацює.
        // Якщо fn викине помилку або поверне відхилений promise, catch передасть помилку в next().
    };
};
// --- END OF FILE utils/catchAsync.js ---