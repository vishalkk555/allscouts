const express = require("express");
const router = express.Router();
const passport =require('passport');
const upload = require('../middlewares/upload');
const userController  = require("../controllers/user/userController");
const productController  = require("../controllers/user/productController");
const profileController = require("../controllers/user/profileController");
const cartController = require("../controllers/user/cartController");
const orderController = require("../controllers/user/orderController")
const walletController = require("../controllers/user/walletController")
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
router.post('/logout',userController.logout)
router.get('/about', userController.getAboutPage)
router.get('/contact' , userController.getContactPage)


// User Profile Routes
router.get('/profile',userAuth ,profileController.userProfile)
router.get('/editProfile',userAuth ,profileController.editProfile)
router.post('/editProfile', upload.single('profileImage'),profileController.updateProfile)


router.get('/emailOtp',userAuth , profileController.loadEmailOtp); // New: Load OTP page
router.post('/verifyEmailOtp',userAuth , profileController.verifyProfileOtp); // New: Verify OTP
router.post('/resendProfileOtp', userAuth ,profileController.resendProfileOtp);

router.delete('/updateImage',userAuth , profileController.deleteProfileImage);
router.get('/changePassword',userAuth , profileController.changePassword)
router.post('/changePassword',userAuth ,profileController.updatePassword)
router.get('/addresses',userAuth ,profileController.getAddresses)
router.get('/addAddress',userAuth ,profileController.addAddress)
router.post('/addAddress',userAuth ,profileController.addNewAddress)
router.get('/editAddress/:addressId',userAuth ,profileController.getEditAddress)
router.put('/updateAddress',userAuth ,profileController.updateAddress)
router.post('/setDefaultAddress', userAuth ,profileController.setDefaultAddress);
router.delete('/deleteAddress', userAuth ,profileController.deleteAddress);



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
router.get('/getStock/:id',productController.getStock)
// router.post('/admin/products', productController.upload, productController.addProduct)


// Cart Management

// Load cart page
router.get('/cart',  cartController.loadCart);
// Add product to cart
router.post('/add', cartController.addToCart);
// Update cart item quantity (increment/decrement)
router.post('/updateQuantity', cartController.updateCartQuantity);
// Remove item from cart
router.post('/removeItem',  cartController.removeCartItem);
// Clear entire cart
router.post('/clear', cartController.clearCart);           
 


router.get('/wishlist' , productController.getWishlist)
router.delete('/wishlist/remove/:productId' , productController.removeFromWishlist)
router.post("/wishlist/addToCart/:productId" , productController.addToCart)
router.post("/wishlist/add",productController.addToWishlist)


router.get("/checkout", productController.getCheckoutPage)
router.post("/addAddress" , productController.addAddress)
router.get('/getAddress/:addressId', profileController.getAddressForModal);


router.post('/applyCoupon',orderController.applyCoupon)
router.post('/removeCoupon',orderController.removeCoupon)
router.post("/placeOrder" , orderController.placeOrder)
router.get("/orderSuccess/:orderId", orderController.orderSuccessPage)
router.post('/create-razorpay-order', orderController.createRazorpayOrder);
router.post('/verify-payment', orderController.verifyPayment);
router.get('/orderFailure/:orderId',orderController.renderPaymentFailure)
router.post('/payment-failed',orderController.updatePaymentFailed)
router.post('/verify-retry-payment',orderController.verifyRetryPayment)


router.get('/wallet', walletController.getWalletPage)



// User orders page route
router.get('/orders', orderController.loadOrdersPage);
// API route to get user's orders with filters and pagination
router.get('/orders/my-orders',  orderController.getUserOrders);
// Order details page route
router.get('/orders/view/:orderId',  orderController.getUserOrderDetails);
// Cancel entire order route
router.patch('/orders/:orderId/cancel',  orderController.cancelOrder);
// Cancel individual item route
router.post('/orders/cancel-item',  orderController.cancelItem);
// Add this route in your routes file
router.post('/orders/check-return-coupon-impact', orderController.checkReturnCouponImpact);
// Return individual item route
router.post('/orders/return-item', orderController.returnItem);
router.get('/orders/:orderId/invoice', orderController.generateInvoice);


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
   req.session.user = req.user._id;
    res.redirect("/");
  }
);










module.exports  = router ;