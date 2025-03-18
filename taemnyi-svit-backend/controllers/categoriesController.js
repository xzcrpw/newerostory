// controllers/categoriesController.js
const Category = require('../models/Category');
const { validationResult } = require('express-validator');

// @desc    Отримати всі категорії
// @route   GET /api/categories
// @access  Public
exports.getCategories = async (req, res) => {
    try {
        const categories = await Category.find();

        res.status(200).json({
            success: true,
            count: categories.length,
            data: categories
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера при отриманні категорій'
        });
    }
};

// @desc    Отримати одну категорію
// @route   GET /api/categories/:id
// @access  Public
exports.getCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id).populate({
            path: 'stories',
            match: { status: 'published' }, // Тільки опубліковані історії
            options: { sort: { createdAt: -1 } } // Сортування за датою
        });

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Категорію не знайдено'
            });
        }

        res.status(200).json({
            success: true,
            data: category
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера при отриманні категорії'
        });
    }
};

// @desc    Створити категорію
// @route   POST /api/categories
// @access  Private (Admin)
exports.createCategory = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const category = await Category.create(req.body);

        res.status(201).json({
            success: true,
            data: category
        });
    } catch (err) {
        console.error(err);

        // Помилка дублікату
        if (err.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Категорія з такою назвою вже існує'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Помилка сервера при створенні категорії'
        });
    }
};

// @desc    Оновити категорію
// @route   PUT /api/categories/:id
// @access  Private (Admin)
exports.updateCategory = async (req, res) => {
    try {
        let category = await Category.findById(req.params.id);

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Категорію не знайдено'
            });
        }

        category = await Category.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({
            success: true,
            data: category
        });
    } catch (err) {
        console.error(err);

        // Помилка дублікату
        if (err.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Категорія з такою назвою вже існує'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Помилка сервера при оновленні категорії'
        });
    }
};

// @desc    Видалити категорію
// @route   DELETE /api/categories/:id
// @access  Private (Admin)
exports.deleteCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Категорію не знайдено'
            });
        }

        await category.remove();

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера при видаленні категорії'
        });
    }
};