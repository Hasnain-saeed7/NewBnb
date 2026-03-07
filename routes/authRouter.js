// External Module
const express = require("express");
const authRouter = express.Router();

// Local Module
const authController = require("../controllers/authController");

authRouter.get("/login",       authController.getLogin);
authRouter.post("/login",      authController.postLogin);
authRouter.post("/logout",     authController.postLogout);
authRouter.get("/signup",      authController.getSignup);
authRouter.post("/signup",     authController.postSignup);
authRouter.get("/verify-otp",  authController.getVerifyOtp);
authRouter.post("/verify-otp", authController.postVerifyOtp);
authRouter.post("/resend-otp", authController.postResendOtp);

module.exports = authRouter;