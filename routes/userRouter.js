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
router.post('/verifyOtp',guestAuth ,userController.verifyOtp)
router.post('/resendOtp', guestAuth , userController.resendOtp)
router.get('/login', guestAuth , userController.loadLogin)
router.post('/login', guestAuth,  userController.login)
router.get('/product',userController.loadProductPage)
router.post('/logout', userAuth ,userController.logout)
router.get('/about', userController.getAboutPage)
router.get('/contact' , userController.getContactPage)


// User Profile Routes
router.get('/profile',userAuth ,profileController.userProfile)
router.get('/editProfile',userAuth ,profileController.editProfile)
router.post('/editProfile', userAuth ,upload.single('profileImage'),profileController.updateProfile)
router.get('/emailOtp',userAuth , profileController.loadEmailOtp); 
router.post('/verifyEmailOtp',userAuth , profileController.verifyProfileOtp); 
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


// Cart Management
router.get('/cart',  userAuth ,cartController.loadCart);
router.post('/add',userAuth , cartController.addToCart);
router.post('/updateQuantity', userAuth , cartController.updateCartQuantity);
router.post('/removeItem', userAuth , cartController.removeCartItem);
router.post('/clear', userAuth ,cartController.clearCart);
router.get('/api/cart-count', cartController.cartCount)           
 

// Wishlist Management
router.get('/wishlist' , userAuth ,productController.getWishlist)
router.delete('/wishlist/remove/:productId' , userAuth , productController.removeFromWishlist)
router.post("/wishlist/addToCart/:productId" , userAuth , productController.addToCart)
router.post("/wishlist/add",userAuth ,productController.addToWishlist)

// Checkout Page and Placing Order
router.get("/checkout", userAuth ,productController.getCheckoutPage)
router.post("/addAddress" , userAuth ,productController.addAddress)
router.get('/getAddress/:addressId', userAuth , profileController.getAddressForModal);
router.post('/editAddress', userAuth, profileController.editAddressFromCheckout);
router.post('/checkStockAvailability', userAuth , orderController.checkStockAvailability);
router.post('/applyCouponDynamic', userAuth ,orderController.applyCoupon)
router.post('/removeCouponDynamic', userAuth ,orderController.removeCoupon)
router.post("/placeOrder" , userAuth ,orderController.placeOrder)
router.get("/orderSuccess/:orderId", userAuth ,orderController.orderSuccessPage)
router.post('/create-razorpay-order', userAuth , orderController.createRazorpayOrder);
router.post('/verify-payment', userAuth ,orderController.verifyPayment);
router.get('/orderFailure/:orderId',userAuth ,orderController.renderPaymentFailure)
router.post('/verify-retry-payment', userAuth ,orderController.verifyRetryPayment)
router.post('/update-payment-failed', userAuth , orderController.updatePaymentFailed);

router.get('/wallet', userAuth , walletController.getWalletPage)



// Orders
router.get('/orders', userAuth ,orderController.loadOrdersPage);
router.get('/orders/my-orders', userAuth , orderController.getUserOrders);
router.get('/orders/view/:orderId', userAuth , orderController.getUserOrderDetails);
router.patch('/orders/:orderId/cancel', userAuth , orderController.cancelOrder);
router.post('/orders/cancel-item', userAuth ,  orderController.cancelItem);
router.post('/orders/check-return-coupon-impact', userAuth , orderController.checkReturnCouponImpact);
router.post('/orders/return-item', userAuth ,orderController.returnItem);
router.get('/orders/:orderId/invoice', userAuth ,orderController.generateInvoice);


router.get('/auth/google',guestAuth,passport.authenticate('google',{scope:['profile','email']}));

router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  (req, res) => {
    if (!req.user) {
      return res.redirect("/login?blocked=1");
    }
   req.session.user = req.user._id;
    res.redirect("/");
  }
);










module.exports  = router ;