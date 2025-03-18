// routes/users.js
const express = require('express');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Контролери будуть додані пізніше

// Заглушки для маршрутів, які буде реалізовано пізніше
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Список користувачів буде доступний пізніше'
  });
});

router.get('/:id', (req, res) => {
  res.status(200).json({
    success: true,
    message: `Інформація про користувача з ID: ${req.params.id} буде доступна пізніше`
  });
});

router.put('/:id', protect, (req, res) => {
  res.status(200).json({
    success: true,
    message: `Оновлення користувача з ID: ${req.params.id} буде доступне пізніше`
  });
});

router.delete('/:id', protect, authorize('admin'), (req, res) => {
  res.status(200).json({
    success: true,
    message: `Видалення користувача з ID: ${req.params.id} буде доступне пізніше`
  });
});

module.exports = router;
