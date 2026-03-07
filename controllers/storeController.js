// const Home = require("../models/home");
// const User = require("../models/user");

// exports.getIndex = (req, res, next) => {
//   Home.find().then((registeredHomes) => {
//     res.render("store/index", {
//       registeredHomes: registeredHomes,
//       pageTitle: "airbnb Home",
//       currentPage: "index",
//     });
//   });
// };

// exports.getHomes = (req, res, next) => {
//   Home.find().then((registeredHomes) => {
//     res.render("store/home-list", {
//       registeredHomes: registeredHomes,
//       pageTitle: "Homes List",
//       currentPage: "Home",
//     });
//   });
// };

// exports.getBookings = (req, res, next) => {
//   res.render("store/bookings", {
//     pageTitle: "My Bookings",
//     currentPage: "bookings",
//   });
// };

// exports.getFavouriteList = async (req, res, next) => {
//   const userId = res.locals.user._id;
//   const dbUser = await User.findById(userId).populate('favourites');
//   res.render("store/favourite-list", {
//     favouriteHomes: dbUser.favourites,
//     pageTitle: "My Favourites",
//     currentPage: "favourites",
//   });
// };

// exports.postAddToFavourite = async (req, res, next) => {
//   const homeId = req.body.id;
//   const userId = res.locals.user._id;
//   const user = await User.findById(userId);
//   if (!user.favourites.includes(homeId)) {
//     user.favourites.push(homeId);
//     await user.save();
//   }
//   res.redirect("/favourites");
// };

// exports.postRemoveFromFavourite = async (req, res, next) => {
//   const homeId = req.params.homeId;
//   const userId = res.locals.user._id;
//   const user = await User.findById(userId);
//   if (user.favourites.includes(homeId)) {
//     user.favourites = user.favourites.filter(fav => fav != homeId);
//     await user.save();
//   }
//   res.redirect("/favourites");
// };

// exports.getHomeDetails = (req, res, next) => {
//   const homeId = req.params.homeId;
//   Home.findById(homeId).then((home) => {
//     if (!home) {
//       console.log("Home not found");
//       res.redirect("/homes");
//     } else {
//       res.render("store/home-detail", {
//         home: home,
//         pageTitle: "Home Detail",
//         currentPage: "Home",
//       });
//     }
//   });
// };





















const Home = require("../models/home");
const User = require("../models/user");
const Booking = require("../models/booking");

exports.getIndex = (req, res, next) => {
  Home.find().then((registeredHomes) => {
    res.render("store/index", {
      registeredHomes: registeredHomes,
      pageTitle: "airbnb Home",
      currentPage: "index",
    });
  }).catch(next);
};

exports.getHomes = (req, res, next) => {
  const search = req.query.search ? req.query.search.trim() : '';
  const query = search
    ? { houseName: { $regex: search, $options: 'i' } }
    : {};
  Home.find(query).then((registeredHomes) => {
    res.render("store/home-list", {
      registeredHomes: registeredHomes,
      pageTitle: "Homes List",
      currentPage: "Home",
    });
  }).catch(next);
};

exports.getBookings = async (req, res, next) => {
  try {
    const userId = res.locals.user._id;
    const bookings = await Booking.find({ user: userId }).populate("home");
    res.render("store/bookings", {
      bookings: bookings,
      pageTitle: "My Bookings",
      currentPage: "bookings",
    });
  } catch (err) {
    console.log("Error fetching bookings:", err);
    next(err);
  }
};

exports.getFavouriteList = async (req, res, next) => {
  try {
    const userId = res.locals.user._id;
    const dbUser = await User.findById(userId).populate("favourites");
    res.render("store/favourite-list", {
      favouriteHomes: dbUser.favourites,
      pageTitle: "My Favourites",
      currentPage: "favourites",
    });
  } catch (err) { next(err); }
};

exports.postAddToFavourite = async (req, res, next) => {
  try {
    const homeId = req.body.id;
    const userId = res.locals.user._id;
    const user = await User.findById(userId);
    if (!user.favourites.includes(homeId)) {
      user.favourites.push(homeId);
      await user.save();
    }
    res.redirect("/favourites");
  } catch (err) { next(err); }
};

exports.postRemoveFromFavourite = async (req, res, next) => {
  try {
    const homeId = req.params.homeId;
    const userId = res.locals.user._id;
    const user = await User.findById(userId);
    if (user.favourites.includes(homeId)) {
      user.favourites = user.favourites.filter((fav) => fav != homeId);
      await user.save();
    }
    res.redirect("/favourites");
  } catch (err) { next(err); }
};

exports.getHomeDetails = (req, res, next) => {
  const homeId = req.params.homeId;
  Home.findById(homeId).populate('owner').then((home) => {
    if (!home) {
      console.log("Home not found");
      res.redirect("/homes");
    } else {
      res.render("store/home-detail", {
        home: home,
        pageTitle: "Home Detail",
        currentPage: "Home",
        mapboxToken: process.env.MAPBOX_TOKEN || '',
      });
    }
  }).catch(next);
};

exports.postBooking = async (req, res, next) => {
  try {
    const homeId = req.params.homeId;
    const userId = res.locals.user._id;
    const { checkIn, checkOut, guests } = req.body;

    const home = await Home.findById(homeId);
    if (!home) return res.redirect("/homes");

    const nights = Math.round(
      (new Date(checkOut) - new Date(checkIn)) / (1000 * 60 * 60 * 24)
    );
    if (nights <= 0) return res.redirect(`/homes/${homeId}`);

    await new Booking({
      home: homeId,
      user: userId,
      checkIn: new Date(checkIn),
      checkOut: new Date(checkOut),
      guests: parseInt(guests),
      total: home.price * nights * parseInt(guests),
    }).save();

    res.redirect("/bookings");
  } catch (err) {
    console.log("Error creating booking:", err);
    next(err);
  }
};





























