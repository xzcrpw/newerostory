// --- START OF FILE controllers/userController.js ---
const mongoose = require('mongoose');
const User = require('../models/User');
const Story = require('../models/Story');
const Like = require('../models/Like');
const Rating = require('../models/Rating');
const Comment = require('../models/Comment');
const Category = require('../models/Category'); // Може знадобитися для підписок/обраного
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const APIFeatures = require('../utils/apiFeatures');
const { createSendToken } = require('./authController'); // Імпортуємо для оновлення паролю
const getLocalizedData = require('../utils/getLocalizedData');
const { deleteFromGCS } = require('../utils/gcsUtils'); // Імпортуємо функцію видалення
require('colors'); // Для логування

// Middleware для встановлення ID поточного користувача в параметри :id
exports.getMe = (req, res, next) => {
    if (!req.user || !req.user._id) {
        return next(new AppError('Користувач не автентифікований.', 401));
    }
    req.params.id = req.user._id.toString();
    next();
};

// Допоміжна функція для фільтрації полів об'єкта
const filterObj = (obj, ...allowedFields) => {
    const newObj = {};
    Object.keys(obj || {}).forEach(el => { // Додано перевірку obj
        if (allowedFields.includes(el) && obj[el] !== undefined) {
            // Додаткова перевірка типів для безпеки
            if (el === 'isActive' || el === 'isPremium') {
                if (typeof obj[el] === 'boolean') newObj[el] = obj[el];
            } else if (el === 'premiumEndDate') {
                // Дозволяємо null або валідну дату
                if (obj[el] === null || !isNaN(new Date(obj[el]).getTime())) {
                    newObj[el] = obj[el] ? new Date(obj[el]) : null;
                }
            } else if (el === 'role') {
                // Валідація ролі вже є в middleware, але для надійності
                if (['user', 'author', 'moderator', 'admin'].includes(obj[el])) {
                    newObj[el] = obj[el];
                }
            } else {
                newObj[el] = obj[el]; // Інші поля (name, bio)
            }
        }
    });
    return newObj;
};

// --- Контролери для Адміністратора ---

exports.getAllUsers = catchAsync(async (req, res, next) => {
    const filter = {};
    const allowedRoles = ['user', 'author', 'moderator', 'admin'];
    const allowedStatuses = ['true', 'false'];

    // Фільтрація
    if (req.query.role && allowedRoles.includes(req.query.role)) {
        filter.role = req.query.role;
    }
    if (req.query.isActive !== undefined && allowedStatuses.includes(String(req.query.isActive))) {
        filter.isActive = String(req.query.isActive) === 'true';
    }
    if (req.query.isPremium !== undefined && allowedStatuses.includes(String(req.query.isPremium))) {
        filter.isPremium = String(req.query.isPremium) === 'true';
    }
    if (req.query.search) {
        const searchRegex = new RegExp(req.query.search.trim(), 'i');
        filter.$or = [ { name: searchRegex }, { email: searchRegex } ];
    }

    const features = new APIFeatures(
        // Виключаємо пароль та інші чутливі поля
        User.find(filter).select('-passwordHash -passwordResetToken -passwordResetExpires -passwordChangedAt'),
        req.query
    )
        // .filter() // Фільтр вже застосовано вище
        .sort(req.query.sort || '-createdAt') // Сортування
        .limitFields() // Виключає __v за замовчуванням
        .paginate(20); // Пагінація

    const users = await features.query.lean(); // .lean() для продуктивності
    // Рахуємо загальну кількість з урахуванням фільтрів
    const totalDocuments = await User.countDocuments(filter); // Використовуємо filter, що збудували вище

    res.status(200).json({
        status: 'success',
        results: users.length,
        data: users,
        pagination: {
            currentPage: features.pagination.currentPage,
            limit: features.pagination.limit,
            totalPages: Math.ceil(totalDocuments / features.pagination.limit),
            totalResults: totalDocuments
        }
    });
});

exports.getUser = catchAsync(async (req, res, next) => {
    const userId = req.params.id;
    const requestingUser = req.user; // Користувач, що робить запит
    const isMeRequest = requestingUser && userId === requestingUser._id.toString();

    // Виключаємо чутливі поля
    let selectFields = '-__v -passwordHash -passwordResetToken -passwordResetExpires -passwordChangedAt';
    // Додатково виключаємо приватні поля, якщо це не запит /me і не адмін/модератор
    if (!isMeRequest && requestingUser?.role !== 'admin' && requestingUser?.role !== 'moderator') {
        selectFields += ' -email -telegramUserId -categorySubscriptions -favoriteCategories -bookmarks';
    }

    // Шукаємо користувача, включаючи неактивних (перевірка доступу нижче)
    const user = await User.findById(userId).select(selectFields).setOptions({ includeInactive: true }).lean();

    if (!user) {
        return next(new AppError('Користувача з таким ID не знайдено.', 404));
    }

    // Перевірка доступу до неактивного профілю
    if (!user.isActive && !isMeRequest && requestingUser?.role !== 'admin' && requestingUser?.role !== 'moderator') {
        // Повертаємо 404, щоб не розкривати існування неактивного користувача
        return next(new AppError('Користувача не знайдено.', 404));
    }

    res.status(200).json({ status: 'success', data: user });
});


exports.updateUser = catchAsync(async (req, res, next) => {
    const userIdToUpdate = req.params.id;

    // Дозволені поля для оновлення адміном
    const allowedFields = ['role', 'isActive', 'isPremium', 'premiumEndDate'];
    const filteredBody = filterObj(req.body, ...allowedFields);

    // Заборона зміни ролі на 'admin', якщо це не сам адмін найвищого рівня (опціонально)
    // Або просто заборонити змінювати роль на admin цим маршрутом
    if (filteredBody.role === 'admin' && req.user.role !== 'admin') { // Дозволяємо тільки адмінам
        console.warn(`Спроба користувача ${req.user.email} призначити роль admin користувачу ${userIdToUpdate}`.yellow);
        return next(new AppError('Недостатньо прав для призначення ролі адміністратора.', 403));
    }
    // Заборона змінювати власну роль або статус isActive
    if (req.user._id.toString() === userIdToUpdate && (filteredBody.role || filteredBody.isActive !== undefined)) {
        return next(new AppError('Ви не можете змінити власну роль або статус активності цим маршрутом.', 400));
    }


    // Оновлюємо користувача
    // Використовуємо { new: true, runValidators: true }
    const user = await User.findByIdAndUpdate(userIdToUpdate, filteredBody, {
        new: true, // Повернути оновлений документ
        runValidators: true, // Запустити валідацію моделі
        context: 'query' // Важливо для деяких валідаторів
    }).select('-__v -passwordHash -passwordResetToken -passwordResetExpires -passwordChangedAt'); // Виключаємо чутливі поля

    if (!user) {
        return next(new AppError('Користувача з таким ID не знайдено.', 404));
    }

    console.log(`Дані користувача ${user.email} (ID: ${userIdToUpdate}) оновлено адміністратором ${req.user.name}`.cyan);
    res.status(200).json({ status: 'success', data: user });
});

exports.deleteUser = catchAsync(async (req, res, next) => {
    const userIdToDelete = req.params.id;

    if (req.user._id.toString() === userIdToDelete) {
        return next(new AppError('Ви не можете деактивувати власний обліковий запис.', 400));
    }

    // Використовуємо findByIdAndUpdate для м'якого видалення (деактивації)
    const userToDeactivate = await User.findByIdAndUpdate(
        userIdToDelete,
        { isActive: false },
        { new: true, runValidators: false } // Не повертати (new: false), валідація не потрібна
    );

    if (!userToDeactivate) {
        // Якщо користувача не знайдено, можливо він вже неактивний або видалений
        return next(new AppError('Користувача з таким ID не знайдено або він вже неактивний.', 404));
    }

    // Якщо користувач вже був неактивний, findByIdAndUpdate поверне null (якщо new: false)
    // або документ без змін (якщо new: true). Краще перевіряти перед оновленням:
    // const user = await User.findById(userIdToDelete);
    // if (!user) return next(new AppError('Користувача не знайдено', 404));
    // if (!user.isActive) return res.status(200).json({ status: 'success', message: 'Користувач вже неактивний.' });
    // user.isActive = false; await user.save({ validateBeforeSave: false });

    console.log(`Користувач ${userToDeactivate.email} (ID: ${userIdToDelete}) деактивований адміністратором ${req.user.name}`.yellow);

    // TODO: Додати логіку обробки контенту деактивованого користувача в хуках моделі User.

    res.status(204).json({ status: 'success', data: null }); // 204 No Content
});


// --- Контролери для Поточного Користувача (/me) ---

exports.updateMe = catchAsync(async (req, res, next) => {
    // 1. Забороняємо оновлення пароля цим маршрутом
    if (req.body.password || req.body.confirmPassword) {
        return next(new AppError('Цей маршрут не для оновлення пароля. Використовуйте /updateMyPassword.', 400));
    }

    // 2. Фільтруємо дозволені поля (name, bio)
    const filteredBody = filterObj(req.body, 'name', 'bio');
    const oldAvatarUrl = req.user.avatarUrl; // Зберігаємо старий URL для можливого видалення

    // 3. Обробка аватара (URL встановлено в req.body.imageUrl middleware handleAvatarUrl)
    // `req.body.imageUrl` буде або новим URL з GCS, або null (якщо видалено), або undefined (якщо не змінювалось)
    if (req.body.imageUrl !== undefined) {
        filteredBody.avatarUrl = req.body.imageUrl; // Встановлюємо новий URL або null
    }

    // 4. Оновлюємо дані користувача
    const updatedUser = await User.findByIdAndUpdate(req.user._id, filteredBody, {
        new: true, // Повернути оновлений документ
        runValidators: true // Запустити валідацію (напр., довжина bio)
    }).select('-__v -passwordHash -passwordResetToken -passwordResetExpires -passwordChangedAt'); // Виключаємо чутливі поля

    if (!updatedUser) {
        // Малоймовірно, якщо користувач автентифікований, але для надійності
        return next(new AppError('Не вдалося знайти користувача для оновлення.', 404));
    }

    // 5. Видаляємо старий аватар з GCS, якщо він був і змінився
    if (oldAvatarUrl && updatedUser.avatarUrl !== oldAvatarUrl) {
        console.log(`[updateMe] Видалення старого аватара: ${oldAvatarUrl}`.yellow);
        deleteFromGCS(oldAvatarUrl).catch(err => {
            console.error(`[updateMe] Помилка видалення старого аватара ${oldAvatarUrl} з GCS:`, err);
            // Не перериваємо відповідь користувачу через помилку видалення старого файлу
        });
    }

    console.log(`Профіль користувача ${updatedUser.email} оновлено`.cyan);
    res.status(200).json({
        status: 'success',
        data: updatedUser,
    });
});

exports.updatePassword = catchAsync(async (req, res, next) => {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    // Перевірки (мінімальна довжина, співпадіння) вже є в validationMiddleware
    if (!currentPassword || !newPassword || !confirmNewPassword || newPassword !== confirmNewPassword) {
        return next(new AppError('Будь ласка, заповніть усі поля. Новий пароль та підтвердження мають співпадати (мін. 8 символів).', 400));
    }

    // 1. Отримуємо користувача з БД, ВИБИРАЮЧИ хеш пароля
    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user) return next(new AppError('Користувача не знайдено.', 401)); // Малоймовірно

    // 2. Перевіряємо поточний пароль
    if (!(await user.comparePassword(currentPassword))) {
        return next(new AppError('Ваш поточний пароль невірний.', 401));
    }

    // Перевіряємо, чи новий пароль не співпадає зі старим (додаткова перевірка)
    if (await user.comparePassword(newPassword)) {
        return next(new AppError('Новий пароль не повинен співпадати з поточним.', 400));
    }

    // 3. Оновлюємо пароль
    user.passwordHash = newPassword;
    // `passwordChangedAt` оновиться автоматично в pre-save hook

    // 4. Зберігаємо користувача (запускає хуки)
    await user.save();

    // 5. Видаємо новий JWT токен (важливо після зміни пароля)
    console.log(`Пароль користувача ${user.email} успішно змінено`.green);
    createSendToken(user, 200, res);
});

// --- Закладки ---
exports.toggleBookmark = catchAsync(async (req, res, next) => {
    const storyId = req.params.storyId;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(storyId)) {
        return next(new AppError('Некоректний ID історії.', 400));
    }

    // 1. Перевіряємо існування історії (тільки опубліковані)
    const storyExists = await Story.exists({ _id: storyId, status: 'published' });
    if (!storyExists) {
        return next(new AppError('Історію не знайдено або вона не опублікована.', 404));
    }

    // 2. Оновлюємо масив закладок користувача та лічильник в історії атомарно
    const user = await User.findById(userId).select('bookmarks'); // Отримуємо поточні закладки
    if (!user) return next(new AppError('Користувача не знайдено.', 404)); // Малоймовірно

    const isBookmarked = user.bookmarks.some(id => id.equals(storyId));
    const updateOperation = isBookmarked ? '$pull' : '$addToSet'; // $addToSet запобігає дублюванню
    const counterUpdate = isBookmarked ? -1 : 1;

    const session = await mongoose.startSession(); // Використовуємо транзакцію для атомарності
    session.startTransaction();
    try {
        await User.updateOne({ _id: userId }, { [updateOperation]: { bookmarks: storyId } }, { session });
        await Story.updateOne({ _id: storyId }, { $inc: { bookmarks: counterUpdate } }, { session });

        await session.commitTransaction();
        console.log(`Закладка для історії ${storyId} ${isBookmarked ? 'видалена' : 'додана'} користувачем ${userId}`.magenta);

        res.status(200).json({
            status: 'success',
            message: isBookmarked ? 'Історію видалено з закладок.' : 'Історію додано до закладок.', // Потрібно додати i18n
            data: { bookmarked: !isBookmarked },
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Помилка зміни статусу закладки:', error);
        return next(new AppError('Не вдалося змінити статус закладки.', 500));
    } finally {
        session.endSession();
    }
});

exports.getBookmarks = catchAsync(async (req, res, next) => {
    const userId = req.user._id;
    const lang = req.query.lang || 'uk';
    const limit = Number(req.query.limit) || 12;
    const page = Math.max(1, Number(req.query.page) || 1);
    const skip = (page - 1) * limit;

    // Отримуємо тільки ID історій з закладок
    const user = await User.findById(userId).select('bookmarks').lean();
    const bookmarkedStoryIds = user?.bookmarks || [];

    if (bookmarkedStoryIds.length === 0) {
        return res.status(200).json({ status: 'success', results: 0, data: [], pagination: { currentPage: 1, totalPages: 0, totalResults: 0, limit } });
    }

    // Формуємо запит для отримання історій з пагінацією та сортуванням
    const storiesQuery = Story.find({
        _id: { $in: bookmarkedStoryIds },
        status: 'published' // Показуємо тільки опубліковані
    })
        .sort('-createdAt') // Сортуємо за датою додавання в закладки? Ні, краще за датою створення історії
        .skip(skip)
        .limit(limit)
        .select('title slug author category imageUrl isPremium ageRating averageRating readingTime views createdAt tags content') // Додаємо content для excerpt
        .populate('author', 'name avatarUrl') // Додаємо populate для автора
        .populate('category', 'name slug') // Додаємо populate для категорії
        .lean();

    // Рахуємо загальну кількість опублікованих історій в закладках
    const totalQuery = Story.countDocuments({ _id: { $in: bookmarkedStoryIds }, status: 'published' });

    const [stories, totalResults] = await Promise.all([storiesQuery, totalQuery]);

    // Використовуємо універсальну функцію підготовки відповіді (якщо вона є)
    // Або обробляємо тут
    const localizedStories = await getLocalizedData(stories, lang, 'uk', 'Story', ['title']);
    const finalBookmarks = localizedStories.map(story => {
        const excerpt = (story.content && typeof story.content === 'string')
            ? story.content.replace(/<[^>]*>?/gm, '').substring(0, 150) + '...'
            : '';
        delete story.content; // Видаляємо повний контент
        return { ...story, excerpt };
    });


    res.status(200).json({
        status: 'success',
        results: finalBookmarks.length,
        data: finalBookmarks,
        pagination: {
            currentPage: page,
            totalPages: Math.ceil(totalResults / limit),
            totalResults: totalResults,
            limit: limit,
        }
    });
});

// --- Підписки на авторів ---
exports.toggleFollow = catchAsync(async (req, res, next) => {
    const authorId = req.params.authorId;
    const userId = req.user._id;

    if (userId.toString() === authorId) {
        return next(new AppError('Ви не можете стежити за собою.', 400));
    }
    if (!mongoose.Types.ObjectId.isValid(authorId)) {
        return next(new AppError('Некоректний ID автора.', 400));
    }

    // Перевіряємо, чи існує та активний автор
    const author = await User.findOne({ _id: authorId, isActive: true }).select('_id'); // Перевіряємо тільки існування
    if (!author) {
        return next(new AppError('Автора не знайдено або він неактивний.', 404));
    }

    const currentUser = await User.findById(userId).select('following'); // Отримуємо поточні підписки
    if (!currentUser) return next(new AppError('Помилка отримання даних користувача.', 404)); // Малоймовірно

    const isFollowing = currentUser.following.some(id => id.equals(authorId));
    const updateOperation = isFollowing ? '$pull' : '$addToSet';

    // Використовуємо транзакцію для атомарності
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        // Оновлюємо підписки поточного користувача
        await User.updateOne({ _id: userId }, { [updateOperation]: { following: authorId } }, { session });
        // Оновлюємо лічильник підписників у автора
        await User.updateOne({ _id: authorId }, { $inc: { 'stats.followersCount': isFollowing ? -1 : 1 } }, { session });

        await session.commitTransaction();

        // Повертаємо ім'я автора для повідомлення
        const authorDetails = await User.findById(authorId).select('name').lean();
        const authorName = authorDetails?.name || 'Автор';

        console.log(`Користувач ${userId} ${isFollowing ? 'відписався від' : 'підписався на'} автора ${authorId}`.magenta);
        res.status(200).json({
            status: 'success',
            message: isFollowing ? `Ви відписалися від ${authorName}.` : `Ви підписалися на ${authorName}.`, // Потрібно i18n
            data: { following: !isFollowing },
        });
    } catch (error) {
        await session.abortTransaction();
        console.error('Помилка зміни статусу підписки на автора:', error);
        return next(new AppError('Не вдалося змінити статус підписки.', 500));
    } finally {
        session.endSession();
    }
});

exports.getFollowing = catchAsync(async (req, res, next) => {
    const userId = req.user._id;
    const limit = Math.min(100, Number(req.query.limit) || 20); // Обмежимо ліміт
    const page = Math.max(1, Number(req.query.page) || 1);
    const skip = (page - 1) * limit;

    // Отримуємо ID авторів, на яких підписаний користувач
    const user = await User.findById(userId).select('following').lean();
    const followingIds = user?.following || [];

    if (followingIds.length === 0) {
        return res.status(200).json({ status: 'success', results: 0, data: [], pagination: { currentPage: 1, totalPages: 0, totalResults: 0, limit } });
    }

    // Знаходимо активних авторів за ID
    const authorsQuery = User.find({
        _id: { $in: followingIds },
        // isActive: true // Хук pre-find вже це робить
    })
        .sort({ name: 1 }) // Сортуємо за іменем
        .skip(skip)
        .limit(limit)
        // Вибираємо поля для відображення в списку
        .select('name avatarUrl bio stats.storyCount stats.followersCount stats.averageRating')
        .lean();

    // Рахуємо загальну кількість активних авторів, на яких підписаний користувач
    const totalQuery = User.countDocuments({ _id: { $in: followingIds }, isActive: true }); // Перевіряємо isActive тут для count

    const [authors, totalResults] = await Promise.all([authorsQuery, totalQuery]);

    res.status(200).json({
        status: 'success',
        results: authors.length,
        data: authors,
        pagination: {
            currentPage: page,
            totalPages: Math.ceil(totalResults / limit),
            totalResults: totalResults,
            limit: limit,
        }
    });
});

exports.checkIfFollowing = catchAsync(async (req, res, next) => {
    const authorId = req.params.authorId;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(authorId)) {
        return next(new AppError('Некоректний ID автора.', 400));
    }

    const isFollowing = await User.exists({ _id: userId, following: authorId });

    res.status(200).json({
        status: 'success',
        data: { isFollowing: !!isFollowing } // Перетворюємо на boolean
    });
});

// --- Статус взаємодії з історією ---
exports.getStoryInteractionStatus = catchAsync(async (req, res, next) => {
    const storyId = req.params.storyId;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(storyId)) {
        return next(new AppError('Некоректний ID історії.', 400));
    }

    // Отримуємо історію, щоб перевірити існування та отримати ID автора
    const story = await Story.findById(storyId).select('author').lean();
    if (!story) {
        return next(new AppError('Історію не знайдено.', 404));
    }

    // Виконуємо запити паралельно
    const [likeExists, bookmarkExists, ratingDoc, followingAuthor] = await Promise.all([
        Like.exists({ user: userId, targetId: storyId, targetModel: 'Story' }),
        User.exists({ _id: userId, bookmarks: storyId }),
        Rating.findOne({ user: userId, targetId: storyId, targetModel: 'Story' }).select('value').lean(),
        // Перевіряємо підписку тільки якщо є автор і це не сам користувач
        (story.author && story.author.toString() !== userId.toString())
            ? User.exists({ _id: userId, following: story.author })
            : Promise.resolve(false) // Якщо автора немає або це сам користувач
    ]);

    res.status(200).json({
        status: 'success',
        data: {
            liked: !!likeExists,
            bookmarked: !!bookmarkExists,
            rating: ratingDoc?.value || 0, // Повертаємо 0, якщо оцінки немає
            followingAuthor: !!followingAuthor, // Статус підписки на автора історії
        }
    });
});
// --- END OF FILE controllers/userController.js ---