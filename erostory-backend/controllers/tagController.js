// --- START OF FILE controllers/tagController.js ---
const mongoose = require('mongoose');
const crypto = require('crypto'); // Для унікального суфікса slug
const Tag = require('../models/Tag');
const Translation = require('../models/Translation');
const Story = require('../models/Story'); // Потрібно для оновлення історій
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const APIFeatures = require('../utils/apiFeatures');
const getLocalizedData = require('../utils/getLocalizedData');
const slugify = require('slugify');
const sendTelegramNotification = require('../utils/telegramNotifier');
require('colors');

const TAG_TRANSLATABLE_FIELDS = ['name'];
const DEFAULT_TAG_PAGINATION_LIMIT = 100; // Ліміт для списку тегів

// --- CREATE TAG (Admin only) ---
exports.createTag = catchAsync(async (req, res, next) => {
    const { translations } = req.body;

    // Валідація (додатково до middleware)
    if (!translations?.uk?.name?.trim()) {
        return next(new AppError('Необхідно надати українську назву тегу (translations.uk.name).', 400));
    }

    const ukName = translations.uk.name.trim();
    let slug = slugify(ukName, { lower: true, strict: true, locale: 'uk' });

    // Перевірка унікальності slug
    const existingTag = await Tag.findOne({ slug });
    if (existingTag) {
        const existingUkTranslation = await Translation.findOne({ refId: existingTag._id, refModel: 'Tag', lang: 'uk' }).lean();
        if (existingUkTranslation?.fields?.name === ukName) {
            return next(new AppError(`Тег "${ukName}" (slug: '${slug}') вже існує.`, 409));
        } else {
            const uniqueSuffix = crypto.randomBytes(3).toString('hex');
            slug = `${slug}-${uniqueSuffix}`;
            console.warn(`Згенеровано новий slug для тегу "${ukName}" через конфлікт: ${slug}`.yellow);
        }
    }

    // 1. Створюємо тег
    const newTag = await Tag.create({ slug });

    // 2. Готуємо та зберігаємо переклади
    const translationDocs = Object.entries(translations || {}).map(([lang, fields]) => {
        const name = fields?.name?.trim();
        if (!name) return null; // Зберігаємо тільки якщо є назва
        return { refId: newTag._id, refModel: 'Tag', lang: lang, fields: { name } };
    }).filter(Boolean);

    if (!translationDocs.some(t => t.lang === 'uk')) {
        await Tag.findByIdAndDelete(newTag._id); // Rollback
        return next(new AppError('Не вдалося створити тег через відсутність української назви.', 400));
    }

    try {
        if (translationDocs.length > 0) {
            await Translation.insertMany(translationDocs);
            console.log(`Створено ${translationDocs.length} перекладів для тегу ${newTag._id}`.green);
        }
    } catch (translationError) {
        await Tag.findByIdAndDelete(newTag._id); // Rollback
        console.error("Помилка збереження перекладів тегу:", translationError);
        if (translationError.code === 11000 || translationError.code === 11001) {
            return next(new AppError('Помилка: Дублюючий переклад для цього тегу та мови.', 409));
        }
        return next(new AppError('Помилка збереження перекладів тегу.', 500));
    }

    // 3. Сповіщення адмінам
    try {
        await sendTelegramNotification(`🏷️ Створено новий тег: "${ukName}" (slug: ${slug})`);
    } catch (e) { console.error('Telegram notification error (create tag):', e); }

    // 4. Повертаємо створений тег з українським перекладом
    const createdTagWithUkTranslation = (await getLocalizedData([newTag.toObject()], 'uk', 'uk', 'Tag', TAG_TRANSLATABLE_FIELDS))[0];

    res.status(201).json({ status: 'success', data: createdTagWithUkTranslation || newTag });
});

// --- GET ALL TAGS (Public) ---
exports.getAllTags = catchAsync(async (req, res, next) => {
    const lang = req.query.lang || 'uk';
    const features = new APIFeatures(Tag.find(), req.query)
        // .filter() // Фільтрація зазвичай не потрібна для всіх тегів
        .sort(req.query.sort || '-storyCount') // За популярністю (кількістю історій)
        .limitFields('-__v')
        .paginate(DEFAULT_TAG_PAGINATION_LIMIT); // Більший ліміт

    const tags = await features.query.lean();
    const totalDocuments = await Tag.countDocuments(features.getQueryFilter());

    // Локалізуємо назви
    const localizedTags = await getLocalizedData(tags, lang, 'uk', 'Tag', TAG_TRANSLATABLE_FIELDS);

    // Сортування за локалізованою назвою
    if (req.query.sort === 'name') {
        localizedTags.sort((a, b) => (a.name || '').localeCompare(b.name || '', lang));
    } else if (req.query.sort === '-name') {
        localizedTags.sort((a, b) => (b.name || '').localeCompare(a.name || '', lang));
    }

    res.status(200).json({
        status: 'success',
        results: localizedTags.length,
        data: localizedTags,
        pagination: {
            currentPage: features.pagination.currentPage,
            limit: features.pagination.limit,
            totalPages: Math.ceil(totalDocuments / features.pagination.limit),
            totalResults: totalDocuments,
        }
    });
});

// --- GET ONE TAG (Public) ---
exports.getTag = catchAsync(async (req, res, next) => {
    const queryParam = req.params.idOrSlug;
    const lang = req.query.lang || 'uk';

    const isObjectId = mongoose.Types.ObjectId.isValid(queryParam);
    const query = isObjectId ? { _id: queryParam } : { slug: queryParam };

    const tag = await Tag.findOne(query).lean();
    if (!tag) return next(new AppError('Тег не знайдено.', 404));

    const localizedTag = (await getLocalizedData([tag], lang, 'uk', 'Tag', TAG_TRANSLATABLE_FIELDS))[0];
    if (!localizedTag) return next(new AppError('Не вдалося отримати локалізовані дані тегу.', 500));

    res.status(200).json({ status: 'success', data: localizedTag });
});

// --- UPDATE TAG (Admin only) ---
exports.updateTag = catchAsync(async (req, res, next) => {
    const queryParam = req.params.idOrSlug;
    const lang = req.query.lang || 'uk'; // Мова для відповіді
    const { translations } = req.body; // Валідація тіла - в middleware

    const isObjectId = mongoose.Types.ObjectId.isValid(queryParam);
    const query = isObjectId ? { _id: queryParam } : { slug: queryParam };

    const tag = await Tag.findOne(query);
    if (!tag) return next(new AppError('Тег не знайдено.', 404));

    let needsTagSave = false;
    let slugNeedsUpdate = false;
    let newSlug = tag.slug;
    let originalUkName = tag.slug; // Fallback для логування
    let translationsChanged = false;
    const oldSlug = tag.slug; // Зберігаємо старий slug для оновлення в історіях

    if (translations && typeof translations === 'object') {
        const currentTranslations = await Translation.find({ refId: tag._id, refModel: 'Tag' }).lean();
        const currentTransMap = currentTranslations.reduce((map, t) => {
            map[t.lang] = t.fields instanceof Map ? Object.fromEntries(t.fields) : (t.fields || {});
            return map;
        }, {});
        originalUkName = currentTransMap['uk']?.name || tag.slug;

        const bulkOps = [];
        let ukNameChanged = false;
        let newUkName = '';

        for (const [langCode, fields] of Object.entries(translations)) {
            if (fields?.name !== undefined) { // Оновлюємо тільки якщо передано name
                const newName = String(fields.name).trim();
                if (langCode === 'uk' && !newName) {
                    return next(new AppError('Українська назва тегу не може бути порожньою.', 400));
                }
                const currentName = currentTransMap[langCode]?.name || '';
                if (newName !== currentName) {
                    translationsChanged = true;
                    const updateSetData = { [`fields.name`]: newName };
                    bulkOps.push({
                        updateOne: {
                            filter: { refId: tag._id, refModel: 'Tag', lang: langCode },
                            update: { $set: updateSetData },
                            upsert: true
                        }
                    });
                    if (langCode === 'uk') { ukNameChanged = true; newUkName = newName; }
                }
            }
        }

        if (bulkOps.length > 0) {
            try { await Translation.bulkWrite(bulkOps); }
            catch (err) { return next(new AppError('Помилка оновлення перекладів тегу.', 500)); }
        }

        // Оновлюємо slug, якщо змінилася українська назва
        if (ukNameChanged && newUkName) {
            const generatedSlug = slugify(newUkName, { lower: true, strict: true, locale: 'uk' });
            if (generatedSlug !== tag.slug) {
                const existingSlug = await Tag.findOne({ slug: generatedSlug, _id: { $ne: tag._id } });
                if (existingSlug) return next(new AppError(`Slug '${generatedSlug}' (${newUkName}) вже використовується іншим тегом.`, 409));
                newSlug = generatedSlug;
                slugNeedsUpdate = true;
            }
        }
    }

    // Оновлюємо slug в основному документі Tag та в історіях
    if (slugNeedsUpdate) {
        tag.slug = newSlug;
        needsTagSave = true;
    }

    // Зберігаємо основний документ, якщо були зміни
    if (needsTagSave) {
        await tag.save({ validateBeforeSave: false });

        // --- Оновлюємо тег в історіях, якщо slug змінився ---
        if (oldSlug && oldSlug !== newSlug) {
            console.log(`Оновлення тегу в історіях: ${oldSlug} -> ${newSlug}`.blue);
            try {
                // Використовуємо updateMany з $set для оновлення елементів масиву
                // Важливо: Це оновлює тільки ПЕРШЕ входження старого slug!
                // Якщо теги можуть дублюватися (не повинні), логіка складніша.
                const storyUpdateResult = await Story.updateMany(
                    { tags: oldSlug },
                    { $set: { "tags.$": newSlug } }
                );
                // Альтернатива (менш ефективна, але обробляє дублікати):
                // const storiesToUpdate = await Story.find({ tags: oldSlug }).select('_id tags');
                // const storyBulkOps = storiesToUpdate.map(story => ({
                //     updateOne: {
                //         filter: { _id: story._id },
                //         update: { tags: story.tags.map(t => t === oldSlug ? newSlug : t) }
                //     }
                // }));
                // if (storyBulkOps.length > 0) await Story.bulkWrite(storyBulkOps);

                console.log(`Тег оновлено в ${storyUpdateResult.modifiedCount} історіях: ${oldSlug} -> ${newSlug}`.cyan);
            } catch (storyUpdateError) {
                console.error(`ПОМИЛКА оновлення тегу "${oldSlug}" в історіях:`.red.bold, storyUpdateError);
                // Розглянути можливість відкату зміни slug тегу, якщо оновлення історій критичне
                // await Tag.updateOne({ _id: tag._id }, { slug: oldSlug }); // Відкат
                // return next(new AppError('Помилка оновлення тегу в історіях.', 500));
            }
        }
    }

    // Сповіщення адмінам про оновлення
    if (needsTagSave || translationsChanged) {
        try {
            const changes = [];
            if (slugNeedsUpdate) changes.push(`slug (новий: ${tag.slug})`);
            if (translationsChanged) changes.push('переклади');
            if (changes.length > 0) {
                await sendTelegramNotification(`🏷️ Оновлено тег: "${originalUkName}" (ID: ${tag._id}). Змінено: ${changes.join(', ')}.`);
            }
        } catch(e) { console.error('Telegram notification error (update tag):', e); }
    }

    // Повертаємо оновлений тег
    const updatedTag = await Tag.findById(tag._id).lean();
    const updatedLocalizedTag = (await getLocalizedData([updatedTag], lang, 'uk', 'Tag', TAG_TRANSLATABLE_FIELDS))[0];

    res.status(200).json({ status: 'success', data: updatedLocalizedTag });
});


// --- DELETE TAG (Admin only) ---
exports.deleteTag = catchAsync(async (req, res, next) => {
    const queryParam = req.params.idOrSlug;
    const isObjectId = mongoose.Types.ObjectId.isValid(queryParam);
    const query = isObjectId ? { _id: queryParam } : { slug: queryParam };

    // Використовуємо findOneAndDelete, щоб спрацював post hook
    const tag = await Tag.findOneAndDelete(query);
    if (!tag) return next(new AppError('Тег не знайдено.', 404));

    // Хук post('findOneAndDelete') в моделі Tag тепер видаляє переклади та оновлює історії.

    // Сповіщення адмінам
    try {
        // Спробуємо отримати українську назву (шукаємо окремо)
        const ukTranslation = await Translation.findOne({ refId: tag._id, refModel: 'Tag', lang: 'uk' }).lean();
        const tagNameForNotification = ukTranslation?.fields?.name || tag.slug;

        await sendTelegramNotification(`🗑️ Видалено тег: "${tagNameForNotification}" (slug: ${tag.slug}, ID: ${tag._id})`);
    } catch (e) { console.error('Telegram notification error (delete tag):', e); }

    res.status(204).json({ status: 'success', data: null });
});
// --- END OF FILE controllers/tagController.js ---