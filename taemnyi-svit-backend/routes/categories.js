// routes/categories.js
const express = require('express');
const { check } = require('express-validator');
const {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory
} = require('../controllers/categoriesController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router
    .route('/')
    .get(getCategories)
    .post(
        protect,
        authorize('admin'),
        [
          check('name', 'Назва категорії обов\'язкова').not().isEmpty(),
          check('name', 'Назва не може перевищувати 50 символів').isLength({ max: 50 }),
          check('description', 'Опис категорії обов\'язковий').not().isEmpty(),
          check('description', 'Опис не може перевищувати 500 символів').isLength({ max: 500 })
        ],
        createCategory
    );

router
    .route('/:id')
    .get(getCategory)
    .put(
        protect,
        authorize('admin'),
        updateCategory
    )
    .delete(
        protect,
        authorize('admin'),
        deleteCategory
    );

module.exports = router;