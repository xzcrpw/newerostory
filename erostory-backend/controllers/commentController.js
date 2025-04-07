// --- START OF FILE controllers/commentController.js ---
const mongoose = require('mongoose');
const Comment = require('../models/Comment');
const Story = require('../models/Story');
const Like = require('../models/Like');
const User = require('../models/User');
const Setting = require('../models/Setting');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const APIFeatures = require('../utils/apiFeatures');
const getLocalizedData = require('../utils/getLocalizedData');
const sendEmail = require('../utils/email');
const sendTelegramNotification = require('../utils/telegramNotifier');
require('colors');

const DEFAULT_COMMENTS_LIMIT = 15;

// Middleware для встановлення ID історії та автора
exports.setStoryUserIds = (req, res, next) => {
    if (!req.body.story && req.params.storyId) req.body.story = req.params.storyId;
    if (!req.body.author && req.user?._id) req.body.author = req.user._id;
    if (!req.body.story) {
        return next(new AppError('Не вказано ID історії для коментаря.', 400));
    }
    // Перевіряємо валідність storyId, якщо він є
    if (req.body.story && !mongoose.Types.ObjectId.isValid(req.body.story)) {
        return next(new AppError('Некоректний ID історії.', 400));
    }
    next();
};

// --- GET ALL COMMENTS ---
exports.getAllComments = catchAsync(async (req, res, next) => {
    const userId = req.user?._id; // ID поточного користувача (може бути null для гостя)
    const lang = req.query.lang || req.user?.preferredLang || 'uk'; // Мова для локалізації

    // --- Фільтр ---
    const filter = {};
    // Фільтр за історією (обов'язковий)
    if (!req.params.storyId || !mongoose.Types.ObjectId.isValid(req.params.storyId)) {
        return next(new AppError('Некоректний або відсутній ID історії.', 400));
    }
    filter.story = req.params.storyId;

    // Показуємо тільки схвалені коментарі для всіх, крім адмінів/модераторів
    if (!req.user || !['admin', 'moderator'].includes(req.user.role)) {
        filter.status = 'approved';
    } else if (req.query.status) { // Адмін/модератор може фільтрувати за статусом
        const allowedStatuses = ['pending', 'approved', 'rejected'];
        if (allowedStatuses.includes(req.query.status)) {
            filter.status = req.query.status;
        }
    } // Якщо статус не вказано, адмін/модератор бачить всі

    // Фільтрація за батьківським коментарем (для отримання відповідей)
    if (req.query.parentComment) {
        if (mongoose.Types.ObjectId.isValid(req.query.parentComment)) {
            filter.parentComment = req.query.parentComment;
        } else {
            // Якщо ID батьківського коментаря невалідний, повертаємо порожній результат
            return res.status(200).json({ status: 'success', results: 0, data: [], pagination: { currentPage: 1, limit: 0, totalPages: 0, totalResults: 0 } });
        }
    } else {
        // Отримуємо коментарі верхнього рівня
        filter.parentComment = null;
    }

    // --- Пагінація та Сортування ---
    const limit = Math.min(50, Number(req.query.limit) || DEFAULT_COMMENTS_LIMIT); // Обмежуємо ліміт
    const page = Math.max(1, Number(req.query.page) || 1);

    const features = new APIFeatures(
        Comment.find(filter).populate({ // Додаємо populate автора
            path: 'author',
            select: 'name avatarUrl'
        }),
        req.query // Передаємо queryString для інших можливих фільтрів (хоча filter вже задано)
    )
        .sort(req.query.sort || '-createdAt') // Сортування
        .paginate(limit); // Пагінація

    // --- Виконання запитів ---
    const [comments, totalDocuments] = await Promise.all([
        features.query.lean(), // Використовуємо lean для продуктивності
        Comment.countDocuments(filter) // Рахуємо тільки за основним фільтром
    ]);

    // --- Отримання статусів лайків для поточного користувача ---
    let likedCommentIds = new Set();
    if (userId && comments.length > 0) {
        const commentIds = comments.map(c => c._id);
        const userLikes = await Like.find({
            user: userId,
            targetId: { $in: commentIds },
            targetModel: 'Comment'
        }).select('targetId -_id').lean();
        likedCommentIds = new Set(userLikes.map(like => like.targetId.toString()));
    }

    // --- Додавання статусу лайка та форматування дати ---
    const finalComments = comments.map(comment => ({
        ...comment,
        liked: likedCommentIds.has(comment._id.toString()),
        // Форматуємо дату згідно з локаллю (безпечно, бо lang визначено)
        date: comment.createdAt ? new Date(comment.createdAt).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' }) : 'Невідомо'
    }));

    res.status(200).json({
        status: 'success',
        results: finalComments.length,
        data: finalComments,
        pagination: {
            currentPage: page, // Використовуємо page, що розрахували
            limit: limit, // Використовуємо limit, що розрахували
            totalPages: Math.ceil(totalDocuments / limit),
            totalResults: totalDocuments,
        }
    });
});

// --- GET ONE COMMENT ---
exports.getComment = catchAsync(async (req, res, next) => {
    const commentId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
        return next(new AppError('Некоректний ID коментаря.', 400));
    }

    const comment = await Comment.findById(commentId).populate({
        path: 'author',
        select: 'name avatarUrl'
    }).lean(); // Можна lean, якщо методи не потрібні

    if (!comment) {
        return next(new AppError('Коментар не знайдено.', 404));
    }

    // Перевірка статусу (тільки адмін/модератор бачить не схвалені)
    const canView = comment.status === 'approved' || (req.user && ['admin', 'moderator'].includes(req.user.role));
    if (!canView) {
        return next(new AppError('Коментар недоступний для перегляду.', 403));
    }

    res.status(200).json({ status: 'success', data: comment });
});


// --- CREATE COMMENT ---
exports.createComment = catchAsync(async (req, res, next) => {
    const { text, story, parentComment } = req.body; // author встановлено в setStoryUserIds
    const authorId = req.user._id;

    // Валідація (текст - в middleware, ID історії перевірено в setStoryUserIds)
    if (!text || typeof text !== 'string' || text.trim().length < 3 || text.trim().length > 1000) {
        return next(new AppError('Текст коментаря має бути від 3 до 1000 символів.', 400));
    }
    if (parentComment && !mongoose.Types.ObjectId.isValid(parentComment)) {
        return next(new AppError('Некоректний ID батьківського коментаря.', 400));
    }

    // 1. Перевірка існування історії та її статусу
    const storyDoc = await Story.findById(story).select('_id status author slug').lean();
    if (!storyDoc) return next(new AppError('Історія не існує.', 404));
    if (storyDoc.status !== 'published') return next(new AppError('Неможливо прокоментувати неопубліковану історію.', 400));

    // 2. Перевірка існування батьківського коментаря (якщо є)
    let parentCommentDoc = null;
    if (parentComment) {
        parentCommentDoc = await Comment.findById(parentComment).select('_id author story').lean();
        if (!parentCommentDoc || parentCommentDoc.story.toString() !== story.toString()) {
            return next(new AppError('Батьківський коментар не знайдено або він належить іншій історії.', 404));
        }
    }

    // 3. Визначення статусу коментаря на основі налаштувань
    const settings = await Setting.findOne().select('commentsModeration').lean();
    const requiresModeration = settings?.commentsModeration ?? true; // Default: moderation ON
    const commentStatus = requiresModeration ? 'pending' : 'approved';

    // 4. Створення коментаря
    const newCommentData = {
        text: text.trim(),
        story,
        author: authorId,
        parentComment: parentCommentDoc ? parentCommentDoc._id : null,
        status: commentStatus
    };
    const newComment = await Comment.create(newCommentData);

    // 5. Повертаємо коментар з даними автора
    const commentWithAuthor = await Comment.findById(newComment._id)
        .populate({ path: 'author', select: 'name avatarUrl' })
        .lean(); // Використовуємо lean

    // Додаємо форматовану дату
    commentWithAuthor.date = newComment.createdAt ? new Date(newComment.createdAt).toLocaleString(req.user.preferredLang || 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }) : 'Щойно';
    commentWithAuthor.liked = false; // Новий коментар не лайкнутий

    // --- Сповіщення ---
    try {
        const commenterName = req.user.name || 'Анонім';
        const storyTitle = (await getLocalizedData([storyDoc], 'uk', 'uk', 'Story', ['title']))[0]?.title || storyDoc.slug;
        const commentUrl = `${process.env.FRONTEND_URL || ''}/story-detailed.html?id=${storyDoc._id}#comment-${newComment._id}`;
        const storyUrl = `${process.env.FRONTEND_URL || ''}/story-detailed.html?id=${storyDoc._id}`;

        // 1. Автору історії (якщо це не він сам)
        if (storyDoc.author?.toString() !== authorId.toString()) {
            const storyAuthor = await User.findById(storyDoc.author).select('name email telegramUserId preferredLang').lean();
            if (storyAuthor) {
                const authorLang = storyAuthor.preferredLang || 'uk';
                // TODO: Додати переклад сповіщень для автора
                const emailSubject = `Новий коментар до вашої історії "${storyTitle}"`;
                const emailMessage = `Привіт, ${storyAuthor.name || 'Автор'}!\n\n${commenterName} залишив(ла) коментар до вашої історії "${storyTitle}":\n\n"${text.trim().substring(0, 150)}..."\n\nПереглянути: ${commentUrl}`;
                const telegramMessage = `💬 Новий коментар до вашої історії <a href="${storyUrl}">"${storyTitle}"</a> від ${commenterName}:\n<i>"${text.trim().substring(0, 150)}..."</i>\n<a href="${commentUrl}">Переглянути</a>`;

                if (storyAuthor.email) sendEmail({ email: storyAuthor.email, subject: emailSubject, message: emailMessage }).catch(e=>console.error(e));
                if (storyAuthor.telegramUserId) sendTelegramNotification(telegramMessage, { parse_mode: 'HTML' }, storyAuthor.telegramUserId).catch(e=>console.error(e));
            }
        }

        // 2. Автору батьківського коментаря (якщо це відповідь і не самому собі)
        if (parentCommentDoc && parentCommentDoc.author?.toString() !== authorId.toString() && parentCommentDoc.author?.toString() !== storyDoc.author?.toString()) {
            const parentAuthor = await User.findById(parentCommentDoc.author).select('name email telegramUserId preferredLang').lean();
            if (parentAuthor) {
                // TODO: Додати переклад сповіщень
                const replySubject = `Нова відповідь на ваш коментар до історії "${storyTitle}"`;
                const replyMessage = `Привіт, ${parentAuthor.name || 'Користувач'}!\n\n${commenterName} відповів(ла) на ваш коментар до історії "${storyTitle}":\n\n"${text.trim().substring(0, 150)}..."\n\nПереглянути відповідь: ${commentUrl}`;
                const telegramReplyMessage = `↪️ ${commenterName} відповів(ла) на ваш коментар до <a href="${storyUrl}">"${storyTitle}"</a>:\n<i>"${text.trim().substring(0, 150)}..."</i>\n<a href="${commentUrl}">Переглянути</a>`;

                if (parentAuthor.email) sendEmail({ email: parentAuthor.email, subject: replySubject, message: replyMessage }).catch(e=>console.error(e));
                if (parentAuthor.telegramUserId) sendTelegramNotification(telegramReplyMessage, { parse_mode: 'HTML' }, parentAuthor.telegramUserId).catch(e=>console.error(e));
            }
        }

        // 3. Модераторам, якщо потрібна модерація
        if (commentStatus === 'pending') {
            const moderationLink = `${process.env.ADMIN_URL || process.env.FRONTEND_URL || ''}/admin/comments.html?status=pending`;
            const moderationMessage = `⏳ Новий коментар (ID: ${newComment._id}) від ${commenterName} до історії <a href="${storyUrl}">"${storyTitle}"</a> чекає на модерацію.\n<a href="${moderationLink}">Перейти до модерації</a>`;
            sendTelegramNotification(moderationMessage, { parse_mode: 'HTML' }).catch(e=>console.error(e));
        }

    } catch (notificationError) {
        console.error("Помилка надсилання сповіщень про новий коментар:", notificationError);
    }
    // --- Кінець Сповіщень ---

    res.status(201).json({ status: 'success', data: commentWithAuthor });
});

// --- UPDATE COMMENT ---
exports.updateComment = catchAsync(async (req, res, next) => {
    const { text } = req.body; // Валідація тексту в middleware
    const commentId = req.params.id;
    const userId = req.user._id;
    const userRole = req.user.role;

    if (!mongoose.Types.ObjectId.isValid(commentId)) {
        return next(new AppError('Некоректний ID коментаря.', 400));
    }
    if (!text || typeof text !== 'string' || text.trim().length < 3 || text.trim().length > 1000) {
        return next(new AppError('Текст коментаря має бути від 3 до 1000 символів.', 400));
    }

    const comment = await Comment.findById(commentId);
    if (!comment) return next(new AppError('Коментар не знайдено.', 404));

    // Перевірка прав: тільки автор або адмін/модератор
    const isAdminOrModerator = ['admin', 'moderator'].includes(userRole);
    if (comment.author.toString() !== userId.toString() && !isAdminOrModerator) {
        return next(new AppError('Ви не можете редагувати цей коментар.', 403));
    }

    // Заборона редагування відхилених (крім адмінів/модераторів)
    if (comment.status === 'rejected' && !isAdminOrModerator) {
        return next(new AppError('Неможливо редагувати відхилений коментар.', 400));
    }

    const oldText = comment.text;
    const newText = text.trim();

    if (oldText === newText) {
        // Якщо текст не змінився, просто повертаємо поточний коментар
        const commentWithAuthor = await Comment.findById(commentId)
            .populate({ path: 'author', select: 'name avatarUrl' }).lean();
        commentWithAuthor.date = comment.createdAt ? new Date(comment.createdAt).toLocaleString(req.user.preferredLang || 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }) : '';
        return res.status(200).json({ status: 'success', data: commentWithAuthor });
    }

    comment.text = newText;
    let statusChangedToPending = false;

    // Якщо коментар був схвалений, а модерація увімкнена,
    // відправляємо на повторну модерацію (якщо редагує не адмін/модератор)
    const settings = await Setting.findOne().select('commentsModeration').lean();
    const requiresModeration = settings?.commentsModeration ?? true;

    if (comment.status === 'approved' && requiresModeration && !isAdminOrModerator) {
        comment.status = 'pending';
        statusChangedToPending = true;
        console.log(`Коментар ${comment._id} відправлено на повторну модерацію після редагування користувачем ${req.user.name}.`);
    }

    await comment.save({ validateBeforeSave: true });

    // Сповіщення модераторам, якщо статус змінився на pending
    if (statusChangedToPending) {
        try {
            const story = await Story.findById(comment.story).select('title slug').lean();
            const storyTitle = story ? (await getLocalizedData([story], 'uk', 'uk', 'Story', ['title']))[0]?.title || story.slug : 'історії';
            const moderationLink = `${process.env.ADMIN_URL || process.env.FRONTEND_URL || ''}/admin/comments.html?status=pending`;
            const storyUrl = `${process.env.FRONTEND_URL || ''}/story-detailed.html?id=${comment.story}`;
            const moderationMessage = `📝 Коментар (ID: ${comment._id}) від ${req.user.name} до історії <a href="${storyUrl}">"${storyTitle}"</a> відредаговано і він чекає на повторну модерацію.\n<a href="${moderationLink}">Перейти до модерації</a>`;
            sendTelegramNotification(moderationMessage, { parse_mode: 'HTML' }).catch(e => console.error(`Telegram notification error (pending comment edit):`, e));
        } catch(e) { console.error('Error sending notification for comment re-moderation:', e); }
    }

    // Повертаємо оновлений коментар
    const updatedCommentWithAuthor = await Comment.findById(comment._id)
        .populate({ path: 'author', select: 'name avatarUrl' }).lean();
    updatedCommentWithAuthor.date = comment.createdAt ? new Date(comment.createdAt).toLocaleString(req.user.preferredLang || 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }) : '';

    res.status(200).json({
        status: 'success',
        message: statusChangedToPending ? 'Коментар оновлено та надіслано на повторну модерацію.' : 'Коментар успішно оновлено.',
        data: updatedCommentWithAuthor
    });
});

// --- DELETE COMMENT ---
exports.deleteComment = catchAsync(async (req, res, next) => {
    const commentId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(commentId)) {
        return next(new AppError('Некоректний ID коментаря.', 400));
    }

    // Знаходимо коментар ПЕРЕД видаленням для перевірки прав
    const comment = await Comment.findById(commentId).select('author');
    if (!comment) return next(new AppError('Коментар не знайдено.', 404));

    // Перевірка прав: автор, модератор або адмін
    const canDelete = comment.author.toString() === req.user._id.toString() ||
        req.user.role === 'moderator' || req.user.role === 'admin';

    if (!canDelete) {
        return next(new AppError('Ви не можете видалити цей коментар.', 403));
    }

    // Використовуємо findByIdAndDelete, щоб спрацювали хуки моделі
    await Comment.findByIdAndDelete(commentId);

    console.log(`Коментар ${commentId} видалено користувачем ${req.user.name}`.yellow);
    res.status(204).json({ status: 'success', data: null }); // 204 No Content
});

exports.getLikeStatuses = catchAsync(async (req, res, next) => {
    const commentIds = req.body.commentIds; // Масив ID коментарів з тіла запиту
    const userId = req.user?._id; // ID поточного користувача

    // Перевірка, чи користувач авторизований (хоча protect вже мав це зробити)
    if (!userId) {
        // Гість не може мати лайків
        const guestStatuses = (commentIds || []).reduce((acc, id) => {
            if (mongoose.Types.ObjectId.isValid(id)) { // Перевіряємо валідність ID
                acc[id.toString()] = false;
            }
            return acc;
        }, {});
        return res.status(200).json({ status: 'success', data: guestStatuses });
    }

    // Валідація вхідних даних (вже є в middleware, але базова перевірка)
    if (!Array.isArray(commentIds) || commentIds.length === 0) {
        return res.status(200).json({ status: 'success', data: {} }); // Повертаємо порожній об'єкт
    }

    // Фільтруємо невалідні ID
    const objectIds = commentIds
        .map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null)
        .filter(id => id !== null);

    if (objectIds.length === 0) {
        return res.status(200).json({ status: 'success', data: {} }); // Повертаємо порожній, якщо всі ID невалідні
    }

    // --- Отримуємо лайки користувача для переданих коментарів ---
    const userLikes = await Like.find({
        user: userId,
        targetId: { $in: objectIds },
        targetModel: 'Comment'
    }).select('targetId -_id').lean(); // Вибираємо тільки ID коментаря

    // --- Створюємо об'єкт статусів ---
    const likedCommentIdsSet = new Set(userLikes.map(like => like.targetId.toString()));
    const likeStatuses = {};
    objectIds.forEach(id => {
        likeStatuses[id.toString()] = likedCommentIdsSet.has(id.toString());
    });

    res.status(200).json({ status: 'success', data: likeStatuses });
});


// --- UPDATE COMMENT STATUS (Admin/Moderator only) ---
exports.updateCommentStatus = catchAsync(async (req, res, next) => {
    const commentId = req.params.id;
    const { status } = req.body; // 'approved' або 'rejected'

    // Валідація ID та статусу - в middleware

    // Знаходимо коментар
    const commentToUpdate = await Comment.findById(commentId);
    if (!commentToUpdate) return next(new AppError('Коментар не знайдено.', 404));

    // Якщо статус не змінюється, нічого не робимо
    if (commentToUpdate.status === status) {
        const populatedComment = await Comment.findById(commentId)
            .populate({ path: 'author', select: 'name avatarUrl' }).lean();
        populatedComment.date = commentToUpdate.createdAt ? new Date(commentToUpdate.createdAt).toLocaleString(req.user.preferredLang || 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }) : '';
        return res.status(200).json({ status: 'success', data: populatedComment });
    }

    // Оновлюємо статус
    commentToUpdate.status = status;
    await commentToUpdate.save(); // Викликаємо save для спрацювання хуків оновлення лічильників

    // --- Сповіщення автору коментаря ---
    try {
        const comment = await Comment.findById(commentId) // Перезавантажуємо з автором
            .populate('author', 'name email telegramUserId preferredLang')
            .lean();

        if (comment && comment.author) {
            const story = await Story.findById(comment.story).select('title slug').lean();
            const storyTitle = story ? (await getLocalizedData([story], comment.author.preferredLang || 'uk', 'uk', 'Story', ['title']))[0]?.title || story.slug : 'історії';
            const commentUrl = `${process.env.FRONTEND_URL || ''}/story-detailed.html?id=${comment.story}#comment-${comment._id}`;
            let subject = ''; let message = ''; let telegramMessage = '';

            if (status === 'approved') {
                subject = `Ваш коментар до історії "${storyTitle}" схвалено!`;
                message = `✅ Вітаємо, ${comment.author.name || 'Користувач'}!\n\nВаш коментар до історії "<a href="${commentUrl}">${storyTitle}</a>" було схвалено модератором.`;
                telegramMessage = message;
            } else if (status === 'rejected') {
                subject = `Ваш коментар до історії "${storyTitle}" відхилено`;
                message = `🚫 На жаль, ${comment.author.name || 'Користувач'},\n\nВаш коментар до історії "<a href="${commentUrl}">${storyTitle}</a>" було відхилено модератором.`;
                telegramMessage = message;
            }

            if (subject && message && comment.author.email) {
                const plainTextMessage = message.replace(/<[^>]*>?/gm, '');
                sendEmail({ email: comment.author.email, subject, message: plainTextMessage, html: message })
                    .catch(e => console.error(`Email notification error (${status} comment ${comment._id}):`, e));
            }
            if (telegramMessage && comment.author.telegramUserId) {
                sendTelegramNotification(telegramMessage, { parse_mode: 'HTML' }, comment.author.telegramUserId)
                    .catch(e => console.error(`Telegram notification error (user ${comment.author.telegramUserId}):`, e));
            }
        }
    } catch(notificationError) {
        console.error(`Помилка надсилання сповіщення про статус коментаря ${commentId}:`, notificationError);
    }
    // --- Кінець сповіщення ---

    // Повертаємо оновлений коментар (вже з хуків)
    const populatedComment = await Comment.findById(commentId)
        .populate({ path: 'author', select: 'name avatarUrl' }).lean();
    populatedComment.date = commentToUpdate.createdAt ? new Date(commentToUpdate.createdAt).toLocaleString(req.user.preferredLang || 'uk-UA', { dateStyle: 'medium', timeStyle: 'short' }) : '';


    console.log(`Статус коментаря ${commentId} змінено на "${status}" модератором ${req.user.name}`.cyan);
    res.status(200).json({ status: 'success', data: populatedComment });
});

// --- GET LIKE STATUSES (Moved from commentController, better fit here?) ---
// OR keep it in commentController as it's specific to comment likes? Let's keep it in commentController.
// If needed for other models, create a generic like status controller.
// --- END OF FILE controllers/commentController.js ---