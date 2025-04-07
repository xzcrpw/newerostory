// --- START OF FILE controllers/likeController.js ---
const mongoose = require('mongoose');
const Like = require('../models/Like');
const Story = require('../models/Story');
const Comment = require('../models/Comment');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
require('colors'); // Для логування

// Універсальний контролер для додавання/видалення лайка
exports.toggleLike = catchAsync(async (req, res, next) => {
    const { targetId, targetModel } = req.body; // Отримуємо ID і тип з тіла
    const userId = req.user._id; // ID поточного авторизованого користувача

    // Валідація вхідних даних (вже є в middleware)
    if (!targetId || !targetModel || !['Story', 'Comment'].includes(targetModel) || !mongoose.Types.ObjectId.isValid(targetId)) {
        return next(new AppError('Некоректні дані для лайка (targetId, targetModel: Story|Comment).', 400));
    }

    // 1. Визначаємо модель цільового об'єкта
    let TargetModel;
    if (targetModel === 'Story') TargetModel = Story;
    else if (targetModel === 'Comment') TargetModel = Comment;
    else return next(new AppError(`Непідтримуваний тип об'єкта: ${targetModel}`, 400)); // Малоймовірно

    // 2. Перевірка існування цільового об'єкта
    const targetExists = await TargetModel.exists({ _id: targetId });
    if (!targetExists) {
        return next(new AppError(`${targetModel === 'Story' ? 'Історію' : 'Коментар'} не знайдено.`, 404));
    }

    // 3. Умови пошуку/видалення/створення лайка
    const likeConditions = { user: userId, targetId: targetId, targetModel: targetModel };
    let liked = false;
    let updatedLikesCount = 0;

    // 4. Атомарна спроба видалити або створити лайк
    try {
        // Спробуємо видалити існуючий лайк
        const deletedLike = await Like.findOneAndDelete(likeConditions);

        if (deletedLike) {
            // Лайк було видалено (unliked)
            liked = false;
            console.log(`Лайк для ${targetModel} ${targetId} видалено користувачем ${userId}`.yellow);
            // Хук post('findOneAndDelete') в Like.js оновить лічильник
        } else {
            // Лайка не існувало, створюємо новий
            await Like.create(likeConditions);
            liked = true;
            console.log(`Лайк для ${targetModel} ${targetId} додано користувачем ${userId}`.green);
            // Хук post('save') в Like.js оновить лічильник
        }

        // 5. Отримуємо ОСТАТОЧНИЙ лічильник лайків після спрацювання хуків
        // Робимо невелику паузу, щоб дати хукам час спрацювати (хоча це не ідеально)
        // Краще, якщо хуки гарантують оновлення до повернення відповіді.
        // Або можна не чекати і покладатися на те, що фронтенд оновить UI оптимістично.
        // await new Promise(resolve => setTimeout(resolve, 50)); // Видаляємо затримку

        const updatedTarget = await TargetModel.findById(targetId).select('likes').lean();
        updatedLikesCount = updatedTarget?.likes ?? 0; // Використовуємо ?? для дефолтного 0

    } catch (error) {
        // Обробка можливої помилки унікального індексу при одночасному запиті
        if (error.code === 11000 || error.code === 11001) {
            console.warn(`Конфлікт (duplicate key) при лайку ${targetModel} ${targetId} користувачем ${userId}.`.yellow);
            // Ймовірно, запит був надісланий двічі. Повернемо поточний стан.
            const [currentLike, currentTarget] = await Promise.all([
                Like.exists(likeConditions),
                TargetModel.findById(targetId).select('likes').lean()
            ]);
            return res.status(200).json({
                status: 'success',
                message: 'Статус лайка вже оновлено.', // Повідомлення про конфлікт
                data: {
                    liked: !!currentLike,
                    likes: currentTarget?.likes ?? 0
                }
            });
        }
        // Інші помилки бази даних або логіки
        console.error(`Помилка при додаванні/видаленні лайка для ${targetModel} ${targetId}:`.red.bold, error);
        return next(new AppError('Не вдалося змінити статус лайка.', 500));
    }

    // 6. Відправляємо успішну відповідь
    res.status(200).json({
        status: 'success',
        data: {
            liked: liked, // Новий стан лайка
            likes: updatedLikesCount // Оновлена кількість лайків
        }
    });
});
// --- END OF FILE controllers/likeController.js ---