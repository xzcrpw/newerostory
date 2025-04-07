// --- START OF FILE controllers/ratingController.js ---
const mongoose = require('mongoose');
const Rating = require('../models/Rating');
const Story = require('../models/Story');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
require('colors'); // Для логування

// Контролер для встановлення/оновлення/видалення оцінки історії
exports.rateStory = catchAsync(async (req, res, next) => {
    const storyId = req.params.storyId;
    const userId = req.user._id;
    const { rating } = req.body; // Оцінка з тіла (0-5)

    // Валідація вхідних даних (вже є в middleware, але базова перевірка тут)
    if (!mongoose.Types.ObjectId.isValid(storyId)) {
        return next(new AppError('Некоректний ID історії.', 400));
    }
    const ratingValue = Number(rating);
    if (isNaN(ratingValue) || ratingValue < 0 || ratingValue > 5 || !Number.isInteger(ratingValue)) {
        return next(new AppError('Рейтинг має бути цілим числом від 0 до 5.', 400));
    }

    // 1. Перевірка існування опублікованої історії
    const storyExists = await Story.exists({ _id: storyId, status: 'published' });
    if (!storyExists) {
        return next(new AppError('Історію не знайдено або вона не опублікована.', 404));
    }

    // 2. Оновлення або видалення оцінки
    const filter = { user: userId, targetId: storyId, targetModel: 'Story' };
    let operationResult;
    let successMessage;
    const i18n = req.i18n || { t: (key, fallback) => fallback || key }; // Базовий fallback для i18n

    if (ratingValue === 0) {
        // Видаляємо оцінку
        operationResult = await Rating.findOneAndDelete(filter);
        successMessage = i18n.t('notifications.ratingRemoved', 'Вашу оцінку скасовано.');
        if (operationResult) {
            console.log(`Оцінку для історії ${storyId} від користувача ${userId} видалено.`.yellow);
            // Хук post('findOneAndDelete') подбає про оновлення середнього рейтингу
        } else {
            console.log(`Спроба видалити неіснуючу оцінку для історії ${storyId} від користувача ${userId}.`);
            // Не повертаємо помилку, просто повідомляємо про успіх скасування
        }

    } else {
        // Оновлюємо або створюємо оцінку
        operationResult = await Rating.findOneAndUpdate(
            filter,
            { value: ratingValue },
            { upsert: true, new: true, runValidators: true }
        );
        const starsSuffix = i18n.t('story.starsSuffix', 'зірок!');
        successMessage = i18n.t('notifications.ratingThanks', `Дякуємо за вашу оцінку: ${ratingValue} ${starsSuffix}`, { rating: ratingValue });
        console.log(`Оцінку ${ratingValue} для історії ${storyId} встановлено/оновлено користувачем ${userId}.`.green);
        // Хук post('save') подбає про оновлення середнього рейтингу
    }

    // 3. Отримуємо оновлені дані рейтингу історії (після спрацювання хуків)
    // Невелике очікування може бути корисним, якщо хуки асинхронні і не блокують
    // await new Promise(resolve => setTimeout(resolve, 100)); // Затримка 100ms

    const updatedStory = await Story.findById(storyId).select('averageRating totalRatings').lean();

    // 4. Відправляємо відповідь
    res.status(200).json({
        status: 'success',
        message: successMessage,
        data: {
            averageRating: updatedStory?.averageRating ?? 0,
            totalRatings: updatedStory?.totalRatings ?? 0,
            userRating: ratingValue // Повертаємо встановлену користувачем оцінку (0, якщо видалено)
        }
    });
});
// --- END OF FILE controllers/ratingController.js ---