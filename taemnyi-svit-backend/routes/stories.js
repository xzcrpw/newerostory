// routes/stories.js
const express = require('express');
const { check } = require('express-validator');
const {
  getStories,
  getStory,
  createStory,
  updateStory,
  deleteStory,
  uploadStoryImage,
  rateStory,
  likeStory,
  saveStory
} = require('../controllers/storiesController');

const { protect, authorize, checkPremium } = require('../middleware/auth');

const router = express.Router();

// Базові маршрути для історій
router
  .route('/')
  .get(getStories)
  .post(
    protect,
    [
      check('title', 'Назва історії обов\'язкова').not().isEmpty(),
      check('title', 'Назва не може перевищувати 100 символів').isLength({ max: 100 }),
      check('content', 'Текст історії обов\'язковий').not().isEmpty(),
      check('category', 'Категорія обов\'язкова').not().isEmpty(),
      check('ageRestriction', 'Віковий рейтинг має бути 18+ або 21+').isIn(['18+', '21+']),
      check('isPremium', 'isPremium має бути true або false').optional().isBoolean(),
      check('isAnonymous', 'isAnonymous має бути true або false').optional().isBoolean()
    ],
    createStory
  );

// Маршрути для окремої історії
router
  .route('/:id')
  .get(getStory)
  .put(protect, updateStory)
  .delete(protect, deleteStory);

// Маршрут для завантаження зображення
router.route('/:id/image').put(protect, uploadStoryImage);

// Маршрут для оцінювання історії
router.route('/:id/rate').post(protect, rateStory);

// Маршрут для лайку історії
router.route('/:id/like').post(protect, likeStory);

// Маршрут для збереження історії
router.route('/:id/save').post(protect, saveStory);

module.exports = router;
