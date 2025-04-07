// --- START OF FILE controllers/categoryController.js ---
const mongoose = require('mongoose');
const crypto = require('crypto'); // Для унікального суфікса slug
const Category = require('../models/Category');
const Translation = require('../models/Translation');
const Story = require('../models/Story'); // Потрібен для хуків Category
const User = require('../models/User');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const APIFeatures = require('../utils/apiFeatures');
const getLocalizedData = require('../utils/getLocalizedData');
const slugify = require('slugify');
const sendTelegramNotification = require('../utils/telegramNotifier');
require('colors'); // Для логування

const CATEGORY_TRANSLATABLE_FIELDS = ['name', 'description'];
const DEFAULT_CATEGORY_PAGINATION_LIMIT = 50; // Ліміт для списку категорій

// --- CREATE CATEGORY (Admin only) ---
exports.createCategory = catchAsync(async (req, res, next) => {
    // Валідація даних (вже є в middleware, але додаємо ключові перевірки)
    const { translations, imageUrl } = req.body;
    if (!translations?.uk?.name?.trim()) {
        return next(new AppError('Необхідно надати українську назву категорії (translations.uk.name).', 400));
    }

    const ukName = translations.uk.name.trim();
    let slug = slugify(ukName, { lower: true, strict: true, locale: 'uk' });

    // Перевірка унікальності slug та генерація нового, якщо потрібно
    const existingCategory = await Category.findOne({ slug });
    if (existingCategory) {
        // Перевіряємо, чи це той самий переклад (можливо, дублікат запиту)
        const existingUkTranslation = await Translation.findOne({ refId: existingCategory._id, refModel: 'Category', lang: 'uk' }).lean();
        if (existingUkTranslation?.fields?.name === ukName) {
            return next(new AppError(`Категорія "${ukName}" (slug: '${slug}') вже існує.`, 409));
        } else {
            // Якщо slug збігся, але назва інша - додаємо унікальний суфікс
            const uniqueSuffix = crypto.randomBytes(3).toString('hex');
            slug = `${slug}-${uniqueSuffix}`;
            console.warn(`Згенеровано новий slug для категорії "${ukName}" через конфлікт: ${slug}`.yellow);
        }
    }

    // 1. Створюємо основний документ категорії
    const newCategory = await Category.create({ slug, imageUrl: imageUrl || null });

    // 2. Готуємо та зберігаємо переклади
    const translationDocs = Object.entries(translations || {}).map(([lang, fields]) => {
        const name = fields?.name?.trim();
        const description = fields?.description?.trim() || ''; // Опис не обов'язковий
        // Створюємо переклад тільки якщо є назва
        if (!name) return null;
        return { refId: newCategory._id, refModel: 'Category', lang, fields: { name, description } };
    }).filter(Boolean); // Видаляємо null

    // Перевіряємо наявність українського перекладу ще раз
    if (!translationDocs.some(t => t.lang === 'uk')) {
        await Category.findByIdAndDelete(newCategory._id); // Rollback
        return next(new AppError('Не вдалося створити категорію: відсутній український переклад назви.', 400));
    }

    try {
        if (translationDocs.length > 0) {
            await Translation.insertMany(translationDocs);
            console.log(`Створено ${translationDocs.length} перекладів для категорії ${newCategory._id}`.green);
        }
    } catch (translationError) {
        await Category.findByIdAndDelete(newCategory._id); // Rollback
        console.error("Помилка збереження перекладів категорії:", translationError);
        // Обробка помилки дублювання перекладу (малоймовірно через перевірку slug)
        if (translationError.code === 11000 || translationError.code === 11001) {
            return next(new AppError('Помилка: Дублюючий переклад для цієї категорії та мови.', 409));
        }
        return next(new AppError('Помилка збереження перекладів категорії.', 500));
    }

    // 3. Сповіщення адмінам
    try {
        await sendTelegramNotification(`➕ Створено нову категорію: "${ukName}" (slug: ${slug})`);
    } catch (e) { console.error('Telegram notification error (create category):', e); }

    // 4. Повертаємо створену категорію з українським перекладом
    const createdCategoryWithUkTranslation = (await getLocalizedData([newCategory.toObject()], 'uk', 'uk', 'Category', CATEGORY_TRANSLATABLE_FIELDS))[0];

    res.status(201).json({ status: 'success', data: createdCategoryWithUkTranslation || newCategory });
});

// --- GET ALL CATEGORIES (Public) ---
exports.getAllCategories = catchAsync(async (req, res, next) => {
    const lang = req.query.lang || 'uk';
    const features = new APIFeatures(Category.find(), req.query)
        // .filter() // Фільтрація зазвичай не потрібна для списку всіх категорій
        .sort(req.query.sort || '-stats.storyCount') // Сортування за кількістю історій спаданням
        .limitFields('-__v') // Виключаємо __v
        .paginate(DEFAULT_CATEGORY_PAGINATION_LIMIT); // Пагінація з дефолтним лімітом

    const categories = await features.query.lean();
    const totalDocuments = await Category.countDocuments(features.getQueryFilter());

    // Локалізуємо дані
    const localizedCategories = await getLocalizedData(categories, lang, 'uk', 'Category', CATEGORY_TRANSLATABLE_FIELDS);

    // Сортування за локалізованою назвою, якщо запитано
    if (req.query.sort === 'name') {
        localizedCategories.sort((a, b) => (a.name || '').localeCompare(b.name || '', lang));
    } else if (req.query.sort === '-name') {
        localizedCategories.sort((a, b) => (b.name || '').localeCompare(a.name || '', lang));
    }

    res.status(200).json({
        status: 'success',
        results: localizedCategories.length,
        data: localizedCategories,
        pagination: {
            currentPage: features.pagination.currentPage,
            limit: features.pagination.limit,
            totalPages: Math.ceil(totalDocuments / features.pagination.limit),
            totalResults: totalDocuments,
        }
    });
});

// --- GET ONE CATEGORY (Public) ---
exports.getCategory = catchAsync(async (req, res, next) => {
    const queryParam = req.params.idOrSlug;
    const lang = req.query.lang || 'uk';

    // Визначаємо, чи це ID, чи slug
    const isObjectId = mongoose.Types.ObjectId.isValid(queryParam);
    const query = isObjectId ? { _id: queryParam } : { slug: queryParam };

    const category = await Category.findOne(query).lean(); // .lean() для продуктивності
    if (!category) {
        return next(new AppError('Категорію не знайдено.', 404));
    }

    const localizedCategory = (await getLocalizedData([category], lang, 'uk', 'Category', CATEGORY_TRANSLATABLE_FIELDS))[0];
    if (!localizedCategory) {
        // Малоймовірно, але обробляємо
        return next(new AppError('Не вдалося отримати локалізовані дані категорії.', 500));
    }

    res.status(200).json({ status: 'success', data: localizedCategory });
});

// --- UPDATE CATEGORY (Admin only) ---
exports.updateCategory = catchAsync(async (req, res, next) => {
    const queryParam = req.params.idOrSlug;
    const lang = req.query.lang || 'uk'; // Мова для відповіді
    const { translations, imageUrl } = req.body; // Валідація тіла - в middleware

    const isObjectId = mongoose.Types.ObjectId.isValid(queryParam);
    const query = isObjectId ? { _id: queryParam } : { slug: queryParam };

    // Знаходимо категорію для оновлення
    const category = await Category.findOne(query);
    if (!category) return next(new AppError('Категорію не знайдено.', 404));

    let needsCategorySave = false;
    let slugNeedsUpdate = false;
    let newSlug = category.slug;
    let originalUkName = category.slug; // Fallback для логування
    let translationsChanged = false;

    // Оновлення imageUrl
    if (imageUrl !== undefined && category.imageUrl !== imageUrl) {
        category.imageUrl = imageUrl; // Може бути null
        needsCategorySave = true;
    }

    // Оновлення перекладів
    if (translations && typeof translations === 'object') {
        const currentTranslations = await Translation.find({ refId: category._id, refModel: 'Category' }).lean();
        const currentTransMap = currentTranslations.reduce((map, t) => {
            map[t.lang] = t.fields instanceof Map ? Object.fromEntries(t.fields) : (t.fields || {});
            return map;
        }, {});
        originalUkName = currentTransMap['uk']?.name || category.slug; // Беремо поточну укр назву

        const bulkOps = [];
        let ukNameChanged = false;
        let newUkName = '';

        for (const [langCode, fields] of Object.entries(translations)) {
            // Перевіряємо, чи передані поля і чи є зміни
            if (fields && (fields.name !== undefined || fields.description !== undefined)) {
                const currentFields = currentTransMap[langCode] || {};
                const fieldsToUpdate = {}; let hasChanges = false;

                if (fields.name !== undefined && String(fields.name).trim() !== (currentFields.name || '')) {
                    fieldsToUpdate.name = String(fields.name).trim(); hasChanges = true;
                }
                if (fields.description !== undefined && String(fields.description).trim() !== (currentFields.description || '')) {
                    fieldsToUpdate.description = String(fields.description).trim(); hasChanges = true;
                }

                if (hasChanges) {
                    if (langCode === 'uk' && !fieldsToUpdate.name && !currentFields.name) {
                        return next(new AppError('Українська назва категорії не може бути порожньою.', 400));
                    }
                    translationsChanged = true;
                    // Формуємо об'єкт для $set
                    const updateSetData = {};
                    for (const [key, value] of Object.entries(fieldsToUpdate)) {
                        updateSetData[`fields.${key}`] = value;
                    }

                    bulkOps.push({
                        updateOne: {
                            filter: { refId: category._id, refModel: 'Category', lang: langCode },
                            update: { $set: updateSetData },
                            upsert: true
                        }
                    });
                    if (langCode === 'uk' && fieldsToUpdate.name) {
                        ukNameChanged = true; newUkName = fieldsToUpdate.name;
                    }
                }
            }
        }

        if (bulkOps.length > 0) {
            try { await Translation.bulkWrite(bulkOps); }
            catch (err) { return next(new AppError('Помилка оновлення перекладів категорії.', 500)); }
        }

        // Оновлення slug, якщо змінилася українська назва
        if (ukNameChanged && newUkName) {
            const generatedSlug = slugify(newUkName, { lower: true, strict: true, locale: 'uk' });
            if (generatedSlug !== category.slug) {
                const existingSlug = await Category.findOne({ slug: generatedSlug, _id: { $ne: category._id } });
                if (existingSlug) return next(new AppError(`Slug '${generatedSlug}' (${newUkName}) вже використовується іншою категорією.`, 409));
                newSlug = generatedSlug;
                slugNeedsUpdate = true;
            }
        }
    }

    // Зберігаємо основний документ категорії, якщо потрібно
    if (needsCategorySave || slugNeedsUpdate) {
        if (slugNeedsUpdate) category.slug = newSlug;
        await category.save({ validateBeforeSave: false }); // Зберігаємо без валідації перекладів
    }

    // Сповіщення про оновлення
    if (needsCategorySave || translationsChanged || slugNeedsUpdate) {
        try {
            const changes = [];
            if (slugNeedsUpdate) changes.push(`slug (новий: ${category.slug})`);
            if (needsCategorySave) changes.push('imageUrl'); // Перевіряємо, чи змінилось imageUrl
            if (translationsChanged) changes.push('переклади');
            if (changes.length > 0) {
                await sendTelegramNotification(`📝 Оновлено категорію: "${originalUkName}" (ID: ${category._id}). Змінено: ${changes.join(', ')}.`);
            }
        } catch(e) { console.error('Telegram notification error (update category):', e); }
    }

    // Повертаємо оновлену категорію з потрібною локалізацією
    const updatedCategory = await Category.findById(category._id).lean(); // Перезавантажуємо дані
    const updatedLocalizedCategory = (await getLocalizedData([updatedCategory], lang, 'uk', 'Category', CATEGORY_TRANSLATABLE_FIELDS))[0];
    res.status(200).json({ status: 'success', data: updatedLocalizedCategory });
});

// --- DELETE CATEGORY (Admin only) ---
exports.deleteCategory = catchAsync(async (req, res, next) => {
    const queryParam = req.params.idOrSlug;
    const isObjectId = mongoose.Types.ObjectId.isValid(queryParam);
    const query = isObjectId ? { _id: queryParam } : { slug: queryParam };

    // Використовуємо findOneAndDelete, щоб спрацював post hook
    const category = await Category.findOneAndDelete(query);
    if (!category) return next(new AppError('Категорію не знайдено.', 404));

    // Логіка оновлення історій та видалення перекладів тепер у post hook моделі

    // Сповіщення адмінам
    try {
        // Спробуємо отримати українську назву (можливо, вона ще є в кеші або з `category`)
        // Краще шукати окремо, бо doc вже видалено з БД в post hook
        const ukTranslation = await Translation.findOne({ refId: category._id, refModel: 'Category', lang: 'uk' }).lean();
        const nameForNotification = ukTranslation?.fields?.name || category.slug; // Fallback на slug
        await sendTelegramNotification(`🗑️ Видалено категорію: "${nameForNotification}" (ID: ${category._id})`);
    } catch (e) { console.error('Telegram notification error (delete category):', e); }

    res.status(204).json({ status: 'success', data: null });
});

// --- SUBSCRIBE/UNSUBSCRIBE CATEGORY (Logged in users) ---
exports.toggleSubscribeCategory = catchAsync(async (req, res, next) => {
    const categorySlug = req.params.slug;
    const userId = req.user._id;

    const category = await Category.findOne({ slug: categorySlug }).select('_id name').lean(); // Отримуємо ID та назву для повідомлення
    if (!category) return next(new AppError('Категорію не знайдено.', 404));
    const categoryId = category._id;

    const user = await User.findById(userId).select('categorySubscriptions');
    if (!user) return next(new AppError('Помилка: Користувача не знайдено.', 404)); // Малоймовірно

    const isSubscribed = user.categorySubscriptions?.some(id => id.equals(categoryId));
    const updateOperation = isSubscribed ? '$pull' : '$addToSet';

    await User.findByIdAndUpdate(userId, { [updateOperation]: { categorySubscriptions: categoryId } });

    // Отримуємо локалізовану назву категорії для повідомлення
    const localizedCategoryName = (await getLocalizedData([category], req.user.preferredLang || 'uk', 'uk', 'Category', ['name']))[0]?.name || categorySlug;
    const messageKey = isSubscribed ? 'notifications.unsubscribedFromCategory' : 'notifications.subscribedToCategory';
    const fallbackMessage = isSubscribed ? `Ви відписалися від категорії "${localizedCategoryName}".` : `Ви підписалися на категорію "${localizedCategoryName}".`;

    console.log(`Користувач ${userId} ${isSubscribed ? 'відписався від' : 'підписався на'} категорію ${categorySlug}`.magenta);
    res.status(200).json({
        status: 'success',
        message: req.t ? req.t(messageKey, { name: localizedCategoryName }) : fallbackMessage,
        data: { subscribed: !isSubscribed }
    });
});

// --- GET CATEGORY STATUS (Subscribed/Favorite) (Logged in users) ---
exports.getCategoryStatus = catchAsync(async (req, res, next) => {
    const categorySlug = req.params.slug;
    const userId = req.user?._id;
    if (!userId) return next(new AppError('Потрібна авторизація.', 401));

    const category = await Category.findOne({ slug: categorySlug }).select('_id').lean();
    if (!category) return next(new AppError('Категорію не знайдено.', 404));
    const categoryId = category._id;

    // Перевіряємо підписку та обране одночасно
    const user = await User.findById(userId).select('categorySubscriptions favoriteCategories').lean();
    const isSubscribed = user?.categorySubscriptions?.some(id => id.equals(categoryId)) || false;
    const isFavorite = user?.favoriteCategories?.some(id => id.equals(categoryId)) || false;

    res.status(200).json({
        status: 'success',
        data: { isSubscribed, isFavorite }
    });
});

// --- TOGGLE FAVORITE CATEGORY (Logged in users) ---
exports.toggleFavoriteCategory = catchAsync(async (req, res, next) => {
    const categorySlug = req.params.slug;
    const userId = req.user._id;

    const category = await Category.findOne({ slug: categorySlug }).select('_id name').lean(); // Беремо і назву
    if (!category) return next(new AppError('Категорію не знайдено.', 404));
    const categoryId = category._id;

    const user = await User.findById(userId).select('favoriteCategories');
    if (!user) return next(new AppError('Помилка: Користувача не знайдено.', 404));

    const isFavorite = user.favoriteCategories?.some(id => id.equals(categoryId));
    const updateOperation = isFavorite ? '$pull' : '$addToSet';

    await User.findByIdAndUpdate(userId, { [updateOperation]: { favoriteCategories: categoryId } });

    // Локалізуємо назву для повідомлення
    const localizedCategoryName = (await getLocalizedData([category], req.user.preferredLang || 'uk', 'uk', 'Category', ['name']))[0]?.name || categorySlug;
    const messageKey = isFavorite ? 'notifications.categoryRemovedFromFavorites' : 'notifications.categoryAddedToFavorites';
    const fallbackMessage = isFavorite ? `Категорія "${localizedCategoryName}" видалена з обраних.` : `Категорія "${localizedCategoryName}" додана до обраних.`;

    console.log(`Користувач ${userId} ${isFavorite ? 'видалив з' : 'додав до'} обраних категорію ${categorySlug}`.cyan);
    res.status(200).json({
        status: 'success',
        message: req.t ? req.t(messageKey, { name: localizedCategoryName }) : fallbackMessage,
        data: { isFavorite: !isFavorite }
    });
});
// --- END OF FILE controllers/categoryController.js ---