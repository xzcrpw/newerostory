const mongoose = require('mongoose');
const slugify = require('slugify'); // Потрібен для хуків, хоча slug генерується в контролері
const crypto = require('crypto'); // Потрібен для генерації унікального суфікса slug
// --- Допоміжна функція для розрахунку часу читання ---
const WORDS_PER_MINUTE = 200; // Середня швидкість читання
function calculateReadingTime(text) {
    if (!text || typeof text !== 'string') return 0;
    const textOnly = text.replace(/<[^>]+>/g, ' '); // Видаляємо HTML теги
    const wordCount = textOnly.split(/\s+/).filter(Boolean).length;
    const time = Math.ceil(wordCount / WORDS_PER_MINUTE);
    return time > 0 ? time : 1; // Мінімальний час - 1 хвилина
}

const storySchema = new mongoose.Schema({
    slug: {
        type: String,
        unique: true,
        lowercase: true,
        required: [true, 'Slug історії є обов\'язковим.'],
        index: true,
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Автор історії є обов\'язковим.'],
        index: true,
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        required: [true, 'Категорія історії є обов\'язковою.'],
        index: true,
    },
    tags: [{
        type: String,
        trim: true,
        lowercase: true,
        index: true, // Дозволяє індексувати масив рядків
    }],
    status: {
        type: String,
        enum: ['draft', 'pending', 'published', 'rejected'],
        default: 'pending', // За замовчуванням йде на модерацію
        index: true,
    },
    isPremium: {
        type: Boolean,
        default: false,
        index: true,
    },
    isAnonymous: { // Якщо автор хоче опублікувати анонімно
        type: Boolean,
        default: false,
    },
    imageUrl: {
        type: String,
        default: null,
    },
    ageRating: {
        type: String,
        enum: ['18+', '21+'],
        default: '18+',
    },
    // --- Статистика ---
    views: { type: Number, default: 0, min: 0, index: -1 },
    likes: { type: Number, default: 0, min: 0, index: -1 },
    bookmarks: { type: Number, default: 0, min: 0 }, // Оновлюється з User моделі
    averageRating: { type: Number, default: 0, min: 0, max: 5, index: -1 },
    totalRatings: { type: Number, default: 0, min: 0 },
    commentsCount: { type: Number, default: 0, min: 0, index: -1 },
    readingTime: { type: Number, default: 1, min: 1 }, // Мінімальний час читання 1 хв
    // --- Поля для модерації ---
    moderatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    moderatedAt: {
        type: Date,
        default: null
    },
    rejectionReason: {
        type: String,
        trim: true,
        default: null
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// --- Індекси для оптимізації запитів ---
storySchema.index({ createdAt: -1 }); // Загальне сортування за датою
storySchema.index({ author: 1, status: 1 }); // Історії конкретного автора за статусом
storySchema.index({ category: 1, status: 1 }); // Історії категорії за статусом
storySchema.index({ tags: 1, status: 1 }); // Історії за тегами та статусом
storySchema.index({ status: 1, averageRating: -1 }); // Сортування опублікованих за рейтингом
storySchema.index({ status: 1, views: -1 }); // Сортування опублікованих за популярністю
storySchema.index({ status: 1, createdAt: -1 }); // Сортування опублікованих за новизною


// --- Middleware (Hooks) ---

// Перед збереженням: відстеження змін для оновлення лічильників
storySchema.pre('save', async function(next) {
    // Оновлюємо час читання, якщо змінено content (або це новий документ)
    // Переклад контенту зберігається окремо, тому оновлюємо час читання тільки при зміні українського контенту
    // Або можна перенести цей розрахунок в контролер
    // if (this.isModified('content')) {
    //     this.readingTime = calculateReadingTime(this.content);
    // }

    // Відстежуємо зміни для хуків post('save')
    if (this.isModified('status') || this.isNew) {
        this._statusChanged = true;
        this._previousStatus = this.get('status', null, { prior: true });
    }
    if (this.isModified('category')) {
        this._categoryChanged = true;
        this._previousCategory = this.get('category', null, { prior: true });
    }
    if (this.isModified('tags')) {
        this._tagsChanged = true;
        // Зберігаємо попередні теги (зверніть увагу, що get() повертає MongooseArray, перетворюємо на звичайний)
        this._previousTags = this.get('tags', null, { prior: true })?.toObject() || [];
    }
    next();
});

// Після збереження: оновлення лічильників пов'язаних моделей
storySchema.post('save', async function(doc, next) {
    // Перевіряємо, чи були зміни, що впливають на лічильники
    const statusChanged = doc._statusChanged;
    const categoryChanged = doc._categoryChanged;
    const tagsChanged = doc._tagsChanged;
    const wasPublished = doc._previousStatus === 'published';
    const isPublished = doc.status === 'published';

    // Якщо статус змінився на/з опублікованого, або змінилась категорія/теги ОПУБЛІКОВАНОЇ історії
    if ((statusChanged && (wasPublished || isPublished)) || (isPublished && (categoryChanged || tagsChanged))) {
        try {
            const User = mongoose.model('User');
            const Category = mongoose.model('Category');
            const Tag = mongoose.model('Tag');

            console.log(`Оновлення лічильників для історії ${doc._id} (статус: ${doc.status}, попередній: ${doc._previousStatus})`);

            // 1. Оновлення лічильника історій автора (завжди при зміні статусу, якщо автор не анонімний)
            if (statusChanged && doc.author && !doc.isAnonymous) {
                await User.updateAuthorStoryCount(doc.author);
            }

            // 2. Оновлення лічильника КАТЕГОРІЙ
            if (categoryChanged) {
                // Зменшуємо лічильник старої категорії, якщо історія була опублікована
                if (doc._previousCategory && wasPublished) {
                    await Category.updateCategoryStoryCount(doc._previousCategory);
                }
                // Збільшуємо лічильник нової категорії, якщо історія стала опублікованою
                if (doc.category && isPublished) {
                    await Category.updateCategoryStoryCount(doc.category);
                }
            } else if (statusChanged) {
                // Якщо категорія не мінялась, але статус змінився на/з published
                await Category.updateCategoryStoryCount(doc.category);
            }

            // 3. Оновлення лічильників ТЕГІВ
            if (tagsChanged) {
                const prevTags = doc._previousTags || [];
                const currentTags = doc.tags || [];
                const addedTags = currentTags.filter(t => !prevTags.includes(t));
                const removedTags = prevTags.filter(t => !currentTags.includes(t));

                // Зменшуємо лічильник видалених тегів, якщо історія була опублікована
                if (removedTags.length > 0 && wasPublished) {
                    await Tag.updateStoryCount(removedTags, -1);
                }
                // Збільшуємо лічильник доданих тегів, якщо історія опублікована
                if (addedTags.length > 0 && isPublished) {
                    await Tag.updateStoryCount(addedTags, 1);
                }
            } else if (statusChanged) {
                // Якщо теги не мінялись, але статус змінився на/з published
                const increment = isPublished ? 1 : (wasPublished ? -1 : 0);
                if (increment !== 0 && doc.tags.length > 0) {
                    await Tag.updateStoryCount(doc.tags, increment);
                }
            }

        } catch (error) {
            console.error(`Помилка оновлення лічильників після збереження історії ${doc._id}:`, error);
        }
    }

    // Скидаємо тимчасові прапорці
    delete doc._statusChanged;
    delete doc._categoryChanged;
    delete doc._tagsChanged;
    delete doc._previousStatus;
    delete doc._previousCategory;
    delete doc._previousTags;
    next();
});

// Перед видаленням історії: видаляємо пов'язані дані та зберігаємо дані для post-хука
storySchema.pre('findOneAndDelete', { document: false, query: true }, async function(next) {
    try {
        const docToDelete = await this.model.findOne(this.getFilter()).lean();
        if (docToDelete) {
            console.log(`Підготовка до видалення пов'язаних даних для історії ${docToDelete._id} (${docToDelete.slug})`);
            this._docToDelete = docToDelete; // Зберігаємо дані для post hook

            const Translation = mongoose.model('Translation');
            const Comment = mongoose.model('Comment');
            const Like = mongoose.model('Like');
            const Rating = mongoose.model('Rating');
            const User = mongoose.model('User');

            // Виконуємо видалення пов'язаних сутностей паралельно
            await Promise.all([
                Translation.deleteMany({ refId: docToDelete._id, refModel: 'Story' }),
                Comment.deleteMany({ story: docToDelete._id }), // Викличе хуки Comment для видалення лайків
                Like.deleteMany({ targetId: docToDelete._id, targetModel: 'Story' }),
                Rating.deleteMany({ targetId: docToDelete._id, targetModel: 'Story' }), // Викличе хуки Rating для оновлення рейтингу автора
                User.updateMany({ bookmarks: docToDelete._id }, { $pull: { bookmarks: docToDelete._id } }) // Видаляємо з закладок
            ]);
            console.log(`Пов'язані переклади, коментарі, лайки, рейтинги, закладки для історії ${docToDelete._id} видалено.`);
        } else {
            console.warn('Документ Story для видалення не знайдено в pre hook.');
        }
    } catch (error) {
        console.error(`Помилка під час pre-видалення пов'язаних даних для історії (фільтр: ${JSON.stringify(this.getFilter())}):`, error);
        return next(error); // Передаємо помилку далі, щоб зупинити процес
    }
    next();
});

// Після видалення історії: оновлюємо лічильники
storySchema.post('findOneAndDelete', { document: false, query: true }, async function(doc, next) {
    const deletedDocData = this._docToDelete; // Отримуємо збережені дані
    if (deletedDocData) {
        console.log(`Оновлення лічильників після видалення історії ${deletedDocData._id}`);
        try {
            const User = mongoose.model('User');
            const Category = mongoose.model('Category');
            const Tag = mongoose.model('Tag');

            // Оновлюємо лічильники тільки якщо історія була опублікована
            if (deletedDocData.status === 'published') {
                await User.updateAuthorStoryCount(deletedDocData.author);
                await Category.updateCategoryStoryCount(deletedDocData.category);
                if (Array.isArray(deletedDocData.tags) && deletedDocData.tags.length > 0) {
                    await Tag.updateStoryCount(deletedDocData.tags, -1);
                }
            }
        } catch (error) {
            console.error(`Помилка оновлення лічильників після видалення історії ${deletedDocData._id}:`, error);
            // Не перериваємо процес, лише логуємо
        }
    }
    next();
});


const Story = mongoose.model('Story', storySchema);

module.exports = Story;
module.exports.calculateReadingTime = calculateReadingTime; // Експортуємо функцію