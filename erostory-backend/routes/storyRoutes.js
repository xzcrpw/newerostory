// --- START OF FILE routes/storyRoutes.js ---
const express = require('express');
const storyController = require('../controllers/storyController');
const authMiddleware = require('../middleware/authMiddleware');
const validationMiddleware = require('../middleware/validationMiddleware');
const uploadMiddleware = require('../middleware/uploadMiddleware');
// Імпортуємо ОБ'ЄКТ з двома роутерами з commentRoutes.js
const { storyCommentRouter } = require('./commentRoutes');
const ratingController = require('../controllers/ratingController');

const router = express.Router();

// --- Вкладені маршрути ---
// Маршрути для коментарів до конкретної історії /stories/:storyId/comments/...
router.use('/:storyId/comments',
    validationMiddleware.validateMongoId('storyId', 'params'), // Валідуємо storyId тут
    storyCommentRouter // ВИКОРИСТОВУЄМО ПРАВИЛЬНИЙ РОУТЕР
);
// Маршрут для оцінки історії POST /stories/:storyId/rate
router.post(
    '/:storyId/rate',
    authMiddleware.protect,
    validationMiddleware.validateRateStory, // Валідатор перевірить і :storyId, і body.rating
    ratingController.rateStory
);

// --- Публічні маршрути для історій ---
router.get('/', storyController.getAllStories); // GET /stories

router.get(
    '/:id', // GET /stories/:id
    validationMiddleware.validateMongoId('id', 'params'),
    (req, res, next) => { // Middleware для встановлення req.user, якщо можливо
        authMiddleware.protect(req, res, (err) => {
            if (err && err.statusCode !== 401) return next(err);
            next(); // Ігноруємо помилку 401, йдемо далі
        });
    },
    storyController.getStory
);

router.get(
    '/:id/related', // GET /stories/:id/related
    validationMiddleware.validateMongoId('id', 'params'),
    storyController.getRelatedStories
);

// --- Захищені маршрути ---
router.use(authMiddleware.protect);

router.post( // POST /stories
    '/',
    uploadMiddleware.uploadStoryImage,
    uploadMiddleware.handleImageUrl,
    uploadMiddleware.handleMulterError,
    validationMiddleware.validateCreateStory,
    storyController.createStory
);

router.patch( // PATCH /stories/:id
    '/:id',
    validationMiddleware.validateMongoId('id', 'params'),
    uploadMiddleware.uploadStoryImage,
    uploadMiddleware.handleImageUrl,
    uploadMiddleware.handleMulterError,
    validationMiddleware.validateUpdateStory,
    storyController.updateStory
);

// --- Маршрути для адмінів/модераторів ---
router.delete( // DELETE /stories/:id
    '/:id',
    validationMiddleware.validateMongoId('id', 'params'),
    authMiddleware.restrictTo('admin', 'moderator'), // Явно обмежуємо
    storyController.deleteStory
);

router.patch( // PATCH /stories/:id/status
    '/:id/status',
    validationMiddleware.validateMongoId('id', 'params'),
    authMiddleware.restrictTo('admin', 'moderator'),
    validationMiddleware.validateUpdateStory, // Валідатор перевірить тіло запиту (поле status)
    storyController.updateStory
);

module.exports = router;
// --- END OF FILE routes/storyRoutes.js ---