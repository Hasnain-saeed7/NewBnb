// Load environment variables from .env
require('dotenv').config();

// Force IPv4 DNS — fixes querySrv ESERVFAIL on some networks/Windows machines
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
const { default: mongoose } = require('mongoose');
const multer = require('multer');
const { storage: cloudinaryStorage } = require('./cloudinary');

const DB_PATH = process.env.MONGO_URI || "mongodb+srv://hass:hass@hasnain.3rdoivb.mongodb.net/airbnb?appName=Hasnain";

const storeRouter = require("./routes/storeRouter");
const hostRouter = require("./routes/hostRouter");
const authRouter = require("./routes/authRouter");
const rootDir = require("./utils/pathUtil");
const errorsController = require("./controllers/errors");

const app = express();

// Trust Vercel's reverse proxy so secure cookies and req.ip work correctly
app.set('trust proxy', 1);

// Unique timestamp for this process run — used to invalidate sessions from
// previous server instances stored in MongoDB.
app.locals.serverBoot = Date.now();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const store = new MongoDBStore({
  uri: DB_PATH,
  collection: 'sessions'
});

// ✅ Add store error handling
store.on('error', (error) => {
  console.log('Session store error:', error);
});

// ✅ Fix 1: urlencoded with proper options
app.use(express.urlencoded({ extended: false }));
app.use(multer({ storage: cloudinaryStorage }).fields([
  { name: 'photo',  maxCount: 1 },
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 },
  { name: 'image3', maxCount: 1 },
  { name: 'image4', maxCount: 1 },
]));
app.use(express.static(path.join(rootDir, 'public')));

// ✅ Fix 2: saveUninitialized false, add cookie config
app.use(session({
  secret: "KnowledgeGate AI with Complete Coding",
  resave: false,
  saveUninitialized: false,
  store: store,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

// ── Session invalidation on server restart ───────────────────────────────────
// Any authenticated session that was persisted in MongoDB from a *previous*
// process will have a different serverBoot stamp (or none at all).  Destroy it
// so the user is forced to log in again after every server restart.
app.use((req, res, next) => {
  if (req.session.isLoggedIn &&
      req.session.serverBoot !== req.app.locals.serverBoot) {
    return req.session.destroy(() => res.redirect('/'));
  }
  next();
});

// ✅ Fix 3: res.locals middleware
app.use((req, res, next) => {
  res.locals.isLoggedIn = req.session.isLoggedIn || false;
  res.locals.user = req.session.user || null;
  next();
});

app.use(authRouter);
app.use(storeRouter);

app.use("/host", (req, res, next) => {
  if (!res.locals.isLoggedIn) return res.redirect("/login");
  next();
});
app.use("/host", hostRouter);

app.use(errorsController.pageNotFound);

// Connect to MongoDB at module load time (required for Vercel serverless)
mongoose.connect(DB_PATH).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Export app for Vercel (serverless)
module.exports = app;

// Start HTTP server only when run directly (local dev)
if (require.main === module) {
  const PORT = process.env.PORT || 3003;
  app.listen(PORT, () => {
    console.log(`Server running on address http://localhost:${PORT}`);
  });
}

