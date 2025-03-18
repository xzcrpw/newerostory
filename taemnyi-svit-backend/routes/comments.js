// routes/comments.js
const express = require('express');
const { check } = require('express-validator');
const {
  getComments,
  createComment,
  updateComment,
  deleteComment,
  likeComment
} = require('../controllers/commentsController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router
    .route('/')
    .get(getComments)
    .post(
        protect,
        [
          check('text', 'Текст коментаря обов\'язковий').not().isEmpty(),
          check('text', 'Текст не може перевищувати 1000 символів').isLength({ max: 1000 }),
          check('story', 'ID історії обов\'язковий').not().isEmpty()
        ],
        createComment
    );

router
    .route('/:id')
    .put(protect, updateComment)
    .delete(protect, deleteComment);

router.route('/:id/like').post(protect, likeComment);

module.exports = router;