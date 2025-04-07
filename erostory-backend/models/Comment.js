const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    text: {
        type: String,
        required: [true, 'Текст коментаря є обов\'язковим'],
        trim: true,
        minlength: [3, 'Коментар занадто короткий (мін. 3 символи)'],
        maxlength: [1000, 'Коментар занадто довгий (макс. 1000 символів)'],
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    story: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Story',
        required: true,
        index: true,
    },
    parentComment: { // Для відповідей на коментарі
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
        default: null,
        index: true,
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        // За замовчуванням встановлюється в контролері на основі налаштувань сайту
        default: 'pending', // Але тут поставимо pending як більш безпечний дефолт
        index: true,
    },
    likes: { type: Number, default: 0, min: 0 }, // Оновлюється з Like моделі/хука
}, { timestamps: true });

// Комбіновані індекси для типових запитів
commentSchema.index({ story: 1, status: 1, createdAt: -1 }); // Схвалені коментарі історії
commentSchema.index({ status: 1, createdAt: -1 }); // Всі коментарі за статусом (адмінка)
commentSchema.index({ author: 1, status: 1, createdAt: -1 }); // Схвалені коментарі автора

// --- Hooks для оновлення лічильників ---

// Зберігаємо попередній статус для post('save') хука
commentSchema.pre('save', async function (next) {
    if (this.isModified('status')) {
        // Отримуємо попереднє значення статусу до збереження
        // Використовуємо internal _conditions для findOneAndUpdate або findById,
        // або this.get() для нових документів або якщо документ був завантажений
        try {
            if (!this.isNew) {
                // Для існуючих документів отримуємо оригінал
                const original = await this.constructor.findOne({ _id: this._id }).select('status').lean();
                this._previousStatus = original ? original.status : this.get('status'); // fallback на поточний, якщо не знайдено
            } else {
                // Для нового документа попереднього статусу немає
                this._previousStatus = null;
            }
        } catch (e) {
            console.error("Error getting previous comment status in pre-save hook:", e);
            this._previousStatus = this.status; // Встановлюємо поточний як попередній при помилці
        }
    }
    next();
});

// Після збереження (новий коментар або зміна статусу)
commentSchema.post('save', async function(doc, next) {
    try {
        // Оновлюємо лічильники тільки якщо статус змінився АБО це новий документ
        const isNewOrStatusChanged = doc.isNew || doc.isModified('status');
        // Перевіряємо, чи статус став/перестав бути 'approved'
        const statusChangedToOrFromApproved = isNewOrStatusChanged &&
            (doc.status === 'approved' || (doc._previousStatus === 'approved' && doc.status !== 'approved'));

        // Оновлюємо лічильник історії тільки якщо статус пов'язаний з 'approved'
        if (statusChangedToOrFromApproved) {
            await doc.constructor.updateStoryCommentsCount(doc.story);
        }
        // Лічильник коментарів користувача оновлюємо при будь-якій зміні статусу або створенні
        // (бо він може рахувати і не схвалені коментарі в профілі)
        // Але краще, щоб він теж рахував тільки схвалені - оновлюємо тільки якщо змінився approved статус
        if (statusChangedToOrFromApproved) {
            await mongoose.model('User').updateUserCommentsCount(doc.author);
        }
    } catch (error) {
        console.error("Помилка оновлення лічильників коментарів після збереження:", error);
    }
    delete doc._previousStatus; // Видаляємо тимчасове поле
    next();
});

// Зберігаємо дані перед видаленням для використання в post-хуку
commentSchema.pre('findOneAndDelete', { document: false, query: true }, async function(next) {
    try {
        const docToDelete = await this.model.findOne(this.getFilter()).lean();
        if (docToDelete) {
            this._commentData = docToDelete;
        }
    } catch (error) {
        console.error("Помилка отримання даних коментаря перед видаленням:", error);
    }
    next();
});

// Після видалення
commentSchema.post('findOneAndDelete', { document: false, query: true }, async function(doc, next) {
    const commentData = this._commentData;
    if (commentData) {
        try {
            // Оновлюємо лічильники для історії та автора (тільки якщо коментар був схвалений)
            if (commentData.status === 'approved') {
                await this.model.updateStoryCommentsCount(commentData.story);
                await mongoose.model('User').updateUserCommentsCount(commentData.author);
            }
            // Видалення лайків, пов'язаних з цим коментарем
            const Like = mongoose.model('Like');
            await Like.deleteMany({ targetId: commentData._id, targetModel: 'Comment' });
            console.log(`Лайки для коментаря ${commentData._id} видалено.`);
        } catch (error) {
            console.error(`Помилка оновлення лічильників/видалення лайків після видалення коментаря ${commentData._id}:`, error);
        }
    }
    next();
});

// --- Статичні Методи ---

// Оновлення лічильника коментарів у історії (рахуємо тільки схвалені)
commentSchema.statics.updateStoryCommentsCount = async function(storyId) {
    if (!storyId) return;
    const Story = mongoose.model('Story');
    try {
        const count = await this.countDocuments({ story: storyId, status: 'approved' });
        await Story.findByIdAndUpdate(storyId, { commentsCount: count });
        console.log(`Оновлено лічильник коментарів для історії ${storyId}: ${count}`);
    } catch (error) {
        console.error(`Помилка оновлення лічильника коментарів для історії ${storyId}:`, error);
    }
};

const Comment = mongoose.model('Comment', commentSchema);

module.exports = Comment;