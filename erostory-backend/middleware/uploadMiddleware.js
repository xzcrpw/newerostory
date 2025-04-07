// --- START OF FILE middleware/uploadMiddleware.js ---
const multer = require('multer');
const path = require('path');
const AppError = require('../utils/AppError');
const { isGcsEnabled, uploadToGCS } = require('../utils/gcsUtils'); // Імпортуємо з gcsUtils

// Налаштування Multer для збереження в пам'яті
const memoryStorage = multer.memoryStorage();

// Фільтр файлів зображень
const imageFileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        // Використовуємо AppError для консистентної обробки помилок
        cb(new AppError('Дозволено завантажувати тільки зображення (JPEG, PNG, GIF, WEBP)!', 400), false);
    }
};

// --- Створення екземплярів Multer для різних типів файлів ---
// (Ліміти встановлюються безпосередньо в middleware)
const upload = multer({
    storage: memoryStorage,
    fileFilter: imageFileFilter
});

// --- Middleware для завантаження ЗОБРАЖЕННЯ ІСТОРІЇ ---
exports.uploadStoryImage = (req, res, next) => {
    // Перевіряємо, чи GCS взагалі налаштовано. Якщо ні, і файл не передано, пропускаємо.
    if (!isGcsEnabled() && !req.file) {
        // console.log('[Upload Story Image] GCS вимкнено, файл не передано. Пропуск.');
        return next();
    }
    // Якщо GCS вимкнено, але файл НАДІСЛАНО, це помилка конфігурації/очікувань
    if (!isGcsEnabled() && req.file) {
        console.error('[Upload Story Image] GCS вимкнено, але отримано файл.');
        return next(new AppError('Сервіс завантаження файлів не налаштовано.', 500));
    }

    // Встановлюємо ліміт для зображень історій
    const storyLimit = 5 * 1024 * 1024; // 5MB
    const storyUpload = multer({
        storage: memoryStorage,
        fileFilter: imageFileFilter,
        limits: { fileSize: storyLimit }
    }).single('image'); // Поле називається 'image'

    storyUpload(req, res, (err) => {
        if (err) {
            // Обробляємо помилку Multer (включаючи ліміт)
            if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
                return next(new AppError(`Файл зображення історії завеликий. Макс. розмір: ${storyLimit / (1024 * 1024)}MB.`, 400));
            }
            // Передаємо інші помилки Multer або AppError з фільтра
            return next(err);
        }
        // console.log('[Upload Story Image] Файл отримано в пам\'ять (якщо був).');
        next();
    });
};

// --- Middleware для завантаження АВАТАРА ---
exports.uploadAvatar = (req, res, next) => {
    if (!isGcsEnabled() && !req.file) {
        // console.log('[Upload Avatar] GCS вимкнено, файл не передано. Пропуск.');
        return next();
    }
    if (!isGcsEnabled() && req.file) {
        console.error('[Upload Avatar] GCS вимкнено, але отримано файл.');
        return next(new AppError('Сервіс завантаження файлів не налаштовано.', 500));
    }

    // Встановлюємо ліміт для аватарів
    const avatarLimit = 2 * 1024 * 1024; // 2MB
    const avatarUpload = multer({
        storage: memoryStorage,
        fileFilter: imageFileFilter,
        limits: { fileSize: avatarLimit }
    }).single('avatar'); // Поле називається 'avatar'

    avatarUpload(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
                return next(new AppError(`Файл аватара завеликий. Макс. розмір: ${avatarLimit / (1024 * 1024)}MB.`, 400));
            }
            return next(err);
        }
        // console.log('[Upload Avatar] Файл отримано в пам\'ять (якщо був).');
        next();
    });
};

// --- Middleware для обробки URL або завантаження ЗОБРАЖЕННЯ ІСТОРІЇ в GCS ---
exports.handleImageUrl = async (req, res, next) => {
    // Перевірка, чи було передано тіло (важливо для FormData)
    if (!req.body && !req.file) {
        // console.log('[Handle Image URL] Немає тіла запиту або файлу.');
        return next();
    }

    // Визначаємо дані (з jsonData або req.body)
    let bodyData = {};
    if (req.file && req.body.jsonData) {
        try {
            bodyData = JSON.parse(req.body.jsonData);
        } catch (e) {
            return next(new AppError('Некоректний формат jsonData.', 400));
        }
    } else if (!req.file) {
        bodyData = req.body;
    }

    // 1. Пріоритет: Файл для завантаження
    if (req.file) {
        if (!isGcsEnabled()) {
            return next(new AppError('Сервіс завантаження файлів (GCS) не налаштовано.', 500));
        }
        try {
            const userId = req.user?._id || 'anonymous';
            const uniqueSuffix = `${userId}-${Date.now()}`;
            const extension = path.extname(req.file.originalname).toLowerCase();
            // Визначаємо папку на основі середовища
            const destinationFolder = process.env.NODE_ENV === 'production' ? 'stories' : 'stories-dev';
            const destination = `${destinationFolder}/${uniqueSuffix}${extension}`;

            const gcsUrl = await uploadToGCS(req.file, destination);
            req.body.imageUrl = gcsUrl; // Встановлюємо URL з GCS для контролера
            console.log(`[Handle Image URL] Файл для історії завантажено в GCS: ${gcsUrl}`);
            return next(); // Переходимо далі
        } catch (error) {
            return next(error); // Передаємо помилку GCS
        }
    }

    // 2. Якщо файлу немає, перевіряємо прапорець видалення
    if (bodyData.removeImage === true || bodyData.removeImage === 'true') {
        req.body.imageUrl = null; // Сигнал для контролера, що треба видалити
        console.log('[Handle Image URL] Встановлено прапорець видалення зображення.');
        return next();
    }

    // 3. Якщо файлу немає і видалення не вказано, перевіряємо URL
    if (bodyData.imageUrl && typeof bodyData.imageUrl === 'string' && validator.isURL(bodyData.imageUrl)) {
        req.body.imageUrl = bodyData.imageUrl.trim(); // Зберігаємо переданий URL
        console.log(`[Handle Image URL] Використовується переданий URL: ${req.body.imageUrl}`);
        return next();
    }

    // 4. Якщо нічого з вищезазначеного не виконалось, imageUrl не встановлено
    console.log('[Handle Image URL] Файл/URL/видалення не вказано. Поле imageUrl не встановлено.');
    req.body.imageUrl = undefined; // Явно вказуємо, що поле не повинно оновлюватись (якщо це PATCH)
    next();
};

// --- Middleware для обробки URL або завантаження АВАТАРА в GCS ---
exports.handleAvatarUrl = async (req, res, next) => {
    // 1. Якщо є файл
    if (req.file) {
        if (!isGcsEnabled()) {
            return next(new AppError('Сервіс завантаження файлів (GCS) не налаштовано.', 500));
        }
        try {
            const userId = req.user._id; // Користувач має бути автентифікований
            const uniqueSuffix = `${userId}-${Date.now()}`;
            const extension = path.extname(req.file.originalname).toLowerCase();
            const destinationFolder = process.env.NODE_ENV === 'production' ? 'avatars' : 'avatars-dev';
            const destination = `${destinationFolder}/${userId}/${uniqueSuffix}${extension}`;

            const gcsUrl = await uploadToGCS(req.file, destination);
            req.body.imageUrl = gcsUrl; // Передаємо URL в контролер updateMe
            console.log(`[Handle Avatar URL] Аватар завантажено в GCS: ${gcsUrl}`);
            return next();
        } catch (error) {
            return next(error);
        }
    }

    // 2. Якщо файлу немає, перевіряємо прапорець видалення
    // Використовуємо саме `req.body.removeAvatar`, а не `bodyData`, бо тут немає jsonData
    if (req.body.removeAvatar === 'true' || req.body.removeAvatar === true) {
        console.log('[Handle Avatar URL] Встановлено прапорець видалення аватара.');
        req.body.imageUrl = null; // Сигнал для контролера updateMe
        return next();
    }

    // 3. Якщо нічого не передано/змінено, imageUrl залишається undefined
    console.log('[Handle Avatar URL] Файл аватара/видалення не передано.');
    req.body.imageUrl = undefined;
    next();
};

// --- Middleware для обробки помилок Multer (залишається загальним) ---
exports.handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        let message = `Помилка завантаження файлу: ${err.message}.`;
        if (err.code === 'LIMIT_FILE_SIZE') {
            // Намагаємось отримати ліміт з запиту (встановлений попереднім middleware)
            const limitMB = (req.multerLimit || 5 * 1024 * 1024) / (1024 * 1024); // 5MB за замовчуванням
            message = `Файл занадто великий. Максимальний розмір: ${limitMB.toFixed(1)}MB.`;
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            message = `Неочікуване поле файлу: ${err.field}.`;
        }
        return next(new AppError(message, 400));
    }
    // Передаємо не-Multer помилки далі
    next(err);
};
// --- END OF FILE middleware/uploadMiddleware.js ---