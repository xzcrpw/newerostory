// models/Story.js
const mongoose = require('mongoose');

const StorySchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Будь ласка, додайте назву історії'],
    trim: true,
    maxlength: [100, 'Назва не може бути довшою за 100 символів']
  },

  // Додаємо поле для мови
  language: {
    type: String,
    enum: ['uk', 'en', 'ru', 'de', 'it'],
    default: 'uk'
  },

  // Додаємо поле для перекладів
  translations: [{
    language: {
      type: String,
      enum: ['uk', 'en', 'ru', 'de', 'it']
    },
    title: String,
    content: String,
    translationDate: {
      type: Date,
      default: Date.now
    }
  }],

  content: {
    type: String,
    required: [true, 'Будь ласка, додайте текст історії']
  },
  image: {
    type: String,
    default: 'default-story.jpg'
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  tags: [{
    type: String
  }],
  ageRestriction: {
    type: String,
    enum: ['18+', '21+'],
    default: '18+'
  },
  isPremium: {
    type: Boolean,
    default: false
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'moderation', 'rejected'],
    default: 'draft'
  },
  views: {
    type: Number,
    default: 0
  },
  likes: {
    type: Number,
    default: 0
  },
  ratings: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    value: {
      type: Number,
      min: 1,
      max: 5
    }
  }],
  averageRating: {
    type: Number,
    default: 0
  },
  readingTime: {
    type: Number,
    default: 0 // в хвилинах
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  publishedAt: {
    type: Date,
    default: null
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Віртуальне поле для коментарів
StorySchema.virtual('comments', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'story',
  justOne: false
});

// Індексація для пошуку
StorySchema.index({ title: 'text', content: 'text', tags: 'text' });

// Оновлення середньої оцінки
StorySchema.methods.updateAverageRating = function() {
  if (this.ratings.length === 0) {
    this.averageRating = 0;
    return;
  }
  
  const sum = this.ratings.reduce((total, rating) => total + rating.value, 0);
  this.averageRating = Math.round((sum / this.ratings.length) * 10) / 10;
};

// Обчислення часу читання при збереженні
StorySchema.pre('save', function(next) {
  if (this.isModified('content')) {
    // Середня швидкість читання: 200 слів за хвилину
    const wordsPerMinute = 200;
    const words = this.content.split(/\s+/).length;
    this.readingTime = Math.ceil(words / wordsPerMinute);
  }
  next();
});

module.exports = mongoose.model('Story', StorySchema);
