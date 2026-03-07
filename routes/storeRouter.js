// External Module
const express = require("express");
const storeRouter = express.Router();

// Local Module
const storeController = require("../controllers/storeController");

const requireLogin = (req, res, next) => {
  if (!res.locals.isLoggedIn) return res.redirect("/login");
  next();
};

const redirectHostFromIndex = (req, res, next) => {
  if (res.locals.isLoggedIn && res.locals.user && res.locals.user.userType === 'host') {
    return res.redirect('/host/host-home-list');
  }
  next();
};

storeRouter.get("/", redirectHostFromIndex, storeController.getIndex);
storeRouter.get("/homes", requireLogin, storeController.getHomes);
storeRouter.get("/bookings", requireLogin, storeController.getBookings);
storeRouter.get("/favourites", requireLogin, storeController.getFavouriteList);

storeRouter.get("/homes/:homeId", requireLogin, storeController.getHomeDetails);
storeRouter.post("/favourites", requireLogin, storeController.postAddToFavourite);
storeRouter.post("/favourites/delete/:homeId", requireLogin, storeController.postRemoveFromFavourite);
storeRouter.post("/homes/:homeId/book", requireLogin, storeController.postBooking);

module.exports = storeRouter; 