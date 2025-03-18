// controllers/commentsController.js
const Comment = require('../models/Comment');
const Story = require('../models/Story');
const { validationResult } = require('express-validator');

// @desc    Отримати коментарі до історії
// @route   GET /api/comments?story=:storyId
// @access  Public
exports.getComments = async (req, res) => {
    try {
        // Перевірка параметру story
        if (!req.query.story) {
            return res.status(400).json({
                success: false,
                message: 'Необхідно вказати ID історії'
            });
        }

        // Отримання коментарів верхнього рівня
        const comments = await Comment.find({
            story: req.query.story,
            parentComment: null
        })
            .sort('-createdAt')
            .populate({
                path: 'user',
                select: 'username avatar'
            })
            .populate({
                path: 'replies',
                populate: {
                    path: 'user',
                    select: 'username avatar'
                }
            });

        res.status(200).json({
            success: true,
            count: comments.length,
            data: comments
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера при отриманні коментарів'
        });
    }
};

// @desc    Створити коментар
// @route   POST /api/comments
// @access  Private
exports.createComment = async (req, res) => {
    try {
        // Валідація вхідних даних
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const { text, story, parentComment } = req.body;

        // Перевірка, чи існує історія
        const storyExists = await Story.findById(story);
        if (!storyExists) {
            return res.status(404).json({
                success: false,
                message: 'Історію не знайдено'
            });
        }

        // Перевірка, чи існує батьківський коментар (якщо вказано)
        if (parentComment) {
            const parentExists = await Comment.findById(parentComment);
            if (!parentExists) {
                return res.status(404).json({
                    success: false,
                    message: 'Батьківський коментар не знайдено'
                });
            }
        }

        // Створення коментаря
        const comment = await Comment.create({
            text,
            user: req.user.id,
            story,
            parentComment
        });

        // Отримання повних даних коментаря з інформацією про користувача
        const populatedComment = await Comment.findById(comment._id)
            .populate({
                path: 'user',
                select: 'username avatar'
            });

        res.status(201).json({
            success: true,
            data: populatedComment
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера при створенні коментаря'
        });
    }
};

// @desc    Оновити коментар
// @route   PUT /api/comments/:id
// @access  Private
exports.updateComment = async (req, res) => {
    try {
        const { text } = req.body;

        // Перевірка наявності тексту
        if (!text) {
            return res.status(400).json({
                success: false,
                message: 'Текст коментаря обов\'язковий'
            });
        }

        let comment = await Comment.findById(req.params.id);

        if (!comment) {
            return res.status(404).json({
                success: false,
                message: 'Коментар не знайдено'
            });
        }

        // Перевірка власності
        if (comment.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'У вас немає прав на редагування цього коментаря'
            });
        }

        // Оновлення коментаря
        comment.text = text;
        comment.isEdited = true;
        comment.updatedAt = Date.now();

        await comment.save();

        // Отримання повних даних коментаря з інформацією про користувача
        const updatedComment = await Comment.findById(comment._id)
            .populate({
                path: 'user',
                select: 'username avatar'
            });

        res.status(200).json({
            success: true,
            data: updatedComment
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера при оновленні коментаря'
        });
    }
};

// @desc    Видалити коментар
// @route   DELETE /api/comments/:id
// @access  Private
exports.deleteComment = async (req, res) => {
    try {
        const comment = await Comment.findById(req.params.id);

        if (!comment) {
            return res.status(404).json({
                success: false,
                message: 'Коментар не знайдено'
            });
        }

        // Перевірка власності
        if (comment.user.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'У вас немає прав на видалення цього коментаря'
            });
        }

        await comment.remove();

        res.status(200).json({
            success: true,
            data: {}
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера при видаленні коментаря'
        });
    }
};

// @desc    Лайк коментаря
// @route   POST /api/comments/:id/like
// @access  Private
exports.likeComment = async (req, res) => {
    try {
        const comment = await Comment.findById(req.params.id);

        if (!comment) {
            return res.status(404).json({
                success: false,
                message: 'Коментар не знайдено'
            });
        }

        // Перевірка, чи вже лайкнуто коментар
        const isLiked = comment.likes.includes(req.user.id);

        if (isLiked) {
            // Видалення лайку
            comment.likes = comment.likes.filter(id => id.toString() !== req.user.id);
        } else {
            // Додавання лайку
            comment.likes.push(req.user.id);
        }

        await comment.save();

        res.status(200).json({
            success: true,
            data: {
                likes: comment.likes.length,
                isLiked: !isLiked
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера при додаванні лайку'
        });
    }
};