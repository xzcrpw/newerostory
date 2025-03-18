// controllers/usersController.js
const User = require('../models/User');
const Story = require('../models/Story');
const { validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');

// @desc    Отримати профіль користувача
// @route   GET /api/users/:id
// @access  Public
exports.getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-email');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Користувача не знайдено'
            });
        }

        // Отримання кількості історій користувача
        const storiesCount = await Story.countDocuments({
            author: user._id,
            status: 'published'
        });

        // Підготовка даних для відповіді
        const userProfile = {
            ...user.toObject(),
            storiesCount
        };

        res.status(200).json({
            success: true,
            data: userProfile
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера при отриманні профілю користувача'
        });
    }
};

// @desc    Оновити профіль користувача
// @route   PUT /api/users/:id
// @access  Private
exports.updateProfile = async (req, res) => {
    try {
        // Перевірка власності
        if (req.params.id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'У вас немає прав на редагування цього профілю'
            });
        }

        // Поля, які можна оновлювати
        const { username, bio } = req.body;

        // Створення об'єкту для оновлення
        const updateData = {};
        if (username) updateData.username = username;
        if (bio) updateData.bio = bio;

        // Оновлення профілю
        const user = await User.findByIdAndUpdate(req.params.id, updateData, {
            new: true,
            runValidators: true
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Користувача не знайдено'
            });
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (err) {
        console.error(err);

        // Помилка дублікату
        if (err.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Користувач з таким іменем вже існує'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Помилка сервера при оновленні профілю'
        });
    }
};

// @desc    Завантаження аватару користувача
// @route   PUT /api/users/:id/avatar
// @access  Private
exports.uploadAvatar = async (req, res) => {
    try {
        // Перевірка власності
        if (req.params.id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'У вас немає прав на редагування цього профілю'
            });
        }

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Користувача не знайдено'
            });
        }

        if (!req.files || !req.files.avatar) {
            return res.status(400).json({
                success: false,
                message: 'Будь ласка, завантажте файл'
            });
        }

        const file = req.files.avatar;

        // Перевірка, чи це зображення
        if (!file.mimetype.startsWith('image')) {
            return res.status(400).json({
                success: false,
                message: 'Будь ласка, завантажте зображення'
            });
        }

        // Перевірка розміру файлу
        if (file.size > process.env.MAX_FILE_SIZE) {
            return res.status(400).json({
                success: false,
                message: `Розмір файлу не може перевищувати ${process.env.MAX_FILE_SIZE} байт`
            });
        }

        // Створення кастомного імені файлу
        file.name = `avatar_${user._id}${path.parse(file.name).ext}`;

        // Якщо є поточний аватар і він не за замовчуванням, видаліть його
        if (user.avatar !== 'default-avatar.jpg') {
            const currentAvatarPath = path.join(__dirname, '../uploads/avatars', user.avatar);

            if (fs.existsSync(currentAvatarPath)) {
                fs.unlinkSync(currentAvatarPath);
            }
        }

        // Переміщення файлу
        file.mv(`${process.env.FILE_UPLOAD_PATH}/avatars/${file.name}`, async err => {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    success: false,
                    message: 'Проблема з завантаженням файлу'
                });
            }

            // Оновлення користувача з новим іменем файлу аватару
            await User.findByIdAndUpdate(req.params.id, { avatar: file.name });

            res.status(200).json({
                success: true,
                data: file.name
            });
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера при завантаженні аватару'
        });
    }
};

// @desc    Підписка на автора
// @route   POST /api/users/follow/:id
// @access  Private
exports.followAuthor = async (req, res) => {
    try {
        // Перевірка, чи не підписуєтесь на себе
        if (req.params.id === req.user.id) {
            return res.status(400).json({
                success: false,
                message: 'Ви не можете підписатися на себе'
            });
        }

        // Перевірка, чи існує автор
        const author = await User.findById(req.params.id);
        if (!author) {
            return res.status(404).json({
                success: false,
                message: 'Автора не знайдено'
            });
        }

        // Отримання поточного користувача
        const user = await User.findById(req.user.id);

        // Перевірка, чи вже підписані
        const isFollowing = user.followingAuthors.includes(req.params.id);

        if (isFollowing) {
            return res.status(400).json({
                success: false,
                message: 'Ви вже підписані на цього автора'
            });
        }

        // Додавання автора до підписок
        user.followingAuthors.push(req.params.id);
        await user.save();

        res.status(200).json({
            success: true,
            data: {
                following: true
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера при підписці на автора'
        });
    }
};

// @desc    Відписка від автора
// @route   POST /api/users/unfollow/:id
// @access  Private
exports.unfollowAuthor = async (req, res) => {
    try {
        // Перевірка, чи існує автор
        const author = await User.findById(req.params.id);
        if (!author) {
            return res.status(404).json({
                success: false,
                message: 'Автора не знайдено'
            });
        }

        // Отримання поточного користувача
        const user = await User.findById(req.user.id);

        // Перевірка, чи підписані
        const isFollowing = user.followingAuthors.includes(req.params.id);

        if (!isFollowing) {
            return res.status(400).json({
                success: false,
                message: 'Ви не підписані на цього автора'
            });
        }

        // Видалення автора з підписок
        user.followingAuthors = user.followingAuthors.filter(
            id => id.toString() !== req.params.id
        );

        await user.save();

        res.status(200).json({
            success: true,
            data: {
                following: false
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера при відписці від автора'
        });
    }
};
// @desc    Отримати збережені історії
// @route   GET /api/users/saved-stories
// @access  Private
exports.getSavedStories = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate({
            path: 'savedStories',
            select: 'title content image author category createdAt',
            populate: [
                {
                    path: 'author',
                    select: 'username avatar'
                },
                {
                    path: 'category',
                    select: 'name slug'
                }
            ]
        });

        res.status(200).json({
            success: true,
            count: user.savedStories.length,
            data: user.savedStories
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера при отриманні збережених історій'
        });
    }
};

// @desc    Отримати вподобані історії
// @route   GET /api/users/liked-stories
// @access  Private
exports.getLikedStories = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate({
            path: 'likedStories',
            select: 'title content image author category createdAt',
            populate: [
                {
                    path: 'author',
                    select: 'username avatar'
                },
                {
                    path: 'category',
                    select: 'name slug'
                }
            ]
        });

        res.status(200).json({
            success: true,
            count: user.likedStories.length,
            data: user.likedStories
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера при отриманні вподобаних історій'
        });
    }
};

// @desc    Отримати список підписок
// @route   GET /api/users/following
// @access  Private
exports.getFollowing = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate({
            path: 'followingAuthors',
            select: 'username avatar bio'
        });

        res.status(200).json({
            success: true,
            count: user.followingAuthors.length,
            data: user.followingAuthors
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера при отриманні підписок'
        });
    }
};

// @desc    Отримати коментарі користувача
// @route   GET /api/users/comments
// @access  Private
exports.getUserComments = async (req, res) => {
    try {
        const comments = await Comment.find({ user: req.user.id })
            .sort('-createdAt')
            .populate({
                path: 'story',
                select: 'title'
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
            message: 'Помилка сервера при отриманні коментарів користувача'
        });
    }
};

// @desc    Оновити налаштування преміум-підписки
// @route   PUT /api/users/premium
// @access  Private
exports.updatePremium = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        // Оновлення преміум-статусу
        user.isPremium = true;

        // Встановлення дати закінчення преміум-підписки (наприклад, +30 днів для місячної підписки)
        const premiumDuration = req.body.duration || 30; // в днях
        user.premiumUntil = new Date(Date.now() + premiumDuration * 24 * 60 * 60 * 1000);

        await user.save();

        res.status(200).json({
            success: true,
            data: {
                isPremium: user.isPremium,
                premiumUntil: user.premiumUntil
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера при оновленні преміум-статусу'
        });
    }
};

// @desc    Скасувати преміум-підписку
// @route   PUT /api/users/premium/cancel
// @access  Private
exports.cancelPremium = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        // Підписка залишається активною до кінця оплаченого періоду
        // Автоматичне продовження не відбудеться

        res.status(200).json({
            success: true,
            message: 'Автоматичне продовження підписки скасовано. Підписка діятиме до кінця оплаченого періоду.',
            data: {
                isPremium: user.isPremium,
                premiumUntil: user.premiumUntil
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Помилка сервера при скасуванні преміум-підписки'
        });
    }
};