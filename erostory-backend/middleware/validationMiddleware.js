// --- START OF FILE middleware/validationMiddleware.js ---
const { body, param, query, validationResult, oneOf } = require('express-validator'); // ДОДАНО oneOf
const mongoose = require('mongoose');
const validator = require('validator');
const AppError = require('../utils/AppError');

// Список підтримуваних мов
const SUPPORTED_LANGUAGES = ['uk', 'en', 'de', 'it', 'ru'];

// Обробник помилок валідації
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(err => {
            let msg = err.msg;
            if (err.type === 'field') {
                msg = `Поле '${err.path}' (${err.location}): ${err.msg}.`;
                if (err.value !== undefined && err.value !== null && typeof err.value !== 'object' && String(err.value).length < 100) {
                    msg += ` Отримане значення: "${JSON.stringify(err.value)}"`;
                }
            } else if (err.param) {
                msg = `Параметр '${err.param}' (${err.location}): ${err.msg}.`;
            }
            return msg;
        }).join(' ');
        return next(new AppError(`Помилки валідації: ${errorMessages}`, 400));
    }
    next();
};

// --- Валідатори ID та Slug ---
const validateMongoId = (paramName = 'id', location = 'params') => {
    const check = location === 'params' ? param : (location === 'body' ? body : query);
    return [
        check(paramName)
            .trim()
            .notEmpty().withMessage(`Параметр '${paramName}' є обов'язковим.`)
            .isMongoId().withMessage(`Некоректний формат MongoDB ID для '${paramName}'.`),
        handleValidationErrors
    ];
};

const validateSlug = (paramName = 'slug', location = 'params') => {
    const check = location === 'params' ? param : (location === 'body' ? body : query);
    return [
        check(paramName)
            .trim()
            .notEmpty().withMessage(`Параметр '${paramName}' є обов'язковим.`)
            .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
            .withMessage(`Некоректний формат slug для '${paramName}'. Дозволено тільки маленькі літери, цифри та дефіси.`)
            .isLength({ min: 1, max: 100 }).withMessage(`Довжина slug для '${paramName}' має бути від 1 до 100 символів.`),
        handleValidationErrors
    ];
};

const validateIdOrSlug = (paramName = 'idOrSlug') => [
    param(paramName)
        .trim()
        .notEmpty().withMessage(`Параметр '${paramName}' не може бути порожнім.`)
        .custom((value) => {
            const isMongoId = mongoose.Types.ObjectId.isValid(value);
            const isSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
            if (!isMongoId && !isSlug) {
                throw new Error(`Некоректний формат ID або slug для '${paramName}'.`);
            }
            return true;
        }),
    handleValidationErrors
];

// --- Валідатори для Auth ---
exports.validateRegister = [
    body('name').trim().notEmpty().withMessage('Ім\'я є обов\'язковим.').isLength({ min: 2, max: 50 }).withMessage('Ім\'я має містити від 2 до 50 символів.'),
    body('email').trim().isEmail().withMessage('Будь ласка, введіть дійсний email.').normalizeEmail(),
    body('password')
        .isLength({ min: 8 }).withMessage('Пароль повинен містити щонайменше 8 символів.')
        .matches(/^(?=.*\d)(?=.*[a-zA-Z])|(?=.*[^a-zA-Z0-9\s])(?=.*[a-zA-Z]).{8,}$/, 'i')
        .withMessage('Пароль має містити літери та цифри, або літери та спецсимволи.'),
    body('confirmPassword').custom((value, { req }) => {
        if (value !== req.body.password) { throw new Error('Паролі не співпадають.'); }
        return true;
    }),
    handleValidationErrors,
];

exports.validateLogin = [
    body('email').trim().isEmail().withMessage('Будь ласка, введіть дійсний email.').normalizeEmail(),
    body('password').notEmpty().withMessage('Пароль є обов\'язковим.'),
    handleValidationErrors,
];

exports.validateForgotPassword = [
    body('email').trim().isEmail().withMessage('Будь ласка, введіть дійсний email.').normalizeEmail(),
    handleValidationErrors,
];

exports.validateResetPassword = [
    param('token').trim().notEmpty().withMessage('Токен відновлення є обов\'язковим.'),
    body('password')
        .isLength({ min: 8 }).withMessage('Пароль повинен містити щонайменше 8 символів.')
        .matches(/^(?=.*\d)(?=.*[a-zA-Z])|(?=.*[^a-zA-Z0-9\s])(?=.*[a-zA-Z]).{8,}$/, 'i')
        .withMessage('Пароль має містити літери та цифри, або літери та спецсимволи.'),
    body('confirmPassword').custom((value, { req }) => {
        if (value !== req.body.password) { throw new Error('Паролі не співпадають.'); }
        return true;
    }),
    handleValidationErrors,
];

// --- Валідатори для User ---
exports.validateUpdateMe = [
    body('name').optional().trim().notEmpty().withMessage('Ім\'я не може бути порожнім.').isLength({ min: 2, max: 50 }).withMessage('Ім\'я має містити від 2 до 50 символів.'),
    body('bio').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 500 }).withMessage('Біографія не може перевищувати 500 символів.'),
    body('removeAvatar').optional().isBoolean().toBoolean().withMessage('Параметр removeAvatar має бути true або false.'),
    handleValidationErrors,
];

exports.validateUpdatePassword = [
    body('currentPassword').notEmpty().withMessage('Поточний пароль є обов\'язковим.'),
    body('newPassword')
        .isLength({ min: 8 }).withMessage('Новий пароль повинен містити щонайменше 8 символів.')
        .matches(/^(?=.*\d)(?=.*[a-zA-Z])|(?=.*[^a-zA-Z0-9\s])(?=.*[a-zA-Z]).{8,}$/, 'i')
        .withMessage('Новий пароль має містити літери та цифри, або літери та спецсимволи.')
        .custom((value, { req }) => {
            if (value === req.body.currentPassword) { throw new Error('Новий пароль не повинен співпадати з поточним.'); }
            return true;
        }),
    body('confirmNewPassword').custom((value, { req }) => {
        if (value !== req.body.newPassword) { throw new Error('Паролі не співпадають.'); }
        return true;
    }),
    handleValidationErrors,
];

exports.validateAdminUpdateUser = [
    validateMongoId('id'),
    body('role').optional().isIn(['user', 'author', 'moderator', 'admin']).withMessage('Некоректна роль користувача.'),
    body('isActive').optional().isBoolean().toBoolean().withMessage('Статус isActive має бути true або false.'),
    body('isPremium').optional().isBoolean().toBoolean().withMessage('Статус isPremium має бути true або false.'),
    body('premiumEndDate').optional({ nullable: true }).isISO8601().toDate().withMessage('Некоректний формат дати premiumEndDate (YYYY-MM-DD або ISO).'),
    body().custom((value, { req }) => {
        const allowedFields = ['role', 'isActive', 'isPremium', 'premiumEndDate'];
        const unknownFields = Object.keys(req.body).filter(key => !allowedFields.includes(key));
        if (unknownFields.length > 0) {
            throw new Error(`Спроба оновити недозволені поля: ${unknownFields.join(', ')}`);
        }
        return true;
    }),
    handleValidationErrors,
];

exports.validateAdminUpdateSettings = [
    body('siteName').optional().trim().notEmpty().withMessage('Назва сайту не може бути порожньою.'),
    body('defaultLang').optional().isIn(SUPPORTED_LANGUAGES).withMessage(`Непідтримувана мова за замовчуванням. Дозволені: ${SUPPORTED_LANGUAGES.join(', ')}.`),
    body('storiesPerPage').optional().isInt({ min: 1, max: 100 }).toInt().withMessage('Кількість історій на сторінку має бути цілим числом від 1 до 100.'),
    body('commentsModeration').optional().isBoolean().toBoolean().withMessage('Параметр модерації коментарів має бути true або false.'),
    body('allowGuestComments').optional().isBoolean().toBoolean().withMessage('Параметр коментарів гостей має бути true або false.'),
    handleValidationErrors,
];

// --- Валідатори для Story ---
const storyBody = (field) => body(field).if((value, { req }) => !req.file || !req.body.jsonData);
const storyJsonData = (field) => body(`jsonData.${field}`).if((value, { req }) => !!req.file && !!req.body.jsonData);

exports.validateCreateStory = [
    body('jsonData').if(body('image').exists()).optional().isJSON().withMessage('jsonData має бути валідним JSON рядком.'),
    // Перевіряємо або body, або jsonData
    oneOf([
        storyBody('translations.uk.title').trim().notEmpty().isLength({ min: 3, max: 150 }),
        storyJsonData('translations.uk.title').trim().notEmpty().isLength({ min: 3, max: 150 })
    ], { message: 'Назва історії (uk) є обов\'язковою (3-150 символів).'}),
    oneOf([
        storyBody('translations.uk.content').trim().notEmpty().isLength({ min: 100 }),
        storyJsonData('translations.uk.content').trim().notEmpty().isLength({ min: 100 })
    ], { message: 'Текст історії (uk) є обов\'язковим (мін. 100 символів).'}),
    oneOf([
        storyBody('category').notEmpty().isMongoId(),
        storyJsonData('category').notEmpty().isMongoId()
    ], { message: 'Категорія є обов\'язковою та має бути валідним ID.'}),

    // Опціональні переклади
    body('translations.*.title').optional({ checkFalsy: true }).trim().isLength({ min: 3, max: 150 }),
    body('translations.*.content').optional({ checkFalsy: true }).trim().isLength({ min: 100 }),
    body('jsonData.translations.*.title').optional({ checkFalsy: true }).trim().isLength({ min: 3, max: 150 }),
    body('jsonData.translations.*.content').optional({ checkFalsy: true }).trim().isLength({ min: 100 }),

    // Опціональні інші поля
    body('tags').optional().isArray(), body('tags.*').optional().trim().toLowerCase().isLength({ min: 1, max: 50 }),
    body('jsonData.tags').optional().isArray(), body('jsonData.tags.*').optional().trim().toLowerCase().isLength({ min: 1, max: 50 }),
    body('isPremium').optional().isBoolean().toBoolean(), body('jsonData.isPremium').optional().isBoolean().toBoolean(),
    body('isAnonymous').optional().isBoolean().toBoolean(), body('jsonData.isAnonymous').optional().isBoolean().toBoolean(),
    body('ageRating').optional().isIn(['18+', '21+']), body('jsonData.ageRating').optional().isIn(['18+', '21+']),

    handleValidationErrors,
];

exports.validateUpdateStory = [
    validateMongoId('id'),
    body('jsonData').if(body('image').exists() || body('removeImage').exists()).optional().isJSON().withMessage('jsonData має бути валідним JSON рядком.'),

    // Опціональні поля для оновлення
    oneOf([ storyBody('translations.uk.title').optional({ checkFalsy: true }).trim().isLength({ min: 3, max: 150 }), storyJsonData('translations.uk.title').optional({ checkFalsy: true }).trim().isLength({ min: 3, max: 150 }) ]),
    oneOf([ storyBody('translations.uk.content').optional({ checkFalsy: true }).trim().isLength({ min: 100 }), storyJsonData('translations.uk.content').optional({ checkFalsy: true }).trim().isLength({ min: 100 }) ]),
    oneOf([ storyBody('category').optional().isMongoId(), storyJsonData('category').optional().isMongoId() ]),

    body('translations.*.title').optional({ checkFalsy: true }).trim().isLength({ min: 3, max: 150 }),
    body('translations.*.content').optional({ checkFalsy: true }).trim().isLength({ min: 100 }),
    body('jsonData.translations.*.title').optional({ checkFalsy: true }).trim().isLength({ min: 3, max: 150 }),
    body('jsonData.translations.*.content').optional({ checkFalsy: true }).trim().isLength({ min: 100 }),

    body('tags').optional().isArray(), body('tags.*').optional().trim().toLowerCase().isLength({ min: 1, max: 50 }),
    body('jsonData.tags').optional().isArray(), body('jsonData.tags.*').optional().trim().toLowerCase().isLength({ min: 1, max: 50 }),

    oneOf([body('status').optional().isIn(['draft', 'pending', 'published', 'rejected']), body('jsonData.status').optional().isIn(['draft', 'pending', 'published', 'rejected'])]),
    oneOf([body('isPremium').optional().isBoolean().toBoolean(), body('jsonData.isPremium').optional().isBoolean().toBoolean()]),
    oneOf([body('isAnonymous').optional().isBoolean().toBoolean(), body('jsonData.isAnonymous').optional().isBoolean().toBoolean()]),
    oneOf([body('ageRating').optional().isIn(['18+', '21+']), body('jsonData.ageRating').optional().isIn(['18+', '21+'])]),
    oneOf([body('rejectionReason').optional({ nullable: true }).trim().isLength({ max: 500 }), body('jsonData.rejectionReason').optional({ nullable: true }).trim().isLength({ max: 500 })]),
    oneOf([body('removeImage').optional().isBoolean().toBoolean(), body('jsonData.removeImage').optional().isBoolean().toBoolean()]),

    handleValidationErrors,
];


// --- Валідатори для Comment ---
exports.validateCreateComment = [
    body('text').trim().notEmpty().withMessage('Текст коментаря є обов\'язковим.')
        .isLength({ min: 3, max: 1000 }).withMessage('Коментар повинен містити від 3 до 1000 символів.'),
    body('parentComment').optional({ nullable: true }).isMongoId().withMessage('Некоректний ID батьківського коментаря.'),
    handleValidationErrors,
];

exports.validateUpdateComment = [
    validateMongoId('id'),
    body('text').trim().notEmpty().withMessage('Текст коментаря не може бути порожнім.')
        .isLength({ min: 3, max: 1000 }).withMessage('Коментар повинен містити від 3 до 1000 символів.'),
    handleValidationErrors,
];

exports.validateGetCommentLikeStatuses = [
    body('commentIds').isArray({ min: 1 }).withMessage('Необхідно передати масив ID коментарів.'),
    body('commentIds.*').isMongoId().withMessage('Масив повинен містити тільки валідні MongoDB ID.'),
    handleValidationErrors,
];

// --- Валідатори для Report ---
exports.validateCreateReport = [
    body('type').isIn(['story', 'comment', 'user']).withMessage('Некоректний тип об\'єкта скарги (дозволено: story, comment, user).'),
    body('reportedItem').notEmpty().withMessage('ID об\'єкта скарги є обов\'язковим.').isMongoId().withMessage('Некоректний ID об\'єкта скарги.'),
    body('reason').trim().notEmpty().withMessage('Причина скарги є обов\'язковою.').isLength({ min: 10, max: 500 }).withMessage('Причина скарги повинна містити від 10 до 500 символів.'),
    handleValidationErrors,
];

exports.validateUpdateReportStatus = [
    validateMongoId('id'),
    body('status')
        .notEmpty().withMessage('Статус є обов\'язковим.')
        .isIn(['new', 'in_progress', 'resolved', 'rejected'])
        .withMessage('Некоректний статус скарги (дозволено: new, in_progress, resolved, rejected).'),
    body('adminNotes')
        .optional({ nullable: true, checkFalsy: true })
        .trim()
        .isLength({ max: 1000 }).withMessage('Нотатки адміністратора занадто довгі (макс. 1000 символів).'),
    handleValidationErrors,
];


// --- Валідатори для Like ---
exports.validateToggleLike = [
    body('targetId')
        .notEmpty().withMessage('ID об\'єкта (targetId) є обов\'язковим.')
        .isMongoId().withMessage('Некоректний формат MongoDB ID для targetId.'),
    body('targetModel')
        .isIn(['Story', 'Comment'])
        .withMessage('Тип об\'єкта (targetModel) має бути "Story" або "Comment".'),
    handleValidationErrors,
];

// --- Валідатори для Rating ---
exports.validateRateStory = [
    validateMongoId('storyId'),
    body('rating')
        .exists({ checkFalsy: false }).withMessage('Поле rating є обов\'язковим.')
        .isInt({ min: 0, max: 5 }).withMessage('Рейтинг повинен бути цілим числом від 0 до 5.'),
    handleValidationErrors,
];

// --- Валідатори для Category ---
exports.validateCategory = [
    body('translations').optional().isObject().withMessage('Поле translations має бути об\'єктом.'),
    body('translations.uk.name').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 100 }).withMessage('Назва категорії (uk) має бути від 2 до 100 символів.'),
    body('translations.uk.description').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).withMessage('Опис категорії (uk) занадто довгий (макс 500).'),
    body('translations.*.name').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 100 }).withMessage('Назва категорії має бути від 2 до 100 символів.'),
    body('translations.*.description').optional({ checkFalsy: true }).trim().isLength({ max: 500 }).withMessage('Опис категорії занадто довгий (макс 500).'),
    body('imageUrl').optional({ nullable: true }).trim().isURL({ protocols: ['http','https'], require_protocol: true, require_valid_protocol: true }).withMessage('Некоректний URL зображення (має починатися з http:// або https://).'),
    handleValidationErrors,
];

// --- Валідатори для Tag ---
exports.validateTag = [
    body('translations').optional().isObject().withMessage('Поле translations має бути об\'єктом.'),
    body('translations.uk.name').optional({ checkFalsy: true }).trim().isLength({ min: 1, max: 50 }).withMessage('Назва тегу (uk) має бути від 1 до 50 символів.'),
    body('translations.*.name').optional({ checkFalsy: true }).trim().isLength({ min: 1, max: 50 }).withMessage('Назва тегу має бути від 1 до 50 символів.'),
    handleValidationErrors,
];


// --- Експорт спільних валідаторів ---
exports.validateMongoId = validateMongoId;
exports.validateSlug = validateSlug;
exports.validateIdOrSlug = validateIdOrSlug;
exports.handleValidationErrors = handleValidationErrors;
// --- END OF FILE middleware/validationMiddleware.js ---