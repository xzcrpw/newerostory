// controllers/authController.js
const User = require('../models/User');
const { validationResult } = require('express-validator');

// @desc    Реєстрація користувача
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { username, email, password } = req.body;
    
    // Перевірка, чи існує вже користувач з таким email
    let user = await User.findOne({ email });
    
    if (user) {
      return res.status(400).json({
        success: false,
        message: 'Користувач з такою електронною поштою вже існує'
      });
    }
    
    // Перевірка, чи існує вже користувач з таким username
    user = await User.findOne({ username });
    
    if (user) {
      return res.status(400).json({
        success: false,
        message: 'Користувач з таким іменем вже існує'
      });
    }
    
    // Створення нового користувача
    user = await User.create({
      username,
      email,
      password
    });
    
    // Генерація токена та відправка відповіді
    sendTokenResponse(user, 201, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при реєстрації користувача'
    });
  }
};

// @desc    Вхід користувача
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Валідація
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Будь ласка, вкажіть електронну пошту та пароль'
      });
    }
    
    // Пошук користувача і вибір пароля (за замовчуванням не вибирається)
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Невірні дані для входу'
      });
    }
    
    // Перевірка відповідності пароля
    const isMatch = await user.matchPassword(password);
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Невірні дані для входу'
      });
    }
    
    // Генерація токена та відправка відповіді
    sendTokenResponse(user, 200, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при вході користувача'
    });
  }
};

// @desc    Отримання поточного користувача
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при отриманні даних користувача'
    });
  }
};

// @desc    Вихід (очищення кукі)
// @route   GET /api/auth/logout
// @access  Private
exports.logout = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Вихід успішний',
    token: null
  });
};

// Функція для відправки токена в відповіді
const sendTokenResponse = (user, statusCode, res) => {
  // Генерація JWT
  const token = user.getSignedJwtToken();
  
  // Видалення пароля з відповіді
  user.password = undefined;
  
  res.status(statusCode).json({
    success: true,
    token,
    user
  });
};
