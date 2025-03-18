// models/Category.js
const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Будь ласка, додайте назву категорії'],
    unique: true,
    trim: true,
    maxlength: [50, 'Назва не може бути довшою за 50 символів']
  },
  slug: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    required: [true, 'Будь ласка, додайте опис категорії'],
    maxlength: [500, 'Опис не може бути довшим за 500 символів']
  },
  image: {
    type: String,
    default: 'default-category.jpg'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Віртуальне поле для історій у категорії
CategorySchema.virtual('stories', {
  ref: 'Story',
  localField: '_id',
  foreignField: 'category',
  justOne: false
});

// Створення slug із назви категорії
CategorySchema.pre('save', function(next) {
  if (this.isModified('name')) {
    // Транслітерація кирилиці та перетворення на slug
    this.slug = this.name
      .toLowerCase()
      .replace(/\s+/g, '-') // Заміна пробілів на дефіси
      .replace(/[^a-z0-9-]/g, '') // Видалення всіх символів, крім літер, цифр та дефісів
      .replace(/-+/g, '-') // Заміна кількох дефісів на один
      .replace(/^-|-$/g, ''); // Видалення дефісів на початку та в кінці
  }
  next();
});

module.exports = mongoose.model('Category', CategorySchema);
