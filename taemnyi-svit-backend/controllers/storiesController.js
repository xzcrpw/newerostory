// controllers/storiesController.js
const Story = require('../models/Story');
const Category = require('../models/Category');
const { validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');

// @desc    Отримати всі історії (з фільтрацією)
// @route   GET /api/stories
// @access  Public
exports.getStories = async (req, res) => {
  try {
    let query;
    
    // Копіюємо об'єкт запиту
    const reqQuery = { ...req.query };
    
    // Поля, які виключаємо з фільтрації
    const removeFields = ['select', 'sort', 'page', 'limit'];
    
    // Видаляємо ці поля з запиту
    removeFields.forEach(param => delete reqQuery[param]);
    
    // Фільтрація за статусом - показуємо тільки опубліковані історії для публічного доступу
    if (!req.user || req.user.role !== 'admin') {
      reqQuery.status = 'published';
    }
    
    // Фільтрація за преміум-контентом
    if (req.query.premium) {
      reqQuery.isPremium = req.query.premium === 'true';
    }
    
    // Перетворення запиту в рядок для подальшої обробки
    let queryStr = JSON.stringify(reqQuery);
    
    // Створення операторів ($gt, $gte, etc)
    queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);
    
    // Пошук за ключовими словами
    if (req.query.keyword) {
      query = Story.find({
        $or: [
          { title: { $regex: req.query.keyword, $options: 'i' } },
          { content: { $regex: req.query.keyword, $options: 'i' } },
          { tags: { $in: [new RegExp(req.query.keyword, 'i')] } }
        ]
      });
    } else {
      // Знаходимо історії відповідно до фільтрів
      query = Story.find(JSON.parse(queryStr));
    }
    
    // Поля для вибору
    if (req.query.select) {
      const fields = req.query.select.split(',').join(' ');
      query = query.select(fields);
    }
    
    // Сортування
    if (req.query.sort) {
      const sortBy = req.query.sort.split(',').join(' ');
      query = query.sort(sortBy);
    } else {
      // Сортування за замовчуванням: спочатку нові
      query = query.sort('-createdAt');
    }
    
    // Пагінація
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = await Story.countDocuments(JSON.parse(queryStr));
    
    query = query.skip(startIndex).limit(limit);
    
    // Заповнення (populate) полів
    query = query.populate({
      path: 'author',
      select: 'username avatar'
    }).populate({
      path: 'category',
      select: 'name slug'
    });
    
    // Виконання запиту
    const stories = await query;
    
    // Пагінація результату
    const pagination = {};
    
    if (endIndex < total) {
      pagination.next = {
        page: page + 1,
        limit
      };
    }
    
    if (startIndex > 0) {
      pagination.prev = {
        page: page - 1,
        limit
      };
    }
    
    res.status(200).json({
      success: true,
      count: stories.length,
      pagination,
      data: stories
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при отриманні історій'
    });
  }
};

// @desc    Отримати одну історію
// @route   GET /api/stories/:id
// @access  Public
exports.getStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id)
      .populate({
        path: 'author',
        select: 'username avatar bio'
      })
      .populate({
        path: 'category',
        select: 'name slug'
      })
      .populate({
        path: 'comments',
        match: { parentComment: null }, // Тільки коментарі верхнього рівня
        populate: {
          path: 'user',
          select: 'username avatar'
        }
      });
    
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Історію не знайдено'
      });
    }
    
    // Перевірка на доступ до історії зі статусом, відмінним від 'published'
    if (story.status !== 'published' && (!req.user || (req.user.id !== story.author._id.toString() && req.user.role !== 'admin'))) {
      return res.status(403).json({
        success: false,
        message: 'У вас немає доступу до цієї історії'
      });
    }
    
    // Перевірка на доступ до преміум-контенту
    if (story.isPremium && (!req.user || !req.user.isPremium) && req.user?.id !== story.author._id.toString() && req.user?.role !== 'admin') {
      // Якщо історія преміум і користувач не має преміум-доступу,
      // обрізаємо контент, залишаючи тільки початок
      const words = story.content.split(' ');
      const previewLength = Math.min(300, words.length);
      
      // Створюємо копію об'єкту історії для модифікації
      const storyObj = story.toObject();
      storyObj.content = words.slice(0, previewLength).join(' ') + '...';
      storyObj.isPremiumLocked = true;
      
      return res.status(200).json({
        success: true,
        data: storyObj
      });
    }
    
    // Інкремент лічильника переглядів
    if (!req.user || req.user.id !== story.author._id.toString()) {
      story.views += 1;
      await story.save({ validateBeforeSave: false });
    }
    
    res.status(200).json({
      success: true,
      data: story
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при отриманні історії'
    });
  }
};

// @desc    Створити нову історію
// @route   POST /api/stories
// @access  Private
exports.createStory = async (req, res) => {
  try {
    // Валідація вхідних даних
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    // Додаємо автора до даних історії
    req.body.author = req.user.id;
    
    // Перевірка, чи існує вказана категорія
    const categoryExists = await Category.findById(req.body.category);
    if (!categoryExists) {
      return res.status(400).json({
        success: false,
        message: 'Вказана категорія не існує'
      });
    }
    
    // Створення історії
    const story = await Story.create(req.body);
    
    res.status(201).json({
      success: true,
      data: story
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при створенні історії'
    });
  }
};

// @desc    Оновити історію
// @route   PUT /api/stories/:id
// @access  Private
exports.updateStory = async (req, res) => {
  try {
    let story = await Story.findById(req.params.id);
    
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Історію не знайдено'
      });
    }
    
    // Перевірка власності
    if (story.author.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'У вас немає прав на редагування цієї історії'
      });
    }
    
    // Якщо змінюється категорія, перевірте, чи вона існує
    if (req.body.category && req.body.category !== story.category.toString()) {
      const categoryExists = await Category.findById(req.body.category);
      if (!categoryExists) {
        return res.status(400).json({
          success: false,
          message: 'Вказана категорія не існує'
        });
      }
    }
    
    // Якщо історія публікується вперше, встановіть дату публікації
    if (req.body.status === 'published' && story.status !== 'published') {
      req.body.publishedAt = Date.now();
    }
    
    // Оновлення історії
    story = await Story.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    
    res.status(200).json({
      success: true,
      data: story
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при оновленні історії'
    });
  }
};

// @desc    Видалити історію
// @route   DELETE /api/stories/:id
// @access  Private
exports.deleteStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Історію не знайдено'
      });
    }
    
    // Перевірка власності
    if (story.author.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'У вас немає прав на видалення цієї історії'
      });
    }
    
    // Якщо є зображення, яке не є зображенням за замовчуванням, видаліть його
    if (story.image !== 'default-story.jpg') {
      const imagePath = path.join(__dirname, '../uploads/stories', story.image);
      
      // Перевірка, чи існує файл
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    await story.remove();
    
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при видаленні історії'
    });
  }
};

// @desc    Завантаження зображення для історії
// @route   PUT /api/stories/:id/image
// @access  Private
exports.uploadStoryImage = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Історію не знайдено'
      });
    }
    
    // Перевірка власності
    if (story.author.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'У вас немає прав на редагування цієї історії'
      });
    }
    
    if (!req.files || !req.files.image) {
      return res.status(400).json({
        success: false,
        message: 'Будь ласка, завантажте файл'
      });
    }
    
    const file = req.files.image;
    
    // Перевірка, чи це зображення
    if (!file.mimetype.startsWith('image')) {
      return res.status(400).json({
        success: false,
        message: 'Будь ласка, завантажте зображення'
      });
    }
    
    // Перевірка розміру файлу
    if (file.size > process.env.MAX_FILE_SIZE) {
      return res.status(400).json({
        success: false,
        message: `Розмір файлу не може перевищувати ${process.env.MAX_FILE_SIZE} байт`
      });
    }
    
    // Створення кастомного імені файлу
    file.name = `story_${story._id}${path.parse(file.name).ext}`;
    
    // Якщо є поточне зображення і воно не за замовчуванням, видаліть його
    if (story.image !== 'default-story.jpg') {
      const currentImagePath = path.join(__dirname, '../uploads/stories', story.image);
      
      if (fs.existsSync(currentImagePath)) {
        fs.unlinkSync(currentImagePath);
      }
    }
    
    // Переміщення файлу
    file.mv(`${process.env.FILE_UPLOAD_PATH}/stories/${file.name}`, async err => {
      if (err) {
        console.error(err);
        return res.status(500).json({
          success: false,
          message: 'Проблема з завантаженням файлу'
        });
      }
      
      // Оновлення історії з новим іменем файлу зображення
      await Story.findByIdAndUpdate(req.params.id, { image: file.name });
      
      res.status(200).json({
        success: true,
        data: file.name
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при завантаженні зображення'
    });
  }
};

// @desc    Оцінити історію
// @route   POST /api/stories/:id/rate
// @access  Private
exports.rateStory = async (req, res) => {
  try {
    const { rating } = req.body;
    
    // Валідація рейтингу
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Будь ласка, вкажіть рейтинг від 1 до 5'
      });
    }
    
    const story = await Story.findById(req.params.id);
    
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Історію не знайдено'
      });
    }
    
    // Перевірка, чи це не власна історія
    if (story.author.toString() === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Ви не можете оцінювати власну історію'
      });
    }
    
    // Перевірка, чи користувач вже оцінював цю історію
    const ratingIndex = story.ratings.findIndex(r => r.user.toString() === req.user.id);
    
    if (ratingIndex !== -1) {
      // Оновлення існуючого рейтингу
      story.ratings[ratingIndex].value = rating;
    } else {
      // Додавання нового рейтингу
      story.ratings.push({
        user: req.user.id,
        value: rating
      });
    }
    
    // Оновлення середнього рейтингу
    story.updateAverageRating();
    
    await story.save();
    
    res.status(200).json({
      success: true,
      data: {
        averageRating: story.averageRating,
        ratingsCount: story.ratings.length
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при оцінюванні історії'
    });
  }
};

// @desc    Додати історію до улюблених (лайк)
// @route   POST /api/stories/:id/like
// @access  Private
exports.likeStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Історію не знайдено'
      });
    }
    
    // Отримання користувача з його лайками
    const user = await User.findById(req.user.id);
    
    // Перевірка, чи вже лайкнуто історію
    const alreadyLiked = user.likedStories.includes(story._id);
    
    if (alreadyLiked) {
      // Видалення лайку
      user.likedStories = user.likedStories.filter(id => id.toString() !== story._id.toString());
      story.likes -= 1;
    } else {
      // Додавання лайку
      user.likedStories.push(story._id);
      story.likes += 1;
    }
    
    await user.save();
    await story.save();
    
    res.status(200).json({
      success: true,
      data: {
        liked: !alreadyLiked,
        likes: story.likes
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при додаванні лайку'
    });
  }
};

// @desc    Додати історію до збережених
// @route   POST /api/stories/:id/save
// @access  Private
exports.saveStory = async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    
    if (!story) {
      return res.status(404).json({
        success: false,
        message: 'Історію не знайдено'
      });
    }
    
    // Отримання користувача з його збереженими історіями
    const user = await User.findById(req.user.id);
    
    // Перевірка, чи вже збережено історію
    const alreadySaved = user.savedStories.includes(story._id);
    
    if (alreadySaved) {
      // Видалення зі збережених
      user.savedStories = user.savedStories.filter(id => id.toString() !== story._id.toString());
    } else {
      // Додавання до збережених
      user.savedStories.push(story._id);
    }
    
    await user.save();
    
    res.status(200).json({
      success: true,
      data: {
        saved: !alreadySaved
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Помилка сервера при збереженні історії'
    });
  }
};
