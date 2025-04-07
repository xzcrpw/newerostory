// --- START OF FILE models/Rating.js ---
const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Користувач для рейтингу є обов\'язковим'],
        index: true,
    },
    targetId: { // ID об'єкта (наразі тільки Story)
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Story', // Явно вказуємо модель
        required: [true, 'Об\'єкт рейтингу є обов\'язковим'],
        index: true,
    },
    targetModel: { // Тип об'єкта
        type: String,
        required: true,
        enum: ['Story'], // Наразі підтримуємо тільки історії
        default: 'Story',
        index: true,
    },
    value: { // Значення оцінки (0 - скасовано, 1-5 - оцінка)
        type: Number,
        required: [true, 'Значення рейтингу є обов\'язковим'],
        min: [0, 'Мінімальне значення рейтингу - 0'],
        max: [5, 'Максимальне значення рейтингу - 5'],
        validate: {
            validator: Number.isInteger, // Перевіряємо, що це ціле число (0, 1, 2, 3, 4, 5)
            message: 'Рейтинг має бути цілим числом від 0 до 5.'
        }
    },
}, { timestamps: true });

// Унікальний індекс: один користувач - одна оцінка для одного об'єкта
ratingSchema.index({ user: 1, targetId: 1, targetModel: 1 }, { unique: true });

// --- Middleware для оновлення середнього рейтингу історії та автора ---

// Статичний метод для оновлення рейтингу історії ТА автора
ratingSchema.statics.updateStoryAndAuthorAverageRating = async function(storyId) {
    if (!storyId) {
        console.warn('updateStoryAndAuthorAverageRating: storyId відсутній.');
        return;
    }

    const Story = mongoose.model('Story');
    const User = mongoose.model('User');

    try {
        // 1. Розраховуємо новий середній рейтинг та кількість для ІСТОРІЇ
        const stats = await this.aggregate([
            { $match: { targetId: new mongoose.Types.ObjectId(storyId), targetModel: 'Story', value: { $gt: 0 } } }, // Рахуємо тільки оцінки > 0
            { $group: { _id: '$targetId', average: { $avg: '$value' }, count: { $sum: 1 } } }
        ]);

        const newAverage = stats.length > 0 ? stats[0].average : 0;
        const newCount = stats.length > 0 ? stats[0].count : 0;

        // 2. Оновлюємо документ Story та отримуємо ID автора
        const updatedStory = await Story.findByIdAndUpdate(
            storyId,
            { averageRating: newAverage.toFixed(1), totalRatings: newCount },
            { new: false, select: 'author' } // Повертаємо старий документ з ID автора
        ).lean();

        console.log(`Оновлено рейтинг для історії ${storyId}: avg=${newAverage.toFixed(1)}, count=${newCount}`);

        // 3. Оновлюємо середній рейтинг АВТОРА цієї історії (якщо автор є)
        if (updatedStory && updatedStory.author) {
            await User.updateAuthorAverageRating(updatedStory.author);
        }

    } catch (error) {
        console.error(`Помилка оновлення рейтингу для історії ${storyId} та її автора:`, error);
    }
};


// Після збереження нової оцінки або оновлення існуючої
ratingSchema.post('save', async function(doc, next) {
    try {
        // Викликаємо оновлення для історії та автора
        await doc.constructor.updateStoryAndAuthorAverageRating(doc.targetId);
    } catch (error) {
        console.error(`Помилка у post('save') хуку Rating для історії ${doc.targetId}:`, error);
    }
    next();
});

// Перед видаленням оцінки
ratingSchema.pre('findOneAndDelete', { document: false, query: true }, async function(next) {
    try {
        const docToDelete = await this.model.findOne(this.getFilter()).lean();
        if (docToDelete) {
            this._ratingData = docToDelete; // Зберігаємо дані для post-хука
        }
    } catch (error) {
        console.error("Помилка отримання даних рейтингу перед видаленням:", error);
    }
    next();
});

// Після видалення оцінки
ratingSchema.post('findOneAndDelete', { document: false, query: true }, async function(doc, next) {
    const ratingData = this._ratingData;
    if (ratingData) {
        try {
            // Викликаємо оновлення для історії та автора
            await this.model.updateStoryAndAuthorAverageRating(ratingData.targetId);
        } catch (error) {
            console.error(`Помилка у post('findOneAndDelete') хуку Rating для історії ${ratingData.targetId}:`, error);
        }
    }
    next();
});


const Rating = mongoose.model('Rating', ratingSchema);

module.exports = Rating;
// --- END OF FILE models/Rating.js ---