// middleware/auth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware для захисту маршрутів
exports.protect = async (req, res, next) => {
  let token;
  
  // Перевіряємо наявність токена в заголовку Authorization
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    // Витягуємо токен з заголовка
    token = req.headers.authorization.split(' ')[1];
  }
  
  // Перевіряємо наявність токена
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Доступ заборонено: необхідна авторизація'
    });
  }
  
  try {
    // Верифікація токена
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Отримання користувача по ID з токена
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Користувача з цим токеном не знайдено'
      });
    }
    
    // Додаємо користувача до об'єкту запиту
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Доступ заборонено: недійсний токен'
    });
  }
};

// Middleware для перевірки ролей користувача
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Роль користувача '${req.user.role}' не має прав для доступу до цього ресурсу`
      });
    }
    next();
  };
};

// Middleware для перевірки преміум статусу
exports.checkPremium = (req, res, next) => {
  if (!req.user.isPremium) {
    return res.status(403).json({
      success: false,
      message: 'Цей контент доступний тільки для преміум-користувачів'
    });
  }
  next();
};
