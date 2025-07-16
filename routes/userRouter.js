const express = require("express");
const router = express.Router();
const passport =require('passport');
const userController  = require("../controllers/user/userController")


router.get("/pageNotFound",userController.pageNotFound);
router.get("/",userController.loadHomePage);
router.get("/signUp",userController.loadSignUp)
router.post("/signUp",userController.register)
router.get('/otp',userController.loadOtp)
router.post('/verifyOtp',userController.verifyOtp)
router.post('/resendOtp',userController.resendOtp)
router.get('/login',userController.loadLogin)
router.post('/login',userController.login)
router.get('/shop',userController.loadShopPage)
router.get('/product',userController.loadProductPage)


router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}));

router.get('/google/callback',passport.authenticate('google',{failureRedirect:'/login'}),(req,res)=>{
    req.session.user = req.user; 
    res.redirect('/')
})









module.exports  = router ;