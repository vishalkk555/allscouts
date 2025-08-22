const express = require("express");
const router = express.Router();
const passport =require('passport');
const userController  = require("../controllers/user/userController");
const productController  = require("../controllers/user/productController");
const { redirectIfLoggedIn, guestAuth, userAuth } = require("../middlewares/auth");


router.get("/pageNotFound",userController.pageNotFound);
router.get("/",userController.loadHomePage);
router.get("/signUp", guestAuth ,userController.loadSignUp)
router.post("/signUp",guestAuth ,userController.register)
router.get('/otp', guestAuth , userController.loadOtp)
router.post('/verifyOtp',userController.verifyOtp)
router.post('/resendOtp', guestAuth , userController.resendOtp)
router.get('/login', guestAuth , userController.loadLogin)
router.post('/login', guestAuth,  userController.login)
router.get('/product',guestAuth,userController.loadProductPage)
router.get('/profile',userAuth ,userController.userProfile)
router.post('/logout',userController.logout)

router.get('/forgotPassword',guestAuth, userController.forgotPassword);
router.post('/sendForgotPasswordOtp', guestAuth, userController.sendForgotPasswordOtp);
router.get('/forgotPasswordOtp', guestAuth,  userController.loadForgotPasswordOtp);
router.post('/verifyForgotPasswordOtp',guestAuth,  userController.verifyForgotPasswordOtp);
router.post('/forgotPasswordResendOtp', guestAuth, userController.resendForgotPasswordOtp);
router.get('/resetPassword', guestAuth, userController.loadResetPassword);
router.post('/resetPassword', guestAuth, userController.resetPassword);


router.get('/shop', productController.getShop);
router.get('/product/:id', productController.getProductDetails);
router.post('/product/:id/review', productController.addReview);
// router.post('/admin/products', productController.upload, productController.addProduct)

router.get('/auth/google',guestAuth,passport.authenticate('google',{scope:['profile','email']}));

router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    if (!req.user) {
      // user was blocked, redirect with query param
      return res.redirect("/login?blocked=1");
    }
    // Normal user
    req.session.user = req.user;
    res.redirect("/");
  }
);










module.exports  = router ;