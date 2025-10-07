const express = require("express");
const router = express.Router();
const passport =require('passport');
const upload = require('../middlewares/upload');
const userController  = require("../controllers/user/userController");
const productController  = require("../controllers/user/productController");
const profileController = require("../controllers/user/profileController");
const cartController = require("../controllers/user/cartController");
const orderController = require("../controllers/user/orderController")
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


// User Profile Routes
router.get('/profile',userAuth ,profileController.userProfile)
router.get('/editProfile',profileController.editProfile)
router.post('/editProfile', upload.single('profileImage'),profileController.updateProfile)

router.delete('/updateImage', profileController.deleteProfileImage);
router.get('/changePassword', profileController.changePassword)
router.post('/changePassword',profileController.updatePassword)
router.get('/addresses',profileController.getAddresses)
router.get('/addAddress',profileController.addAddress)
router.post('/addAddress',profileController.addNewAddress)
router.get('/editAddress/:addressId',profileController.getEditAddress)
router.put('/updateAddress',profileController.updateAddress)
router.post('/setDefaultAddress', profileController.setDefaultAddress);
router.delete('/deleteAddress', profileController.deleteAddress);



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



router.post("/placeOrder" , orderController.placeOrder)
router.get("/orderSuccess/:orderId", orderController.orderSuccessPage)
router.post('/create-razorpay-order', orderController.createRazorpayOrder);
router.post('/verify-payment', orderController.verifyPayment);



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