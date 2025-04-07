const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Користувач для лайка є обов\'язковим'],
        index: true,
    },
    targetId: { // ID історії або коментаря
        type: mongoose.Schema.Types.ObjectId,
        required: [true, 'Об\'єкт лайка є обов\'язковим'],
        index: true,
    },
    targetModel: { // Тип ('Story' або 'Comment')
        type: String,
        required: [true, 'Тип об\'єкта лайка є обов\'язковим'],
        enum: ['Story', 'Comment'],
        index: true,
    },
}, { timestamps: true });

// Унікальний індекс: один користувач - один лайк для одного об'єкта
likeSchema.index({ user: 1, targetId: 1, targetModel: 1 }, { unique: true });

// --- Middleware для оновлення лічильників ---

// Статичний метод для оновлення лічильника лайків
likeSchema.statics.updateTargetLikesCount = async function(targetId, targetModel) {
    if (!targetId || !targetModel) {
        console.warn('updateTargetLikesCount: targetId або targetModel відсутні.');
        return;
    }

    try {
        const count = await this.countDocuments({ targetId, targetModel });
        let ModelToUpdate;
        if (targetModel === 'Story') ModelToUpdate = mongoose.model('Story');
        else if (targetModel === 'Comment') ModelToUpdate = mongoose.model('Comment');
        else return; // Не підтримувана модель

        await ModelToUpdate.findByIdAndUpdate(targetId, { likes: count });
        console.log(`Оновлено лічильник лайків для ${targetModel} ${targetId}: ${count}`);
    } catch (error) {
        console.error(`Помилка оновлення лічильника лайків для ${targetModel} ${targetId}:`, error);
        // Не кидаємо помилку, щоб не переривати основну операцію
    }
};

// Після збереження нового лайка
likeSchema.post('save', async function(doc, next) {
    try {
        await doc.constructor.updateTargetLikesCount(doc.targetId, doc.targetModel);
    } catch (error) {
        console.error(`Помилка у post('save') хуку Like для ${doc.targetModel} ${doc.targetId}:`, error);
    }
    next();
});

// Перед видаленням лайка
likeSchema.pre('findOneAndDelete', { document: false, query: true }, async function(next) {
    try {
        const docToDelete = await this.model.findOne(this.getFilter()).lean();
        if (docToDelete) {
            this._likeData = docToDelete; // Зберігаємо дані в контекст запиту
        }
    } catch (error) {
        console.error("Помилка отримання даних лайка перед видаленням:", error);
    }
    next();
});

// Після видалення лайка
likeSchema.post('findOneAndDelete', { document: false, query: true }, async function(doc, next) {
    const likeData = this._likeData;
    if (likeData) {
        try {
            await this.model.updateTargetLikesCount(likeData.targetId, likeData.targetModel);
        } catch (error) {
            console.error(`Помилка у post('findOneAndDelete') хуку Like для ${likeData.targetModel} ${likeData.targetId}:`, error);
        }
    }
    next();
});


const Like = mongoose.model('Like', likeSchema);

module.exports = Like;