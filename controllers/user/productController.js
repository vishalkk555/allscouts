const Category = require("../../models/categorySchema")
const Product = require("../../models/productSchema")
const User = require("../../models/userSchema")
const Cart = require("../../models/cartSchema")
const Address = require("../../models/addressSchema");
const Offer = require("../../models/offerSchema")
const mongoose = require('mongoose');


// Get product details
const getProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.redirect('/shop');
    }

    const product = await Product.findById(productId).populate('category');
    if (!product || product.isBlocked || !['Available', 'out of stock'].includes(product.status)) {
      return res.redirect('/shop');
    }

    const relatedProducts = await Product.find({
      category: product.category._id,
      _id: { $ne: product._id },
      isBlocked: false,
      status: 'Available'
    }).limit(4).populate('category');

    // Calculate offers for the main product
    const productWithOffer = await calculateProductOffer(product);

    // Calculate offers for related products
    const relatedProductsWithOffers = await Promise.all(
      relatedProducts.map(async (relatedProduct) => {
        return await calculateProductOffer(relatedProduct);
      })
    );

    res.render('product_details', { 
      product: productWithOffer, 
      relatedProducts: relatedProductsWithOffers 
    });
  } catch (error) {
    console.error(error);
    res.redirect('/shop');
  }
};

// Helper function to calculate product offer
async function calculateProductOffer(product) {
  const now = new Date();
  
  // Find active product-specific offers
  const productOffers = await Offer.find({
    offerType: 'product',
    productId: product._id,
    status: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  }).sort({ discount: -1 }); // Sort by discount descending

  // Find active category offers
  const categoryOffers = await Offer.find({
    offerType: 'category',
    categoryId: product.category._id,
    status: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  }).sort({ discount: -1 }); // Sort by discount descending

  let bestOffer = null;
  let offerType = null;

  // Get the best product offer
  const bestProductOffer = productOffers.length > 0 ? productOffers[0] : null;
  
  // Get the best category offer
  const bestCategoryOffer = categoryOffers.length > 0 ? categoryOffers[0] : null;

  // Determine which offer is better
  if (bestProductOffer && bestCategoryOffer) {
    if (bestProductOffer.discount >= bestCategoryOffer.discount) {
      bestOffer = bestProductOffer;
      offerType = 'product';
    } else {
      bestOffer = bestCategoryOffer;
      offerType = 'category';
    }
  } else if (bestProductOffer) {
    bestOffer = bestProductOffer;
    offerType = 'product';
  } else if (bestCategoryOffer) {
    bestOffer = bestCategoryOffer;
    offerType = 'category';
  }

  // Calculate prices
  const regularPrice = product.regularPrice;
  let finalPrice = regularPrice;
  let discountPercentage = 0;
  let appliedOfferName = null;

  if (bestOffer) {
    discountPercentage = bestOffer.discount;
    finalPrice = regularPrice - (regularPrice * (discountPercentage / 100));
    appliedOfferName = bestOffer.offerName;
  }

  // Return product with offer details
  return {
    ...product.toObject(),
    offer: {
      hasOffer: bestOffer !== null,
      offerName: appliedOfferName,
      offerType: offerType,
      discountPercentage: discountPercentage,
      regularPrice: regularPrice,
      finalPrice: parseFloat(finalPrice.toFixed(2)),
      savings: parseFloat((regularPrice - finalPrice).toFixed(2))
    }
  };
}

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
    let query = { isBlocked: false, status: { $in: ["Available", "out of stock"] }};

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

const getStock = async(req,res,next) => {
  try {
    // const userId = req.session.user
    // if(!userId){
    //   res.redirect("login")
    // }

    const productId = req.params.id
    const product =   await Product.findById(productId).select("stock")
    if(!product){
      return  res.status(400).json({success:false,message:"Product not found"})
    } 

    res.json({success:true,stock:product.stock,product})


  } catch (error) {
      next(error)
  }
}

const getWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    if (!userId) {
      return res.redirect("/login");
    }

    const user = await User.findById(userId).populate("wishlist.productId");
    // Filter out blocked products
    const wishlistProducts = user
      ? user.wishlist
          .map(item => item.productId)
          .filter(product => product && !product.isBlocked)
      : [];

    res.render("wishlist", {
      wishlist: wishlistProducts,
      user: req.session.user,
    });
  } catch (error) {
    console.error("Error fetching wishlist:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Remove product from wishlist
const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    const productId = req.params.productId;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.wishlist = user.wishlist.filter(
      (item) => item.productId.toString() !== productId
    );
    await user.save();

    res.json({ success: true, message: "Product removed from wishlist" });
  } catch (error) {
    console.error("Error removing from wishlist:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Add product to cart from wishlist


const addToCart = async (req, res) => {
  try {
     const userId = req.session.user;
    const { productId } = req.params;
    const { size = "M", quantity = 1 } = req.body; // default size M if not provided

    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in" });
    }

    if (!productId) {
      return res.status(400).json({ success: false, message: "Product ID is required" });
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1) {
      return res.status(400).json({ success: false, message: "Invalid quantity" });
    }

    // Fetch product and category
    const product = await Product.findById(productId)
      .populate("category", "isBlocked")
      .select("productName regularPrice stock status isBlocked category");

    if (!product || product.isBlocked || product.category?.isBlocked || product.status !== "Available") {
      return res.status(400).json({ success: false, message: "Product unavailable" });
    }

    // Check stock for selected size
    const sizeStock = product.stock.find(s => s.size === size);
    if (!sizeStock || sizeStock.quantity < 1) {
      return res.status(400).json({ success: false, message: "Selected size not available" });
    }

    const MAX_QTY = 5;

    // Find or create cart
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, item: [], cartTotal: 0 });
    }

    // Check if product with same size already exists in cart
    const existingItem = cart.item.find(i => i.productId.toString() === productId && i.size === size);
    const currentQtyInCart = existingItem ? existingItem.quantity : 0;
    const totalQty = currentQtyInCart + qty;

    if (totalQty > MAX_QTY) {
      return res.status(400).json({
        success: false,
        message: `You can only add up to ${MAX_QTY} units of this product. You already have ${currentQtyInCart} in your cart.`
      });
    }

    // Update existing or add new
    if (existingItem) {
      existingItem.quantity += qty;
      existingItem.total = existingItem.quantity * existingItem.price;
    } else {
      cart.item.push({
        productId,
        size,
        quantity: qty,
        price: product.regularPrice,
        total: qty * product.regularPrice,
        stock: sizeStock.quantity
      });
    }

    // Recalculate cart total
    cart.cartTotal = cart.item.reduce((sum, i) => sum + i.total, 0);
    await cart.save();

    // Remove from wishlist if exists
   // Remove from wishlist if it exists
const user = await User.findById(userId);
if (user && user.wishlist && user.wishlist.length > 0) {
  user.wishlist = user.wishlist.filter(
    item => item.productId.toString() !== productId
  );
  await user.save();
}


    return res.json({ success: true, message: "Product added to cart successfully" });
    
  } catch (error) {
    console.error("Add to cart error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};





const addToWishlist = async (req, res) => {
  try {
    const userId = req.session.user;
    const { productId } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please login to add items to wishlist",
      });
    }

    // Validate product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Get user
    const user = await User.findById(userId);

    //  Check if already in wishlist
    const exists = user.wishlist.some(
      (item) => item.productId.toString() === productId
    );

    if (exists) {
      return res.json({
        success: false,
        exists: true,
        message: "Product already in wishlist",
      });
    }

    // Add product
    user.wishlist.push({ productId });
    await user.save();

    return res.json({
      success: true,
      message: "Product added to wishlist",
    });

  } catch (error) {
    console.error("Error adding to wishlist:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};



// Get checkout page
const getCheckoutPage = async (req, res) => {
  try {
    const userId = req.session.user;

    // Fetch user addresses
    const userAddresses = await Address.findOne({ userId });
    const addresses = userAddresses ? userAddresses.address : [];

    // Fetch cart items
    const cart = await Cart.findOne({ userId }).populate({
      path: 'item.productId',
      select: 'productName regularPrice productImage stock isBlocked'
    });

    // If cart empty, redirect to cart page
    if (!cart || !cart.item || cart.item.length === 0) {
      return res.redirect('/cart');
    }

    // Calculate totals and stock status
    let subtotal = 0;
    let totalItems = 0;
    let hasUnavailableItems = false;

    const cartItems = cart.item.map(cartItem => {
      const itemTotal = cartItem.productId.regularPrice * cartItem.quantity;
      subtotal += itemTotal;
      totalItems += cartItem.quantity;
      
      // Calculate stock status for each item
      let stockStatus = 'in-stock';
      let isAvailable = true;
      
      if (cartItem.productId.isBlocked) {
        stockStatus = 'blocked';
        isAvailable = false;
        hasUnavailableItems = true;
      } else {
        const sizeStock = cartItem.productId.stock.find(stock => stock.size === cartItem.size);
        if (!sizeStock || sizeStock.quantity <= 0) {
          stockStatus = 'out-of-stock';
          isAvailable = false;
          hasUnavailableItems = true;
        } else if (sizeStock.quantity < cartItem.quantity) {
          stockStatus = 'low-stock';
          isAvailable = false;
          hasUnavailableItems = true;
        }
      }

      return {
        ...cartItem.toObject(),
        stockStatus: stockStatus,
        isAvailable: isAvailable
      };
    });

    // Shipping charge - CORRECTED LOGIC: ₹100 if subtotal < 1000, FREE if >= 1000
    const shippingCharge = subtotal < 1000 ? 100 : 0;

    // Coupon discount (your existing logic preserved)
    let discount = 0;
    if (req.session.appliedCoupon) {
      const coupon = await Coupon.findOne({
        code: req.session.appliedCoupon.code,
        isActive: true,
        expiryDate: { $gte: new Date() }
      });

      if (coupon) {
        if (coupon.discountType === 'percentage') {
          discount = Math.floor((subtotal * coupon.discountValue) / 100);
          if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
        } else {
          discount = coupon.discountValue;
        }
      } else {
        delete req.session.appliedCoupon;
      }
    }

    const totalAmount = subtotal + shippingCharge - discount;

    res.render('checkout', {
      title: 'Checkout - ALLSCOUTS',
      user: req.session.user,
      addresses,
      cartItems,
      subtotal,
      shippingCharge,
      discount,
      totalAmount,
      totalItems,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      appliedCoupon: req.session.appliedCoupon || null,
      hasUnavailableItems: hasUnavailableItems // Optional: can be used in template
    });

  } catch (error) {
    console.error('Error loading checkout page:', error);
    res.status(500).render('user/error', {
      message: 'Something went wrong while loading checkout page',
      error: error.message
    });
  }
};


// Add new address
const addAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const {
            name,
            email,
            number,
            houseName,
            street,
            city,
            state,
            country,
            pincode,
            saveAs,
            isDefault
        } = req.body;

        // Validate required fields
        if (!name || !email || !number || !houseName || !street || !city || !state || !country || !pincode || !saveAs) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address'
            });
        }

        // Validate phone number
        if (number.toString().length < 10) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid phone number'
            });
        }

        // Validate pincode
        if (pincode.length !== 6 || !/^\d{6}$/.test(pincode)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid 6-digit pincode'
            });
        }

        const newAddress = {
            name,
            email,
            number: parseInt(number),
            houseName,
            street,
            city,
            state,
            country,
            pincode,
            saveAs,
            isDefault: isDefault || false
        };

        let userAddresses = await Address.findOne({ userId });

        if (!userAddresses) {
            // Create new address document for user
            userAddresses = new Address({
                userId,
                address: [{ ...newAddress, isDefault: true }] // First address is always default
            });
        } else {
            // If setting as default, update other addresses
            if (newAddress.isDefault) {
                userAddresses.address.forEach(addr => {
                    addr.isDefault = false;
                });
            }
            
            // If no addresses exist or this is the first address, make it default
            if (userAddresses.address.length === 0) {
                newAddress.isDefault = true;
            }

            userAddresses.address.push(newAddress);
        }

        await userAddresses.save();

        res.json({
            success: true,
            message: 'Address added successfully'
        });

    } catch (error) {
        console.error('Error adding address:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding address'
        });
    }
};





module.exports = {
    getProductDetails,
    addReview,
    getShop,
    getStock,
    getWishlist,
    removeFromWishlist,
    addToCart,
    addToWishlist,
    getCheckoutPage,
    addAddress,
  

}