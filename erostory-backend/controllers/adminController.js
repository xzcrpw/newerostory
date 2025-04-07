// --- START OF FILE controllers/adminController.js ---
const mongoose = require('mongoose');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const Story = require('../models/Story');
const Comment = require('../models/Comment');
const User = require('../models/User');
const Category = require('../models/Category');
const Setting = require('../models/Setting');
const Report = require('../models/Report'); // Додано Report
const APIFeatures = require('../utils/apiFeatures');
const getLocalizedData = require('../utils/getLocalizedData');
const sendTelegramNotification = require('../utils/telegramNotifier');
const sendEmail = require('../utils/email');
require('colors'); // Для логування

// --- Дашборд ---
exports.getDashboardStats = catchAsync(async (req, res, next) => {
    // Агрегація для отримання різноманітної статистики одним запитом
    const [storyStats, userStats, commentStats, reportStats] = await Promise.all([
        // Статистика історій
        Story.aggregate([
            {
                $group: {
                    _id: null, // Групуємо всі
                    totalStories: { $sum: 1 },
                    pendingStories: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
                    publishedStories: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } },
                    draftStories: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
                    rejectedStories: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
                    totalViews: { $sum: '$views' },
                    totalLikes: { $sum: '$likes' },
                    totalBookmarks: { $sum: '$bookmarks' },
                }
            }
        ]),
        // Статистика користувачів
        User.aggregate([
            {
                $group: {
                    _id: null,
                    totalUsers: { $sum: 1 },
                    activeUsers: { $sum: { $cond: ['$isActive', 1, 0] } },
                    inactiveUsers: { $sum: { $cond: ['$isActive', 0, 1] } }, // Рахуємо неактивних
                    premiumUsers: { $sum: { $cond: ['$isPremium', 1, 0] } },
                    // Статистика за ролями (всіх, включаючи неактивних для загального огляду)
                    userRoleCount: { $sum: { $cond: [{ $eq: ['$role', 'user'] }, 1, 0] } },
                    authorRoleCount: { $sum: { $cond: [{ $eq: ['$role', 'author'] }, 1, 0] } },
                    moderatorRoleCount: { $sum: { $cond: [{ $eq: ['$role', 'moderator'] }, 1, 0] } },
                    adminRoleCount: { $sum: { $cond: [{ $eq: ['$role', 'admin'] }, 1, 0] } },
                }
            }
        ]),
        // Статистика коментарів
        Comment.aggregate([
            {
                $group: {
                    _id: null,
                    totalComments: { $sum: 1 },
                    pendingComments: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
                    approvedComments: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
                    rejectedComments: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
                }
            }
        ]),
        // Статистика скарг (Додано)
        Report.aggregate([
            {
                $group: {
                    _id: null,
                    totalReports: { $sum: 1 },
                    newReports: { $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] } },
                    inProgressReports: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
                }
            }
        ])
    ]);

    // Об'єднуємо результати, обробляючи можливу відсутність даних ([0] повертає перший елемент масиву або undefined)
    const s = storyStats[0] || {};
    const u = userStats[0] || {};
    const c = commentStats[0] || {};
    const r = reportStats[0] || {};

    const dashboardData = {
        stories: {
            total: s.totalStories || 0,
            pending: s.pendingStories || 0,
            published: s.publishedStories || 0,
            draft: s.draftStories || 0,
            rejected: s.rejectedStories || 0,
            views: s.totalViews || 0,
            likes: s.totalLikes || 0,
            bookmarks: s.totalBookmarks || 0,
        },
        users: {
            total: u.totalUsers || 0,
            active: u.activeUsers || 0,
            inactive: u.inactiveUsers || 0,
            premium: u.premiumUsers || 0,
            roles: {
                user: u.userRoleCount || 0,
                author: u.authorRoleCount || 0,
                moderator: u.moderatorRoleCount || 0,
                admin: u.adminRoleCount || 0,
            }
        },
        comments: {
            total: c.totalComments || 0,
            pending: c.pendingComments || 0,
            approved: c.approvedComments || 0,
            rejected: c.rejectedComments || 0,
        },
        reports: {
            total: r.totalReports || 0,
            new: r.newReports || 0,
            inProgress: r.inProgressReports || 0,
        }
    };

    res.status(200).json({
        status: 'success',
        data: dashboardData,
    });
});

// --- Модерація Історій ---
exports.getPendingStories = catchAsync(async (req, res, next) => {
    const features = new APIFeatures(
        Story.find({ status: 'pending' })
            .populate('author', 'name email avatarUrl') // Додаємо аватар
            .populate('category', 'slug'), // Slug для отримання ID
        req.query
    )
        .sort(req.query.sort || '-createdAt') // Новіші спочатку
        .paginate(15); // Пагінація

    const stories = await features.query.lean();
    const totalDocuments = await Story.countDocuments({ status: 'pending' }); // Рахуємо тільки pending

    // Локалізуємо назви історій та категорій (тільки 'uk' для адмінки)
    const localizedStories = await getLocalizedData(stories, 'uk', 'uk', 'Story', ['title']);

    const categoryIds = [...new Set(localizedStories.map(s => s.category?._id?.toString()).filter(Boolean))];
    let categoryMap = {};
    if(categoryIds.length > 0) {
        const categoriesData = await Category.find({ _id: { $in: categoryIds } }).select('slug').lean();
        const localizedCategories = await getLocalizedData(categoriesData, 'uk', 'uk', 'Category', ['name']);
        categoryMap = localizedCategories.reduce((map, cat) => {
            map[cat._id.toString()] = { name: cat.name, slug: cat.slug };
            return map;
        }, {});
    }

    localizedStories.forEach(story => {
        if (story.category?._id) {
            const catInfo = categoryMap[story.category._id.toString()];
            story.category.name = catInfo?.name || story.category.slug || 'N/A';
            story.category.slug = catInfo?.slug; // Додаємо slug
        } else {
            story.category = null;
        }
    });

    res.status(200).json({
        status: 'success',
        results: localizedStories.length,
        data: localizedStories,
        pagination: {
            currentPage: features.pagination.currentPage,
            limit: features.pagination.limit,
            totalPages: Math.ceil(totalDocuments / features.pagination.limit),
            totalResults: totalDocuments,
        }
    });
});

exports.approveStory = catchAsync(async (req, res, next) => {
    const story = await Story.findById(req.params.id)
        .populate('author', 'name email telegramUserId preferredLang'); // Додаємо preferredLang

    if (!story) return next(new AppError('Історію з таким ID не знайдено.', 404));
    if (story.status === 'published') { // Перевірка, чи вже схвалено
        return res.status(200).json({ status: 'success', message: 'Історія вже опублікована.', data: story });
    }

    story.status = 'published';
    story.moderatedBy = req.user._id;
    story.moderatedAt = Date.now();
    story.rejectionReason = null; // Очищуємо причину
    await story.save(); // Зберігаємо, щоб спрацювали хуки

    // Сповіщення автору
    if (story.author) {
        try {
            const authorLang = story.author.preferredLang || 'uk';
            // Отримуємо локалізовану назву
            const titleForNotification = (await getLocalizedData([story.toObject()], authorLang, 'uk', 'Story', ['title']))[0]?.title || story.slug;
            const storyUrl = `${process.env.FRONTEND_URL || ''}/story-detailed.html?id=${story._id}`;
            // TODO: Додати переклади сповіщень
            const message = `🎉 Вітаємо, ${story.author.name || 'Автор'}! Вашу історію "<a href="${storyUrl}">${titleForNotification}</a>" було схвалено та опубліковано!`;
            const telegramMessageAdmin = `✅ Історія "<a href="${storyUrl}">${titleForNotification}</a>" (ID: ${story._id}) схвалена модератором ${req.user.name}.`;

            if (story.author.email) {
                sendEmail({ email: story.author.email, subject: 'Вашу історію опубліковано!', message: message.replace(/<[^>]*>?/gm, ''), html: message }).catch(e=>console.error(e));
            }
            if (story.author.telegramUserId) {
                sendTelegramNotification(message, { parse_mode: 'HTML' }, story.author.telegramUserId).catch(e=>console.error(e));
            }
            sendTelegramNotification(telegramMessageAdmin, { parse_mode: 'HTML' }).catch(e=>console.error(e)); // В адмін чат

        } catch(notificationError) { console.error(`Помилка сповіщення про схвалення історії ${story._id}:`, notificationError); }
    }

    console.log(`Історія ${story._id} схвалена модератором ${req.user.name}`.green);
    res.status(200).json({ status: 'success', data: story });
});

exports.rejectStory = catchAsync(async (req, res, next) => {
    const { rejectionReason } = req.body; // Валідація в middleware

    const story = await Story.findById(req.params.id)
        .populate('author', 'name email telegramUserId preferredLang');

    if (!story) return next(new AppError('Історію з таким ID не знайдено.', 404));
    if (story.status === 'rejected') { // Перевірка, чи вже відхилено
        return res.status(200).json({ status: 'success', message: 'Історія вже відхилена.', data: story });
    }

    story.status = 'rejected';
    story.rejectionReason = rejectionReason.trim();
    story.moderatedBy = req.user._id;
    story.moderatedAt = Date.now();
    await story.save(); // Зберігаємо, щоб спрацювали хуки

    // Сповіщення автору
    if (story.author) {
        try {
            const authorLang = story.author.preferredLang || 'uk';
            const titleForNotification = (await getLocalizedData([story.toObject()], authorLang, 'uk', 'Story', ['title']))[0]?.title || story.slug;
            const storyUrl = `${process.env.FRONTEND_URL || ''}/profile.html`; // Посилання на профіль для редагування
            // TODO: Додати переклади сповіщень
            const message = `🙁 На жаль, ${story.author.name || 'Автор'}, вашу історію "${titleForNotification}" було відхилено.\nПричина: ${rejectionReason.trim()}\nВи можете відредагувати її в <a href="${storyUrl}">профілі</a> та надіслати на повторну модерацію.`;
            const telegramMessageAdmin = `❌ Історія "${titleForNotification}" (ID: ${story._id}) відхилена модератором ${req.user.name}. Причина: ${rejectionReason.trim()}`;

            if (story.author.email) {
                sendEmail({ email: story.author.email, subject: 'Вашу історію відхилено', message: message.replace(/<[^>]*>?/gm, ''), html: message }).catch(e=>console.error(e));
            }
            if (story.author.telegramUserId) {
                sendTelegramNotification(message, { parse_mode: 'HTML' }, story.author.telegramUserId).catch(e=>console.error(e));
            }
            sendTelegramNotification(telegramMessageAdmin, { parse_mode: 'HTML' }).catch(e=>console.error(e)); // В адмін чат

        } catch(notificationError) { console.error(`Помилка сповіщення про відхилення історії ${story._id}:`, notificationError); }
    }


    console.log(`Історія ${story._id} відхилена модератором ${req.user.name}`.yellow);
    res.status(200).json({ status: 'success', data: story });
});

// --- Модерація Коментарів ---
exports.getPendingComments = catchAsync(async (req, res, next) => {
    const features = new APIFeatures(
        Comment.find({ status: 'pending' })
            .populate('author', 'name email avatarUrl')
            .populate({ path: 'story', select: 'title slug' }),
        req.query
    )
        .sort(req.query.sort || '-createdAt')
        .paginate(20);

    const comments = await features.query.lean();
    const totalDocuments = await Comment.countDocuments({ status: 'pending' });

    // Локалізуємо назви історій
    const storyIds = [...new Set(comments.map(c => c.story?._id?.toString()).filter(Boolean))];
    let storyMap = {};
    if (storyIds.length > 0) {
        const storiesData = await Story.find({ _id: { $in: storyIds } }).select('title slug').lean();
        const localizedStories = await getLocalizedData(storiesData, 'uk', 'uk', 'Story', ['title']);
        storyMap = localizedStories.reduce((map, story) => {
            map[story._id.toString()] = { title: story.title, slug: story.slug };
            return map;
        }, {});
    }

    comments.forEach(comment => {
        if (comment.story?._id) {
            const storyInfo = storyMap[comment.story._id.toString()];
            comment.story.title = storyInfo?.title || comment.story.slug || 'N/A';
            comment.story.slug = storyInfo?.slug;
        }
    });

    res.status(200).json({
        status: 'success',
        results: comments.length,
        data: comments,
        pagination: {
            currentPage: features.pagination.currentPage,
            limit: features.pagination.limit,
            totalPages: Math.ceil(totalDocuments / features.pagination.limit),
            totalResults: totalDocuments,
        }
    });
});

exports.approveComment = catchAsync(async (req, res, next) => {
    const comment = await Comment.findById(req.params.id)
        .populate('author', 'name email telegramUserId preferredLang'); // Додаємо preferredLang

    if (!comment) return next(new AppError('Коментар з таким ID не знайдено.', 404));
    if (comment.status === 'approved') {
        return res.status(200).json({ status: 'success', message: 'Коментар вже схвалено.', data: comment });
    }

    comment.status = 'approved';
    await comment.save(); // Запускаємо хуки для оновлення лічильників

    // Сповіщення автору коментаря
    if (comment.author) {
        try {
            const authorLang = comment.author.preferredLang || 'uk';
            const story = await Story.findById(comment.story).select('title slug').lean();
            const storyTitle = story ? (await getLocalizedData([story], authorLang, 'uk', 'Story', ['title']))[0]?.title || story.slug : 'історії';
            const commentLink = `${process.env.FRONTEND_URL || ''}/story-detailed.html?id=${comment.story}#comment-${comment._id}`;
            // TODO: i18n
            const message = `✅ Ваш коментар до історії "<a href='${commentLink}'>${storyTitle}</a>" схвалено модератором.`;

            if (comment.author.email) {
                sendEmail({ email: comment.author.email, subject: 'Ваш коментар схвалено!', message: message.replace(/<[^>]*>?/gm, ''), html: message }).catch(e=>console.error(e));
            }
            if (comment.author.telegramUserId) {
                sendTelegramNotification(message, { parse_mode: 'HTML' }, comment.author.telegramUserId).catch(e=>console.error(e));
            }
        } catch (notificationError) { console.error(`Помилка сповіщення про схвалення коментаря ${comment._id}:`, notificationError); }
    }

    console.log(`Коментар ${comment._id} схвалено модератором ${req.user.name}`.green);
    res.status(200).json({ status: 'success', data: comment });
});

exports.rejectComment = catchAsync(async (req, res, next) => {
    const comment = await Comment.findById(req.params.id)
        .populate('author', 'name email telegramUserId preferredLang');

    if (!comment) return next(new AppError('Коментар з таким ID не знайдено.', 404));
    if (comment.status === 'rejected') {
        return res.status(200).json({ status: 'success', message: 'Коментар вже відхилено.', data: comment });
    }

    comment.status = 'rejected';
    await comment.save(); // Запускаємо хуки

    // Сповіщення автору коментаря
    if (comment.author) {
        try {
            const authorLang = comment.author.preferredLang || 'uk';
            const story = await Story.findById(comment.story).select('title slug').lean();
            const storyTitle = story ? (await getLocalizedData([story], authorLang, 'uk', 'Story', ['title']))[0]?.title || story.slug : 'історії';
            // TODO: i18n
            const message = `🚫 Ваш коментар до історії "${storyTitle}" було відхилено модератором.`;

            if (comment.author.email) {
                sendEmail({ email: comment.author.email, subject: 'Ваш коментар відхилено', message }).catch(e=>console.error(e));
            }
            if (comment.author.telegramUserId) {
                sendTelegramNotification(message, {}, comment.author.telegramUserId).catch(e=>console.error(e));
            }
        } catch (notificationError) { console.error(`Помилка сповіщення про відхилення коментаря ${comment._id}:`, notificationError); }
    }


    console.log(`Коментар ${comment._id} відхилено модератором ${req.user.name}`.yellow);
    res.status(200).json({ status: 'success', data: comment });
});


// --- Налаштування Сайту (Admin only) ---

// Допоміжна функція для отримання або створення налаштувань
const getOrCreateSettings = async () => {
    let settings = await Setting.findOne();
    if (!settings) {
        console.log('Створення налаштувань сайту за замовчуванням...'.cyan);
        settings = await Setting.create({
            // Використовуємо значення з .env або дефолтні значення моделі
            siteName: process.env.SITE_NAME || 'EroStory',
            defaultLang: process.env.DEFAULT_LANG || 'uk',
            storiesPerPage: parseInt(process.env.STORIES_PER_PAGE || '12', 10),
            commentsModeration: (process.env.COMMENTS_MODERATION !== 'false'), // default true
            allowGuestComments: (process.env.ALLOW_GUEST_COMMENTS === 'true'), // default false
        });
    }
    return settings;
};

exports.getSettings = catchAsync(async (req, res, next) => {
    const settings = await getOrCreateSettings();
    res.status(200).json({ status: 'success', data: settings });
});

exports.updateSettings = catchAsync(async (req, res, next) => {
    // Фільтруємо дозволені поля та валідуємо їх (валідація в middleware)
    const allowedFields = ['siteName', 'defaultLang', 'storiesPerPage', 'commentsModeration', 'allowGuestComments'];
    const updateData = filterObj(req.body, ...allowedFields);

    if (Object.keys(updateData).length === 0) {
        return next(new AppError('Немає даних для оновлення.', 400));
    }

    // Використовуємо findOneAndUpdate без upsert, бо getOrCreateSettings гарантує існування документа
    const updatedSettings = await Setting.findOneAndUpdate({}, updateData, {
        new: true,
        runValidators: true
    });

    if (!updatedSettings) {
        // Малоймовірно, але можливо, якщо документ видалили вручну
        console.error('Не вдалося знайти документ налаштувань для оновлення.'.red);
        return next(new AppError('Не вдалося оновити налаштування.', 500));
    }

    console.log(`Налаштування сайту оновлено адміністратором ${req.user.name}`.cyan);
    res.status(200).json({ status: 'success', data: updatedSettings });
});
// --- END OF FILE controllers/adminController.js ---