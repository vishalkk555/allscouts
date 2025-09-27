const Category = require("../../models/categorySchema")
const product = require("../../models/productSchema")
const mongoose = require('mongoose');
const path = require("path")
const fs = require("fs");
const uploadDir = path.join(__dirname, '../../uploads/products');
const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");


// Debug function to check models and connections
const debugModels = () => {
  console.log('Available models:', mongoose.modelNames());
  console.log('Category model exists:', mongoose.models.Category ? 'Yes' : 'No');
  console.log('Product model exists:', mongoose.models.Product ? 'Yes' : 'No');
}


const loadAddProduct = async (req,res) => {
    try {
        const categories = await Category.find({isActive:true})
         res.render("addProduct",{categories})
    } catch (error) {
          console.log('Failed to load addProduct page', error);
          res.status(500).send('Server Error');
    }
}


const addProducts = async (req,res) => {
    try {
        const {name,description,category,price,size_S,size_M,size_L,size_XL} = req.body;

        if(!name || !description || !category || !price){
              return res.status(400).json({success:false,message:"Fields are required, shouldn't be empty"})
        }
        
        const categoryExists = await Category.findOne({ _id: category, isActive: true });
        if (!categoryExists) {
          return res.status(400).json({ success: false, message: 'Invalid or inactive category.' });
        }   

        const checkExistingProduct = await Product.findOne({productName:name.trim()})

        if(checkExistingProduct){
            return res.status(400).json({success:false,message:"The name already exists"})
        }

        const stock = [
            {size:'S',quantity: parseInt(req.body.size_S) || 0},
            {size:'M', quantity: parseInt(req.body.size_M) || 0},
            {size:'L', quantity : parseInt(req.body.size_L) || 0},
            {size:'XL', quantity : parseInt(req.body.size_XL) || 0}
        ]

        const totalStock = stock.reduce((sum , item)=> sum + item.quantity ,0)

        const images = req.files ? req.files.map(file => file.filename) : [];
        if (images.length < 3) {
          // Clean up uploaded files if less than 3
          images.forEach(filename => {
            const filePath = path.join(uploadDir, filename);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          });
          return res.status(400).json({ success: false, message: 'Please upload at least 3 product images.' });
        }
        if (images.length > 10) {
          // Clean up uploaded files if too many
          images.forEach(filename => {
            const filePath = path.join(uploadDir, filename);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          });
          return res.status(400).json({ success: false, message: 'Maximum 10 images allowed.' });
        }

        const newProduct = new Product({
            productName : name.trim(),
            description : description.trim(),
            category: category,
            regularPrice : parseFloat(price),
           stock : stock,
           totalStock : totalStock,
           productImage : images,
           isBlocked : false,
            status: totalStock > 0 ? 'Available' : 'out of stock'        
        })

        await newProduct.save()

        console.log('BODY:', req.body);
        console.log('FILES:', req.files);

        res.status(200).json({ success: true, message: 'Product added successfully!' });

    } catch (error) {
       console.error('Error adding product:', error);

        // Clean up uploaded files on error
        if (req.files) {
          req.files.forEach(file => {
            const filePath = path.join(uploadDir, file.filename);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          });
        }

        res.status(500).json({ success: false, message: error.message || 'An error occurred while saving the product.' });
    }
}

const editProduct = async (req, res) => {
    try {
        const productId = req.params.id;

        const product = await Product.findById(productId).populate('category');

        const categories = await Category.find({ isActive: true });

        if (!product) {
            console.log('No product found for ID:', productId);
            if (req.query.format === 'json') {
                return res.status(404).json({ message: 'Product not found' });
            }
            return res.status(404).send('Product not found');
        }

        // Prepare sizeQuantity from stock array
        const sizeQuantity = {
            S: 0,
            M: 0,
            L: 0,
            XL: 0
        };
        if (product.stock && Array.isArray(product.stock)) {
            product.stock.forEach(item => {
                if (item.size && item.quantity !== undefined) {
                    sizeQuantity[item.size] = item.quantity;
                }
            });
        }

        // Prepare product data for JSON
        const productData = {
            _id: product._id,
            name: product.productName || '',
            category: product.category || { _id: '' },
            price: product.regularPrice || 0,
            description: product.description || '',
            sizeQuantity,
            images: product.productImage || []
        };

        if (req.query.format === 'json') {
            return res.json(productData);
        }

        // Alternative: No-fetch approach
        /*
        res.render('editProduct', {
            product: JSON.stringify(productData),
            categories
        });
        */
        // Render EJS template for browser requests
        res.render('editProduct', { categories });
    } catch (error) {
        console.error('Error in editProduct:', error);
        if (req.query.format === 'json') {
            return res.status(500).json({ message: 'Server error' });
        }
        res.status(500).send('Server error');
    }
};



// Update a product
const updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const { productName, category, regularPrice, description, size_S, size_M, size_L, size_XL, deletedImages } = req.body;
    console.log("this is from update ", req.body);
    const images = req.files ? req.files.map(file => file.filename) : [];
  
    const stock = [
      { size: 'S', quantity: parseInt(size_S) || 0 },
      { size: 'M', quantity: parseInt(size_M) || 0 },
      { size: 'L', quantity: parseInt(size_L) || 0 },
      { size: 'XL', quantity: parseInt(size_XL) || 0 },
    ];

    for (let item of stock) {
      if (item.quantity < 0) {
        return res.status(400).json({
          message: `Invalid stock: size ${item.size} cannot have negative quantity`
        });
      }
    }

    const totalStock = stock.reduce((sum, item) => sum + item.quantity, 0);

    const updateData = {
      productName,
      category,
      regularPrice: parseFloat(regularPrice),
      stock,
      totalStock,
      status: totalStock > 0 ? 'Available' : 'out of stock',
      description: description ? description.trim() : '',
    };

    // Always fetch existing product to handle deletions and additions
    const existingProduct = await Product.findById(productId);
    if (!existingProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    let productImages = existingProduct.productImage || [];

    if (deletedImages) {
      let deletedImagesArray = [];
      try {
        deletedImagesArray = JSON.parse(deletedImages);
      } catch (e) {
        console.error('Error parsing deletedImages:', e);
      }
      if (Array.isArray(deletedImagesArray) && deletedImagesArray.length > 0) {
        productImages = productImages.filter(image => !deletedImagesArray.includes(image));
      }
    }

    // Add new images (includes cropped versions treated as new)
    if (images.length > 0) {
      productImages = [...productImages, ...images];
    }

    updateData.productImage = productImages;

    const product = await Product.findByIdAndUpdate(productId, updateData, { new: true });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.status(200).json({ message: 'Product updated successfully' });
  } catch (error) {
    console.error('Error in updateProduct:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  }
};



const listProducts = async (req, res) => {
  try {
    const searchQuery = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 4; // Show 4 products per page

    // Build query object
    let query = {};
    if (searchQuery.trim() !== '') {
      query.productName = { $regex: searchQuery, $options: 'i' };
    }

    // Count total products
    const totalItems = await Product.countDocuments(query);

    // Fetch products for current page with proper population
    const products = await Product.find(query)
      .populate({
        path: 'category',
        select: 'name isActive' // Only select needed fields
      })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(); // makes rendering faster

   

    // Total number of pages
    const totalPages = Math.ceil(totalItems / limit);

    // Render view
    res.render("products", {
      products,
      search: searchQuery,
      currentPage: page,
      totalItems,
      totalPages,
      limit // Pass limit so EJS can calculate serial numbers correctly
    });

  } catch (error) {
    console.error("Error in listProducts Loading", error);
    res.status(500).json({
      success: false,
      message: "There is an error in loading Products"
    });
  }
};

const getProductsAPI = async (req, res) => {
  try {
    const searchQuery = req.query.search || '';
    const page = parseInt(req.query.page) || 1;
    const limit = 4;

    const query = {};
    if (searchQuery.trim()) {
      query.productName = { $regex: searchQuery, $options: 'i' };
    }

    const totalItems = await Product.countDocuments(query);
    const products = await Product.find(query)
      .populate({
        path: 'category',
        model: 'Category',
        select: 'name isActive' // Only select needed fields
      })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    console.log('API Products found:', products.length);
    console.log('API Sample product category:', products[0]?.category);

    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      success: true,
      products,
      currentPage: page,
      totalItems,
      totalPages,
      limit
    });

  } catch (error) {
    console.error('API Error in getProductsAPI:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const blockProduct = async (req,res) => {
  try {
    const {id} = req.params
    await Product.findByIdAndUpdate(id,{isBlocked:true})
    res.json({success:true, message: 'Product blocked successfully'})
  } catch (error) {
      console.error('Block product error:', error);
      res.status(500).json({ success: false, message: "Block failed" });
  }
}

const unblockProduct = async (req,res) =>{
  try {
    const {id} = req.params
    // FIXED: Changed from Products to Product (typo fix)
    await Product.findByIdAndUpdate(id,{isBlocked:false})
    res.json({success:true, message: 'Product unblocked successfully'})
  } catch (error) {
    console.error('Unblock product error:', error);
    // FIXED: Changed success:true to success:false for error case
    res.status(500).json({success:false,message:"Unblock failed"})
  }
}




module.exports = {
    loadAddProduct,
    addProducts,
    editProduct,
    updateProduct,
    listProducts,
    getProductsAPI,
    blockProduct,
    unblockProduct
}

