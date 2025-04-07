const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const validator = require('validator');
const crypto = require('crypto');
// Імпортуємо моделі тут, щоб уникнути циклічних залежностей в хуках/методах
// (хоча краще викликати mongoose.model('ModelName') всередині методів)

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Будь ласка, вкажіть ім\'я'],
        trim: true,
        minlength: [2, 'Ім\'я повинно містити щонайменше 2 символи'],
        maxlength: [50, 'Ім\'я не може перевищувати 50 символів'],
    },
    email: {
        type: String,
        required: [true, 'Будь ласка, вкажіть email'],
        unique: true,
        lowercase: true,
        trim: true,
        validate: [validator.isEmail, 'Будь ласка, введіть дійсний email'],
        index: true,
    },
    passwordHash: {
        type: String,
        // Пароль обов'язковий тільки для локальної реєстрації
        required: [function() { return !this.provider || this.provider === 'local'; }, 'Пароль є обов\'язковим для локальної реєстрації'],
        minlength: [8, 'Пароль занадто короткий (мінімум 8 символів)'],
        select: false, // Не повертати хеш пароля за замовчуванням
    },
    provider: { // Як користувач зареєструвався
        type: String,
        enum: ['local', 'google', 'facebook'], // Додайте інші за потреби
        default: 'local',
    },
    passwordChangedAt: { // Коли пароль було змінено востаннє
        type: Date,
        select: false,
    },
    passwordResetToken: { // Токен для скидання пароля (зберігаємо хеш)
        type: String,
        select: false,
    },
    passwordResetExpires: { // Час дії токена скидання
        type: Date,
        select: false,
    },
    role: {
        type: String,
        enum: ['user', 'author', 'moderator', 'admin'],
        default: 'user',
        index: true,
    },
    isPremium: {
        type: Boolean,
        default: false,
        index: true,
    },
    premiumEndDate: {
        type: Date,
        default: null,
    },
    avatarUrl: {
        type: String,
        default: null, // Можна встановити дефолтний URL аватара
        validate: { // Додаємо базову валідацію URL
            validator: function(v) {
                return v === null || validator.isURL(v, { protocols: ['http','https'], require_protocol: true });
            },
            message: props => `${props.value} не є валідним URL!`
        }
    },
    bio: {
        type: String,
        maxlength: [500, 'Біографія не може перевищувати 500 символів'],
        default: '',
        trim: true
    },
    isActive: { // Для м'якого видалення / блокування
        type: Boolean,
        default: true,
        index: true
    },
    telegramUserId: { // Для сповіщень
        type: String,
        sparse: true, // Дозволяє null значенням бути унікальними
        unique: true, // Унікальний ID користувача Telegram
        default: null,
        index: true,
    },

    // --- Зв'язки ---
    bookmarks: [{ // Масив ID історій в закладках
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Story'
    }],
    following: [{ // Масив ID авторів, на яких підписаний
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    categorySubscriptions: [{ // Категорії, на які підписаний
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
    }],
    favoriteCategories: [{ // Обрані категорії
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
    }],

    // --- Статистика (винесено в окремий об'єкт) ---
    stats: {
        // Кількість ОПУБЛІКОВАНИХ історій автора
        storyCount: { type: Number, default: 0, min: 0 },
        // Кількість підписників на цього автора
        followersCount: { type: Number, default: 0, min: 0, index: -1 },
        // Кількість СХВАЛЕНИХ коментарів користувача
        commentsCount: { type: Number, default: 0, min: 0 },
        // Середній рейтинг ОПУБЛІКОВАНИХ історій автора
        averageRating: { type: Number, default: 0, min: 0, max: 5, index: -1 },
    },
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// --- Віртуальні Поля ---
userSchema.virtual('bookmarkCount').get(function() {
    return Array.isArray(this.bookmarks) ? this.bookmarks.length : 0;
});
userSchema.virtual('followingCount').get(function() {
    return Array.isArray(this.following) ? this.following.length : 0;
});
// Лічильник підписників беремо зі stats
userSchema.virtual('followersCount').get(function() {
    return this.stats?.followersCount ?? 0;
});

// --- Middleware (Hooks) ---

// Хешування пароля перед збереженням
userSchema.pre('save', async function(next) {
    // Виконувати тільки якщо пароль був змінений (або це новий користувач)
    if (!this.isModified('passwordHash') || !this.passwordHash) return next();

    // Встановлюємо час зміни пароля (важливо для JWT інвалідації)
    // -1000ms, щоб гарантувати, що токен буде створено *після* зміни пароля
    this.passwordChangedAt = Date.now() - 1000;

    // Очищаємо поля відновлення пароля
    this.passwordResetToken = undefined;
    this.passwordResetExpires = undefined;

    try {
        // Хешуємо пароль
        const salt = await bcrypt.genSalt(10);
        this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
        next();
    } catch (error) {
        console.error("Помилка хешування пароля:", error);
        next(error); // Передаємо помилку далі
    }
});

// Очищення premiumEndDate, якщо isPremium встановлено в false
userSchema.pre('save', function(next) {
    if (this.isModified('isPremium') && !this.isPremium) {
        this.premiumEndDate = null;
    }
    next();
});

// Виключаємо неактивних користувачів з усіх find запитів за замовчуванням
userSchema.pre(/^find/, function(next) {
    // `this` вказує на поточний запит
    // Додаємо умову { isActive: { $ne: false } }, якщо не вказано інше
    if (this.getOptions().includeInactive !== true) {
        this.where({ isActive: { $ne: false } });
    }
    next();
});

// --- Методи Екземпляра Схеми ---

// Порівняння наданого пароля з хешом у базі
userSchema.methods.comparePassword = async function(candidatePassword) {
    if (!this.passwordHash) return false; // Якщо хешу немає (напр., OAuth)
    return await bcrypt.compare(candidatePassword, this.passwordHash);
};

// Перевірка, чи був пароль змінений після видачі JWT токена
userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
    if (this.passwordChangedAt) {
        const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
        // Якщо час зміни пароля БІЛЬШИЙ за час видачі токена, повертаємо true
        return JWTTimestamp < changedTimestamp;
    }
    // Пароль ніколи не змінювався
    return false;
};

// Генерація токена для скидання пароля
userSchema.methods.createPasswordResetToken = function() {
    const resetToken = crypto.randomBytes(32).toString('hex'); // Генеруємо токен

    // Хешуємо токен перед збереженням у БД
    this.passwordResetToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

    // Встановлюємо час життя токена (наприклад, 10 хвилин)
    this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

    // Повертаємо НЕхешований токен для відправки користувачу
    return resetToken;
};

// --- Статичні Методи Моделі ---

// Оновлення лічильника історій АВТОРА
userSchema.statics.updateAuthorStoryCount = async function(authorId) {
    if (!authorId) return;
    try {
        const Story = mongoose.model('Story');
        // Рахуємо тільки опубліковані історії
        const count = await Story.countDocuments({ author: authorId, status: 'published' });
        await this.findByIdAndUpdate(authorId, { 'stats.storyCount': count });
        console.log(`Оновлено лічильник історій для автора ${authorId}: ${count}`);
        // Перераховуємо середній рейтинг автора ПІСЛЯ зміни кількості історій
        await this.updateAuthorAverageRating(authorId, count);
    } catch (error) {
        console.error(`Помилка оновлення лічильника історій для автора ${authorId}:`, error);
    }
};

// Оновлення лічильника коментарів КОРИСТУВАЧА
userSchema.statics.updateUserCommentsCount = async function(userId) {
    if (!userId) return;
    try {
        const Comment = mongoose.model('Comment');
        // Рахуємо тільки схвалені коментарі
        const count = await Comment.countDocuments({ author: userId, status: 'approved' });
        await this.findByIdAndUpdate(userId, { 'stats.commentsCount': count });
        console.log(`Оновлено лічильник коментарів для користувача ${userId}: ${count}`);
    } catch (error) {
        console.error(`Помилка оновлення лічильника коментарів для користувача ${userId}:`, error);
    }
};

// Оновлення лічильника підписників АВТОРА (викликається з toggleFollow)
userSchema.statics.updateAuthorFollowersCount = async function(authorId) {
    if (!authorId) return;
    try {
        // Рахуємо, скільки користувачів мають цього автора у своєму списку `following`
        const count = await this.countDocuments({ following: authorId });
        await this.findByIdAndUpdate(authorId, { 'stats.followersCount': count });
        console.log(`Оновлено лічильник підписників для автора ${authorId}: ${count}`);
    } catch (error) {
        console.error(`Помилка оновлення лічильника підписників для автора ${authorId}:`, error);
    }
};

// Оновлення середнього рейтингу історій АВТОРА
userSchema.statics.updateAuthorAverageRating = async function(authorId, storyCount = null) {
    if (!authorId) return;
    try {
        const Story = mongoose.model('Story');
        // Отримуємо середнє значення 'averageRating' для всіх опублікованих історій автора, що мають хоча б одну оцінку
        const stats = await Story.aggregate([
            { $match: {
                    author: new mongoose.Types.ObjectId(authorId),
                    status: 'published',
                    totalRatings: { $gt: 0 } // Враховуємо тільки історії, які мають оцінки
                }},
            { $group: {
                    _id: '$author',
                    averageAuthorRating: { $avg: '$averageRating' } // Рахуємо середнє по 'averageRating' історій
                }}
        ]);

        const newAverageRating = stats.length > 0 ? stats[0].averageAuthorRating : 0;

        const updateData = {
            'stats.averageRating': newAverageRating.toFixed(1) // Округлюємо
        };

        // Оновлюємо лічильник історій, якщо він не переданий явно
        if (storyCount === null) {
            const count = await Story.countDocuments({ author: authorId, status: 'published' });
            updateData['stats.storyCount'] = count;
        } else {
            updateData['stats.storyCount'] = storyCount;
        }

        await this.findByIdAndUpdate(authorId, updateData);
        console.log(`Оновлено статистику автора ${authorId}: storyCount=${updateData['stats.storyCount']}, averageRating=${updateData['stats.averageRating']}`);
    } catch (error) {
        console.error(`Помилка оновлення середнього рейтингу для автора ${authorId}:`, error);
    }
};

// --- Hook для оновлення лічильника підписників при зміні поля `following` ---
// Використовуємо `post` для доступу до `_update` в `updateOne`/`updateMany`
// Або краще робити це явно в контролері `toggleFollow`
// userSchema.post(/Update/, async function(res, next) {
//     const update = this.getUpdate();
//     const filter = this.getFilter();
//     // Логіка визначення, чи змінилось поле `following` та для яких ID
//     // Це складно зробити надійно в хуку, тому краще оновлювати явно в контролері
//     next();
// });

const User = mongoose.model('User', userSchema);

module.exports = User;