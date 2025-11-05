const express = require("express")
const router = express.Router()
const upload = require('../middlewares/upload');
const adminController = require("../controllers/admin/adminController");
const categoryController = require("../controllers/admin/categoryController")
const productController = require("../controllers/admin/productController")
const customerController = require("../controllers/admin/customerController")
const orderController = require("../controllers/admin/orderController")
const couponController = require("../controllers/admin/couponController")
const offerController = require("../controllers/admin/offerController")
const salesreportController = require("../controllers/admin/salesreportController")
const {userAuth,adminAuth} = require("../middlewares/auth")


//Login Management
router.get('/pageerror',adminController.pageerror)
router.get("/login",adminController.loadLogin)
router.post("/login",adminController.login)
router.post("/logout", adminAuth , adminController.logout)
router.get("/",adminAuth,adminController.loadDashboard);

// Category Management
router.get("/addCategory", adminAuth,categoryController.loadAddCategory);
router.post("/addCategory", adminAuth, categoryController.addCategory);
router.get('/editCategories/:id', adminAuth ,categoryController.editCategory);
router.put('/updateCategories/:id', adminAuth , categoryController.updateCategory);
router.post('/categories/block/:id', adminAuth ,categoryController.blockCategory);
router.post('/categories/unblock/:id', adminAuth ,categoryController.unblockCategory);
router.get('/api/categories', adminAuth, categoryController.getCategoriesAPI);
router.get("/categories", adminAuth, categoryController.categoryInfo);



// Product Management
router.get('/addProduct', adminAuth, productController.loadAddProduct);
router.post('/api/products', adminAuth, upload.array('images', 10), productController.addProducts);
router.get('/api/categories/active', adminAuth, categoryController.getActiveCategories);
router.get('/editProduct/:id',adminAuth, productController.editProduct);
router.put('/api/products/:id', adminAuth, upload.array('images', 10), productController.updateProduct);
router.get('/products',adminAuth ,productController.listProducts)
router.get('/api/products', adminAuth ,productController.getProductsAPI)
router.post('/products/block/:id', adminAuth ,productController.blockProduct)
router.post('/products/unblock/:id', adminAuth ,productController.unblockProduct)


//Customer Management
router.get('/users',adminAuth , customerController.customerInfo)
router.get('/api/customers', adminAuth, customerController.getCustomersAPI);
router.patch('/api/customers/:id/block', adminAuth, customerController.blockCustomer);
router.patch('/api/customers/:id/unblock', adminAuth, customerController.unblockCustomer);


//Order Management 
router.get('/orders' ,adminAuth, orderController.ordersListPage)
// GET /admin/orders/:id - Order details page
router.get('/orders/:id', adminAuth, orderController.orderDetailsPage);
// POST /admin/orders/:id/update - Update order details
router.post('/orders/:id/update', adminAuth , orderController.updateOrderDetails);
// POST /admin/orders/:id/return-request/:itemId - Handle return request
router.post('/orders/:id/return-request/:itemId', orderController.handleReturnRequest);


//Coupon Management
router.get('/coupons',adminAuth,couponController.getCouponPage)
router.get('/coupons/addCoupon',adminAuth,couponController.getAddCoupon)
router.post('/coupons/addCoupon', adminAuth ,couponController.createCoupon)
router.patch('/coupons/toggle-status/:id', adminAuth , couponController.toggleCouponStatus);
router.get('/coupons/edit/:id',adminAuth,couponController.getEditCoupon)
router.put('/coupons/edit/:id', adminAuth ,couponController.updateCoupon)


//Offer Management
router.get("/offers",adminAuth,offerController.getOffersPage)
router.patch('/offers/toggle-status/:id', adminAuth , offerController.toggleOfferStatus);
router.get("/offers/addOffer",adminAuth,offerController.getAddOfferPage)
router.post("/offers/addOffer", adminAuth , offerController.createOffer)
router.get('/offers/editOffer/:id',adminAuth,offerController.getEditOfferPage)
router.put('/offers/editOffer/:id', adminAuth ,offerController.updateOffer)


// Admin Dashboard
router.get('/dashboard', adminAuth, salesreportController.getDashboard);
router.get('/api/dashboard-data',  adminAuth ,salesreportController.getDashboardData);
router.get('/api/generate-report', adminAuth , salesreportController.generateSalesReport);




module.exports = router ;