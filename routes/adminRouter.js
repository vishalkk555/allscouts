const express = require("express")
const router = express.Router()
const adminController = require("../controllers/admin/adminController");
const categoryController = require("../controllers/admin/categoryController")
const productController = require("../controllers/admin/productController")
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



//Product Management
router.get('/addProduct', adminAuth, productController.loadAddProduct)
router.get('/api/categoreis/active',categoryController.getActiveCategories)
router.get('/editProduct',productController.editProduct)




module.exports = router ;