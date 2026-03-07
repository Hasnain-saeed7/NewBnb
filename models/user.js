const mongoose = require('mongoose');

const userSchema = mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required']
  },
  lastName: String,
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true
  },
  password: {
    type: String,
    required: [true, 'Password is required']
  },
  userType: {
    type: String,
    enum: ['guest', 'host'],
    default: 'guest'
  },
  favourites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Home'
  }],
  hostProfile: {
    bio: { type: String, default: '' },
    phone: { type: String, default: '' },
    languages: { type: String, default: '' },
    responseTime: { type: String, default: '' },
    profilePhoto: { type: String, default: '' }
  }
});

module.exports = mongoose.model('User', userSchema);