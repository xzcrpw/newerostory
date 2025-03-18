// routes/auth.js
const express = require('express');
const { check } = require('express-validator');
const {
  register,
  login,
  getMe,
  logout
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Маршрут для реєстрації
router.post(
  '/register',
  [
    check('username', 'Ім\'я користувача обов\'язкове').not().isEmpty(),
    check('username', 'Ім\'я користувача не може перевищувати 50 символів').isLength({ max: 50 }),
    check('email', 'Будь ласка, вкажіть правильну електронну пошту').isEmail(),
    check('password', 'Пароль повинен бути не менше 6 символів').isLength({ min: 6 })
  ],
  register
);

// Маршрут для входу
router.post('/login', login);

// Маршрут для отримання поточного користувача
router.get('/me', protect, getMe);

// Маршрут для виходу
router.get('/logout', protect, logout);

module.exports = router;
