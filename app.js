// Load environment variables from .env (no-op in production where env vars are injected)
require('dotenv').config();

// Force IPv4 DNS — fixes querySrv ESERVFAIL on some networks/Windows machines
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
const mongoose = require('mongoose');
const multer = require('multer');
const { storage: cloudinaryStorage } = require('./cloudinary');

const storeRouter = require("./routes/storeRouter");
const hostRouter = require("./routes/hostRouter");
const authRouter = require("./routes/authRouter");
const errorsController = require("./controllers/errors");

// ── MongoDB connection cache (serverless-safe) ───────────────────────────────
// Vercel re-uses warm function instances, so we reuse an existing connection
// instead of opening a new one on every request.
let cachedConn = null;
async function connectDB() {
  if (cachedConn && mongoose.connection.readyState === 1) return cachedConn;
  cachedConn = await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');
  return cachedConn;
}

const app = express();

// Trust Vercel's reverse proxy so secure cookies and req.ip work correctly
app.set('trust proxy', 1);

// Unique timestamp for this process run — used to invalidate sessions from
// previous server instances stored in MongoDB.
app.locals.serverBoot = Date.now();

app.set('view engine', 'ejs');
// Use __dirname so the path is correct whether app.js is run directly or imported
app.set('views', path.join(__dirname, 'views'));

const store = new MongoDBStore({
  uri: process.env.MONGO_URI,
  collection: 'sessions'
});

store.on('error', (error) => {
  console.log('Session store error:', error);
});

app.use(express.urlencoded({ extended: false }));
app.use(multer({ storage: cloudinaryStorage }).fields([
  { name: 'photo',  maxCount: 1 },
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 },
  { name: 'image3', maxCount: 1 },
  { name: 'image4', maxCount: 1 },
]));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: store,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    // In production (Vercel = HTTPS) cookies must be secure and SameSite=None
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  }
}));

// ── Session invalidation on server restart ───────────────────────────────────
app.use((req, res, next) => {
  if (req.session.isLoggedIn &&
      req.session.serverBoot !== req.app.locals.serverBoot) {
    return req.session.destroy(() => res.redirect('/'));
  }
  next();
});

app.use((req, res, next) => {
  res.locals.isLoggedIn = req.session.isLoggedIn || false;
  res.locals.user = req.session.user || null;
  next();
});

// ── Ensure DB is connected on every request (required for serverless) ────────
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

app.use(authRouter);
app.use(storeRouter);

app.use("/host", (req, res, next) => {
  if (!res.locals.isLoggedIn) return res.redirect("/login");
  next();
});
app.use("/host", hostRouter);

app.use(errorsController.pageNotFound);

// ── Start local dev server only when run directly (not imported by Vercel) ───
if (require.main === module) {
  const PORT = process.env.PORT || 3003;
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }).catch(err => {
    console.error('MongoDB connection error:', err);
  });
}

module.exports = app;

