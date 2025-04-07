// --- START OF FILE routes/categoryRoutes.js ---
const express = require('express');
const categoryController = require('../controllers/categoryController');
const authMiddleware = require('../middleware/authMiddleware');
const validationMiddleware = require('../middleware/validationMiddleware');

const router = express.Router();

// --- Публічні маршрути ---
router.get('/', categoryController.getAllCategories); // GET /categories

router.get(
    '/:idOrSlug',
    validationMiddleware.validateIdOrSlug('idOrSlug'), // Валідація ID або slug
    categoryController.getCategory // GET /categories/:id або /categories/:slug
);

// --- Маршрути, що потребують автентифікації ---
router.use(authMiddleware.protect);

// Отримання статусу (підписка/обране) для конкретної категорії
router.get(
    '/:slug/status', // GET /categories/:slug/status
    validationMiddleware.validateSlug('slug', 'params'), // Валідація slug
    categoryController.getCategoryStatus
);

// Підписка/відписка від категорії
router.post( // POST для зміни стану
    '/:slug/subscribe', // POST /categories/:slug/subscribe
    validationMiddleware.validateSlug('slug', 'params'),
    categoryController.toggleSubscribeCategory
);

// Додавання/видалення категорії з обраного
router.post( // POST для зміни стану
    '/:slug/favorite', // POST /categories/:slug/favorite
    validationMiddleware.validateSlug('slug', 'params'),
    categoryController.toggleFavoriteCategory
);

// --- Маршрути тільки для адміністраторів ---
router.use(authMiddleware.restrictTo('admin'));

router.post( // POST /categories
    '/',
    validationMiddleware.validateCategory, // Валідація тіла запиту
    categoryController.createCategory
);

router.patch( // PATCH /categories/:idOrSlug
    '/:idOrSlug',
    validationMiddleware.validateIdOrSlug('idOrSlug'), // Валідація параметра
    validationMiddleware.validateCategory, // Валідація тіла (поля опціональні)
    categoryController.updateCategory
);

router.delete( // DELETE /categories/:idOrSlug
    '/:idOrSlug',
    validationMiddleware.validateIdOrSlug('idOrSlug'),
    categoryController.deleteCategory
);

module.exports = router;
// --- END OF FILE routes/categoryRoutes.js ---