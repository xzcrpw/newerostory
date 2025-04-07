// --- START OF FILE utils/apiFeatures.js ---
const mongoose = require('mongoose'); // Додано, хоча використовується лише для типу

/**
 * Клас для реалізації фільтрації, сортування, вибору полів та пагінації
 * для запитів Mongoose.
 */
class APIFeatures {
    /**
     * @param {mongoose.Query} query - Об'єкт запиту Mongoose.
     * @param {object} queryString - Об'єкт req.query з параметрами запиту.
     */
    constructor(query, queryString) {
        this.query = query;
        this.queryString = { ...queryString }; // Копіюємо, щоб не мутувати оригінал
        this.queryFilter = {}; // Для збереження фінального фільтра
        this.pagination = {}; // Для збереження параметрів пагінації
    }

    /**
     * Застосовує фільтрацію до запиту Mongoose.
     * Виключає спеціальні поля. Перетворює оператори порівняння.
     * @returns {APIFeatures} - Повертає this для ланцюжкового виклику.
     */
    filter() {
        const queryObj = { ...this.queryString };
        const excludedFields = ['page', 'sort', 'limit', 'fields', 'lang'];
        excludedFields.forEach(el => delete queryObj[el]);

        let queryStr = JSON.stringify(queryObj);
        queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);

        try {
            this.queryFilter = JSON.parse(queryStr);

            // --- Логування застосованого фільтра в режимі розробки ---
            if (process.env.NODE_ENV === 'development' && Object.keys(this.queryFilter).length > 0) {
                console.log('[DEV_DEBUG] APIFeatures - Mongoose filter applied:', JSON.stringify(this.queryFilter));
            }
            // -------------------------------------------------------

            this.query = this.query.find(this.queryFilter);
        } catch (e) {
            console.error("Помилка парсингу фільтра запиту:", e, "Оригінальний рядок:", queryStr);
            // Замість кидання помилки, просто ігноруємо некоректний фільтр
        }

        return this;
    }

    /**
     * Застосовує сортування до запиту Mongoose.
     * @returns {APIFeatures} - Повертає this для ланцюжкового виклику.
     */
    sort(defaultSort = '-createdAt') { // Додано дефолтне сортування
        if (this.queryString.sort) {
            const sortBy = this.queryString.sort.split(',').join(' ');
            this.query = this.query.sort(sortBy);
        } else {
            this.query = this.query.sort(defaultSort); // Використовуємо дефолтне
        }
        return this;
    }

    /**
     * Обмежує поля, що повертаються запитом Mongoose.
     * @returns {APIFeatures} - Повертає this для ланцюжкового виклику.
     */
    limitFields(defaultExclude = '-__v') { // Додано дефолтне виключення
        if (this.queryString.fields) {
            const fields = this.queryString.fields.split(',').join(' ');
            this.query = this.query.select(fields);
        } else {
            this.query = this.query.select(defaultExclude);
        }
        return this;
    }

    /**
     * Застосовує пагінацію до запиту Mongoose.
     * @param {number} defaultLimit - Ліміт за замовчуванням.
     * @returns {APIFeatures} - Повертає this для ланцюжкового виклику.
     */
    paginate(defaultLimit = 10) { // Змінено дефолтний ліміт
        const page = Math.max(1, Number(this.queryString.page) || 1); // Сторінка не може бути < 1
        const limit = Math.max(1, Math.min(100, Number(this.queryString.limit) || defaultLimit)); // Ліміт від 1 до 100
        const skip = (page - 1) * limit;

        this.query = this.query.skip(skip).limit(limit);

        this.pagination = { currentPage: page, limit: limit };

        return this;
    }

    /**
     * Метод для отримання об'єкта фільтра Mongoose.
     * @returns {object} - Об'єкт фільтра Mongoose.
     */
    getQueryFilter() {
        return this.queryFilter;
    }

    /**
     * Метод для отримання параметрів пагінації.
     * @returns {object} - Об'єкт з параметрами пагінації { currentPage, limit }.
     */
    getPaginationParams() {
        return this.pagination;
    }
}

module.exports = APIFeatures;
// --- END OF FILE utils/apiFeatures.js ---