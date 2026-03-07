const Home = require("../models/home");
const User = require("../models/user");
const fs = require("fs");
const { cloudinary } = require('../cloudinary');
const mapboxSdk = require('@mapbox/mapbox-sdk');
const mbxGeocoding = require('@mapbox/mapbox-sdk/services/geocoding');

/** Geocode a location string → [lng, lat], falls back to [0,0] on error */
async function geocode(locationStr) {
  try {
    const token = process.env.MAPBOX_TOKEN;
    if (!token || token.startsWith('pk.your_')) return [0, 0];

    const client = mapboxSdk({ accessToken: token });
    const geocoder = mbxGeocoding(client);
    const response = await geocoder.forwardGeocode({ query: locationStr, limit: 1 }).send();
    const features = response.body.features;
    if (features && features.length > 0) {
      return features[0].geometry.coordinates; // [lng, lat]
    }
  } catch (e) {
    console.log('Geocoding error:', e.message);
  }
  return [0, 0];
}

exports.getAddHome = (req, res, next) => {
  res.render("host/edit-home", {
    pageTitle: "Add Home to airbnb",
    currentPage: "addHome",
    editing: false,
    mapboxToken: process.env.MAPBOX_TOKEN || '',
  });
};

exports.getEditHome = (req, res, next) => {
  const homeId = req.params.homeId;
  const editing = req.query.editing === "true";

  Home.findById(homeId).then((home) => {
    if (!home) {
      console.log("Home not found for editing.");
      return res.redirect("/host/host-home-list");
    }

    res.render("host/edit-home", {
      home: home,
      pageTitle: "Edit your Home",
      currentPage: "host-homes",
      editing: editing,
      mapboxToken: process.env.MAPBOX_TOKEN || '',
    });
  }).catch(next);
};

exports.getHostHomes = (req, res, next) => {
  const search = req.query.search ? req.query.search.trim() : '';
  const query = search ? { houseName: { $regex: search, $options: 'i' } } : {};
  Home.find(query).then((registeredHomes) => {
    res.render("host/host-home-list", {
      registeredHomes: registeredHomes,
      pageTitle: "Host Homes List",
      currentPage: "host-homes",
      search: search,
    });
  }).catch(next);
};

exports.postAddHome = async (req, res, next) => {
  const { houseName, price, location, rating, description } = req.body;
  const files = req.files || {};

  const mainFile = files['photo']?.[0];
  if (!mainFile) {
    return res.status(422).send('No main image provided');
  }

  const formLng = parseFloat(req.body.lng);
  const formLat = parseFloat(req.body.lat);
  const coordinates = (!isNaN(formLng) && !isNaN(formLat) && (formLng !== 0 || formLat !== 0))
    ? [formLng, formLat]
    : await geocode(location);

  const home = new Home({
    houseName,
    price,
    location,
    rating,
    photo:  mainFile ? { url: mainFile.path, filename: mainFile.filename } : undefined,
    image1: files['image1']?.[0] ? { url: files['image1'][0].path, filename: files['image1'][0].filename } : undefined,
    image2: files['image2']?.[0] ? { url: files['image2'][0].path, filename: files['image2'][0].filename } : undefined,
    image3: files['image3']?.[0] ? { url: files['image3'][0].path, filename: files['image3'][0].filename } : undefined,
    image4: files['image4']?.[0] ? { url: files['image4'][0].path, filename: files['image4'][0].filename } : undefined,
    description,
    owner: res.locals.user ? res.locals.user._id : null,
    geometry: { type: 'Point', coordinates },
  });
  home.save().then(() => {
    console.log('Home Saved successfully');
  });

  res.redirect('/host/host-home-list');
};

exports.postEditHome = async (req, res, next) => {
  const { id, houseName, price, location, rating, description } =
    req.body;
  Home.findById(id)
    .then(async (home) => {
      home.houseName = houseName;
      home.price = price;
      home.location = location;
      home.rating = rating;
      home.description = description;

      // Use frontend-provided coordinates if valid, otherwise re-geocode
      const formLng = parseFloat(req.body.lng);
      const formLat = parseFloat(req.body.lat);
      const updatedCoords = (!isNaN(formLng) && !isNaN(formLat) && (formLng !== 0 || formLat !== 0))
        ? [formLng, formLat]
        : await geocode(location);
      home.geometry = { type: 'Point', coordinates: updatedCoords };

      const files = req.files || {};

      if (files['photo']?.[0]) {
        if (home.photo && home.photo.filename) await cloudinary.uploader.destroy(home.photo.filename).catch(() => {});
        home.photo = { url: files['photo'][0].path, filename: files['photo'][0].filename };
      }
      if (files['image1']?.[0]) {
        if (home.image1 && home.image1.filename) await cloudinary.uploader.destroy(home.image1.filename).catch(() => {});
        home.image1 = { url: files['image1'][0].path, filename: files['image1'][0].filename };
      }
      if (files['image2']?.[0]) {
        if (home.image2 && home.image2.filename) await cloudinary.uploader.destroy(home.image2.filename).catch(() => {});
        home.image2 = { url: files['image2'][0].path, filename: files['image2'][0].filename };
      }
      if (files['image3']?.[0]) {
        if (home.image3 && home.image3.filename) await cloudinary.uploader.destroy(home.image3.filename).catch(() => {});
        home.image3 = { url: files['image3'][0].path, filename: files['image3'][0].filename };
      }
      if (files['image4']?.[0]) {
        if (home.image4 && home.image4.filename) await cloudinary.uploader.destroy(home.image4.filename).catch(() => {});
        home.image4 = { url: files['image4'][0].path, filename: files['image4'][0].filename };
      }

      home
        .save()
        .then((result) => {
          console.log("Home updated ", result);
        })
        .catch((err) => {
          console.log("Error while updating ", err);
        });
      res.redirect("/host/host-home-list");
    })
    .catch((err) => {
      console.log("Error while finding home ", err);
    });
};

exports.postDeleteHome = (req, res, next) => {
  const homeId = req.params.homeId;
  console.log("Came to delete ", homeId);
  Home.findByIdAndDelete(homeId)
    .then(() => {
      res.redirect("/host/host-home-list");
    })
    .catch((error) => {
      console.log("Error while deleting ", error);
    });
};

exports.getHostProfile = async (req, res, next) => {
  try {
    const user = await User.findById(res.locals.user._id);
    res.render("host/host-profile", {
      pageTitle: "My Host Profile",
      currentPage: "host-profile",
      hostUser: user,
      saved: req.query.saved === 'true',
    });
  } catch (err) {
    next(err);
  }
};

exports.postHostProfile = async (req, res, next) => {
  try {
    const { bio, phone, languages, responseTime } = req.body;
    const user = await User.findById(res.locals.user._id);
    user.hostProfile = user.hostProfile || {};
    user.hostProfile.bio = bio || '';
    user.hostProfile.phone = phone || '';
    user.hostProfile.languages = languages || '';
    user.hostProfile.responseTime = responseTime || '';
    const photoFile = req.files?.['photo']?.[0];
    if (photoFile) {
      if (user.hostProfile.profilePhoto) {
        fs.unlink(user.hostProfile.profilePhoto, () => {});
      }
      user.hostProfile.profilePhoto = photoFile.path;
    }
    user.markModified('hostProfile');
    await user.save();
    res.redirect("/host/profile?saved=true");
  } catch (err) {
    next(err);
  }
};




