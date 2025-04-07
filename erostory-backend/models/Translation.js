// --- START OF FILE models/Translation.js ---
const mongoose = require('mongoose');
const AppError = require('../utils/AppError'); // Потрібен для помилки валідації

// Список підтримуваних мов
const SUPPORTED_LANGUAGES = ['uk', 'en', 'de', 'it', 'ru'];

const translationSchema = new mongoose.Schema({
    refId: {
        type: mongoose.Schema.Types.ObjectId,
        required: [true, 'ID батьківського документа є обов\'язковим.'],
        index: true,
    },
    refModel: {
        type: String,
        required: [true, 'Назва батьківської моделі є обов\'язковою.'],
        enum: {
            values: ['Category', 'Story', 'Tag'],
            message: 'Модель "{VALUE}" не підтримується для перекладів.'
        },
        index: true,
    },
    lang: {
        type: String,
        required: [true, 'Код мови є обов\'язковим.'],
        index: true,
        enum: {
            values: SUPPORTED_LANGUAGES,
            message: 'Мова "{VALUE}" не підтримується.'
        }
    },
    fields: {
        type: Map,
        of: String, // Очікуємо рядкові значення
        required: [true, 'Поле "fields" з перекладами є обов\'язковим.'],
        validate: {
            validator: function(v) { return v instanceof Map && v.size > 0; },
            message: 'Об\'єкт "fields" не може бути порожнім.'
        },
    }
}, { timestamps: true });

// Комбінований унікальний індекс
translationSchema.index({ refId: 1, refModel: 1, lang: 1 }, { unique: true });

// Перевірка перед збереженням, чи є хоча б одне не порожнє значення в fields
translationSchema.pre('save', function(next) {
    if (!this.fields || this.fields.size === 0) {
        // Це має зловити валідатор required, але додаємо для надійності
        return next(new AppError('Об\'єкт "fields" не може бути порожнім.', 400));
    }

    let hasNonEmptyValue = false;
    // Перевіряємо кожне значення в Map
    for (const value of this.fields.values()) {
        // Переконуємось, що значення існує, є рядком і не порожнє після обрізки пробілів
        if (value !== null && value !== undefined && String(value).trim() !== '') {
            hasNonEmptyValue = true;
            break; // Достатньо одного не порожнього
        }
    }

    if (!hasNonEmptyValue) {
        // Якщо ВСІ значення порожні або null/undefined, повертаємо помилку
        return next(new AppError('Об\'єкт "fields" повинен містити хоча б одне не порожнє значення перекладу.', 400));
    }

    next(); // Все гаразд
});

const Translation = mongoose.model('Translation', translationSchema);

module.exports = Translation;
// --- END OF FILE models/Translation.js ---