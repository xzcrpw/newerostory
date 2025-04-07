// --- START OF FILE models/Category.js ---
const mongoose = require('mongoose');
const validator = require('validator');

const categorySchema = new mongoose.Schema({
    slug: {
        type: String,
        unique: true,
        lowercase: true,
        required: [true, 'Slug категорії є обов\'язковим.'],
        trim: true,
        index: true,
        validate: { // Додаємо валідацію формату slug
            validator: function(v) { return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v); },
            message: props => `${props.value} не є валідним slug! Дозволені тільки маленькі літери, цифри та дефіси.`
        }
    },
    imageUrl: {
        type: String,
        default: null,
        validate: {
            validator: function(v) {
                return v === null || validator.isURL(v, { protocols: ['http','https'], require_protocol: true });
            },
            message: props => `${props.value} не є валідним URL!`
        }
    },
    stats: {
        // Лічильник ОПУБЛІКОВАНИХ історій
        storyCount: { type: Number, default: 0, min: 0, index: -1 },
        // Можна додати інші лічильники (перегляди, лайки по категорії), але це потребує складнішої логіки
    },
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// --- Hook для видалення пов'язаних перекладів та оновлення історій ---
categorySchema.post('findOneAndDelete', { document: false, query: true }, async function (doc, next) {
    // `doc` тут - це документ, який БУВ видалений (якщо знайдено)
    if (doc) {
        console.log(`Обробка після видалення категорії ${doc._id} (${doc.slug})`);
        const Translation = mongoose.model('Translation');
        const Story = mongoose.model('Story');
        const Category = mongoose.model('Category'); // Використовуємо mongoose.model

        try {
            // 1. Видаляємо переклади
            const translationResult = await Translation.deleteMany({ refId: doc._id, refModel: 'Category' });
            console.log(`Переклади для категорії ${doc._id} видалено (${translationResult.deletedCount} записів).`);

            // 2. Знаходимо категорію "Інше"
            const otherCategorySlug = 'other'; // Визначаємо slug для "Інше"
            const otherCategory = await Category.findOne({ slug: otherCategorySlug }).select('_id').lean(); // Отримуємо тільки ID

            // 3. Оновлюємо історії
            let updateTargetCategory = null;
            let updateOperation;

            if (otherCategory) {
                updateTargetCategory = otherCategory._id;
                updateOperation = { $set: { category: updateTargetCategory } };
                console.log(`Знайдено категорію "Інше" (${updateTargetCategory}). Історії будуть переміщені туди.`);
            } else {
                updateOperation = { $unset: { category: "" } }; // Видаляємо поле category
                console.warn(`Категорія "${otherCategorySlug}" не знайдена. Поле 'category' буде видалено з історій категорії ${doc._id}.`);
            }

            const storyUpdateResult = await Story.updateMany({ category: doc._id }, updateOperation);
            console.log(`Оновлено ${storyUpdateResult.modifiedCount} історій, що належали до категорії ${doc._id}. Нова категорія: ${updateTargetCategory || 'null'}.`);

            // 4. Оновлюємо лічильник історій для категорії "Інше" (якщо вона існує і були зміни)
            if (otherCategory && storyUpdateResult.modifiedCount > 0) {
                await Category.updateCategoryStoryCount(otherCategory._id);
            }

        } catch (error) {
            console.error(`Помилка під час post-видалення для категорії ${doc._id}:`, error);
        }
    }
    next();
});

// --- Статичний метод для оновлення лічильника ОПУБЛІКОВАНИХ історій ---
categorySchema.statics.updateCategoryStoryCount = async function(categoryId) {
    if (!categoryId) return;

    const Story = mongoose.model('Story');
    try {
        // Рахуємо тільки опубліковані історії
        const count = await Story.countDocuments({ category: categoryId, status: 'published' });
        await this.findByIdAndUpdate(categoryId, { 'stats.storyCount': count });
        console.log(`Оновлено лічильник опублікованих історій для категорії ${categoryId}: ${count}`);
    } catch (error) {
        console.error(`Помилка оновлення лічильника історій для категорії ${categoryId}:`, error);
    }
};

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;
// --- END OF FILE models/Category.js ---