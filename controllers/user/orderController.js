const  User = require("../../models/userSchema")
const Product = require("../../models/productSchema")
const Cart = require("../../models/cartSchema")
const Address = require("../../models/addressSchema")
const Orders = require("../../models/orderSchema")
const Coupon = require("../../models/couponSchema")
const Wallet = require("../../models/walletSchema")
const PDFDocument = require('pdfkit'); 
const mongoose = require('mongoose');
const crypto = require('crypto');
const { razorpay } = require('../../config/razorpay');

const checkStockAvailability = async (req, res) => {
  try {
    const userId = req.session.user;
    const cart = await Cart.findOne({ userId }).populate({
      path: 'item.productId',
      select: 'productName regularPrice stock isBlocked'
    });

    if (!cart || !cart.item || cart.item.length === 0) {
      return res.json({ success: true, unavailableItems: [] });
    }

    const unavailableItems = [];

    for (const cartItem of cart.item) {
      if (cartItem.productId.isBlocked) {
        unavailableItems.push({
          id: cartItem._id,
          productId: cartItem.productId._id,
          productName: cartItem.productId.productName,
          size: cartItem.size,
          reason: 'blocked',
          message: 'Product is currently unavailable'
        });
      } else {
        const sizeStock = cartItem.productId.stock.find(stock => stock.size === cartItem.size);
        if (!sizeStock || sizeStock.quantity <= 0) {
          unavailableItems.push({
            id: cartItem._id,
            productId: cartItem.productId._id,
            productName: cartItem.productId.productName,
            size: cartItem.size,
            reason: 'out-of-stock',
            message: 'Out of stock'
          });
        } else if (sizeStock.quantity < cartItem.quantity) {
          unavailableItems.push({
            id: cartItem._id,
            productId: cartItem.productId._id,
            productName: cartItem.productId.productName,
            size: cartItem.size,
            reason: 'low-stock',
            message: `Only ${sizeStock.quantity} available, but ${cartItem.quantity} in cart`,
            availableQuantity: sizeStock.quantity,
            requestedQuantity: cartItem.quantity
          });
        }
      }
    }

    res.json({ 
      success: true, 
      unavailableItems,
      hasUnavailableItems: unavailableItems.length > 0
    });
  } catch (error) {
    console.error('Error checking stock availability:', error);
    res.status(500).json({ success: false, message: 'Failed to check stock availability' });
  }
};

// Apply Coupon
const applyCoupon = async (req, res) => {
    try {
    const { code } = req.body;
    const userId = req.session.user;

    // Get user to check used coupons
    const user = await User.findById(userId);
    if (!user) {
      return res.json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Check if user has already used this coupon
    if (user.usedCoupons && user.usedCoupons.includes(code.toUpperCase())) {
      return res.json({ 
        success: false, 
        message: 'You have already used this coupon code' 
      });
    }

    // FIXED: Don't check maxRedeem in find query as it's only for percentage coupons
    const coupon = await Coupon.findOne({
      couponCode: code.toUpperCase(),
      status: true,
      expiry: { $gte: new Date() }
    });

    if (!coupon) {
      return res.json({ 
        success: false, 
        message: 'Invalid or expired coupon code' 
      });
    }

    const cart = await Cart.findOne({ userId }).populate({
      path: 'item.productId',
      select: 'regularPrice'
    });

    if (!cart || !cart.item || cart.item.length === 0) {
      return res.json({ 
        success: false, 
        message: 'Your cart is empty' 
      });
    }

    let subtotal = 0;
    for (const item of cart.item) {
      const itemPrice = item.price || item.productId.regularPrice;
      subtotal += itemPrice * item.quantity;
    }

    if (subtotal < coupon.minPurchase) {
      return res.json({ 
        success: false, 
        message: `Minimum purchase of ₹${coupon.minPurchase} required. Add ₹${coupon.minPurchase - subtotal} more to use this coupon.` 
      });
    }

    let discount = 0;
    if (coupon.type === 'percentageDiscount') {
      const calculatedDiscount = Math.floor((subtotal * coupon.discount) / 100);
      
      // Check if discount exceeds maxRedeem limit (only for percentage coupons)
      if (coupon.maxRedeem && calculatedDiscount > coupon.maxRedeem) {
        return res.json({ 
          success: false, 
          message: `This coupon has a maximum discount limit of ₹${coupon.maxRedeem}. Your cart value gives ₹${calculatedDiscount} discount, which exceeds the limit.` 
        });
      }
      
      discount = calculatedDiscount;
    } else {
      // For flat discount, just use the discount value
      discount = coupon.discount;
    }

    const totalAmount = subtotal - discount;

    req.session.appliedCoupon = {
      code: coupon.couponCode,
      discount: discount,
      couponId: coupon._id
    };

    res.json({ 
      success: true, 
      message: `Coupon applied! You saved ₹${discount}`,
      appliedCoupon: {
        code: coupon.couponCode,
        type: coupon.type,
        discount: coupon.discount,
        minPurchase: coupon.minPurchase,
        description: coupon.description,
        maxRedeem: coupon.maxRedeem || null
      },
      subtotal,
      discount,
      totalAmount
    });
  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to apply coupon. Please try again.' 
    });
  }
};

// Remove Coupon
const removeCoupon = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!req.session.appliedCoupon) {
      return res.json({ 
        success: false, 
        message: 'No coupon applied' 
      });
    }

    const cart = await Cart.findOne({ userId }).populate({
      path: 'item.productId',
      select: 'regularPrice'
    });

    if (!cart || !cart.item || cart.item.length === 0) {
      return res.json({ 
        success: false, 
        message: 'Your cart is empty' 
      });
    }

    let subtotal = 0;
    for (const item of cart.item) {
      const itemPrice = item.price || item.productId.regularPrice;
      subtotal += itemPrice * item.quantity;
    }

    delete req.session.appliedCoupon;

    res.json({ 
      success: true, 
      message: 'Coupon removed successfully',
      subtotal,
      discount: 0,
      totalAmount: subtotal
    });
  } catch (error) {
    console.error('Error removing coupon:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to remove coupon. Please try again.' 
    });
  }
};


const placeOrder = async (req, res) => {
  try {
    const { addressId, paymentMethod } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "User not authenticated"
      });
    }

    if (!addressId) {
      return res.status(400).json({
        success: false,
        error: "Delivery address is required"
      });
    }

    // Fetch cart
    const cart = await Cart.findOne({ userId }).populate("item.productId");
    if (!cart || !cart.item.length) {
      return res.status(400).json({
        success: false,
        error: "Cart is empty"
      });
    }

    // Stock validation
    const stockValidationErrors = [];
    const validCartItems = [];

    for (const item of cart.item) {
      const product = await Product.findById(item.productId._id);

      if (!product) {
        stockValidationErrors.push({
          productName: item.productId.productName,
          message: "Product no longer exists",
          type: "not_exists"
        });
        continue;
      }

      if (product.isBlocked) {
        stockValidationErrors.push({
          productName: product.productName,
          message: "Product is unavailable (Blocked)",
          type: "blocked"
        });
        continue;
      }

      const sizeStock = product.stock.find(stock => stock.size === item.size);

      if (!sizeStock) {
        stockValidationErrors.push({
          productName: product.productName,
          message: `Size ${item.size} not available`,
          type: "size_unavailable"
        });
      } else if (sizeStock.quantity <= 0) {
        stockValidationErrors.push({
          productName: product.productName,
          message: `Out of stock in size ${item.size}`,
          type: "out_of_stock"
        });
      } else if (sizeStock.quantity < item.quantity) {
        stockValidationErrors.push({
          productName: product.productName,
          message: `Only ${sizeStock.quantity} available in size ${item.size}`,
          type: "insufficient_stock"
        });
      } else {
        validCartItems.push(item);
      }
    }

    if (stockValidationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Stock validation failed",
        details: stockValidationErrors.map((err, index) => ({
          productId: cart.item[index].productId._id,
          productName: err.productName,
          size: cart.item[index].size,
          message: err.message
        }))
      });
    }

    // Calculate totals and apply coupon
    let subtotal = 0;
    const orderedItem = validCartItems.map((item) => {
      const productPrice = item.offerPrice || item.price || item.productId.regularPrice;
      const itemTotal = productPrice * item.quantity;
      subtotal += itemTotal;

      return {
        productId: item.productId._id,
        quantity: item.quantity,
        size: item.size,
        productPrice: productPrice,
        totalProductPrice: itemTotal,
        productStatus: "Pending",
        offer_id: item.offer_id || null,
      };
    });

    // Apply coupon discount if present
    let discount = 0;
    let couponCode = null;
    let appliedCoupon = null;
    if (req.session.appliedCoupon) {
      const coupon = await Coupon.findOne({
        couponCode: req.session.appliedCoupon.code,
        status: true,
        expiry: { $gte: new Date() }
      });

      if (coupon && subtotal >= coupon.minPurchase) {
        appliedCoupon = coupon;
        couponCode = coupon.couponCode;
        if (coupon.type === 'percentageDiscount') {
          discount = Math.floor((subtotal * coupon.discount) / 100);
          if (coupon.maxRedeem) {
            discount = Math.min(discount, coupon.maxRedeem);
          }
        } else {
          discount = coupon.discount;
        }
      } else {
        delete req.session.appliedCoupon;
      }
    }

    const totalAmount = subtotal - discount;
    const orderNumber = "ORD" + Math.floor(Math.random() * 1000000);

    // Set payment status based on payment method
    let paymentStatus;
    if (paymentMethod === 'cod') {
      paymentStatus = 'Pending';
    } else if (paymentMethod === 'razorpay') {
      paymentStatus = 'Pending'; // Will change to 'Paid' or 'Failed' based on payment result
    } else if (paymentMethod === 'wallet') {
      paymentStatus = 'Pending'; // Will change to 'Paid' immediately after wallet deduction
    } else {
      return res.status(400).json({
        success: false,
        error: "Invalid payment method"
      });
    }

    // For wallet payment, check balance
    if (paymentMethod === 'wallet') {
      const wallet = await Wallet.findOne({ userId });
      if (!wallet || wallet.balance < totalAmount) {
        return res.status(400).json({
          success: false,
          error: "Insufficient wallet balance",
          required: totalAmount,
          available: wallet ? wallet.balance : 0
        });
      }
    }

    // Create new order
    const newOrder = new Orders({
      userId,
      cartId: cart._id,
      orderedItem,
      deliveryAddress: addressId,
      orderAmount: totalAmount,
      deliveryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      shippingDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      paymentMethod,
      paymentStatus,
      orderNumber,
      orderStatus: "Pending",
      couponDiscount: discount,
      couponCode: couponCode
    });

    await newOrder.save();

    // Handle different payment methods
    if (paymentMethod === 'cod') {
      // Update stock and clear cart for COD
      for (const item of orderedItem) {
        await Product.updateOne(
          { _id: item.productId, "stock.size": item.size },
          {
            $inc: {
              "stock.$.quantity": -item.quantity,
              totalstock: -item.quantity,
            },
          }
        );
      }

      // Decrement coupon uses and add to user's usedCoupons
      if (appliedCoupon) {
        await Coupon.updateOne(
          { _id: appliedCoupon._id },
          { $inc: { maxRedeem: -1 } }
        );
        
        await User.updateOne(
          { _id: userId },
          { $addToSet: { usedCoupons: appliedCoupon.couponCode } }
        );
      }

      // Clear coupon from session
      if (req.session.appliedCoupon) {
        delete req.session.appliedCoupon;
      }

      // Clear cart
      await Cart.deleteOne({ userId });
      req.session.cartItem = 0;

      return res.json({
        success: true,
        orderId: newOrder._id,
        orderNumber: newOrder.orderNumber,
        orderAmount: newOrder.orderAmount,
        message: "Order placed successfully!"
      });
    } else if (paymentMethod === 'razorpay') {
      // For Razorpay, don't update stock or clear cart yet
      // Stock will be updated only after successful payment verification
      return res.json({
        success: true,
        orderId: newOrder._id,
        orderNumber: newOrder.orderNumber,
        orderAmount: newOrder.orderAmount,
        requiresPayment: true,
        paymentMethod: 'razorpay',
        message: "Order created. Please complete payment."
      });
    } else if (paymentMethod === 'wallet') {
      // Update stock
      for (const item of orderedItem) {
        await Product.updateOne(
          { _id: item.productId, "stock.size": item.size },
          {
            $inc: {
              "stock.$.quantity": -item.quantity,
              totalstock: -item.quantity,
            },
          }
        );
      }

      // Decrement coupon uses and add to user's usedCoupons
      if (appliedCoupon) {
        await Coupon.updateOne(
          { _id: appliedCoupon._id },
          { $inc: { maxRedeem: -1 } }
        );
        
        await User.updateOne(
          { _id: userId },
          { $addToSet: { usedCoupons: appliedCoupon.couponCode } }
        );
      }

      // Deduct wallet balance and add transaction
      await Wallet.updateOne(
        { userId },
        {
          $inc: { balance: -totalAmount },
          $push: {
            transaction: {
              amount: -totalAmount,
              transactionsMethod: 'Payment',
              orderId: newOrder._id,
              date: new Date(),
              description: `Payment for order #${newOrder.orderNumber || newOrder._id.toString().slice(-8).toUpperCase()}`
            }
          }
        }
      );

      // Update payment status to Paid
      await Orders.updateOne(
        { _id: newOrder._id },
        { $set: { paymentStatus: 'Paid' } }
      );

      // Clear coupon from session
      if (req.session.appliedCoupon) {
        delete req.session.appliedCoupon;
      }

      // Clear cart
      await Cart.deleteOne({ userId });
      req.session.cartItem = 0;

      return res.json({
        success: true,
        orderId: newOrder._id,
        orderNumber: newOrder.orderNumber,
        orderAmount: newOrder.orderAmount,
        message: "Order placed successfully with wallet payment!",
        remainingBalance: (await Wallet.findOne({ userId })).balance
      });
    }

  } catch (error) {
    console.error("Error placing order:", error);
    res.status(500).json({
      success: false,
      error: "Order processing failed"
    });
  }
};


const orderSuccessPage = async (req,res,next) => {
 try {
        const orderId = req.params.orderId;
        const order = await Orders.findById(orderId).populate("userId");

        if (!order) {
            return res.status(404).send("Order not found");
        }

        res.render("orderSuccess", {
            orderId: order.orderNumber,
            email: order.userId.email
        });
    } catch (err) {
        console.error(err);
        res.status(500).send("Something went wrong");
    }
}


// Render user orders page
const loadOrdersPage = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) return res.redirect('/login');

        // Fetch full user for Razorpay prefill (adjust fields to your schema)
        const userDetails = await User.findById(userId).select('name email phone').lean();
        if (!userDetails) return res.redirect('/login');

        res.render('orderList', { 
            user: userDetails, // Now object with name/email/phone
            title: 'My Orders',
            razorpayKeyId: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
       next(error)
    }
};

// Get user's orders with search and pagination
const getUserOrders = async (req, res) => {
    try {
        
        const userId = req.session.user
        
        if (!userId) {
            return res.json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const {
            page = 1,
            limit = 10,
            orderNumber
        } = req.query;

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        //  filter by userId
        let filter = { userId: userId };
        
        // Filter by order number if provided
        if (orderNumber && orderNumber.trim()) {
            filter.orderNumber = { 
                $regex: orderNumber.trim(), 
                $options: 'i' 
            };
        }

        // Get total count for pagination
        const totalOrders = await Orders.countDocuments(filter);
        const totalPages = Math.ceil(totalOrders / limitNum);

        // Get orders with population
        const orders = await Orders.find(filter)
            .populate({
                path: 'orderedItem.productId',
                select: 'productName productImage'
            })
            .populate({
                path: 'deliveryAddress',
                select: 'firstName lastName street city state zipCode'
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        res.json({
            success: true,
            orders: orders,
            currentPage: pageNum,
            totalPages: totalPages,
            totalOrders: totalOrders
        });

    } catch (error) {
        console.error('Error fetching user orders:', error);
        res.json({
            success: false,
            message: 'Failed to fetch orders',
            error: error.message
        });
    }
};

// Get User Order Details with proper total calculation
const getUserOrderDetails = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).render('error', {
                message: 'Invalid order ID format.',
                user: req.session.user
            });
        }

        const order = await Orders.findOne({ 
            _id: new mongoose.Types.ObjectId(orderId),
            userId: new mongoose.Types.ObjectId(userId)
        }).lean();

        if (!order) {
            return res.status(404).render('error', {
                message: 'Order not found',
                user: req.session.user
            });
        }

        console.log('Raw order deliveryAddress:', order.deliveryAddress);

        // Resolve delivery address
        if (order.deliveryAddress && mongoose.Types.ObjectId.isValid(order.deliveryAddress)) {
            let address = await Address.findById(order.deliveryAddress).lean();

            if (!address) {
                const parentDoc = await Address.findOne({ 'address._id': order.deliveryAddress }).lean();
                if (parentDoc) {
                    const sub = parentDoc.address.find(a => a._id.toString() === order.deliveryAddress.toString());
                    if (sub) {
                        address = { address: [sub] };
                    }
                }
            }

            order.deliveryAddress = address || null;
            console.log('Resolved deliveryAddress:', order.deliveryAddress);
        }

        // Populate product data
        if (order.orderedItem && order.orderedItem.length > 0) {
            for (let item of order.orderedItem) {
                if (item.productId && mongoose.Types.ObjectId.isValid(item.productId)) {
                    const product = await Product.findById(item.productId)
                        .select('productName productImage productPrice stock status')
                        .lean();
                    item.productId = product;

                    if (product && product.productImage) {
                        if (typeof product.productImage === 'string') {
                            product.productImage = [product.productImage];
                        }
                        product.productImage = product.productImage.map(img => {
                            if (img && !img.includes('/') && !img.startsWith('http')) {
                                return `/uploads/products/${img}`;
                            }
                            return img;
                        });
                    }
                }
            }
        }

        // Calculate CURRENT subtotal (only active items)
        let currentSubtotal = 0;
        order.orderedItem.forEach(item => {
            if (!['Returned', 'Cancelled'].includes(item.productStatus)) {
                currentSubtotal += item.totalProductPrice;
            }
        });

        // Calculate CURRENT applicable discount
        let currentDiscount = 0;
        let couponInfo = null;
        
        if (order.couponCode) {
            couponInfo = await Coupon.findOne({ couponCode: order.couponCode }).lean();
            
            if (couponInfo && currentSubtotal >= couponInfo.minPurchase) {
                if (couponInfo.type === 'percentageDiscount') {
                    currentDiscount = Math.round((currentSubtotal * couponInfo.discount) / 100);
                } else {
                    currentDiscount = couponInfo.discount;
                }
            }
        }

        const currentGrandTotal = currentSubtotal - currentDiscount;

        // Add calculated values to order for EJS
        order.calculatedSubtotal = currentSubtotal;
        order.calculatedDiscount = currentDiscount;
        order.calculatedGrandTotal = currentGrandTotal;
        order.couponInfo = couponInfo;

        console.log('=== ORDER TOTALS ===');
        console.log('Current Subtotal:', currentSubtotal);
        console.log('Current Discount:', currentDiscount);
        console.log('Current Grand Total:', currentGrandTotal);

        res.render('orderDetails', { 
            order,
            user: req.session.user,
            title: `Order ${order.orderNumber || order._id.toString().slice(-8).toUpperCase()}`
        });

    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).render('error', {
            message: 'Failed to load order details. Please try again.',
            user: req.session.user
        });
    }
};


// Cancel entire order
const cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user;

        console.log('Cancel Order Request:', { orderId, userId });

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const order = await Orders.findOne({ _id: orderId, userId: userId })
            .populate('orderedItem.productId');
        
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Check if order can be cancelled
        const nonCancellableStatuses = ['Delivered', 'Cancelled', 'Shipped'];
        if (nonCancellableStatuses.includes(order.orderStatus)) {
            return res.status(400).json({
                success: false,
                message: `Order cannot be cancelled as it's already ${order.orderStatus}`
            });
        }

        // === FIXED: RESTORE STOCK BY SIZE + totalStock (NO DUPLICATES) ===
        for (const item of order.orderedItem) {
            if (item.productId && item.productStatus !== 'Cancelled') {
                const quantity = Number(item.quantity);
                const size = item.size;

                // Step 1: Try to increment existing size entry
                const updated = await Product.findOneAndUpdate(
                    { _id: item.productId._id, "stock.size": size },
                    {
                        $inc: {
                            "stock.$.quantity": quantity,
                            totalStock: quantity
                        },
                        $set: { status: "Available" }
                    },
                    { new: true }
                );

                // Step 2: Only if size not found → add new entry
                if (!updated) {
                    await Product.findByIdAndUpdate(
                        item.productId._id,
                        {
                            $push: { stock: { size, quantity } },
                            $inc: { totalStock: quantity },
                            $set: { status: "Available" }
                        },
                        { new: true }
                    );
                }

                console.log(`Restored ${quantity} units (size: ${size}) to product: ${item.productId._id}`);
            }
        }

        // Calculate total refund amount
        let totalRefundAmount = 0;
        const activeItems = order.orderedItem.filter(item => 
            !['Cancelled', 'Returned'].includes(item.productStatus)
        );

        activeItems.forEach(item => {
            let itemRefund = item.totalProductPrice;
            if (order.couponDiscount > 0) {
                const originalSubtotal = order.orderedItem.reduce((sum, orderItem) => sum + orderItem.totalProductPrice, 0);
                const proportionalDiscount = Math.round((item.totalProductPrice / originalSubtotal) * order.couponDiscount);
                itemRefund = item.totalProductPrice - proportionalDiscount;
            }
            totalRefundAmount += itemRefund;
        });

        // Process refund to wallet if payment was made
        if (order.paymentStatus === 'Paid' && ['razorpay', 'wallet', 'cod'].includes(order.paymentMethod) && totalRefundAmount > 0) {
            let wallet = await Wallet.findOne({ userId: userId });
            if (!wallet) {
                wallet = new Wallet({
                    userId: userId,
                    balance: 0,
                    transaction: []
                });
            }

            await Wallet.updateOne(
                { userId: userId },
                {
                    $inc: { balance: totalRefundAmount },
                    $push: {
                        transaction: {
                            amount: totalRefundAmount,
                            transactionsMethod: 'Refund',
                            orderId: order._id,
                            date: new Date(),
                            description: `Refund for cancelled order: ${order.orderNumber || order._id}`
                        }
                    }
                }
            );
        }

        // Update order status to cancelled
        order.orderStatus = 'Cancelled';
        order.cancelledAt = new Date();
        order.totalRefundAmount = totalRefundAmount;
        
        // Update all item statuses to cancelled
        order.orderedItem.forEach(item => {
            if (item.productStatus !== 'Cancelled') {
                item.productStatus = 'Cancelled';
                item.cancelledAt = new Date();
            }
        });

        await order.save();

        console.log(`Order ${orderId} cancelled successfully`);

        const refundedToWallet = order.paymentStatus === 'Paid' && ['razorpay', 'wallet', 'cod'].includes(order.paymentMethod) && totalRefundAmount > 0;
        
        console.log('Order cancellation response:', {
            success: true,
            refundAmount: totalRefundAmount,
            refundedToWallet: refundedToWallet,
            paymentStatus: order.paymentStatus,
            paymentMethod: order.paymentMethod
        });

        res.json({
            success: true,
            message: 'Order cancelled successfully',
            refundAmount: totalRefundAmount,
            refundedToWallet: refundedToWallet,
            data: {
                orderId: order._id,
                cancelledAt: order.cancelledAt
            }
        });

    } catch (error) {
        console.error('Error cancelling order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel order',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Cancel individual item (UNCHANGED — ALREADY CORRECT)
const cancelItem = async (req, res) => {
    try {
        const { orderId, productId, itemIndex } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const order = await Orders.findOne({ _id: orderId, userId: userId })
            .populate('orderedItem.productId');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const index = parseInt(itemIndex);
        if (isNaN(index) || index < 0 || index >= order.orderedItem.length) {
            return res.status(400).json({
                success: false,
                message: 'Invalid item index'
            });
        }

        const item = order.orderedItem[index];
        
        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in order'
            });
        }

        if (item.productId._id.toString() !== productId) {
            return res.status(400).json({
                success: false,
                message: 'Product ID mismatch'
            });
        }

        if (['Delivered', 'Cancelled', 'Returned'].includes(item.productStatus)) {
            return res.status(400).json({
                success: false,
                message: `Item cannot be cancelled because it's already ${item.productStatus}`
            });
        }

        const quantity = Number(item.quantity);
        if (isNaN(quantity) || quantity <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid quantity value'
            });
        }

        const size = item.size;

        // === RESTORE STOCK BY SIZE + totalStock (ALREADY CORRECT) ===
        const updatedProduct = await Product.findOneAndUpdate(
            { _id: productId, "stock.size": size },
            {
                $inc: {
                    "stock.$.quantity": quantity,
                    totalStock: quantity
                },
                $set: { status: "Available" }
            },
            { new: true, runValidators: true }
        );

        let finalProduct = updatedProduct;
        if (!finalProduct) {
            finalProduct = await Product.findByIdAndUpdate(
                productId,
                {
                    $push: { stock: { size, quantity } },
                    $inc: { totalStock: quantity },
                    $set: { status: "Available" }
                },
                { new: true }
            );
        }

        if (!finalProduct) {
            return res.status(404).json({
                success: false,
                message: 'Product not found during stock update'
            });
        }

        // Calculate refund amount with proportional coupon discount
        let refundAmount = item.totalProductPrice;
        if (order.couponDiscount > 0) {
            const originalSubtotal = order.orderedItem.reduce((sum, orderItem) => sum + orderItem.totalProductPrice, 0);
            const proportionalDiscount = Math.round((item.totalProductPrice / originalSubtotal) * order.couponDiscount);
            refundAmount = item.totalProductPrice - proportionalDiscount;
        }

        // Process refund to wallet if payment was made
        if (order.paymentStatus === 'Paid' && ['razorpay', 'wallet', 'cod'].includes(order.paymentMethod)) {
            let wallet = await Wallet.findOne({ userId: userId });
            if (!wallet) {
                wallet = new Wallet({
                    userId: userId,
                    balance: 0,
                    transaction: []
                });
            }

            await Wallet.updateOne(
                { userId: userId },
                {
                    $inc: { balance: refundAmount },
                    $push: {
                        transaction: {
                            amount: refundAmount,
                            transactionsMethod: 'Refund',
                            orderId: order._id,
                            date: new Date(),
                            description: `Refund for cancelled item: ${item.productId.productName}`
                        }
                    }
                }
            );
        }

        // Update item status in the order
        order.orderedItem[index].productStatus = 'Cancelled';
        order.orderedItem[index].cancelledAt = new Date();
        order.orderedItem[index].refundAmount = refundAmount;

        // Update overall order status based on all items
        const activeItems = order.orderedItem.filter(item => 
            !['Cancelled', 'Returned'].includes(item.productStatus)
        );
        
        if (activeItems.length === 0) {
            order.orderStatus = 'Cancelled';
        } else if (order.orderStatus === 'Cancelled') {
            const hasShippedItems = order.orderedItem.some(item => 
                ['Shipped', 'Delivered'].includes(item.productStatus)
            );
            const hasPendingItems = order.orderedItem.some(item => 
                ['Pending', 'Confirmed', 'Processing'].includes(item.productStatus)
            );

            if (hasShippedItems) {
                order.orderStatus = 'Shipped';
            } else if (hasPendingItems) {
                order.orderStatus = 'Processing';
            }
        }

        await order.save();

        await order.populate('orderedItem.productId', 'productName productImage');

        const refundedToWallet = order.paymentStatus === 'Paid' && ['razorpay', 'wallet', 'cod'].includes(order.paymentMethod);
        
        console.log('Item cancellation response:', {
            success: true,
            refundAmount: refundAmount,
            refundedToWallet: refundedToWallet,
            paymentStatus: order.paymentStatus,
            paymentMethod: order.paymentMethod
        });

        res.json({
            success: true,
            message: 'Item cancelled successfully',
            refundAmount: refundAmount,
            refundedToWallet: refundedToWallet,
            data: {
                updatedOrder: {
                    orderStatus: order.orderStatus,
                    items: order.orderedItem.map(item => ({
                        productStatus: item.productStatus,
                        productName: item.productId.productName
                    }))
                },
                stockUpdate: {
                    productId: productId,
                    newTotalStock: finalProduct.totalStock,
                    restoredSize: size,
                    restoredQty: quantity
                }
            }
        });

    } catch (error) {
        console.error('Error cancelling item:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel item',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Check if return will affect coupon (API endpoint for warning)
const checkReturnCouponImpact = async (req, res) => {
    try {
        const { orderId, itemIndex } = req.body;
        const userId = req.session.user;

        if (!userId) {
            return res.json({ success: false, message: 'User not authenticated' });
        }

        const order = await Orders.findOne({ _id: orderId, userId: userId });

        if (!order) {
            return res.json({ success: false, message: 'Order not found' });
        }

        const item = order.orderedItem[itemIndex];
        
        if (!item) {
            return res.json({ success: false, message: 'Item not found' });
        }

        let willLoseCoupon = false;
        let couponAmount = 0;
        let newSubtotal = 0;
        let currentSubtotal = 0;
        
        if (order.couponCode) {
            const coupon = await Coupon.findOne({ couponCode: order.couponCode });
            
            if (coupon) {
                // Calculate current subtotal (only active items)
                order.orderedItem.forEach(orderItem => {
                    if (!['Returned', 'Cancelled'].includes(orderItem.productStatus)) {
                        currentSubtotal += orderItem.totalProductPrice;
                    }
                });

                // Calculate subtotal after this return
                newSubtotal = currentSubtotal - item.totalProductPrice;

                // Check coupon eligibility before and after
                const hasCurrentCoupon = currentSubtotal >= coupon.minPurchase;
                const willHaveCoupon = newSubtotal >= coupon.minPurchase;

                if (hasCurrentCoupon && !willHaveCoupon) {
                    willLoseCoupon = true;
                    
                    // Calculate current coupon discount amount
                    if (coupon.type === 'percentageDiscount') {
                        couponAmount = Math.round((currentSubtotal * coupon.discount) / 100);
                    } else {
                        couponAmount = coupon.discount;
                    }
                }
            }
        }

        res.json({
            success: true,
            willLoseCoupon,
            couponAmount,
            minPurchase: order.couponInfo?.minPurchase || 0,
            newSubtotal,
            currentSubtotal
        });

    } catch (error) {
        console.error('Error checking coupon impact:', error);
        res.json({ success: false, message: 'Failed to check coupon impact' });
    }
};

// Request return for individual item (with transaction support)
const returnItem = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        const { orderId, productId, itemIndex, returnReason } = req.body;
        const userId = req.session.user;

        if (!userId) {
            await session.abortTransaction();
            session.endSession();
            return res.json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const order = await Orders.findOne({ _id: orderId, userId: userId }).session(session);

        if (!order) {
            await session.abortTransaction();
            session.endSession();
            return res.json({
                success: false,
                message: 'Order not found'
            });
        }

        const item = order.orderedItem[itemIndex];
        
        if (!item || item.productId.toString() !== productId) {
            await session.abortTransaction();
            session.endSession();
            return res.json({
                success: false,
                message: 'Item not found'
            });
        }

        if (item.productStatus !== 'Delivered') {
            await session.abortTransaction();
            session.endSession();
            return res.json({
                success: false,
                message: 'Only delivered items can be returned'
            });
        }

        // Update item with return request
        item.returnReason = returnReason;
        item.returnStatus = 'Requested';
        item.returnRequestDate = new Date();
        item.productStatus = 'Return Requested';

        await order.save({ session });
        await session.commitTransaction();
        session.endSession();

        res.json({
            success: true,
            message: 'Return request submitted successfully'
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error submitting return request:', error);
        res.json({
            success: false,
            message: 'Failed to submit return request',
            error: error.message
        });
    }
};

const generateInvoice = async (req, res) => {
    try {
        const { orderId } = req.params;
        const userId = req.session.user;
        
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const order = await Orders.findOne({ _id: orderId, userId: userId })
            .populate({
                path: 'orderedItem.productId',
                select: 'productName productImage regularPrice'
            })
            .populate({
                path: 'userId',
                select: 'name email'
            })
            .lean();

        // Manually populate the delivery address if it's an ObjectId
        if (order.deliveryAddress && mongoose.Types.ObjectId.isValid(order.deliveryAddress)) {
            let address = await Address.findById(order.deliveryAddress).lean();
            if (!address) {
                // Try resolving as sub-address id
                const parentDoc = await Address.findOne({ 'address._id': order.deliveryAddress }).lean();
                if (parentDoc) {
                    const sub = parentDoc.address.find(a => a._id.toString() === order.deliveryAddress.toString());
                    if (sub) {
                        address = { address: [sub] };
                    }
                }
            }
            order.deliveryAddress = address || null;
        }

        // Debug: Check the address structure
        console.log('Invoice - Delivery Address:', order.deliveryAddress);
        console.log('Invoice - Address Array:', order.deliveryAddress?.address);
        console.log('Invoice - Address Structure:', {
            hasAddress: !!order.deliveryAddress?.address,
            addressLength: order.deliveryAddress?.address?.length,
            firstAddress: order.deliveryAddress?.address?.[0],
            directFields: {
                name: order.deliveryAddress?.name,
                houseName: order.deliveryAddress?.houseName,
                street: order.deliveryAddress?.street
            }
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Create a PDF document
        const doc = new PDFDocument({ margin: 50 });
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderNumber || order._id}.pdf`);

        // Pipe the PDF to response
        doc.pipe(res);

        // Add content to PDF
        addInvoiceContent(doc, order);

        // Finalize the PDF
        doc.end();

    } catch (error) {
        console.error('Error generating invoice:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate invoice',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// Updated invoice content function with proper nested address handling
const addInvoiceContent = (doc, order) => {
    const subtotal = order.orderedItem.reduce((sum, item) => sum + (item.totalProductPrice || 0), 0);
    const discount = order.couponDiscount || 0;
    
    // Header
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#e74c3c')
       .text('ALLSCOUTS', 50, 50);
    doc.fontSize(16).fillColor('#000000')
       .text('INVOICE', 50, 80);
    
    // Order info
    doc.fontSize(10).font('Helvetica')
       .text(`Order #: ${order.orderNumber || order._id}`, 50, 120)
       .text(`Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`, 50, 135);
    
    // Billing Information
    doc.fontSize(12).font('Helvetica-Bold')
       .text('Billing Information:', 50, 170);
    doc.fontSize(10).font('Helvetica')
       .text(`Customer: ${order.userId ? order.userId.name : 'N/A'}`, 50, 190)
       .text(`Email: ${order.userId?.email || 'N/A'}`, 50, 205)
       .text(`Payment Method: ${order.paymentMethod || 'N/A'}`, 50, 220)
       .text(`Payment Status: ${order.paymentStatus || 'N/A'}`, 50, 235);
    
    // Shipping Information - FIXED: Handle different address structures
    doc.fontSize(12).font('Helvetica-Bold')
       .text('Shipping Information:', 300, 170);
    
    // Handle different address structures
    let shippingAddress = null;
    if (order.deliveryAddress) {
        if (order.deliveryAddress.address && order.deliveryAddress.address.length > 0) {
            // If address is an array, get the first one
            shippingAddress = order.deliveryAddress.address[0];
        } else if (order.deliveryAddress.name || order.deliveryAddress.houseName) {
            // If address is directly in the object
            shippingAddress = order.deliveryAddress;
        }
    }
    
    if (shippingAddress) {
        doc.fontSize(10).font('Helvetica')
           .text(`Name: ${shippingAddress.name || 'N/A'}`, 300, 190)
           .text(`Email: ${shippingAddress.email || 'N/A'}`, 300, 205)
           .text(`Phone: ${shippingAddress.number || 'N/A'}`, 300, 220)
           .text(`Address: ${shippingAddress.houseName || ''} ${shippingAddress.street || ''}`, 300, 235)
           .text(`${shippingAddress.city || ''}, ${shippingAddress.state || ''} - ${shippingAddress.pincode || ''}`, 300, 250)
           .text(`Country: ${shippingAddress.country || 'India'}`, 300, 265);
    } else {
        doc.fontSize(10).font('Helvetica')
           .text('Shipping address not available', 300, 190);
    }
    
    // Table header
    doc.fontSize(11).font('Helvetica-Bold').fillColor('#ffffff')
       .rect(50, 300, 500, 20).fill('#e74c3c');
    doc.text('Product', 60, 305);
    doc.text('Size', 200, 305);
    doc.text('Qty', 280, 305);
    doc.text('Unit Price', 320, 305);
    doc.text('Total', 400, 305);
    
    // Table rows
    let yPosition = 330;
    doc.fillColor('#000000');
    
    // Filter active items (exclude cancelled/returned)
    const activeItems = order.orderedItem.filter(item => 
        !['Cancelled', 'Returned'].includes(item.productStatus)
    );
    
    order.orderedItem.forEach((item, index) => {
        if (yPosition > 700) {
            doc.addPage();
            yPosition = 50;
        }
        
        doc.fontSize(9).font('Helvetica')
           .text(item.productId ? item.productId.productName : 'Product not found', 60, yPosition)
           .text(item.size || 'N/A', 200, yPosition)
           .text(item.quantity || 0, 280, yPosition)
           .text(`₹${(item.productPrice || 0).toFixed(2)}`, 320, yPosition)
           .text(`₹${(item.totalProductPrice || 0).toFixed(2)}`, 400, yPosition);
        
        // Add product status below product name
        yPosition += 15;
        doc.fontSize(8).font('Helvetica').fillColor('#666666')
           .text(`Status: ${item.productStatus}`, 60, yPosition);
        
        yPosition += 20;
    });
    
    // Adjust yPosition for totals based on address height
    const totalsY = order.deliveryAddress && order.deliveryAddress.address && order.deliveryAddress.address.length > 0 ? yPosition + 40 : yPosition + 20;
    
    // Calculate totals based on active items only
    const activeSubtotal = activeItems.reduce((sum, item) => sum + (item.totalProductPrice || 0), 0);
    const finalTotal = activeSubtotal - discount;
    
    // Totals
    doc.fontSize(11).font('Helvetica-Bold')
       .text('Subtotal:', 350, totalsY)
       .text(`₹${activeSubtotal.toFixed(2)}`, 450, totalsY);
    
    if (discount > 0) {
        doc.text('Discount:', 350, totalsY + 20)
           .text(`-₹${discount.toFixed(2)}`, 450, totalsY + 20);
    }
    
    doc.text('Shipping:', 350, totalsY + 40)
       .text('Free', 450, totalsY + 40);
    
    doc.fontSize(14)
       .text('Grand Total:', 350, totalsY + 70)
       .text(`₹${finalTotal.toFixed(2)}`, 450, totalsY + 70);
    
    // Footer
    doc.fontSize(8).font('Helvetica')
       .text('Thank you for your business!', 50, totalsY + 110)
       .text('This is a computer-generated invoice. No signature required.', 50, totalsY + 125);
};

// Helper function to generate invoice HTML
const generateInvoiceHTML = (order) => {
    const subtotal = order.orderedItem.reduce((sum, item) => sum + item.totalProductPrice, 0);
    const discount = order.couponDiscount || 0;

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Invoice - ${order.orderNumber || order._id}</title>
        <style>
            body { 
                font-family: Arial, sans-serif; 
                margin: 0; 
                padding: 20px; 
                color: #333;
                line-height: 1.6;
            }
            .header { 
                text-align: center; 
                margin-bottom: 30px; 
                border-bottom: 2px solid #e74c3c;
                padding-bottom: 20px;
            }
            .company-name { 
                font-size: 28px; 
                font-weight: bold; 
                color: #e74c3c; 
                margin-bottom: 10px;
            }
            .invoice-title { 
                font-size: 24px; 
                color: #333; 
                margin-bottom: 20px;
            }
            .order-info { 
                display: grid; 
                grid-template-columns: 1fr 1fr; 
                gap: 30px; 
                margin-bottom: 30px;
            }
            .info-section h3 { 
                color: #e74c3c; 
                border-bottom: 1px solid #eee; 
                padding-bottom: 5px;
                margin-bottom: 15px;
            }
            .info-row { 
                margin-bottom: 8px; 
                display: flex; 
                justify-content: space-between;
            }
            .info-label { 
                font-weight: bold; 
                color: #666;
            }
            .items-table { 
                width: 100%; 
                border-collapse: collapse; 
                margin-bottom: 30px;
            }
            .items-table th { 
                background: #f8f9fa; 
                padding: 12px; 
                text-align: left; 
                border-bottom: 2px solid #e74c3c;
                font-weight: bold;
            }
            .items-table td { 
                padding: 12px; 
                border-bottom: 1px solid #eee;
            }
            .total-section { 
                margin-left: auto; 
                width: 300px; 
                border-top: 2px solid #e74c3c;
                padding-top: 15px;
            }
            .total-row { 
                display: flex; 
                justify-content: space-between; 
                margin-bottom: 8px;
                font-size: 14px;
            }
            .grand-total { 
                font-weight: bold; 
                font-size: 18px; 
                color: #e74c3c;
                border-top: 1px solid #eee;
                padding-top: 8px;
                margin-top: 8px;
            }
            .footer {
                text-align: center;
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #eee;
                color: #666;
                font-size: 12px;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="company-name">ALLSCOUTS</div>
            <div class="invoice-title">INVOICE</div>
            <p><strong>Order #:</strong> ${order.orderNumber || order._id}</p>
            <p><strong>Date:</strong> ${new Date(order.createdAt).toLocaleDateString('en-IN')}</p>
        </div>

        <div class="order-info">
            <div class="info-section">
                <h3>Billing Information</h3>
                <div class="info-row">
                    <span class="info-label">Customer:</span>
                    <span>${order.userId ? `${order.userId.firstName} ${order.userId.lastName}` : 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Email:</span>
                    <span>${order.userId?.email || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Payment Method:</span>
                    <span>${order.paymentMethod}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Payment Status:</span>
                    <span>${order.paymentStatus}</span>
                </div>
            </div>

            <div class="info-section">
                <h3>Shipping Information</h3>
                ${(() => {
                    // Handle different address structures
                    let shippingAddress = null;
                    if (order.deliveryAddress) {
                        if (order.deliveryAddress.address && order.deliveryAddress.address.length > 0) {
                            // If address is an array, get the first one
                            shippingAddress = order.deliveryAddress.address[0];
                        } else if (order.deliveryAddress.name || order.deliveryAddress.houseName) {
                            // If address is directly in the object
                            shippingAddress = order.deliveryAddress;
                        }
                    }
                    
                    if (shippingAddress) {
                        return `
                        <div class="info-row">
                            <span class="info-label">Name:</span>
                            <span>${shippingAddress.name || 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Email:</span>
                            <span>${shippingAddress.email || 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Phone:</span>
                            <span>${shippingAddress.number || 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Address:</span>
                            <span>${shippingAddress.houseName || ''} ${shippingAddress.street || ''}, ${shippingAddress.city || ''}, ${shippingAddress.state || ''} - ${shippingAddress.pincode || ''}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Country:</span>
                            <span>${shippingAddress.country || 'India'}</span>
                        </div>
                        `;
                    } else {
                        return '<p>No shipping address available</p>';
                    }
                })()}
            </div>
        </div>

        <table class="items-table">
            <thead>
                <tr>
                    <th>Product</th>
                    <th>Size</th>
                    <th>Quantity</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                ${order.orderedItem.map(item => `
                <tr>
                    <td>
                        ${item.productId ? item.productId.productName : 'Product not found'}
                        <br><small style="color: #666;">Status: ${item.productStatus}</small>
                    </td>
                    <td>${item.size}</td>
                    <td>${item.quantity}</td>
                    <td>₹${item.productPrice.toFixed(2)}</td>
                    <td>₹${item.totalProductPrice.toFixed(2)}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>

        <div class="total-section">
            <div class="total-row">
                <span>Subtotal:</span>
                <span>₹${subtotal.toFixed(2)}</span>
            </div>
            ${discount > 0 ? `
            <div class="total-row">
                <span>Discount:</span>
                <span style="color: #28a745;">-₹${discount.toFixed(2)}</span>
            </div>
            ` : ''}
            <div class="total-row">
                <span>Shipping:</span>
                <span>Free</span>
            </div>
            <div class="total-row grand-total">
                <span>Grand Total:</span>
                <span>₹${(subtotal - discount).toFixed(2)}</span>
            </div>
        </div>

        <div class="footer">
            <p>Thank you for your business!</p>
            <p>This is a computer-generated invoice. No signature required.</p>
        </div>
    </body>
    </html>
    `;
};



// Create Razorpay Order
const createRazorpayOrder = async (req, res) => {
  try {
    const { amount, orderId } = req.body;

    console.log('Creating Razorpay order for:', { amount, orderId });

    if (!amount || isNaN(amount)) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid amount" 
      });
    }

    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: "Order ID is required"
      });
    }

    let amountInPaise = Math.round(Number(amount) * 100);

    // Shorter receipt
    const receipt = `rcpt_${Date.now()}`;

    const options = {
      amount: amountInPaise,
      currency: "INR",
      receipt: receipt,
      payment_capture: 1
    };

    const razorpayOrder = await razorpay.orders.create(options);

    // Use Orders (your model name)
    await Orders.findByIdAndUpdate(orderId, {
      razorpayOrderId: razorpayOrder.id
    });

    console.log('Razorpay order created:', razorpayOrder.id);

    return res.json({
      success: true,
      order: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key_id: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error("Razorpay order creation error:", error);
    return res.status(500).json({ 
      success: false,
      error: "Failed to create payment order" 
    });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
    const userId = req.session.user;

    console.log('Verifying payment for order:', orderId);

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment details'
      });
    }

    // Verify payment signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      console.log('Payment verification failed: signature mismatch');
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    // Fetch order
    const order = await Orders.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Update order with payment success
    order.paymentStatus = 'Paid';
    order.paymentId = razorpay_payment_id;
    order.razorpayOrderId = razorpay_order_id;
    order.paymentDate = new Date();
    await order.save();

    // Update stock for successful payment
    for (const item of order.orderedItem) {
      await Product.updateOne(
        { _id: item.productId, "stock.size": item.size },
        {
          $inc: {
            "stock.$.quantity": -item.quantity,
            totalstock: -item.quantity,
          },
        }
      );
    }

    // Handle coupon if applied
    if (order.couponCode) {
      const coupon = await Coupon.findOne({ couponCode: order.couponCode });
      if (coupon) {
        // Decrement coupon uses
        await Coupon.updateOne(
          { _id: coupon._id },
          { $inc: { maxRedeem: -1 } }
        );
        
        // Add coupon code to user's usedCoupons array
        await User.updateOne(
          { _id: userId },
          { $addToSet: { usedCoupons: order.couponCode } }
        );
      }
    }

    // Clear user's cart
    await Cart.deleteOne({ userId });

    // Clear coupon from session
    if (req.session.appliedCoupon) {
      delete req.session.appliedCoupon;
    }

    res.json({
      success: true,
      message: 'Payment verified successfully',
      orderId: order._id,
      paymentId: razorpay_payment_id
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message
    });
  }
};
   

const orderFailure = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const errorMessage = req.query.error || null;
        
        // Fetch order details
        const order = await Orders.findById(orderId);
        
        if (!order) {
            return res.redirect('/orders');
        }

        res.render('user/orderFailure', {
            orderId: order._id,
            orderAmount: order.orderAmount,
            email: req.session.user.email,
            userName: req.session.user.name || 'Customer',
            userPhone: req.session.user.phone || '',
            razorpayKeyId: process.env.RAZORPAY_KEY_ID,
            errorMessage: errorMessage
        });
    } catch (error) {
        console.error('Error rendering payment failure page:', error);
        res.redirect('/orders');
    }
}

const renderPaymentFailure = async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const errorMessage = req.query.error || null;
        
        // Fetch order details
        const order = await Orders.findById(orderId);
        
        if (!order) {
            req.flash('error', 'Order not found');
            return res.redirect('/orders');
        }

        // Check if order belongs to logged-in user
        if (order.userId.toString() !== req.session.user) {
            req.flash('error', 'Unauthorized access');
            return res.redirect('/orders');
        }

        // Get user details
        const user = await User.findById(req.session.user);

        res.render('orderFailure', {
            orderId: order._id,
            orderAmount: order.orderAmount,
            email: user.email,
            userName: user.name || 'Customer',
            userPhone: user.phone || '',
            razorpayKeyId: process.env.RAZORPAY_KEY_ID,
            errorMessage: errorMessage,
            user: user
        });
    } catch (error) {
        console.error('Error rendering payment failure page:', error);
        req.flash('error', 'Something went wrong');
        res.redirect('/orders');
    }
};

//   Verify retry payment

const verifyRetryPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
    const userId = req.session.user;

    console.log('🔄 Verifying RETRY payment for order:', orderId);

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment details'
      });
    }

    // Verify payment signature
    const generatedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }

    // Fetch order
    const order = await Orders.findById(orderId);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Verify this is actually a retry (payment was previously failed)
    if (order.paymentStatus !== 'Failed') {
      return res.status(400).json({
        success: false,
        message: 'This order does not require payment retry'
      });
    }

    // Handle coupon if applied (for retry payment)
    if (order.couponCode) {
      const coupon = await Coupon.findOne({ couponCode: order.couponCode });
      if (coupon) {
        // Decrement coupon uses
        await Coupon.updateOne(
          { _id: coupon._id },
          { $inc: { maxRedeem: -1 } }
        );
        
        // Add coupon code to user's usedCoupons array
        await User.updateOne(
          { _id: userId },
          { $addToSet: { usedCoupons: order.couponCode } }
        );
      }
    }
    
    // Update stock for successful retry payment
    for (const item of order.orderedItem) {
      await Product.updateOne(
        { _id: item.productId, "stock.size": item.size },
        {
          $inc: {
            "stock.$.quantity": -item.quantity,
            totalstock: -item.quantity,
          },
        }
      );
    }

    // Update order payment status
    order.paymentStatus = 'Paid';
    order.paymentId = razorpay_payment_id;
    order.razorpayOrderId = razorpay_order_id;
    order.paymentDate = new Date();
    await order.save();

    // Clear user's cart (in case it wasn't cleared before)
    await Cart.deleteOne({ userId });
    req.session.cartItem = 0;

    // Clear coupon from session
    if (req.session.appliedCoupon) {
      delete req.session.appliedCoupon;
    }

    res.json({
      success: true,
      message: 'Payment verified successfully',
      orderId: order._id,
      paymentId: razorpay_payment_id
    });
  } catch (error) {
    console.error('❌ Retry payment verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message
    });
  }
};




// UPDATE PAYMENT FAILED STATUS
const updatePaymentFailed = async (req, res) => {
  try {
    const { orderId, error } = req.body;

    if (!orderId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Order ID is required' 
      });
    }

    // Update both paymentStatus and orderStatus
    const order = await Orders.findByIdAndUpdate(
      orderId,
      {
        $set: {
          paymentStatus: 'Failed',
          orderStatus: 'Pending'  // ← Ensures order remains retryable
        }
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ 
        success: false, 
        error: 'Order not found' 
      });
    }

    return res.json({ 
      success: true,
      message: 'Payment failed status updated successfully',
      orderId: order._id,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus
    });

  } catch (error) {
    console.error('Error in updatePaymentFailed:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to update payment status',
      details: error.message 
    });
  }
};


module.exports = {
    checkStockAvailability,
    applyCoupon,
    removeCoupon,
    placeOrder,
    orderSuccessPage,
    loadOrdersPage,
    getUserOrders,
    getUserOrderDetails,
    cancelOrder,
    cancelItem,
    checkReturnCouponImpact,
    returnItem,
    generateInvoice,
    createRazorpayOrder,
    verifyPayment,
    orderFailure,
    renderPaymentFailure,
    updatePaymentFailed,
    verifyRetryPayment

    
    



}