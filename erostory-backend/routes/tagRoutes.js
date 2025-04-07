// --- START OF FILE routes/tagRoutes.js ---
const express = require('express');
const tagController = require('../controllers/tagController');
const authMiddleware = require('../middleware/authMiddleware');
const validationMiddleware = require('../middleware/validationMiddleware');

const router = express.Router();

// --- Публічні маршрути ---
router.get('/', tagController.getAllTags); // GET /tags

router.get(
    '/:idOrSlug',
    validationMiddleware.validateIdOrSlug('idOrSlug'), // Валідація ID або slug
    tagController.getTag // GET /tags/:id або /tags/:slug
);

// --- Маршрути тільки для адміністраторів ---
router.use(authMiddleware.protect, authMiddleware.restrictTo('admin'));

router.post( // POST /tags
    '/',
    validationMiddleware.validateTag, // Валідація тіла запиту
    tagController.createTag
);

router.patch( // PATCH /tags/:idOrSlug
    '/:idOrSlug',
    validationMiddleware.validateIdOrSlug('idOrSlug'), // Валідація параметра
    validationMiddleware.validateTag, // Валідація тіла (поля опціональні)
    tagController.updateTag
);

router.delete( // DELETE /tags/:idOrSlug
    '/:idOrSlug',
    validationMiddleware.validateIdOrSlug('idOrSlug'),
    tagController.deleteTag
);

module.exports = router;
// --- END OF FILE routes/tagRoutes.js ---