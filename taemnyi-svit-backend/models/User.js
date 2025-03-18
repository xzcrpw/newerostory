// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Будь ласка, додайте ім\'я користувача'],
    unique: true,
    trim: true,
    maxlength: [50, 'Ім\'я користувача не може бути довшим за 50 символів']
  },
  email: {
    type: String,
    required: [true, 'Будь ласка, додайте електронну пошту'],
    unique: true,
    match: [
      /^\S+@\S+\.\S+$/,
      'Будь ласка, додайте коректну електронну пошту'
    ]
  },
  password: {
    type: String,
    required: [true, 'Будь ласка, додайте пароль'],
    minlength: [6, 'Пароль має містити не менше 6 символів'],
    select: false // Не повертається при запитах
  },
  avatar: {
    type: String,
    default: 'default-avatar.jpg'
  },
  bio: {
    type: String,
    maxlength: [500, 'Біографія не може перевищувати 500 символів']
  },
  isPremium: {
    type: Boolean,
    default: false
  },
  premiumUntil: {
    type: Date,
    default: null
  },
  savedStories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Story'
  }],
  likedStories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Story'
  }],
  followingAuthors: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  role: {
    type: String,
    enum: ['user', 'author', 'admin'],
    default: 'user'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Додаємо поле для Google ID
  googleId: {
    type: String,
    default: null
  }
});

// Хешування пароля перед збереженням
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
  }
  
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Метод порівняння пароля
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Метод генерації JWT токена
UserSchema.methods.getSignedJwtToken = function() {
  return jwt.sign(
    { id: this._id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

module.exports = mongoose.model('User', UserSchema);
