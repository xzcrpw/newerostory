// routes/comments.js
const express = require('express');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Контролери будуть додані пізніше

// Заглушки для маршрутів, які буде реалізовано пізніше
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Список коментарів буде доступний пізніше'
  });
});

router.post('/', protect, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Створення коментаря буде доступне пізніше'
  });
});

router.put('/:id', protect, (req, res) => {
  res.status(200).json({
    success: true,
    message: `Оновлення коментаря з ID: ${req.params.id} буде доступне пізніше`
  });
});

router.delete('/:id', protect, (req, res) => {
  res.status(200).json({
    success: true,
    message: `Видалення коментаря з ID: ${req.params.id} буде доступне пізніше`
  });
});

router.post('/:id/like', protect, (req, res) => {
  res.status(200).json({
    success: true,
    message: `Лайк коментаря з ID: ${req.params.id} буде доступний пізніше`
  });
});

module.exports = router;
