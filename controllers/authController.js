const { check, validationResult } = require("express-validator");
const User = require("../models/user");
const bcrypt = require("bcryptjs");
const { generateOtp, sendOtpEmail } = require("../utils/emailUtil");

/** OTP is valid for 10 minutes */
const OTP_TTL_MS = 10 * 60 * 1000;

exports.getLogin = (req, res, next) => {
  const justVerified = req.query.verified === "1";
  res.render("auth/login", {
    pageTitle: "Login",
    currentPage: "login",
    errors: [],
    success: justVerified ? "Email verified successfully! You can now log in." : null,
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
      req.session.save((err) => {
        if (err) return next(err);
        res.redirect("/verify-otp");

        // Log OTP to server console (visible in Render logs) for debugging
        console.log(`[OTP] ${email} → ${otp}`);

        // Fire-and-forget after redirect is sent
        sendOtpEmail(email, otp, firstName)
          .then(() => console.log(`[OTP] Email sent successfully to ${email}`))
          .catch((e) => {
            console.error(`[OTP] Email FAILED for ${email} | code: ${e.code} | message: ${e.message}`);
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