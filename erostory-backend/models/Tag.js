// --- START OF FILE models/Tag.js ---
const mongoose = require('mongoose');

const tagSchema = new mongoose.Schema({
    slug: {
        type: String,
        unique: true,
        lowercase: true,
        required: [true, 'Slug тегу є обов\'язковим.'],
        trim: true,
        index: true,
        minlength: [1, 'Slug тегу не може бути порожнім.'],
        validate: { // Додаємо валідацію формату slug
            validator: function(v) { return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v); },
            message: props => `${props.value} не є валідним slug! Дозволені тільки маленькі літери, цифри та дефіси.`
        }
    },
    // Лічильник ОПУБЛІКОВАНИХ історій з цим тегом
    storyCount: {
        type: Number,
        default: 0,
        min: 0,
        index: -1 // Індекс для сортування за популярністю
    },
}, { timestamps: true });

// --- Hook для видалення пов'язаних перекладів та оновлення історій ---
tagSchema.post('findOneAndDelete', { document: false, query: true }, async function (doc, next) {
    if (doc) {
        console.log(`Обробка після видалення тегу ${doc._id} (${doc.slug})`);
        const Translation = mongoose.model('Translation');
        const Story = mongoose.model('Story');

        try {
            // 1. Видаляємо переклади
            const translationResult = await Translation.deleteMany({ refId: doc._id, refModel: 'Tag' });
            console.log(`Переклади для тегу ${doc._id} видалено (${translationResult.deletedCount} записів).`);

            // 2. Видаляємо тег з усіх історій, де він використовувався
            const storyUpdateResult = await Story.updateMany(
                { tags: doc.slug }, // Знаходимо історії, що містять цей slug тегу
                { $pull: { tags: doc.slug } } // Видаляємо slug з масиву tags
            );
            console.log(`Тег "${doc.slug}" видалено з ${storyUpdateResult.modifiedCount} історій.`);

        } catch (error) {
            console.error(`Помилка під час post-видалення для тегу ${doc._id}:`, error);
        }
    }
    next();
});

// --- Статичний метод для оновлення лічильника ОПУБЛІКОВАНИХ історій ---
// Викликається з хуків моделі Story
tagSchema.statics.updateStoryCount = async function(tagSlugs, incrementValue) {
    if (!Array.isArray(tagSlugs) || tagSlugs.length === 0 || typeof incrementValue !== 'number') {
        console.warn('Tag.updateStoryCount: Некоректні вхідні дані.', { tagSlugs, incrementValue });
        return;
    }
    const validSlugs = tagSlugs.filter(slug => typeof slug === 'string' && slug.trim().length > 0);
    if (validSlugs.length === 0) {
        console.warn('Tag.updateStoryCount: Не знайдено валідних slug для оновлення.');
        return;
    }

    try {
        // Атомарно оновлюємо лічильник для кожного тегу
        const result = await this.updateMany(
            { slug: { $in: validSlugs } },
            { $inc: { storyCount: incrementValue } } // Збільшуємо або зменшуємо лічильник
        );
        console.log(`Оновлено лічильники історій для ${result.modifiedCount}/${validSlugs.length} тегів (${validSlugs.join(', ')}) на ${incrementValue}.`);
    } catch (error) {
        console.error(`Помилка оновлення лічильників для тегів ${validSlugs.join(', ')}:`, error);
    }
};

const Tag = mongoose.model('Tag', tagSchema);

module.exports = Tag;
// --- END OF FILE models/Tag.js ---