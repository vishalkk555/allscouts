const Category = require("../../models/categorySchema")
const Product = require("../../models/productSchema")
const User = require("../../models/userSchema")
const Cart = require("../../models/cartSchema")
const Address = require("../../models/addressSchema");
const Offer = require("../../models/offerSchema")
const Coupon = require("../../models/couponSchema")
const Wallet = require("../../models/walletSchema")
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
    const rawProducts = await Product.find(query).sort(sort).skip(skip).limit(limit).populate('category');

    // Calculate offers for all products
    const products = await Promise.all(
      rawProducts.map(async (product) => {
        return await calculateProductOffer(product);
      })
    );

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

    const user = await User.findById(userId).populate({
      path: 'wishlist.productId',
      populate: {
        path: 'category',
        select: 'name isBlocked'
      }
    });

    if (!user) {
      return res.redirect("/login");
    }

    // Calculate offers and modify product prices
    const wishlistProducts = [];
    
    for (const item of user.wishlist) {
      const product = item.productId;
      
      // Skip if product doesn't exist or is blocked
      if (!product || product.isBlocked || product.category?.isBlocked) {
        continue;
      }

      // Calculate current offer
      const now = new Date();
      
      const productOffers = await Offer.find({
        offerType: 'product',
        productId: product._id,
        status: true,
        startDate: { $lte: now },
        endDate: { $gte: now }
      }).sort({ discount: -1 });

      const categoryOffers = await Offer.find({
        offerType: 'category',
        categoryId: product.category._id,
        status: true,
        startDate: { $lte: now },
        endDate: { $gte: now }
      }).sort({ discount: -1 });

      let bestOffer = null;
      const bestProductOffer = productOffers.length > 0 ? productOffers[0] : null;
      const bestCategoryOffer = categoryOffers.length > 0 ? categoryOffers[0] : null;

      if (bestProductOffer && bestCategoryOffer) {
        bestOffer = bestProductOffer.discount >= bestCategoryOffer.discount ? bestProductOffer : bestCategoryOffer;
      } else {
        bestOffer = bestProductOffer || bestCategoryOffer;
      }

      // Calculate final price
      let finalPrice = product.regularPrice;
      if (bestOffer) {
        finalPrice = product.regularPrice - (product.regularPrice * (bestOffer.discount / 100));
        finalPrice = parseFloat(finalPrice.toFixed(2));
      }

      // Create modified product object
      const productObj = product.toObject();
      productObj.price = finalPrice; // Your EJS uses this
      productObj.regularPrice = finalPrice; // Or this - set both to be safe
      productObj.originalPrice = product.regularPrice; // Store original if needed later
      
      wishlistProducts.push(productObj);
    }

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
    const { size = "M", quantity = 1 } = req.body;

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

    // Calculate current offer price
    const now = new Date();
    
    const productOffers = await Offer.find({
      offerType: 'product',
      productId: product._id,
      status: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).sort({ discount: -1 });

    const categoryOffers = await Offer.find({
      offerType: 'category',
      categoryId: product.category._id,
      status: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    }).sort({ discount: -1 });

    let bestOffer = null;
    const bestProductOffer = productOffers.length > 0 ? productOffers[0] : null;
    const bestCategoryOffer = categoryOffers.length > 0 ? categoryOffers[0] : null;

    if (bestProductOffer && bestCategoryOffer) {
      bestOffer = bestProductOffer.discount >= bestCategoryOffer.discount ? bestProductOffer : bestCategoryOffer;
    } else {
      bestOffer = bestProductOffer || bestCategoryOffer;
    }

    let currentOfferPrice = product.regularPrice;
    if (bestOffer) {
      currentOfferPrice = product.regularPrice - (product.regularPrice * (bestOffer.discount / 100));
      currentOfferPrice = parseFloat(currentOfferPrice.toFixed(2));
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

    // Update existing or add new with current offer price
    if (existingItem) {
      existingItem.quantity += qty;
      existingItem.price = currentOfferPrice; // Update with current offer price
      existingItem.total = existingItem.quantity * currentOfferPrice;
    } else {
      cart.item.push({
        productId,
        size,
        quantity: qty,
        price: currentOfferPrice, // Use current offer price
        total: qty * currentOfferPrice,
        stock: sizeStock.quantity
      });
    }

    // Recalculate cart total
    cart.cartTotal = cart.item.reduce((sum, i) => sum + i.total, 0);
    await cart.save();

    // Remove from wishlist if exists
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
    const { productId, price } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Please login to add items to wishlist",
      });
    }

    // Validate product exists
    const product = await Product.findById(productId).populate('category');
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Get user
    const user = await User.findById(userId);

    // Check if already in wishlist
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

    // Calculate current offer price if not provided
    let finalPrice = price || product.regularPrice;
    
    if (!price) {
      // Calculate offer price
      const now = new Date();
      
      const productOffers = await Offer.find({
        offerType: 'product',
        productId: product._id,
        status: true,
        startDate: { $lte: now },
        endDate: { $gte: now }
      }).sort({ discount: -1 });

      const categoryOffers = await Offer.find({
        offerType: 'category',
        categoryId: product.category._id,
        status: true,
        startDate: { $lte: now },
        endDate: { $gte: now }
      }).sort({ discount: -1 });

      let bestOffer = null;
      const bestProductOffer = productOffers.length > 0 ? productOffers[0] : null;
      const bestCategoryOffer = categoryOffers.length > 0 ? categoryOffers[0] : null;

      if (bestProductOffer && bestCategoryOffer) {
        bestOffer = bestProductOffer.discount >= bestCategoryOffer.discount ? bestProductOffer : bestCategoryOffer;
      } else {
        bestOffer = bestProductOffer || bestCategoryOffer;
      }

      if (bestOffer) {
        finalPrice = product.regularPrice - (product.regularPrice * (bestOffer.discount / 100));
        finalPrice = parseFloat(finalPrice.toFixed(2));
      }
    }

    // Add product with offer price
    user.wishlist.push({ 
      productId,
      price: finalPrice
    });
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


const getCheckoutPage = async (req, res, next) => {
  try {
    const userId = req.session.user;
    const userAddresses = await Address.findOne({ userId });
    const addresses = userAddresses ? userAddresses.address : [];
    const cart = await Cart.findOne({ userId }).populate({
      path: 'item.productId',
      select: 'productName regularPrice productImage stock isBlocked'
    });
    const wallet = await Wallet.findOne({ userId }); // Fetch wallet balance
    const coupons = await Coupon.find({
      status: true,
      expiry: { $gte: new Date() },
      maxRedeem: { $gt: 0 }
    });

    if (!cart || !cart.item || cart.item.length === 0) {
      return res.redirect('/cart');
    }

    let subtotal = 0;
    let totalItems = 0;
    let hasUnavailableItems = false;

    const cartItems = cart.item.map(cartItem => {
      const itemPrice = cartItem.price || cartItem.productId.regularPrice;
      const itemTotal = itemPrice * cartItem.quantity;
      subtotal += itemTotal;
      totalItems += cartItem.quantity;
      
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
        isAvailable: isAvailable,
        itemPrice: itemPrice,
        itemTotal: itemTotal
      };
    });

    let discount = 0;
    let appliedCoupon = null;
    if (req.session.appliedCoupon) {
      const coupon = await Coupon.findOne({
        couponCode: req.session.appliedCoupon.code,
        status: true,
        expiry: { $gte: new Date() },
        maxRedeem: { $gt: 0 }
      });

      if (coupon && subtotal >= coupon.minPurchase) {
        appliedCoupon = {
          code: coupon.couponCode,
          type: coupon.type,
          discount: coupon.discount,
          minPurchase: coupon.minPurchase,
          description: coupon.description
        };

        if (coupon.type === 'percentageDiscount') {
          discount = Math.floor((subtotal * coupon.discount) / 100);
          if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
        } else {
          discount = coupon.discount;
        }
      } else {
        delete req.session.appliedCoupon;
      }
    }

    const totalAmount = subtotal - discount;

    res.render('checkout', {
      title: 'Checkout - ALLSCOUTS',
      user: req.session.user,
      addresses,
      cartItems,
      subtotal,
      discount,
      totalAmount,
      totalItems,
      coupons,
      appliedCoupon,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      hasUnavailableItems,
      walletBalance: wallet ? wallet.balance : 0, // Pass wallet balance
      paymentMethod: 'cod' // Default payment method
    });
  } catch (error) {
    console.error('Error loading checkout page:', error);
    next(error);
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