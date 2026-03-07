const mongoose = require("mongoose");

const homeSchema = mongoose.Schema({
  houseName: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  location: {
    type: String,
    required: true,
  },
  rating: {
    type: Number,
    required: true,
  },
  photo:  { url: String, filename: String },
  image1: { url: String, filename: String },
  image2: { url: String, filename: String },
  image3: { url: String, filename: String },
  image4: { url: String, filename: String },
  description: String,
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  geometry: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],   // [longitude, latitude]
      default: [0, 0]
    }
  }
});

homeSchema.post('findOneAndDelete', async function(doc) {
  if (doc) {
    const Booking = require('../models/booking');
    await Booking.deleteMany({ home: doc._id });

    // Delete all associated images from Cloudinary
    const { cloudinary } = require('../cloudinary');
    const imageFields = [doc.photo, doc.image1, doc.image2, doc.image3, doc.image4];
    for (const img of imageFields) {
      if (img && img.filename) {
        await cloudinary.uploader.destroy(img.filename).catch(() => {});
      }
    }
  }
});

module.exports = mongoose.model("Home", homeSchema);