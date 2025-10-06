const express = require("express");
const app = express();
const path = require("path");
const fs = require("fs")
const env = require("dotenv").config();
const db = require("./config/db");
const userRouter = require("./routes/userRouter");
const session  = require("express-session")
const passport = require("./config/passport")
const adminRouter = require("./routes/adminRouter");
const blockGuard = require("./middlewares/blockGuard");
const flash = require("connect-flash");

db()


app.use(express.json());
app.use(express.urlencoded({extended:true}))
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } 
}));



app.use(flash());

// Make flash messages available in all EJS views
app.use((req, res, next) => {
  res.locals.success_msg = req.flash("success");
  res.locals.error_msg = req.flash("error");
  next();
});


app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});


app.set("view engine","ejs");
app.set("views",[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin')])
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin/assets', express.static(path.join(__dirname, 'public/admin/assets')));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;  
  next();
});

app.use(blockGuard);

app.use("/",userRouter);
app.use("/admin", adminRouter);



app.use((err, req, res, next) => {
    console.error(err.stack);  // Log the error

    // If request expects JSON (API)
    if (req.originalUrl.startsWith('/api') || req.headers.accept.includes('application/json')) {
        return res.status(err.status || 500).json({
            success: false,
            message: err.message || 'Internal Server Error'
        });
    }

    // For normal page routes
    res.status(err.status || 500).render('error', {
        title: 'Error',
        message: err.message || 'Something went wrong',
        status: err.status || 500
    });
});




app.listen(process.env.PORT, ()=>{
    console.log("Server Running");
})


module.exports = app;


