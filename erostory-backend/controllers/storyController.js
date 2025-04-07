// --- START OF FILE controllers/storyController.js ---
const mongoose = require('mongoose');
const crypto = require('crypto');
const Story = require('../models/Story');
const User = require('../models/User');
const Category = require('../models/Category');
const Translation = require('../models/Translation');
const Like = require('../models/Like');
const Rating = require('../models/Rating');
const Comment = require('../models/Comment'); // Потрібен для видалення коментарів в хуку
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const APIFeatures = require('../utils/apiFeatures');
const sendTelegramNotification = require('../utils/telegramNotifier');
const sendEmail = require('../utils/email');
const getLocalizedData = require('../utils/getLocalizedData');
const slugify = require('slugify');
const { deleteFromGCS } = require('../utils/gcsUtils');
require('colors'); // Для логування

const STORY_TRANSLATABLE_FIELDS = ['title', 'content']; // Основні поля для перекладу
const WORDS_PER_MINUTE = 200; // Середня швидкість читання

// --- Допоміжна функція для розрахунку часу читання ---
function calculateReadingTime(text) {
    if (!text || typeof text !== 'string') return 1; // Повертаємо 1 хв, якщо тексту немає
    const textOnly = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); // Видаляємо HTML та зайві пробіли
    const wordCount = textOnly.split(' ').filter(Boolean).length;
    const time = Math.ceil(wordCount / WORDS_PER_MINUTE);
    return time > 0 ? time : 1; // Мінімальний час - 1 хвилина
}

// --- Допоміжна функція для підготовки списку історій ---
async function prepareStoryListResponse(stories, lang, userId = null) {
    if (!Array.isArray(stories) || stories.length === 0) return [];

    const plainStories = stories.map(s => (s.toObject ? s.toObject() : { ...s }));

    // 1. Локалізація назв та отримання контенту для excerpt
    const localizedStories = await getLocalizedData(plainStories, lang, 'uk', 'Story', ['title', 'content']);

    // 2. Збір ID для паралельних запитів
    const authorIds = [...new Set(localizedStories.map(s => s.author?.toString()).filter(Boolean))];
    const categoryIds = [...new Set(localizedStories.map(s => s.category?.toString()).filter(Boolean))];
    const storyIds = localizedStories.map(s => s._id?.toString()).filter(Boolean);

    // 3. Паралельні запити
    const [authorsData, categoriesData, userInteractions] = await Promise.all([
        authorIds.length ? User.find({ _id: { $in: authorIds } }).select('name avatarUrl').lean() : Promise.resolve([]),
        categoryIds.length ? Category.find({ _id: { $in: categoryIds } }).select('slug').lean() : Promise.resolve([]),
        userId && storyIds.length ? Promise.all([
            Like.find({ user: userId, targetId: { $in: storyIds }, targetModel: 'Story' }).select('targetId -_id').lean(),
            User.findById(userId).select('bookmarks').lean(),
            Rating.find({ user: userId, targetId: { $in: storyIds }, targetModel: 'Story' }).select('targetId value -_id').lean()
        ]) : Promise.resolve([[], { bookmarks: [] }, []]) // Повертаємо пусті значення для гостя
    ]);

    // 4. Створення мап для швидкого доступу
    const authorMap = authorsData.reduce((map, author) => { map[author._id.toString()] = author; return map; }, {});
    const [userLikes, userBookmarksDoc, userRatings] = userInteractions;
    const likedStoryIds = new Set(userLikes.map(like => like.targetId.toString()));
    const bookmarkedStoryIds = new Set(userBookmarksDoc?.bookmarks?.map(id => id.toString()) || []);
    const userRatingMap = userRatings.reduce((map, rating) => { map[rating.targetId.toString()] = rating.value; return map; }, {});

    // 5. Локалізація категорій
    let categoryLocalizedMap = {};
    if (categoriesData.length > 0) {
        const localizedCategoryNames = await getLocalizedData(categoriesData, lang, 'uk', 'Category', ['name']);
        categoryLocalizedMap = localizedCategoryNames.reduce((map, cat) => {
            map[cat._id.toString()] = { name: cat.name, slug: cat.slug };
            return map;
        }, {});
    }

    // 6. Формування фінального результату
    return localizedStories.map(story => {
        const authorInfo = story.author ? authorMap[story.author.toString()] : null;
        const categoryInfo = story.category ? categoryLocalizedMap[story.category.toString()] : null;
        const storyIdStr = story._id?.toString();

        // Формуємо excerpt з локалізованого контенту
        const contentForExcerpt = story.content || '';
        const excerpt = (contentForExcerpt && typeof contentForExcerpt === 'string')
            ? contentForExcerpt.replace(/<[^>]*>?/gm, '').substring(0, 150) // Обрізаємо до 150 символів
            : '';

        const finalStory = {
            ...story, // Включає локалізовану title та повний content (який ми зараз видалимо)
            author: authorInfo ? { _id: authorInfo._id, name: authorInfo.name, avatarUrl: authorInfo.avatarUrl } : null,
            category: categoryInfo || null,
            liked: userId && storyIdStr ? likedStoryIds.has(storyIdStr) : false,
            bookmarked: userId && storyIdStr ? bookmarkedStoryIds.has(storyIdStr) : false,
            userRating: userId && storyIdStr ? (userRatingMap[storyIdStr] || 0) : 0,
            excerpt: excerpt // Додаємо excerpt
        };

        delete finalStory.content; // Видаляємо повний контент з відповіді списку

        return finalStory;
    });
}

// --- GET ALL STORIES ---
exports.getAllStories = catchAsync(async (req, res, next) => {
    const lang = req.query.lang || 'uk';
    const userId = req.user?._id || null;

    // --- Формування базового фільтра ---
    const baseFilter = {};
    const canViewNonPublished = req.user && ['admin', 'moderator'].includes(req.user.role);

    if (req.query.status) {
        const requestedStatuses = req.query.status.split(',').map(s => s.trim()).filter(Boolean);
        const allowedStatuses = canViewNonPublished
            ? ['draft', 'pending', 'published', 'rejected']
            : ['published']; // Звичайні користувачі бачать тільки опубліковані

        const finalStatuses = requestedStatuses.filter(status => allowedStatuses.includes(status));

        // Якщо автор запитує свої історії, дозволяємо всі статуси
        if (req.query.author && req.query.author === userId?.toString()) {
            baseFilter.author = userId; // Фільтр за автором
            if (requestedStatuses.length > 0) { // Якщо автор вказав статус
                baseFilter.status = { $in: requestedStatuses };
            } // Якщо автор не вказав статус, показуємо всі його статуси
        } else if (finalStatuses.length > 0) {
            baseFilter.status = { $in: finalStatuses };
        } else {
            // Якщо не передано валідний статус, показуємо тільки опубліковані (або нічого, якщо немає прав)
            baseFilter.status = 'published';
        }
    } else {
        // За замовчуванням показуємо тільки опубліковані
        baseFilter.status = 'published';
    }

    // --- Додавання інших фільтрів ---
    if (req.query.author && !baseFilter.author) { // Додаємо фільтр автора, якщо він ще не встановлений
        if (mongoose.Types.ObjectId.isValid(req.query.author)) {
            baseFilter.author = req.query.author;
        } else {
            console.warn(`Некоректний ID автора у фільтрі: ${req.query.author}`);
            // Можна повернути порожній результат або ігнорувати фільтр
            return res.status(200).json({ status: 'success', results: 0, data: [], pagination: { /* ... */ } });
        }
    }
    if (req.query.category) {
        const category = await Category.findOne({ slug: req.query.category }).select('_id').lean();
        if (category) {
            baseFilter.category = category._id;
        } else {
            // Якщо категорію не знайдено, повертаємо порожній результат
            return res.status(200).json({ status: 'success', results: 0, data: [], pagination: { currentPage: 1, totalPages: 0, totalResults: 0, limit: Number(req.query.limit) || 12 } });
        }
    }
    if (req.query.tags) {
        const tags = req.query.tags.split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean);
        if (tags.length > 0) baseFilter.tags = { $in: tags };
    }
    if (req.query.isPremium !== undefined) {
        baseFilter.isPremium = String(req.query.isPremium).toLowerCase() === 'true';
    }

    // --- APIFeatures ---
    const features = new APIFeatures(
        Story.find(baseFilter), // Передаємо вже збудований фільтр
        req.query
    )
        // .filter() // Фільтрація вже частково врахована в baseFilter, але можна додати ще
        .sort(req.query.sort || '-createdAt') // Сортування
        // Вибираємо поля, ВКЛЮЧАЮЧИ 'content' для prepareStoryListResponse
        .limitFields('-rejectionReason -moderatedBy -moderatedAt +content')
        .paginate(12); // Пагінація

    const stories = await features.query.lean();
    const totalDocuments = await Story.countDocuments(baseFilter); // Рахуємо з урахуванням базового фільтра

    // Готуємо фінальну відповідь
    const finalStories = await prepareStoryListResponse(stories, lang, userId);

    res.status(200).json({
        status: 'success',
        results: finalStories.length,
        data: finalStories,
        pagination: {
            currentPage: features.pagination.currentPage,
            limit: features.pagination.limit,
            totalPages: Math.ceil(totalDocuments / features.pagination.limit),
            totalResults: totalDocuments,
        }
    });
});

// --- GET ONE STORY ---
exports.getStory = catchAsync(async (req, res, next) => {
    const lang = req.query.lang || 'uk';
    const userId = req.user?._id || null;
    const userRole = req.user?.role || 'guest';
    const storyId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(storyId)) {
        return next(new AppError('Некоректний ID історії.', 400));
    }

    // Знаходимо історію, вибираючи потрібні поля
    const story = await Story.findById(storyId)
        .select('-__v') // Виключаємо __v
        .lean(); // Використовуємо lean, бо будемо модифікувати об'єкт

    if (!story) return next(new AppError('Історію не знайдено', 404));

    // --- Перевірка доступу ---
    const isAuthor = story.author?.toString() === userId?.toString();
    const canView = story.status === 'published' || isAuthor || userRole === 'admin' || userRole === 'moderator';

    if (!canView) {
        return next(new AppError('Ця історія недоступна для перегляду.', 403));
    }

    // --- Паралельне завантаження даних ---
    const [localizedData, authorData, categoryDoc, interactionStatus] = await Promise.all([
        getLocalizedData([story], lang, 'uk', 'Story', STORY_TRANSLATABLE_FIELDS).then(res => res[0]),
        story.isAnonymous ? Promise.resolve(null) : User.findById(story.author).select('name avatarUrl bio stats.storyCount stats.averageRating stats.followersCount').lean(), // Додаємо статистику
        story.category ? Category.findById(story.category).select('name slug').lean() : Promise.resolve(null), // Вибираємо потрібні поля
        userId ? api.users.getStoryInteractionStatus(storyId) : Promise.resolve({ data: { liked: false, bookmarked: false, rating: 0, followingAuthor: false } }) // Завантажуємо статус взаємодії
    ]);

    // --- Перевірка преміум доступу та обрізка контенту ---
    const isPremiumStory = story.isPremium;
    const userHasPremiumAccess = req.user?.isPremium || userRole === 'admin' || userRole === 'moderator';
    let storyContent = localizedData?.content || story.content || ''; // Пріоритет локалізованому
    let premiumLock = false;

    if (isPremiumStory && !userHasPremiumAccess) {
        const previewPercentage = 0.3; // 30% контенту
        const previewLength = Math.max(500, Math.floor(storyContent.length * previewPercentage)); // Не менше 500 символів
        storyContent = storyContent.substring(0, previewLength) + (storyContent.length > previewLength ? '...' : '');
        premiumLock = true;
    }

    // --- Локалізація категорії ---
    const localizedCategory = categoryDoc ? (await getLocalizedData([categoryDoc], lang, 'uk', 'Category', ['name']))[0] : null;

    // --- Оновлення переглядів (асинхронно, не блокуємо відповідь) ---
    if (!isAuthor && story.status === 'published') {
        Story.updateOne({ _id: story._id }, { $inc: { views: 1 } })
            .exec() // Запускаємо запит
            .catch(err => console.error(`Помилка оновлення лічильника переглядів для історії ${story._id}:`, err));
    }

    // --- Формування фінальної відповіді ---
    const finalStory = {
        ...story, // Всі оригінальні поля, крім __v
        title: localizedData?.title || story.title, // Пріоритет локалізації
        content: storyContent, // Обрізаний або повний контент
        premiumLock: premiumLock,
        author: authorData ? { // Додаємо статистику автора
            _id: authorData._id, name: authorData.name, avatarUrl: authorData.avatarUrl,
            bio: authorData.bio, stats: {
                storyCount: authorData.stats?.storyCount ?? 0,
                averageRating: authorData.stats?.averageRating ?? 0,
                followersCount: authorData.stats?.followersCount ?? 0
            }
        } : (story.isAnonymous ? { _id: null, name: 'Анонім', avatarUrl: null, stats: {} } : null),
        category: localizedCategory ? { _id: categoryDoc._id, slug: categoryDoc.slug, name: localizedCategory.name } : null,
        // Статуси взаємодії
        liked: interactionStatus.data.liked,
        bookmarked: interactionStatus.data.bookmarked,
        userRating: interactionStatus.data.rating,
        followingAuthor: interactionStatus.data.followingAuthor,
    };

    // Видаляємо поля модерації для звичайних користувачів
    if (!isAuthor && userRole !== 'admin' && userRole !== 'moderator') {
        delete finalStory.moderatedBy;
        delete finalStory.moderatedAt;
        delete finalStory.rejectionReason;
        delete finalStory.status; // Статус теж приховуємо, якщо не опубліковано (хоча перевірка вище)
    }

    res.status(200).json({ status: 'success', data: finalStory });
});

// --- CREATE STORY ---
exports.createStory = catchAsync(async (req, res, next) => {
    const authorId = req.user._id;
    const requestData = req.body.jsonData ? JSON.parse(req.body.jsonData) : req.body;
    const { translations, category, tags, isPremium, isAnonymous, ageRating } = requestData;
    const imageUrl = req.body.imageUrl; // URL з GCS (встановлено в handleImageUrl)

    // --- Валідація на бекенді (додатково до middleware) ---
    if (!translations?.uk?.title?.trim()) return next(new AppError('Необхідно надати українську назву (translations.uk.title).', 400));
    if (!translations?.uk?.content?.trim()) return next(new AppError('Необхідно надати український текст історії (translations.uk.content).', 400));
    if (translations.uk.content.trim().length < 100) return next(new AppError('Текст історії (uk) занадто короткий (мінімум 100 символів).', 400));
    if (!category || !mongoose.Types.ObjectId.isValid(category)) return next(new AppError('Необхідно вказати коректний ID категорії.', 400));
    const categoryExists = await Category.exists({ _id: category });
    if (!categoryExists) return next(new AppError('Вказаної категорії не існує.', 400));
    // --- Кінець валідації ---

    const ukTitle = translations.uk.title.trim();
    const baseSlug = slugify(ukTitle, { lower: true, strict: true, locale: 'uk' });
    // Генеруємо унікальний суфікс, щоб уникнути колізій
    const uniqueSuffix = crypto.randomBytes(4).toString('hex');
    const slug = `${baseSlug}-${uniqueSuffix}`;

    const readingTime = calculateReadingTime(translations.uk.content.trim());

    const storyData = {
        slug, author: authorId, category, readingTime,
        tags: Array.isArray(tags) ? [...new Set(tags.map(tag => tag.trim().toLowerCase()).filter(Boolean))] : [],
        status: 'pending', // Завжди на модерацію при створенні
        isPremium: !!isPremium,
        isAnonymous: !!isAnonymous,
        ageRating: ['18+', '21+'].includes(ageRating) ? ageRating : '18+',
        imageUrl: imageUrl || null // З middleware
    };

    const newStory = await Story.create(storyData);

    // Зберігаємо переклади
    const translationDocs = Object.entries(translations).map(([lang, fields]) => {
        const title = fields?.title?.trim();
        const content = fields?.content?.trim();
        if (!title || !content) {
            console.warn(`Пропуск перекладу для мови '${lang}' для історії ${newStory._id} (відсутні title або content)`);
            return null;
        }
        if (content.length < 100) { // Перевірка довжини контенту для всіх мов
            console.warn(`Контент для мови '${lang}' закороткий (історія ${newStory._id}). Пропускається.`);
            return null;
        }
        return { refId: newStory._id, refModel: 'Story', lang: lang, fields: { title, content } };
    }).filter(Boolean); // Видаляємо null елементи

    if (!translationDocs.some(t => t.lang === 'uk')) {
        await Story.findByIdAndDelete(newStory._id);
        if (imageUrl) await deleteFromGCS(imageUrl); // Видаляємо зображення
        return next(new AppError('Український переклад є обов\'язковим і не може бути порожнім.', 400));
    }
    try { await Translation.insertMany(translationDocs); }
    catch (translationError) {
        await Story.findByIdAndDelete(newStory._id);
        if (imageUrl) await deleteFromGCS(imageUrl); // Видаляємо зображення
        console.error("Помилка збереження перекладів історії:", translationError);
        return next(new AppError('Помилка збереження перекладів історії.', 500));
    }

    // Сповіщення модераторам
    try {
        const storyUrl = `${process.env.FRONTEND_URL || ''}/story-detailed.html?id=${newStory._id}`;
        const moderationLink = `${process.env.ADMIN_URL || process.env.FRONTEND_URL || ''}/admin/stories/pending`; // Потрібно створити цю сторінку
        const message = `📖 Нова історія "<a href="${storyUrl}">${ukTitle}</a>" (ID: ${newStory._id}) від ${req.user.name} чекає на модерацію.\nПерейти до модерації: ${moderationLink}`;
        await sendTelegramNotification(message, { parse_mode: 'HTML', disable_web_page_preview: false });
    } catch (notificationError) { console.error("Помилка Telegram сповіщення про нову історію:", notificationError); }

    res.status(201).json({
        status: 'success',
        message: 'Історію успішно створено та надіслано на модерацію.',
        data: { _id: newStory._id, slug: newStory.slug } // Повертаємо ID та slug
    });
});

// --- UPDATE STORY ---
exports.updateStory = catchAsync(async (req, res, next) => {
    const storyId = req.params.id;
    const userId = req.user._id;
    const userRole = req.user.role;
    // Визначаємо джерело даних
    const hasFileOrRemoval = !!req.file || req.body.removeImage === true || req.body.removeImage === 'true';
    const requestData = hasFileOrRemoval && req.body.jsonData ? JSON.parse(req.body.jsonData) : req.body;
    const { translations, category, tags, isPremium, isAnonymous, ageRating, status, rejectionReason } = requestData;
    // imageUrl беремо з req.body, бо його туди додає handleImageUrl
    const newImageUrl = req.body.imageUrl; // Може бути URL, null або undefined
    const removeImageFlag = req.body.removeImage === true || req.body.removeImage === 'true'; // З jsonData або body

    if (!mongoose.Types.ObjectId.isValid(storyId)) {
        return next(new AppError('Некоректний ID історії.', 400));
    }

    const story = await Story.findById(storyId);
    if (!story) return next(new AppError('Історію не знайдено.', 404));

    const isAdminOrModerator = ['admin', 'moderator'].includes(userRole);
    const isAuthor = story.author.toString() === userId.toString();
    if (!isAuthor && !isAdminOrModerator) {
        return next(new AppError('У вас немає прав для редагування цієї історії.', 403));
    }

    // --- Оновлення даних ---
    const updateData = {};
    let slugNeedsUpdate = false;
    let readingTimeNeedsUpdate = false;
    const oldImageUrl = story.imageUrl; // Зберігаємо старий URL
    let ukTitleForSlug = '';
    let translationsChanged = false;
    let statusChanged = false;
    const oldStatus = story.status;

    // Неперекладні поля
    if (category && mongoose.Types.ObjectId.isValid(category) && story.category?.toString() !== category) {
        const categoryExists = await Category.exists({ _id: category });
        if (categoryExists) updateData.category = category;
    }
    if (tags !== undefined && Array.isArray(tags)) {
        const newTags = [...new Set(tags.map(tag => tag?.trim()?.toLowerCase()).filter(Boolean))];
        // Перевіряємо, чи масив дійсно змінився, щоб уникнути зайвих оновлень
        if (JSON.stringify(newTags.sort()) !== JSON.stringify((story.tags || []).sort())) {
            updateData.tags = newTags;
        }
    }
    if (isPremium !== undefined && typeof isPremium === 'boolean' && story.isPremium !== isPremium) updateData.isPremium = isPremium;
    if (isAnonymous !== undefined && typeof isAnonymous === 'boolean' && story.isAnonymous !== isAnonymous) updateData.isAnonymous = isAnonymous;
    if (ageRating && ['18+', '21+'].includes(ageRating) && story.ageRating !== ageRating) updateData.ageRating = ageRating;

    // Зображення (newImageUrl = URL | null | undefined)
    if (newImageUrl !== undefined) { // Якщо поле imageUrl прийшло (навіть null)
        updateData.imageUrl = newImageUrl;
    } else if (removeImageFlag && oldImageUrl) { // Якщо файлу/url немає, але є прапорець видалення
        updateData.imageUrl = null;
    } // Якщо undefined і немає removeImageFlag - поле imageUrl не оновлюється

    // Статус (тільки адмін/модератор або автор для певних переходів)
    if (status && ['draft', 'pending', 'published', 'rejected'].includes(status) && status !== oldStatus) {
        let allowChange = false;
        if (isAdminOrModerator) {
            allowChange = true;
            updateData.moderatedBy = userId;
            updateData.moderatedAt = Date.now();
            updateData.rejectionReason = (status === 'rejected') ? (rejectionReason || '').trim() || null : null;
        } else if (isAuthor) {
            // Автор може повернути в чернетку або відправити на модерацію
            if ((['published', 'rejected'].includes(oldStatus) && status === 'draft') || (oldStatus === 'draft' && status === 'pending')) {
                allowChange = true;
                updateData.moderatedBy = null; updateData.moderatedAt = null; updateData.rejectionReason = null;
            }
        }
        if (allowChange) {
            updateData.status = status;
            statusChanged = true;
        } else {
            console.warn(`Користувач ${userId} (${userRole}) не може змінити статус історії ${storyId} з ${oldStatus} на ${status}`.yellow);
        }
    }

    // Переклади
    // Обробка перекладів
    if (translations && typeof translations === 'object') {
        // Отримуємо всі поточні переклади одним запитом
        const currentTranslations = await Translation.find({ refId: story._id, refModel: 'Story' }).lean();
        const currentTransMap = currentTranslations.reduce((map, t) => {
            map[t.lang] = t.fields instanceof Map ? Object.fromEntries(t.fields) : (t.fields || {});
            return map;
        }, {});

        const bulkOps = [];
        for (const [lang, fields] of Object.entries(translations)) {
            const currentFields = currentTransMap[lang] || {};
            const fieldsToUpdate = {}; let hasChanges = false;

            // Перевіряємо кожне поле на наявність та зміну
            if (fields.title !== undefined && String(fields.title).trim() !== (currentFields.title || '')) {
                fieldsToUpdate.title = String(fields.title).trim(); hasChanges = true;
            }
            if (fields.content !== undefined && String(fields.content).trim() !== (currentFields.content || '')) {
                fieldsToUpdate.content = String(fields.content).trim(); hasChanges = true;
            }

            if (hasChanges) {
                // Валідація (наприклад, мінімальна довжина контенту)
                if (fieldsToUpdate.content && fieldsToUpdate.content.length < 100) {
                    return next(new AppError(`Текст історії (${lang}) занадто короткий (мінімум 100 символів).`, 400));
                }
                translationsChanged = true; // Позначаємо, що були зміни в перекладах

                // --- ВИПРАВЛЕНО: Формування об'єкта для $set ---
                const updateSetData = {};
                for (const [key, value] of Object.entries(fieldsToUpdate)) {
                    updateSetData[`fields.${key}`] = value; // Правильний синтаксис для $set
                }
                // --- Кінець виправлення ---

                // Готуємо операцію оновлення або вставки
                bulkOps.push({
                    updateOne: {
                        filter: { refId: story._id, refModel: 'Story', lang },
                        // Використовуємо зібраний об'єкт updateSetData
                        update: { $set: updateSetData },
                        upsert: true // Створюємо, якщо перекладу ще немає
                    }
                });

                if (lang === 'uk') {
                    if (fieldsToUpdate.title) { slugNeedsUpdate = true; ukTitleForSlug = fieldsToUpdate.title; }
                    if (fieldsToUpdate.content) readingTimeNeedsUpdate = true;
                }
            }
        }
        if (bulkOps.length > 0) {
            try { await Translation.bulkWrite(bulkOps); }
            catch (err) { return next(new AppError('Помилка оновлення перекладів.', 500)); }
        }
        // Якщо змінювали не 'uk' переклад, але нам потрібна 'uk' назва для slug
        if (slugNeedsUpdate && !ukTitleForSlug) {
            ukTitleForSlug = currentTransMap['uk']?.title || story.title;
        }
    }



    // Оновлюємо slug, якщо потрібно
    if (slugNeedsUpdate && ukTitleForSlug) {
        const baseSlug = slugify(ukTitleForSlug, { lower: true, strict: true, locale: 'uk' });
        // Використовуємо частину ID для унікальності, щоб не перевіряти існуючі
        const uniqueSuffix = story._id.toString().slice(-6);
        updateData.slug = `${baseSlug}-${uniqueSuffix}`;
    }

    // Оновлюємо час читання, якщо потрібно
    if (readingTimeNeedsUpdate) {
        // Беремо новий uk контент, якщо він є, інакше поточний з БД
        const ukContent = translations?.uk?.content?.trim() ||
            (await Translation.findOne({ refId: story._id, refModel: 'Story', lang: 'uk' }).lean())?.fields?.content;
        if (ukContent) updateData.readingTime = calculateReadingTime(ukContent);
    }

    // Перевіряємо, чи є взагалі зміни для основного документа
    if (Object.keys(updateData).length === 0 && !translationsChanged) {
        console.log(`Оновлення історії ${storyId}: немає змін для збереження.`);
        // Повертаємо поточні дані (або тільки ID/slug)
        const currentData = await Story.findById(storyId).select('_id slug').lean();
        return res.status(200).json({ status: 'success', data: currentData });
    }

    // Зберігаємо основний документ Story
    const updatedStory = await Story.findByIdAndUpdate(storyId, updateData, {
        new: true, // Повернути оновлений документ
        runValidators: true // Запустити валідацію Mongoose
    });

    if (!updatedStory) return next(new AppError('Не вдалося оновити історію.', 500));

    // Видаляємо старе зображення з GCS, якщо воно було замінено або видалено
    const imageUrlChanged = updateData.imageUrl !== undefined && oldImageUrl !== updateData.imageUrl;
    if (oldImageUrl && imageUrlChanged) {
        console.log(`[UpdateStory] Видалення старого зображення історії: ${oldImageUrl}`);
        deleteFromGCS(oldImageUrl).catch(err => {
            console.error(`[UpdateStory] Помилка видалення старого зображення ${oldImageUrl} з GCS:`, err);
        });
    }

    // Сповіщення автору про зміну статусу модератором
    if (statusChanged && updateData.status && oldStatus !== updateData.status && isAdminOrModerator && !isAuthor) {
        try {
            const author = await User.findById(story.author).select('email name telegramUserId').lean();
            if (author) {
                const titleForNotification = ukTitleForSlug || updatedStory.title; // Використовуємо оновлену назву
                const storyUrl = `${process.env.FRONTEND_URL || ''}/story-detailed.html?id=${story._id}`;
                let subject = '', message = '', telegramMessage = '';
                const siteName = process.env.SITE_NAME || 'EroStory';

                if (updateData.status === 'published') {
                    subject = `Вашу історію "${titleForNotification}" опубліковано!`;
                    message = `🎉 Вітаємо, ${author.name || 'Автор'}!\n\nВашу історію "<a href="${storyUrl}">${titleForNotification}</a>" було схвалено та опубліковано на сайті ${siteName}.`;
                    telegramMessage = `✅ Вашу історію "<a href="${storyUrl}">${titleForNotification}</a>" опубліковано модератором.`;
                } else if (updateData.status === 'rejected') {
                    const reason = updateData.rejectionReason || 'Причина не вказана.';
                    subject = `Вашу історію "${titleForNotification}" відхилено`;
                    message = `🙁 Шановний(а) ${author.name || 'Автор'},\n\nНа жаль, вашу історію "<a href="${storyUrl}">${titleForNotification}</a>" було відхилено модератором.${reason ? '\nПричина: ' + reason : ''}\n\nВи можете відредагувати її та надіслати на повторну модерацію.`;
                    telegramMessage = `❌ Вашу історію "<a href="${storyUrl}">${titleForNotification}</a>" відхилено.${reason ? '\n<i>Причина:</i> ' + reason : ''}`;
                }
                // Сповіщення в адмін чат про дію модератора
                const adminActionMessage = `ℹ️ Модератор ${req.user.name} ${updateData.status === 'published' ? 'схвалив(ла)' : 'відхилив(ла)'} історію "<a href="${storyUrl}">${titleForNotification}</a>" (ID: ${storyId}). ${updateData.status === 'rejected' && updateData.rejectionReason ? ' Причина: ' + updateData.rejectionReason : ''}`;
                sendTelegramNotification(adminActionMessage, { parse_mode: 'HTML' }).catch(e => console.error("Помилка Telegram сповіщення модераторам:", e));


                if (subject && message && author.email) {
                    const plainTextMessage = message.replace(/<[^>]*>?/gm, '');
                    sendEmail({ email: author.email, subject, message: plainTextMessage, html: message })
                        .catch(e => console.error("Помилка відправки Email сповіщення автору про статус:", e));
                }
                if (telegramMessage && author.telegramUserId) {
                    sendTelegramNotification(telegramMessage, { parse_mode: 'HTML' }, author.telegramUserId)
                        .catch(e => console.error(`Помилка Telegram сповіщення користувачу ${author.telegramUserId} про статус:`, e));
                }
            }
        } catch (notificationError) { console.error('Помилка відправки сповіщення автору про зміну статусу:', notificationError); }
    }

    console.log(`Історія ${storyId} успішно оновлена користувачем ${userId}`.green);
    res.status(200).json({
        status: 'success',
        message: 'Історію успішно оновлено.', // Додаємо повідомлення
        data: { _id: updatedStory._id, slug: updatedStory.slug } // Повертаємо оновлені дані
    });
});

// --- DELETE STORY ---
exports.deleteStory = catchAsync(async (req, res, next) => {
    const storyId = req.params.id;
    const userId = req.user._id;
    const userRole = req.user.role;

    if (!mongoose.Types.ObjectId.isValid(storyId)) {
        return next(new AppError('Некоректний ID історії.', 400));
    }

    // Використовуємо findOne для перевірки прав перед видаленням
    const story = await Story.findById(storyId).select('author imageUrl slug status'); // Додаємо status
    if (!story) return next(new AppError('Історію не знайдено.', 404));

    // Перевірка прав доступу
    if (story.author.toString() !== userId.toString() && userRole !== 'admin' && userRole !== 'moderator') {
        return next(new AppError('У вас немає прав для видалення цієї історії.', 403));
    }

    // Видаляємо історію (хук pre('findOneAndDelete') подбає про пов'язані дані)
    await Story.findByIdAndDelete(storyId);

    // Видаляємо зображення з GCS (після успішного видалення з БД)
    if (story.imageUrl) {
        console.log(`[DeleteStory] Видалення зображення історії: ${story.imageUrl}`.yellow);
        deleteFromGCS(story.imageUrl).catch(err => {
            console.error(`[DeleteStory] Помилка видалення зображення ${story.imageUrl} з GCS:`, err);
        });
    }

    // Сповіщення в Telegram
    try {
        const ukTranslation = await Translation.findOne({ refId: storyId, refModel: 'Story', lang: 'uk' }).lean();
        const titleForNotification = ukTranslation?.fields?.title || story.slug || storyId;
        const message = `🗑️ Історія "${titleForNotification}" (ID: ${storyId}, Статус: ${story.status}) видалена користувачем ${req.user.name}.`;
        await sendTelegramNotification(message);
    } catch (notificationError) {
        console.error("Помилка Telegram сповіщення про видалення історії:", notificationError);
    }

    console.log(`Історія ${storyId} видалена користувачем ${userId}`.yellow);
    res.status(204).json({ status: 'success', data: null });
});

// --- GET RELATED STORIES ---
exports.getRelatedStories = catchAsync(async (req, res, next) => {
    const storyId = req.params.id;
    const lang = req.query.lang || 'uk';
    const limit = Math.min(10, Number(req.query.limit) || 5); // Обмеження на кількість схожих
    const userId = req.user?._id || null; // Для перевірки статусу лайків/закладок

    if (!mongoose.Types.ObjectId.isValid(storyId)) {
        return next(new AppError('Некоректний ID історії.', 400));
    }

    const currentStory = await Story.findById(storyId).select('category tags author').lean();
    if (!currentStory) return next(new AppError('Поточну історію не знайдено.', 404));

    // --- Логіка пошуку схожих ---
    const matchConditions = {
        _id: { $ne: currentStory._id }, // Виключаємо поточну
        status: 'published', // Тільки опубліковані
        // isPremium: { $ne: true } // Опціонально: показувати тільки безкоштовні?
    };
    // Виключаємо історії того ж автора, якщо він не анонімний
    if (currentStory.author && !currentStory.isAnonymous) {
        matchConditions.author = { $ne: currentStory.author };
    }

    // Збираємо умови $or
    const orConditions = [];
    if (currentStory.category) orConditions.push({ category: currentStory.category });
    if (currentStory.tags && currentStory.tags.length > 0) orConditions.push({ tags: { $in: currentStory.tags } });

    // Якщо є умови $or, додаємо їх
    if (orConditions.length > 0) {
        matchConditions.$or = orConditions;
    } else {
        // Якщо немає ні категорії, ні тегів, можливо, варто шукати за іншими критеріями
        // або просто повернути останні опубліковані, виключаючи поточну
        console.warn(`Історія ${storyId} не має категорії або тегів для пошуку схожих.`);
        // Наприклад, шукаємо просто останні, крім поточної та автора
        delete matchConditions.$or; // Видаляємо порожній $or
    }

    // --- Агрегація для рейтингу релевантності ---
    const aggregationPipeline = [
        { $match: matchConditions },
        // Додаємо поле для підрахунку спільних тегів (тільки якщо вони є в поточній історії)
        currentStory.tags && currentStory.tags.length > 0 ? {
            $addFields: {
                commonTagsScore: {
                    $size: { $ifNull: [ { $setIntersection: ["$tags", currentStory.tags] }, [] ] }
                }
            }
        } : { $addFields: { commonTagsScore: 0 } },
        // Додаємо поле для відповідності категорії
        currentStory.category ? {
            $addFields: {
                categoryMatchScore: { $cond: [{ $eq: ["$category", currentStory.category] }, 1, 0] }
            }
        } : { $addFields: { categoryMatchScore: 0 } },
        // Додаємо поле для загального "рахунку схожості"
        {
            $addFields: {
                relevanceScore: {
                    $add: [
                        { $multiply: ["$categoryMatchScore", 2] }, // Вага для категорії
                        "$commonTagsScore" // Вага для тегів
                        // Можна додати інші фактори, напр., $averageRating, $views
                    ]
                }
            }
        },
        // Сортуємо за релевантністю, потім за іншими критеріями
        { $sort: { relevanceScore: -1, averageRating: -1, views: -1, createdAt: -1 } },
        { $limit: limit },
        // Проектуємо потрібні поля, включаючи 'content' для prepareStoryListResponse
        {
            $project: {
                _id: 1, title: 1, slug: 1, author: 1, category: 1, imageUrl: 1,
                isPremium: 1, ageRating: 1, averageRating: 1, readingTime: 1,
                views: 1, createdAt: 1, tags: 1, content: 1 // Включаємо content
            }
        }
    ];

    const relatedStoriesRaw = await Story.aggregate(aggregationPipeline);

    // Готуємо відповідь, передаючи отримані об'єкти
    const finalRelated = await prepareStoryListResponse(relatedStoriesRaw, lang, userId);

    res.status(200).json({
        status: 'success',
        results: finalRelated.length,
        data: finalRelated,
    });
});
// --- END OF FILE controllers/storyController.js ---