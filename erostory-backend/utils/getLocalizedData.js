// --- START OF FILE utils/getLocalizedData.js ---
const mongoose = require('mongoose');
const Translation = require('../models/Translation'); // Імпортуємо модель

/**
 * Отримує масив документів і додає до них локалізовані поля.
 * Ефективно завантажує всі необхідні переклади одним запитом.
 *
 * @param {Array<mongoose.Document|object>} docs - Масив Mongoose документів або простих об'єктів (після .lean()). Повинен містити поле `_id`.
 * @param {string} lang - Бажаний код мови (напр., 'en').
 * @param {string} defaultLang - Код мови за замовчуванням (напр., 'uk').
 * @param {string} refModel - Назва моделі ('Category', 'Story', 'Tag').
 * @param {Array<string>} translatableFields - Масив назв полів, які потрібно перекласти (напр., ['name', 'description']).
 * @returns {Promise<Array<object>>} - Масив об'єктів з доданими локалізованими полями.
 */
const getLocalizedData = async (docs, lang, defaultLang, refModel, translatableFields) => {
    // --- Базові перевірки ---
    if (!Array.isArray(docs) || docs.length === 0) {
        return []; // Повертаємо порожній масив, якщо вхідний порожній
    }
    if (!refModel || !Array.isArray(translatableFields) || translatableFields.length === 0) {
        console.warn('[getLocalizedData] Не вказано refModel або translatableFields. Повернення оригінальних документів.');
        return docs.map(doc => (doc && typeof doc === 'object' ? (doc.toObject ? doc.toObject() : { ...doc }) : doc));
    }

    // --- Отримуємо валідні ID ---
    const docIds = docs
        .map(doc => doc?._id)
        .filter(id => id && mongoose.Types.ObjectId.isValid(id));

    if (docIds.length === 0) {
        console.warn('[getLocalizedData] Не знайдено валідних _id в документах.');
        return docs.map(doc => (doc && typeof doc === 'object' ? (doc.toObject ? doc.toObject() : { ...doc }) : doc));
    }

    // --- Визначаємо мови для запиту ---
    const languagesToFetch = [lang, defaultLang].filter((l, i, self) => l && typeof l === 'string' && self.indexOf(l) === i);
    if (languagesToFetch.length === 0) {
        console.warn('[getLocalizedData] Не вказано валідних мов для отримання перекладів.');
        return docs.map(doc => (doc && typeof doc === 'object' ? (doc.toObject ? doc.toObject() : { ...doc }) : doc));
    }

    try {
        // --- Отримуємо ВСІ потрібні переклади ОДНИМ запитом ---
        const translations = await Translation.find({
            refId: { $in: docIds },
            refModel: refModel,
            lang: { $in: languagesToFetch }
        }).lean(); // Використовуємо lean для продуктивності

        // --- Створюємо зручну мапу для доступу: Map<docIdString, Map<langCode, fieldsObject>> ---
        const translationsMap = new Map();
        translations.forEach(t => {
            const idStr = t.refId.toString();
            if (!translationsMap.has(idStr)) {
                translationsMap.set(idStr, new Map());
            }
            // Перетворюємо Map з БД в простий об'єкт, якщо потрібно
            const fieldsObject = t.fields instanceof Map ? Object.fromEntries(t.fields) : (t.fields || {});
            translationsMap.get(idStr).set(t.lang, fieldsObject);
        });
        // console.debug(`[getLocalizedData] Translations map created for ${translationsMap.size} documents.`); // Debug log

        // --- Формуємо фінальний масив документів ---
        return docs.map(doc => {
            // Створюємо копію або перетворюємо Mongoose документ на об'єкт
            const plainDoc = doc && typeof doc === 'object' ? (doc.toObject ? doc.toObject() : { ...doc }) : {};
            const idStr = plainDoc._id?.toString();

            // Якщо немає ID або перекладів для цього ID, повертаємо копію як є
            if (!idStr || !translationsMap.has(idStr)) {
                // Додаємо порожні значення для перекладних полів, якщо їх немає в оригіналі
                translatableFields.forEach(field => {
                    if (plainDoc[field] === undefined) plainDoc[field] = '';
                });
                return plainDoc;
            }

            const docTranslations = translationsMap.get(idStr); // Map<lang, fields>
            const currentLangTranslations = docTranslations.get(lang) || {};
            const defaultLangTranslations = docTranslations.get(defaultLang) || {};

            // Проходимо по полях, які потрібно перекласти
            translatableFields.forEach(field => {
                // Визначаємо значення з пріоритетом: поточна мова -> дефолтна -> оригінал -> порожній рядок
                let value = ''; // Починаємо з порожнього рядка
                if (currentLangTranslations[field] !== undefined && currentLangTranslations[field] !== null && String(currentLangTranslations[field]).trim() !== '') {
                    value = currentLangTranslations[field];
                } else if (defaultLangTranslations[field] !== undefined && defaultLangTranslations[field] !== null && String(defaultLangTranslations[field]).trim() !== '') {
                    value = defaultLangTranslations[field];
                } else if (plainDoc[field] !== undefined && plainDoc[field] !== null) { // Перевіряємо оригінальне поле
                    value = plainDoc[field];
                }
                plainDoc[field] = value; // Встановлюємо знайдене або порожнє значення
            });

            return plainDoc; // Повертаємо оновлений об'єкт
        });

    } catch (error) {
        console.error(`[getLocalizedData] Помилка отримання або обробки перекладів для моделі ${refModel}:`, error);
        // У разі помилки повертаємо оригінальні документи, перетворені на об'єкти
        return docs.map(doc => (doc && typeof doc === 'object' ? (doc.toObject ? doc.toObject() : { ...doc }) : doc));
    }
};

module.exports = getLocalizedData;
// --- END OF FILE utils/getLocalizedData.js ---