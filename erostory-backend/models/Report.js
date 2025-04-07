// --- START OF FILE models/Report.js ---
const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    type: {
        type: String,
        required: [true, 'Тип об\'єкта скарги є обов\'язковим.'],
        enum: {
            values: ['story', 'comment', 'user'],
            message: 'Тип об\'єкта скарги може бути тільки "story", "comment", або "user".'
        },
        index: true,
    },
    reportedItem: {
        type: mongoose.Schema.Types.ObjectId,
        required: [true, 'ID об\'єкта скарги є обов\'язковим.'],
        // refPath дозволяє динамічно посилатися на різні моделі на основі поля 'type'
        refPath: 'type', // Вказує, що поле 'type' містить назву моделі
        index: true,
    },
    reason: {
        type: String,
        required: [true, 'Будь ласка, вкажіть причину скарги.'],
        trim: true,
        minlength: [10, 'Причина скарги занадто коротка (мін. 10 символів).'],
        maxlength: [500, 'Причина скарги занадто довга (макс. 500 символів).'],
    },
    reporter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Автор скарги є обов\'язковим.'],
        index: true,
    },
    status: {
        type: String,
        enum: ['new', 'in_progress', 'resolved', 'rejected'],
        default: 'new',
        index: true,
    },
    adminNotes: {
        type: String,
        trim: true,
        default: '',
        maxlength: [1000, 'Нотатки адміністратора занадто довгі (макс. 1000 символів).']
    },
    resolvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },
    resolvedAt: { // Додаємо час вирішення скарги
        type: Date,
        default: null
    }
}, { timestamps: true });

// Комбіновані індекси
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ type: 1, status: 1, createdAt: -1 });
// Індекс по reportedItem вже є

// Віртуальні поля для populate тепер не потрібні завдяки refPath,
// але populate все одно краще робити явно в контролері для гнучкості.

const Report = mongoose.model('Report', reportSchema);

module.exports = Report;
// --- END OF FILE models/Report.js ---