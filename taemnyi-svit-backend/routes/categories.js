// routes/categories.js
const express = require('express');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Контролери будуть додані пізніше

// Заглушки для маршрутів, які буде реалізовано пізніше
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Список категорій буде доступний пізніше'
  });
});

router.get('/:id', (req, res) => {
  res.status(200).json({
    success: true,
    message: `Інформація про категорію з ID: ${req.params.id} буде доступна пізніше`
  });
});

router.post('/', protect, authorize('admin'), (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Створення категорії буде доступне пізніше'
  });
});

router.put('/:id', protect, authorize('admin'), (req, res) => {
  res.status(200).json({
    success: true,
    message: `Оновлення категорії з ID: ${req.params.id} буде доступне пізніше`
  });
});

router.delete('/:id', protect, authorize('admin'), (req, res) => {
  res.status(200).json({
    success: true,
    message: `Видалення категорії з ID: ${req.params.id} буде доступне пізніше`
  });
});

module.exports = router;
