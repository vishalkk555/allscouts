const User = require ("../../models/userSchema")
const Product = require("../../models/productSchema")
const Cart = require("../../models/cartSchema")
const Offer = require("../../models/offerSchema")


/**
 * Validates if requested product quantity is available in stock
 * @param {Object} product - Product document
 * @param {String} size - Product size
 * @param {Number} requestedQty - Requested quantity
 * @returns {Object} - Validation result with success status and message
 */
const validateStockAvailability = (product, size, requestedQty) => {
  
  if (!product || !product.status || product.isBlocked) {
    return {
      success: false,
      message: "Product not found or unavailable"
    };
  }

  if (product.category && product.category.isBlocked) {
    return {
      success: false,
      message: "Product category is unavailable"
    };
  }

  // Find stock entry for specific size
  const stockEntry = product.stock.find(stock => stock.size === size);
  
  if (!stockEntry) {
    return {
      success: false,
      outOfStock: true,
      message: `Size ${size} is not available for this product`
    };
  }
  
  // Check if requested quantity is available
  if (stockEntry.quantity < requestedQty) {
    return {
      success: false,
      outOfStock: true,
      message: `Only ${stockEntry.quantity} items available for size ${size}`
    };
  }
  
  return {
    success: true,
    message: "Stock available",
    availableQty: stockEntry.quantity
  };
};



// function to calculate product offer 
async function calculateProductOffer(product) {
  const now = new Date();
  
  // Find active product-specific offers
  const productOffers = await Offer.find({
    offerType: 'product',
    productId: product._id,
    status: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  }).sort({ discount: -1 });

  // Find active category offers
  const categoryOffers = await Offer.find({
    offerType: 'category',
    categoryId: product.category._id,
    status: true,
    startDate: { $lte: now },
    endDate: { $gte: now }
  }).sort({ discount: -1 });

  let bestOffer = null;
  let offerType = null;

  const bestProductOffer = productOffers.length > 0 ? productOffers[0] : null;
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

  const regularPrice = product.regularPrice;
  let finalPrice = regularPrice;
  let discountPercentage = 0;
  let appliedOfferName = null;

  if (bestOffer) {
    discountPercentage = bestOffer.discount;
    finalPrice = regularPrice - (regularPrice * (discountPercentage / 100));
    appliedOfferName = bestOffer.offerName;
  }

  return {
    hasOffer: bestOffer !== null,
    offerName: appliedOfferName,
    offerType: offerType,
    discountPercentage: discountPercentage,
    regularPrice: regularPrice,
    finalPrice: parseFloat(finalPrice.toFixed(2)),
    savings: parseFloat((regularPrice - finalPrice).toFixed(2)),
    offerId: bestOffer?._id
  };
}


const loadCart = async (req, res) => {
  try {

    const cart = await Cart.findOne({ userId: req.session.user }).populate({
      path: "item.productId",
      populate: { path: "category", select: "isBlocked name" },
      select: "productName productImage stock regularPrice status isBlocked category"
    });

    if (!cart || !cart.item.length) {
      return res.render("cart", { cart: null });
    }

    let cartUpdated = false; 

    // Per-item computations with offer calculation
    for (let item of cart.item) {
      const product = item.productId;
      if (!product) continue;

      const offerDetails = await calculateProductOffer(product);

      // Find the stock for the SELECTED SIZE only
      const stockEntry = Array.isArray(product.stock)
        ? product.stock.find(s => String(s.size).trim() === String(item.size).trim())
        : null;

      const sizeQty = stockEntry?.quantity ?? 0;

      const isBlocked =
        Boolean(product.isBlocked) ||
        Boolean(product.category?.isBlocked) ||
        product.status === "blocked" ||
        product.status === "inactive";

      // OUT OF STOCK based on selected size quantity vs cart quantity
      const isOutOfStock = sizeQty < (item.quantity || 0);

      item.availableStock = sizeQty;
      item.isBlocked = isBlocked;
      item.isOutOfStock = isOutOfStock;
      item.inStock = !isBlocked && !isOutOfStock;

      // Store offer details in the item for display
      item.offer = offerDetails;
      item.regularPrice = offerDetails.regularPrice;

      // Update item price if there's an active offer and price has changed
      const currentOfferPrice = offerDetails.finalPrice;
      if (item.price !== currentOfferPrice) {
        item.price = currentOfferPrice;
        cartUpdated = true;
      }

      // Update offer_id if it changed
      if (offerDetails.offerId && (!item.offer_id || item.offer_id.toString() !== offerDetails.offerId.toString())) {
        item.offer_id = offerDetails.offerId;
        cartUpdated = true;
      } else if (!offerDetails.offerId && item.offer_id) {
        item.offer_id = null;
        cartUpdated = true;
      }

      item.total = item.price * (item.quantity || 0);
    }

    // Cart totals/flags
    cart.cartTotal = cart.item.reduce((sum, it) => sum + (it.total || 0), 0);
    cart.hasBlockedItems = cart.item.some(it => it.isBlocked);
    cart.hasOutOfStockItems = cart.item.some(it => it.isOutOfStock);

    // Save cart only if prices were updated
    if (cartUpdated) {
      await cart.save();
      console.log("Cart prices updated with current offers");
    }

    return res.render("cart", { cart });
  } catch (error) {
    console.error("Error loading cart:", error);
    return res.status(500).send("Server Error");
  }
};


const addToCart = async (req, res) => {
  try {
    const { productId, size, quantity, price } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1) {
      return res.status(400).json({ success: false, message: "Invalid quantity" });
    }

    if (!price || isNaN(parseFloat(price))) {
      return res.status(400).json({ success: false, message: "Invalid price" });
    }

    const finalPrice = parseFloat(price);

    // Fetch product
    const product = await Product.findById(productId)
      .populate("category", "isBlocked")
      .select("productName regularPrice stock status isBlocked category");

    if (!product || product.isBlocked || product.category?.isBlocked) {
      return res.status(400).json({ success: false, message: "Product not available" });
    }

    // Check stock for selected size
    const sizeStock = product.stock.find(s => s.size === size);
    if (!sizeStock) {
      return res.status(400).json({ success: false, message: "Selected size not found" });
    }

    if (sizeStock.quantity < 1) {
      return res.status(400).json({ 
        success: false, 
        message: `Size ${size} is out of stock` 
      });
    }

    // Maximum quantity per product (site-wide limit)
    const MAX_QTY = 5;

    // Find or create cart
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, item: [], cartTotal: 0 });
    }

    // Check if product with same size already in cart
    const existingItem = cart.item.find(i => i.productId.toString() === productId && i.size === size);

    // Current quantity in cart for this product and size
    const currentQtyInCart = existingItem ? existingItem.quantity : 0;
    
    // Total quantity after adding new request
    const totalQty = currentQtyInCart + qty;

    // Check against site-wide limit
    if (totalQty > MAX_QTY) {
      return res.status(400).json({
        success: false,
        message: `You can only add up to ${MAX_QTY} units of this product. You already have ${currentQtyInCart} in your cart.`
      });
    }

    // CRITICAL: Check against available stock
    if (totalQty > sizeStock.quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${sizeStock.quantity} units available for size ${size}. You already have ${currentQtyInCart} in your cart.`
      });
    }

    if (existingItem) {
      // Update existing item
      existingItem.quantity += qty;
      existingItem.price = finalPrice; // Update with current offer price
      existingItem.total = existingItem.quantity * finalPrice;
      existingItem.stock = sizeStock.quantity; // Update stock info
    } else {
      // Add new item with offer price
      cart.item.push({
        productId,
        size,
        quantity: qty,
        price: finalPrice, // Store the offer price
        total: qty * finalPrice,
        stock: sizeStock.quantity
      });
    }

    // Recalculate cart total
    cart.cartTotal = cart.item.reduce((sum, i) => sum + i.total, 0);
    await cart.save();

    return res.json({ 
      success: true, 
      message: "Product added to cart successfully",
      cartCount: cart.item.reduce((sum, i) => sum + i.quantity, 0)
    });

  } catch (error) {
    console.error("Add to cart error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
/**
 * Update cart item quantity (increment/decrement)
 */
const updateCartQuantity = async (req, res) => {
  try {
    const userId = req.session.user;
    const { itemId, action } = req.body;

    if (!itemId || !action) {
      return res.status(400).json({
        success: false,
        message: "Missing item ID or action"
      });
    }

    const cart = await Cart.findOne({ userId }).populate({
      path: "item.productId",
      populate: {
        path: "category",
        select: "isBlocked"
      },
      select: "productName stock price status isBlocked category"
    });

    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found"
      });
    }

    const itemIndex = cart.item.findIndex(item => item._id.toString() === itemId);
    
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Item not found in cart"
      });
    }

    const cartItem = cart.item[itemIndex];
    const product = cartItem.productId;
    let newQuantity = cartItem.quantity;

    if (action === 'increment') {
      newQuantity = cartItem.quantity + 1;
    } else if (action === 'decrement') {
      newQuantity = Math.max(1, cartItem.quantity - 1);
    }

    // Validate stock availability
    const stockValidation = validateStockAvailabilityNew(product, cartItem.size, newQuantity);
    if (!stockValidation.success) {
      return res.status(400).json(stockValidation);
    }

    // Update quantity and total (keep the same price that was added to cart)
    cart.item[itemIndex].quantity = newQuantity;
    cart.item[itemIndex].total = newQuantity * cartItem.price; // Use the stored price
    
    // Recalculate cart total
    cart.cartTotal = cart.item.reduce((acc, curr) => acc + curr.total, 0);
    await cart.save();

    res.json({
      success: true,
      newQuantity: newQuantity,
      itemTotal: cart.item[itemIndex].total,
      cartTotal: cart.cartTotal,
      availableStock: stockValidation.availableQty
    });
  } catch (error) {
    console.error("Update quantity error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while updating quantity"
    });
  }
};

// Helper function for stock validation
function validateStockAvailabilityNew(product, size, quantity) {
  if (!product || product.isBlocked || product.category?.isBlocked) {
    return {
      success: false,
      message: "Product is no longer available"
    };
  }

  const sizeStock = product.stock.find(s => s.size === size);
  if (!sizeStock) {
    return {
      success: false,
      message: "Selected size is not available"
    };
  }

  if (quantity > sizeStock.quantity) {
    return {
      success: false,
      message: `Only ${sizeStock.quantity} items available in stock`,
      availableQty: sizeStock.quantity
    };
  }

  // Maximum quantity limit
  const MAX_QTY = 5;
  if (quantity > MAX_QTY) {
    return {
      success: false,
      message: `Maximum ${MAX_QTY} items allowed per product`,
      availableQty: MAX_QTY
    };
  }

  return {
    success: true,
    availableQty: Math.min(sizeStock.quantity, MAX_QTY)
  };
}

/**
 * Remove item from cart
 */
const removeCartItem = async (req, res) => {
  try {
    const userId = req.session.user;
    const { itemId } = req.body;

    if (!itemId) {
      return res.status(400).json({
        success: false,
        message: "Item ID is required"
      });
    }

    const cart = await Cart.findOne({ userId });
    
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: "Cart not found"
      });
    }

    // Remove item from cart
    cart.item = cart.item.filter(item => item._id.toString() !== itemId);
    
    // Recalculate cart total
    cart.cartTotal = cart.item.reduce((acc, curr) => acc + curr.total, 0);
    await cart.save();

    // Update session cart count
    req.session.cartItem = cart.item.length;

    res.json({
      success: true,
      message: "Item removed from cart",
      cartTotal: cart.cartTotal,
      cartCount: cart.item.length
    });
  } catch (error) {
    console.error("Remove item error:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while removing the item"
    });
  }
};

/**
 * Clear entire cart
 */
const clearCart = async (req, res) => {
  try {
    await Cart.deleteMany({ userId: req.session.userId });
    req.session.cartItem = 0;
    res.redirect("/cart");
  } catch (error) {
    console.error("Clear cart error:", error);
    res.status(500).send("Server Error");
  }
};

const cartCount = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.json({ success: true, count: 0 });
        }

        const cart = await Cart.findOne({ userId: req.session.user });
        const count = cart && cart.item ? cart.item.length : 0;
        
        res.json({ success: true, count: count });
    } catch (error) {
        console.error('Error fetching cart count:', error);
        res.json({ success: false, count: 0 });
    }
};



module.exports = {
  loadCart,
  addToCart,
  updateCartQuantity,
  removeCartItem,
  clearCart,
  cartCount
};





