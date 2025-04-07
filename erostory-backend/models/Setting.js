// --- START OF FILE models/Setting.js ---
const mongoose = require('mongoose');

// Список підтримуваних мов
const SUPPORTED_LANGUAGES = ['uk', 'en', 'de', 'it', 'ru'];

const settingSchema = new mongoose.Schema({
    siteName: {
        type: String,
        required: [true, 'Назва сайту є обов\'язковою.'],
        trim: true,
        default: 'EroStory', // Змінив дефолтну назву
    },
    defaultLang: {
        type: String,
        required: [true, 'Мова за замовчуванням є обов\'язковою.'],
        enum: {
            values: SUPPORTED_LANGUAGES,
            message: 'Мова "{VALUE}" не підтримується.'
        },
        default: 'uk',
    },
    storiesPerPage: {
        type: Number,
        required: [true, 'Кількість історій на сторінку є обов\'язковою.'],
        min: [1, 'Кількість історій має бути більше 0.'],
        max: [100, 'Кількість історій не може перевищувати 100.'], // Додав max
        default: 12,
    },
    commentsModeration: {
        type: Boolean,
        default: true,
    },
    allowGuestComments: {
        type: Boolean,
        default: false,
    },
    // Додайте інші налаштування
    // telegramNotificationsEnabled: { type: Boolean, default: true },
    // emailNotificationsEnabled: { type: Boolean, default: true },
}, {
    timestamps: true
});

// Забезпечуємо існування тільки одного документа налаштувань
// Використовуємо унікальний індекс на "вічному" полі, напр. createdAt,
// Або просто використовуємо findOneAndUpdate({}, ...) без upsert: true після першого створення.
// Для простоти поки що можна не додавати індекс, а покладатися на логіку контролера (getOrCreateSettings)

const Setting = mongoose.model('Setting', settingSchema);

module.exports = Setting;
// --- END OF FILE models/Setting.js ---