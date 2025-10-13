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
router.get("/",adminAuth,adminController.loadDashboard);

// Category Management
router.get("/addCategory", categoryController.loadAddCategory);
router.post("/addCategory", adminAuth, categoryController.addCategory);
router.get('/editCategories/:id', categoryController.editCategory);
router.put('/updateCategories/:id', categoryController.updateCategory);
router.post('/categories/block/:id', categoryController.blockCategory);
router.post('/categories/unblock/:id', categoryController.unblockCategory);
router.get('/api/categories', categoryController.getCategoriesAPI);
router.get("/categories", adminAuth, categoryController.categoryInfo);



// Product Management
router.get('/addProduct', adminAuth, productController.loadAddProduct);
router.post('/api/products', adminAuth, upload.array('images', 10), productController.addProducts);
router.get('/api/categories/active', adminAuth, categoryController.getActiveCategories);
router.get('/editProduct/:id', productController.editProduct);
router.put('/api/products/:id', adminAuth, upload.array('images', 10), productController.updateProduct);
router.get('/products',productController.listProducts)
router.get('/api/products',productController.getProductsAPI)
router.post('/products/block/:id',productController.blockProduct)
router.post('/products/unblock/:id',productController.unblockProduct)


//Customer Management
router.get('/users',adminAuth , customerController.customerInfo)
router.get('/api/customers', adminAuth, customerController.getCustomersAPI);
router.patch('/api/customers/:id/block', adminAuth, customerController.blockCustomer);
router.patch('/api/customers/:id/unblock', adminAuth, customerController.unblockCustomer);


//Order Management 
router.get('/orders' , orderController.ordersListPage)
// GET /admin/orders/:id - Order details page
router.get('/orders/:id',  orderController.orderDetailsPage);

// POST /admin/orders/:id/update - Update order details
router.post('/orders/:id/update',  orderController.updateOrderDetails);

// POST /admin/orders/:id/return-request/:itemId - Handle return request
router.post('/orders/:id/return-request/:itemId', orderController.handleReturnRequest);


//Coupon Management
router.get('/coupons',couponController.getCouponPage)
router.get('/coupons/addCoupon',couponController.getAddCoupon)
router.post('/coupons/addCoupon',couponController.createCoupon)
router.patch('/coupons/toggle-status/:id',  couponController.toggleCouponStatus);
router.get('/coupons/edit/:id',couponController.getEditCoupon)
router.put('/coupons/edit/:id',couponController.updateCoupon)


//Offer Management
router.get("/offers",offerController.getOffersPage)
router.patch('/offers/toggle-status/:id',  offerController.toggleOfferStatus);
router.get("/offers/addOffer",offerController.getAddOfferPage)
router.post("/offers/addOffer", offerController.createOffer)
router.get('/offers/editOffer/:id',offerController.getEditOfferPage)
router.put('/offers/editOffer/:id',offerController.updateOffer)


// Admin Dashboard
router.get('/dashboard',  salesreportController.getDashboard);
// API routes
router.get('/api/dashboard-data',  salesreportController.getDashboardData);
router.get('/api/generate-report',  salesreportController.generateSalesReport);




module.exports = router ;