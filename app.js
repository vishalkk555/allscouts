const express = require("express");
const app = express();
const path = require("path");
const fs = require("fs");
const env = require("dotenv").config();
const db = require("./config/db");
const session = require("express-session");
const passport = require("./config/passport");
const flash = require("connect-flash");
const MemoryStore = require('memorystore')(session); // Use memorystore for session isolation

const userRouter = require("./routes/userRouter");
const adminRouter = require("./routes/adminRouter");
const blockGuard = require("./middlewares/blockGuard");

db();

// Parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cache control
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

// View engine
app.set("view engine", "ejs");
app.set("views", [
  path.join(__dirname, "views/user"),
  path.join(__dirname, "views/admin")
]);

// Static files
app.use(express.static(path.join(__dirname, "public")));
app.use('/admin/assets', express.static(path.join(__dirname, "public/admin/assets")));
app.use('/uploads', express.static(path.join(__dirname, "uploads")));

// ---------------------------
// Session Configuration
// ---------------------------
const userSession = session({
  name: "userSessionId",
  secret: process.env.SESSION_SECRET || "userSecret",
  resave: false,
  saveUninitialized: false,
  store: new MemoryStore({
    checkPeriod: 86400000 // Prune expired entries every 24 hours
  }),
  cookie: { 
    maxAge: 1000 * 60 * 60 * 24,
    path: '/'
  }
});

const adminSession = session({
  name: "adminSessionId",
  secret: process.env.ADMIN_SESSION_SECRET || "adminSecret",
  resave: false,
  saveUninitialized: false,
  store: new MemoryStore({
    checkPeriod: 86400000 // Prune expired entries every 24 hours
  }),
  cookie: { 
    maxAge: 1000 * 60 * 60 * 24,
    path: '/admin'
  }
});

// ---------------------------
// Apply User Session + Passport (NOT on /admin routes)
// ---------------------------
app.use((req, res, next) => {
  if (req.path.startsWith('/admin')) {
    return next();
  }
  userSession(req, res, next);
});

// Initialize Passport ONLY for user routes (AFTER session)
app.use((req, res, next) => {
  if (req.path.startsWith('/admin')) {
    return next();
  }
  passport.initialize()(req, res, next);
});

app.use((req, res, next) => {
  if (req.path.startsWith('/admin')) {
    return next();
  }
  passport.session()(req, res, next);
});

// Flash messages (user routes only)
app.use((req, res, next) => {
  if (req.path.startsWith('/admin')) {
    return next();
  }
  flash()(req, res, next);
});

app.use((req, res, next) => {
  if (req.path.startsWith('/admin')) {
    return next();
  }
  res.locals.success_msg = req.flash("success");
  res.locals.error_msg = req.flash("error");
  next();
});

// Make user available in views (user routes only)
app.use((req, res, next) => {
  if (req.path.startsWith('/admin')) {
    return next();
  }
  res.locals.user = req.session?.user || null;
  next();
});

// Blocked user middleware (user routes only)
app.use((req, res, next) => {
  if (req.path.startsWith('/admin')) {
    return next();
  }
  blockGuard(req, res, next);
});

// ---------------------------
// Routes
// ---------------------------

// User routes (already has user session + passport)
app.use("/", userRouter);

// Admin routes (apply admin session separately)
app.use("/admin", adminSession, (req, res, next) => {
  res.locals.admin = req.session?.admin || null;
  next();
}, adminRouter);

// ---------------------------
// Error handling
// ---------------------------
app.use((err, req, res, next) => {
  console.error(err.stack);

  if (req.originalUrl.startsWith('/api') || req.headers.accept?.includes('application/json')) {
    return res.status(err.status || 500).json({
      success: false,
      message: err.message || 'Internal Server Error'
    });
  }

  res.status(err.status || 500).render('error', {
    title: 'Error',
    message: err.message || 'Something went wrong',
    status: err.status || 500
  });
});

// Start server
app.listen(process.env.PORT, () => {
  console.log("Server Running");
});

module.exports = app;