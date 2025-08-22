const Category = require("../../models/categorySchema")
const Product = require("../../models/productSchema")
const mongoose = require('mongoose');
// Get single product details
// Get product details
const getProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.redirect('/shop');
    }
    const product = await Product.findById(productId).populate('category');
    if (!product || product.isBlocked || product.status !== 'Available') {
      return res.redirect('/shop');
    }
    // Get exactly 4 related products from the same category
    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: product._id },
      isBlocked: false,
      status: 'Available'
    }).limit(4).populate('category');
    res.render('product_details', { product, relatedProducts });
  } catch (error) {
    console.error(error);
    res.redirect('/shop');
  }
};

// Add review
const addReview = async (req, res) => {
  try {
    const productId = req.params.id;
    const { userName, email, rating, comment, agree } = req.body;
    if (!agree) {
      return res.status(400).json({ error: 'You must agree to the terms.' });
    }
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ error: 'Invalid product ID.' });
    }
    const product = await Product.findById(productId);
    if (!product || product.isBlocked || product.status !== 'Available') {
      return res.status(404).json({ error: 'Product not found or unavailable.' });
    }
    product.reviews.push({ userName, email, rating: Number(rating), comment });
    await product.save();
    res.json({ message: 'Review added successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add review.' });
  }
};

//  shop 
// Get shop page with filters, sort, pagination
const getShop = async (req, res) => {
  try {
    let query = { isBlocked: false, status: 'Available' };

    // Category filter
    let selectedCategories = [];
    if (req.query.categories) {
      selectedCategories = Array.isArray(req.query.categories)
        ? req.query.categories
        : [req.query.categories];
      const catIds = await Category.find({ name: { $in: selectedCategories } }).select('_id');
      if (catIds.length > 0) {
        query.category = { $in: catIds.map(c => c._id) };
      } else {
        console.warn('No valid categories found for:', selectedCategories);
      }
    }

    // Size filter
    let selectedSize = req.query.size || '';
    if (selectedSize) {
      query.stock = { $elemMatch: { size: selectedSize, quantity: { $gt: 0 } } };
    }

    // Search filter
    let search = req.query.search || '';
    if (search) {
      query.productName = { $regex: new RegExp(search, 'i') };
    }

    // Compute min/max price without price filter
    const priceQuery = { ...query };
    const minPriceAgg = await Product.aggregate([{ $match: priceQuery }, { $sort: { regularPrice: 1 } }, { $limit: 1 }]);
    const maxPriceAgg = await Product.aggregate([{ $match: priceQuery }, { $sort: { regularPrice: -1 } }, { $limit: 1 }]);
    const minPrice = minPriceAgg[0]?.regularPrice || 0;
    const maxPrice = maxPriceAgg[0]?.regularPrice || 10000;

    // Price filter
    let selectedMinPrice = req.query.minPrice !== undefined && req.query.minPrice !== '' ? Number(req.query.minPrice) : '';
    let selectedMaxPrice = req.query.maxPrice !== undefined && req.query.maxPrice !== '' ? Number(req.query.maxPrice) : '';
    if (selectedMinPrice !== '' || selectedMaxPrice !== '') {
      query.regularPrice = {};
      if (selectedMinPrice !== '') query.regularPrice.$gte = Math.max(0, Number(selectedMinPrice));
      if (selectedMaxPrice !== '') query.regularPrice.$lte = Math.min(maxPrice, Number(selectedMaxPrice));
    }

    // Sort
    let sortOption = req.query.sort || 'latest';
    let sort = {};
    switch (sortOption) {
      case 'low': sort.regularPrice = 1; break;
      case 'high': sort.regularPrice = -1; break;
      case 'az': sort.productName = 1; break;
      case 'za': sort.productName = -1; break;
      default: sort.createdAt = -1;
    }

    // Pagination
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = 9;
    const skip = (page - 1) * limit;
    const total = await Product.countDocuments(query);
    const products = await Product.find(query).sort(sort).skip(skip).limit(limit).populate('category');

    // Categories
    const categories = await Category.find({ isActive: true });

    // Query string for pagination
    const queryParams = { ...req.query };
    delete queryParams.page;
    const queryString = Object.keys(queryParams)
      .filter(key => queryParams[key] !== undefined && queryParams[key] !== '')
      .map(key => {
        if (key === 'categories' && Array.isArray(queryParams[key])) {
          return queryParams[key].map(cat => `${key}=${encodeURIComponent(cat)}`).join('&');
        }
        return `${key}=${encodeURIComponent(queryParams[key])}`;
      })
      .join('&');

    // Query string without search
    const queryParamsNoSearch = { ...queryParams };
    delete queryParamsNoSearch.search;
    const queryStringNoSearch = Object.keys(queryParamsNoSearch)
      .filter(key => queryParamsNoSearch[key] !== undefined && queryParamsNoSearch[key] !== '')
      .map(key => {
        if (key === 'categories' && Array.isArray(queryParamsNoSearch[key])) {
          return queryParamsNoSearch[key].map(cat => `${key}=${encodeURIComponent(cat)}`).join('&');
        }
        return `${key}=${encodeURIComponent(queryParamsNoSearch[key])}`;
      })
      .join('&');



    res.render('shop', {
      products,
      categories,
      total,
      page,
      pages: Math.ceil(total / limit),
      minPrice,
      maxPrice,
      selectedMinPrice,
      selectedMaxPrice,
      selectedCategories,
      selectedSize,
      sort: sortOption,
      queryString,
      queryStringNoSearch,
      search
    });
  } catch (error) {
    console.error('Error in getShop:', error);
    res.status(500).render('error', { error: 'Failed to load shop' });
  }
};

module.exports = {
    getProductDetails,
    addReview,
    getShop
}