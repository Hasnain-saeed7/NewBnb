const { check, validationResult } = require("express-validator");
const User = require("../models/user");
const bcrypt = require("bcryptjs");
const { generateOtp, sendOtpEmail } = require("../utils/emailUtil");

/** OTP is valid for 10 minutes */
const OTP_TTL_MS = 10 * 60 * 1000;

exports.getLogin = (req, res, next) => {
  const justVerified  = req.query.verified === "1";
  const justReset     = req.query.reset    === "1";
  let success = null;
  if (justVerified) success = "Email verified successfully! You can now log in.";
  if (justReset)    success = "Password reset successfully! You can now log in with your new password.";
  res.render("auth/login", {
    pageTitle: "Login",
    currentPage: "login",
    errors: [],
    success,
    oldInput: { email: "" },
  });
};

exports.getSignup = (req, res, next) => {
  res.render("auth/signup", {
    pageTitle: "Signup",
    currentPage: "signup",
    errors: [],
    oldInput: {firstName: "", lastName: "", email: "", userType: ""},
  });
};

exports.postSignup = [
  check("firstName")
    .trim()
    .isLength({ min: 2 })
    .withMessage("First Name should be atleast 2 characters long")
    .matches(/^[A-Za-z\s]+$/)
    .withMessage("First Name should contain only alphabets"),

  check("lastName")
    .matches(/^[A-Za-z\s]*$/)
    .withMessage("Last Name should contain only alphabets"),

  check("email")
    .isEmail()
    .withMessage("Please enter a valid email")
    .normalizeEmail(),

  check("password")
    .isLength({ min: 8 })
    .withMessage("Password should be atleast 8 characters long")
    .matches(/[A-Z]/)
    .withMessage("Password should contain atleast one uppercase letter")
    .matches(/[a-z]/)
    .withMessage("Password should contain atleast one lowercase letter")
    .matches(/[0-9]/)
    .withMessage("Password should contain atleast one number")
    .matches(/[!@&]/)
    .withMessage("Password should contain atleast one special character")
    .trim(),

  check("confirmPassword")
    .trim()
    .custom((value, { req }) => {
      if (value !== req.body.password) throw new Error("Passwords do not match");
      return true;
    }),

  check("userType")
    .notEmpty()
    .withMessage("Please select a user type")
    .isIn(["guest", "host"])
    .withMessage("Invalid user type"),

  check("terms")
    .notEmpty()
    .withMessage("Please accept the terms and conditions")
    .custom((value) => {
      if (value !== "on") throw new Error("Please accept the terms and conditions");
      return true;
    }),

  async (req, res, next) => {
    const { firstName, lastName, email, password, userType } = req.body;

    // ── 1. Form validation ────────────────────────────────────────────────
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).render("auth/signup", {
        pageTitle: "Signup",
        currentPage: "signup",
        errors: errors.array().map((e) => e.msg),
        oldInput: { firstName, lastName, email, password, userType },
      });
    }

    try {
      // ── 2. Duplicate email check ──────────────────────────────────────
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(422).render("auth/signup", {
          pageTitle: "Signup",
          currentPage: "signup",
          errors: ["An account with this email already exists. Please log in."],
          oldInput: { firstName, lastName, email, userType },
        });
      }

      // ── 3. Hash password ──────────────────────────────────────────────
      const hashedPassword = await bcrypt.hash(password, 12);

      // ── 4. Generate OTP ───────────────────────────────────────────────
      const otp = generateOtp();
      const otpExpiry = Date.now() + OTP_TTL_MS;

      // ── 5. Persist pending registration in session ────────────────────
      req.session.pendingUser = { firstName, lastName, email, hashedPassword, userType };
      req.session.otpData    = { otp, expiry: otpExpiry, attempts: 0 };

      // ── 6. Redirect immediately, then send OTP email in background ────
      // NOT awaited — user reaches the verify page instantly.
      // The OTP is already in the session; email arrives within seconds.
      req.session.save((err) => {
        if (err) return next(err);
        res.redirect("/verify-otp");

        // Fire-and-forget after redirect is sent
        sendOtpEmail(email, otp, firstName).catch((e) => {
          console.error('[signup] OTP email failed for', email, ':', e.message);
        });
      });
    } catch (err) {
      next(err);
    }
  },
];

// ─── GET /verify-otp ─────────────────────────────────────────────────────────
exports.getVerifyOtp = (req, res) => {
  if (!req.session.pendingUser) return res.redirect("/signup");

  res.render("auth/verify-otp", {
    pageTitle: "Verify Email",
    currentPage: "signup",
    email: req.session.pendingUser.email,
    errors: [],
    success: null,
  });
};

// ─── POST /verify-otp ────────────────────────────────────────────────────────
exports.postVerifyOtp = async (req, res, next) => {
  const { pendingUser, otpData } = req.session;

  if (!pendingUser || !otpData) return res.redirect("/signup");

  const entered = (req.body.otp || "").trim();

  const renderError = (msg) =>
    res.status(422).render("auth/verify-otp", {
      pageTitle: "Verify Email",
      currentPage: "signup",
      email: pendingUser.email,
      errors: [msg],
      success: null,
    });

  // ── Expiry check ──────────────────────────────────────────────────────────
  if (Date.now() > otpData.expiry) {
    req.session.otpData = null;
    return renderError("Your verification code has expired. Please request a new one.");
  }

  // ── Attempt throttle (max 5 tries) ───────────────────────────────────────
  if (otpData.attempts >= 5) {
    return renderError("Too many incorrect attempts. Please request a new code.");
  }

  // ── Code match ────────────────────────────────────────────────────────────
  if (entered !== otpData.otp) {
    req.session.otpData.attempts += 1;
    const remaining = 5 - req.session.otpData.attempts;
    return renderError(
      `Incorrect code. ${remaining > 0 ? remaining + " attempt(s) remaining." : "No more attempts. Please resend."}`
    );
  }

  // ── ✅ OTP correct — save user ────────────────────────────────────────────
  try {
    const { firstName, lastName, email, hashedPassword, userType } = pendingUser;
    const user = new User({ firstName, lastName, email, password: hashedPassword, userType });
    await user.save();

    // Clean up session
    req.session.pendingUser = null;
    req.session.otpData     = null;

    req.session.save((err) => {
      if (err) return next(err);
      res.redirect("/login?verified=1");
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /resend-otp ────────────────────────────────────────────────────────
exports.postResendOtp = async (req, res, next) => {
  const { pendingUser } = req.session;
  if (!pendingUser) return res.redirect("/signup");

  try {
    const otp      = generateOtp();
    const otpExpiry = Date.now() + OTP_TTL_MS;
    req.session.otpData = { otp, expiry: otpExpiry, attempts: 0 };

    req.session.save((err) => {
      if (err) return next(err);
      res.render("auth/verify-otp", {
        pageTitle: "Verify Email",
        currentPage: "signup",
        email: pendingUser.email,
        errors: [],
        success: "A new verification code has been sent to your inbox.",
      });

      // Fire-and-forget after response is sent
      sendOtpEmail(pendingUser.email, otp, pendingUser.firstName).catch((e) => {
        console.error('[resend-otp] email failed:', e.message);
      });
    });
  } catch (err) {
    next(err);
  }
};

exports.postLogin = async (req, res, next) => {
  try {
    const {email, password} = req.body;
    const user = await User.findOne({email});
    if (!user) {
      return res.status(422).render("auth/login", {
        pageTitle: "Login",
        currentPage: "login",
        errors: ["User does not exist"],
        success: null,
        oldInput: {email},
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(422).render("auth/login", {
        pageTitle: "Login",
        currentPage: "login",
        errors: ["Invalid Password"],
        success: null,
        oldInput: {email},
      });
    }

    req.session.isLoggedIn  = true;
    req.session.serverBoot   = req.app.locals.serverBoot; // ties session to this process run
    req.session.user = {
      _id: user._id.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      userType: user.userType,
      favourites: user.favourites.map(id => id.toString())
    };

    // Use callback — connect-mongodb-session doesn't return a Promise from save()
    req.session.save((err) => {
      if (err) return next(err);
      res.redirect("/");
    });
  } catch (err) {
    next(err);
  }
}

exports.postLogout = (req, res, next) => {
  req.session.destroy(() => {
    res.redirect("/login");
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// FORGOT PASSWORD FLOW
// ─────────────────────────────────────────────────────────────────────────────

// ─── GET /forgot-password ────────────────────────────────────────────────────
exports.getForgotPassword = (req, res) => {
  res.render("auth/forgot-password", {
    pageTitle: "Forgot Password",
    currentPage: "",
    errors: [],
    success: null,
    oldInput: { email: "" },
  });
};

// ─── POST /forgot-password ───────────────────────────────────────────────────
exports.postForgotPassword = async (req, res, next) => {
  const email = (req.body.email || "").trim().toLowerCase();

  const renderError = (msg) =>
    res.status(422).render("auth/forgot-password", {
      pageTitle: "Forgot Password",
      currentPage: "",
      errors: [msg],
      success: null,
      oldInput: { email },
    });

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return renderError("Please enter a valid email address.");
  }

  try {
    const user = await User.findOne({ email });
    // Always show the same message to prevent email enumeration
    if (!user) {
      return res.render("auth/forgot-password", {
        pageTitle: "Forgot Password",
        currentPage: "",
        errors: [],
        success: "If that email is registered, you'll receive a code shortly.",
        oldInput: { email: "" },
      });
    }

    const otp     = generateOtp();
    const expiry  = Date.now() + OTP_TTL_MS;

    req.session.resetData = { email, otp, expiry, attempts: 0, verified: false };

    req.session.save((err) => {
      if (err) return next(err);
      res.redirect("/verify-reset-otp");

      sendOtpEmail(email, otp, user.firstName, "Password Reset").catch((e) => {
        console.error("[forgot-password] OTP email failed for", email, ":", e.message);
      });
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /verify-reset-otp ───────────────────────────────────────────────────
exports.getVerifyResetOtp = (req, res) => {
  if (!req.session.resetData || req.session.resetData.verified) {
    return res.redirect("/forgot-password");
  }

  res.render("auth/verify-reset-otp", {
    pageTitle: "Verify Reset Code",
    currentPage: "",
    email: req.session.resetData.email,
    errors: [],
    success: null,
  });
};

// ─── POST /verify-reset-otp ──────────────────────────────────────────────────
exports.postVerifyResetOtp = (req, res, next) => {
  const { resetData } = req.session;
  if (!resetData || resetData.verified) return res.redirect("/forgot-password");

  const entered = (req.body.otp || "").trim();

  const renderError = (msg) =>
    res.status(422).render("auth/verify-reset-otp", {
      pageTitle: "Verify Reset Code",
      currentPage: "",
      email: resetData.email,
      errors: [msg],
      success: null,
    });

  if (Date.now() > resetData.expiry) {
    req.session.resetData = null;
    return renderError("Your code has expired. Please request a new one.");
  }

  if (resetData.attempts >= 5) {
    return renderError("Too many incorrect attempts. Please request a new code.");
  }

  if (entered !== resetData.otp) {
    req.session.resetData.attempts += 1;
    const remaining = 5 - req.session.resetData.attempts;
    return renderError(
      `Incorrect code. ${remaining > 0 ? remaining + " attempt(s) remaining." : "No more attempts. Please resend."}`
    );
  }

  // ✅ Correct — mark as verified, proceed to reset page
  req.session.resetData.verified = true;
  req.session.save((err) => {
    if (err) return next(err);
    res.redirect("/reset-password");
  });
};

// ─── POST /resend-reset-otp ──────────────────────────────────────────────────
exports.postResendResetOtp = async (req, res, next) => {
  const { resetData } = req.session;
  if (!resetData || resetData.verified) return res.redirect("/forgot-password");

  try {
    const user = await User.findOne({ email: resetData.email });
    const otp    = generateOtp();
    const expiry = Date.now() + OTP_TTL_MS;

    req.session.resetData = { ...resetData, otp, expiry, attempts: 0 };

    req.session.save((err) => {
      if (err) return next(err);
      res.render("auth/verify-reset-otp", {
        pageTitle: "Verify Reset Code",
        currentPage: "",
        email: resetData.email,
        errors: [],
        success: "A new code has been sent to your inbox.",
      });

      if (user) {
        sendOtpEmail(resetData.email, otp, user.firstName, "Password Reset").catch((e) => {
          console.error("[resend-reset-otp] email failed:", e.message);
        });
      }
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /reset-password ─────────────────────────────────────────────────────
exports.getResetPassword = (req, res) => {
  const { resetData } = req.session;
  if (!resetData || !resetData.verified) return res.redirect("/forgot-password");

  res.render("auth/reset-password", {
    pageTitle: "Reset Password",
    currentPage: "",
    errors: [],
  });
};

// ─── POST /reset-password ────────────────────────────────────────────────────
exports.postResetPassword = async (req, res, next) => {
  const { resetData } = req.session;
  if (!resetData || !resetData.verified) return res.redirect("/forgot-password");

  const { password, confirmPassword } = req.body;

  const renderError = (msg) =>
    res.status(422).render("auth/reset-password", {
      pageTitle: "Reset Password",
      currentPage: "",
      errors: [msg],
    });

  if (!password || password !== confirmPassword) {
    return renderError("Passwords do not match.");
  }

  const pwRules = [
    [/.{8,}/,   "Password must be at least 8 characters long."],
    [/[A-Z]/,   "Password must contain at least one uppercase letter."],
    [/[a-z]/,   "Password must contain at least one lowercase letter."],
    [/[0-9]/,   "Password must contain at least one number."],
    [/[!@&]/,   "Password must contain at least one special character (!@&)."],
  ];

  for (const [regex, msg] of pwRules) {
    if (!regex.test(password)) return renderError(msg);
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    await User.findOneAndUpdate(
      { email: resetData.email },
      { password: hashedPassword }
    );

    req.session.resetData = null;
    req.session.save((err) => {
      if (err) return next(err);
      res.redirect("/login?reset=1");
    });
  } catch (err) {
    next(err);
  }
};