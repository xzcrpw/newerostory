// utils/jwt.js
const jwt = require('jsonwebtoken');
const { promisify } = require('util');

/**
 * Підписує JWT токен.
 * @param {string} id - ID користувача.
 * @returns {string} - Згенерований JWT токен.
 * @throws {Error} Якщо змінні середовища JWT_SECRET або JWT_EXPIRES_IN не встановлено.
 */
const signToken = (id) => {
    if (!process.env.JWT_SECRET || !process.env.JWT_EXPIRES_IN) {
        console.error('ПОМИЛКА JWT: JWT_SECRET або JWT_EXPIRES_IN не встановлено!'.red.bold);
        throw new Error('Помилка конфігурації сервера JWT.');
    }
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN,
    });
};

/**
 * Верифікує JWT токен.
 * @param {string} token - JWT токен для верифікації.
 * @returns {Promise<object>} - Проміс, що повертає декодовані дані токену.
 * @throws {Error} Якщо токен недійсний або сталася помилка верифікації.
 */
const verifyToken = async (token) => {
    if (!process.env.JWT_SECRET) {
        console.error('ПОМИЛКА JWT: JWT_SECRET не встановлено!'.red.bold);
        throw new Error('Помилка конфігурації сервера JWT.');
    }
    // Використовуємо promisify для асинхронної верифікації
    return promisify(jwt.verify)(token, process.env.JWT_SECRET);
};

module.exports = {
    signToken,
    verifyToken,
};