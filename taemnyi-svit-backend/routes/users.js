// routes/users.js
const express = require('express');
const {
  getUserProfile,
  updateProfile,
  uploadAvatar,
  followAuthor,
  unfollowAuthor,
  getSavedStories,
  getLikedStories,
  getFollowing,
  getUserComments,
  updatePremium,
  cancelPremium
} = require('../controllers/usersController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Базові маршрути для користувачів
router.get('/:id', getUserProfile);
router.put('/:id', protect, updateProfile);
router.put('/:id/avatar', protect, uploadAvatar);

// Маршрути для підписок
router.post('/follow/:id', protect, followAuthor);
router.post('/unfollow/:id', protect, unfollowAuthor);
router.get('/following', protect, getFollowing);

// Маршрути для збережених і вподобаних історій та коментарів
router.get('/saved-stories', protect, getSavedStories);
router.get('/liked-stories', protect, getLikedStories);
router.get('/comments', protect, getUserComments);

// Маршрути для преміум-підписки
router.put('/premium', protect, updatePremium);
router.put('/premium/cancel', protect, cancelPremium);

module.exports = router;