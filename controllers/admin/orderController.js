const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema")
const Orders = require("../../models/orderSchema")
const Wallet = require("../../models/walletSchema")
const Cart = require("../../models/cartSchema")
const Offer = require("../../models/offerSchema")
const Coupon = require('../../models/couponSchema');
const mongoose = require('mongoose');


// GET /admin/orders - Order listing page

const ordersListPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const search = req.query.search?.trim() || '';
    const statusFilter = req.query.status || '';

    // Build query object
    let query = {};
    if (statusFilter) {
      query.orderStatus = statusFilter;
    }

    // Build search query
    let searchQuery = {};
    if (search) {
      // Search by order number
      const orderSearchQuery = { orderNumber: { $regex: search, $options: 'i' } };

      // Search users by name
      const users = await User.find({ name: { $regex: search, $options: 'i' } }).select('_id');

      // Search addresses by name
      const addresses = await Address.find({ "address.name": { $regex: search, $options: 'i' } }).select('userId address.$');

      const userIdsFromAddresses = addresses.map(a => a.userId);

      const allUserIds = [...users.map(u => u._id), ...userIdsFromAddresses];

      if (allUserIds.length > 0) {
        searchQuery = { $or: [orderSearchQuery, { userId: { $in: allUserIds } }] };
      } else {
        searchQuery = orderSearchQuery;
      }
    }

    // Combine filter and search
    const finalQuery = search ? { ...query, ...searchQuery } : query;

    // Fetch orders with pagination
    const orders = await Orders.find(finalQuery)
      .populate('userId', 'name email phone address') // user details
      .populate('orderedItem.productId', 'productName regularPrice productImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalOrders = await Orders.countDocuments(finalQuery);
    const totalPages = Math.ceil(totalOrders / limit);

    // Attach shipping address name and return status
    const processedOrders = await Promise.all(
      orders.map(async (order) => {
        let customerName = "N/A";

        if (order.deliveryAddress) {
          const addressDoc = await Address.findOne(
            { "address._id": order.deliveryAddress },
            { "address.$": 1 } // only matched address
          ).lean();

          if (addressDoc?.address?.length > 0) {
            customerName = addressDoc.address[0].name;
          }
        }

        if (customerName === "N/A" && order.userId?.name) {
          customerName = order.userId.name;
        }

        // Determine return status
        let returnStatus = "None";
        const hasReturnedItems = order.orderedItem.some(item =>
          ["Returned", "Return Requested", "Return Approved", "Return Rejected"].includes(item.productStatus)
        );

        if (hasReturnedItems) {
          if (order.orderedItem.some(item => item.productStatus === "Returned")) returnStatus = "Returned";
          else if (order.orderedItem.some(item => item.productStatus === "Return Requested")) returnStatus = "Return Requested";
        }

        return {
          ...order,
          customerName,
          returnStatus,
          displayOrderId: order.orderNumber || order._id.toString().slice(-8).toUpperCase()
        };
      })
    );

    // Render page
    res.render('orderListing', {
      orders: processedOrders,
      currentPage: page,
      totalPages,
      totalOrders,
      limit,
      search,
      statusFilter,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page + 1,
      prevPage: page - 1
    });

  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).send(`
      <html>
        <body>
          <h2>Error loading orders</h2>
          <p>${error.message}</p>
          <a href="/admin/orders">Go back to orders</a>
        </body>
      </html>
    `);
  }
};


// GET /admin/orders/:id - Order details page
const orderDetailsPage = async (req, res) => {
    try {
        const orderId = req.params.id;
        
        // Fetch order with all necessary population
        const order = await Orders.findById(orderId)
            .populate('userId', 'name email phone')
            .populate('orderedItem.productId', 'productName productImage regularPrice description')
            .lean();
        
        if (!order) {
            return res.status(404).render('admin/error', {
                message: 'Order not found',
                error: 'The requested order does not exist.'
            });
        }
        
        // Get shipping address details
        let shippingAddress = null;
        if (order.deliveryAddress) {
            // First try to get from Address model (separate collection)
            try {
                const addressDoc = await Address.findOne({ 
                    userId: order.userId,
                    'address._id': order.deliveryAddress 
                }).lean();
                
                if (addressDoc && addressDoc.address) {
                    const foundAddress = addressDoc.address.find(addr => 
                        addr._id.toString() === order.deliveryAddress.toString()
                    );
                    if (foundAddress) {
                        shippingAddress = foundAddress;
                    }
                }
            } catch (err) {
                console.log('Error fetching address:', err.message);
            }
            
            // If still not found, try User's address array (fallback)
            if (!shippingAddress && order.userId) {
                const userWithAddress = await User.findById(order.userId).lean();
                if (userWithAddress && userWithAddress.address && Array.isArray(userWithAddress.address)) {
                    const addressArray = userWithAddress.address.find(addr => 
                        addr._id && addr._id.toString() === order.deliveryAddress.toString()
                    );
                    if (addressArray) {
                        shippingAddress = addressArray;
                    }
                }
            }
        }
        
        // Calculate adjusted totals considering returns/cancellations
        let adjustedSubtotal = 0;
        order.orderedItem.forEach((item) => {
            if (!['Returned', 'Cancelled'].includes(item.productStatus)) {
                adjustedSubtotal += item.totalProductPrice;
            }
        });

        let adjustedCouponDiscount = 0;
        if (order.couponDiscount > 0 && order.couponCode) {
            const coupon = await Coupon.findOne({ couponCode: order.couponCode }).lean();
            if (coupon && adjustedSubtotal >= coupon.minPurchase) {
                if (coupon.type === 'percentageDiscount') {
                    adjustedCouponDiscount = Math.round((adjustedSubtotal * coupon.discount) / 100);
                } else {
                    adjustedCouponDiscount = coupon.discount;
                }
            }
        }

        const shippingCharge = order.deliveryCharge || 0;
        const finalTotal = adjustedSubtotal + shippingCharge - adjustedCouponDiscount;
        
        // Format order data with adjusted values
        const orderData = {
            ...order,
            displayOrderId: order.orderNumber || order._id.toString().slice(-8).toUpperCase(),
            formattedDate: new Date(order.createdAt).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }),
            subtotal: adjustedSubtotal,
            shippingCharge,
            couponDiscount: adjustedCouponDiscount,
            finalTotal,
            shippingAddress
        };
        
        res.render('orderDetailPage', { order: orderData });
        
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).render('admin/error', {
            message: 'Error loading order details',
            error: error.message
        });
    }
};

// POST /admin/orders/:id/update - Update order details
const updateOrderDetails = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const orderId = req.params.id;
    const { orderStatus, paymentStatus, orderedItems } = req.body;

    const order = await Orders.findById(orderId)
      .populate('orderedItem.productId', 'productName')
      .session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.json({ success: false, message: 'Order not found' });
    }

    // Save old statuses for comparison
    const oldStatuses = order.orderedItem.map(item => item.productStatus);

    // Calculate CURRENT active subtotal (items not yet returned/cancelled)
    let currentSubtotal = 0;
    for (let i = 0; i < order.orderedItem.length; i++) {
      if (!['Returned', 'Cancelled'].includes(oldStatuses[i])) {
        currentSubtotal += order.orderedItem[i].totalProductPrice;
      }
    }

    // Get coupon details if exists
    const coupon = order.couponCode 
      ? await Coupon.findOne({ couponCode: order.couponCode }).session(session) 
      : null;

    // Calculate CURRENT applicable discount based on current active items
    let currentDiscount = 0;
    if (coupon && currentSubtotal >= coupon.minPurchase) {
      if (coupon.type === 'percentageDiscount') {
        currentDiscount = Math.round((currentSubtotal * coupon.discount) / 100);
      } else {
        currentDiscount = coupon.discount;
      }
    }

    const shippingCharge = order.deliveryCharge || 0;
    const currentFinal = currentSubtotal + shippingCharge - currentDiscount;

    console.log('=== BEFORE UPDATE ===');
    console.log('Current Subtotal:', currentSubtotal);
    console.log('Current Discount:', currentDiscount);
    console.log('Current Final:', currentFinal);

    // Function to check if status is terminal
    const isTerminal = (status) => ['Delivered', 'Returned', 'Cancelled', 'Return Rejected'].includes(status);

    // Handle whole order status update
    if (orderStatus && order.orderStatus !== orderStatus) {
      for (let i = 0; i < order.orderedItem.length; i++) {
        const item = order.orderedItem[i];
        const currentStatus = oldStatuses[i];
        if (!isTerminal(currentStatus) || currentStatus === orderStatus) {
          item.productStatus = orderStatus;
        }
      }
      order.orderStatus = orderStatus;
      if (orderStatus === 'Shipped' && !order.shippingDate) {
        order.shippingDate = new Date();
      }
      if (orderStatus === 'Delivered' && !order.deliveryDate) {
        order.deliveryDate = new Date();
      }
    }

    // Handle individual item updates
    if (orderedItems && Array.isArray(orderedItems)) {
      for (const itemUpdate of orderedItems) {
        const orderItem = order.orderedItem.find(oi => oi._id.toString() === itemUpdate.itemId);
        if (orderItem && itemUpdate.productStatus) {
          const currentStatus = orderItem.productStatus;
          if (!isTerminal(currentStatus) || currentStatus === itemUpdate.productStatus) {
            orderItem.productStatus = itemUpdate.productStatus;
          }
        }
      }
    }

    // Calculate NEW active subtotal after status changes
    let newSubtotal = 0;
    order.orderedItem.forEach(item => {
      if (!['Returned', 'Cancelled'].includes(item.productStatus)) {
        newSubtotal += item.totalProductPrice;
      }
    });

    // Calculate NEW applicable discount
    let newDiscount = 0;
    if (coupon && newSubtotal >= coupon.minPurchase) {
      if (coupon.type === 'percentageDiscount') {
        newDiscount = Math.round((newSubtotal * coupon.discount) / 100);
      } else {
        newDiscount = coupon.discount;
      }
    }

    const newFinal = newSubtotal + shippingCharge - newDiscount;

    console.log('=== AFTER UPDATE ===');
    console.log('New Subtotal:', newSubtotal);
    console.log('New Discount:', newDiscount);
    console.log('New Final:', newFinal);

    // Calculate total refund for this operation
    let totalRefundedAmount = Math.max(0, currentFinal - newFinal);

    console.log('=== REFUND ===');
    console.log('Refund Amount:', totalRefundedAmount);

    // Identify items that changed status to Returned/Cancelled in this operation
    let refundedItems = [];
    let changedItemsTotal = 0;
    
    for (let i = 0; i < order.orderedItem.length; i++) {
      const item = order.orderedItem[i];
      const oldStatus = oldStatuses[i];
      const newStatus = item.productStatus;
      
      if (!['Returned', 'Cancelled'].includes(oldStatus) && ['Returned', 'Cancelled'].includes(newStatus)) {
        changedItemsTotal += item.totalProductPrice;
        refundedItems.push({
          productName: item.productId?.productName || 'Unknown Product',
          itemPrice: item.totalProductPrice,
          refundedAmount: 0 // Will be calculated proportionally
        });
      }
    }

    // Distribute refund proportionally among returned/cancelled items
    if (refundedItems.length > 0 && changedItemsTotal > 0 && totalRefundedAmount > 0) {
      refundedItems.forEach(item => {
        item.refundedAmount = Math.round((item.itemPrice / changedItemsTotal) * totalRefundedAmount);
      });
    }

    // Process refund if applicable
    if (totalRefundedAmount > 0 && ['Paid', 'Partially Refunded'].includes(order.paymentStatus) && ['razorpay', 'wallet', 'cod'].includes(order.paymentMethod)) {
      let wallet = await Wallet.findOne({ userId: order.userId }).session(session);
      if (!wallet) {
        wallet = await Wallet.create({
          userId: order.userId,
          balance: 0,
          transaction: []
        }, { session });
      }

      await Wallet.updateOne(
        { userId: order.userId },
        {
          $inc: { balance: totalRefundedAmount },
          $push: {
            transaction: {
              amount: totalRefundedAmount,
              transactionsMethod: 'Refund',
              orderId: order._id,
              date: new Date()
            }
          }
        },
        { session }
      );
    }

    // Restore stock for newly returned/cancelled items
    for (let i = 0; i < order.orderedItem.length; i++) {
      const item = order.orderedItem[i];
      const oldStatus = oldStatuses[i];
      
      if (!['Returned', 'Cancelled'].includes(oldStatus) && ['Returned', 'Cancelled'].includes(item.productStatus)) {
        await Product.updateOne(
          { _id: item.productId, 'stock.size': item.size },
          {
            $inc: {
              'stock.$.quantity': item.quantity,
              totalstock: item.quantity
            }
          },
          { session }
        );
      }
    }

    // Update stored couponDiscount to reflect current state
    order.couponDiscount = newDiscount;

    // Update payment status based on cumulative refunds
    const originalSubtotal = order.orderedItem.reduce((sum, item) => sum + item.totalProductPrice, 0);
    
    // Calculate original discount (at order placement)
    let originalDiscount = 0;
    if (coupon && originalSubtotal >= coupon.minPurchase) {
      if (coupon.type === 'percentageDiscount') {
        originalDiscount = Math.round((originalSubtotal * coupon.discount) / 100);
      } else {
        originalDiscount = coupon.discount;
      }
    }
    
    const originalFinal = originalSubtotal + shippingCharge - originalDiscount;
    const cumulativeRefunded = originalFinal - newFinal;
    
    if (cumulativeRefunded > 0) {
      order.paymentStatus = 'Partially Refunded';
      if (newFinal <= 0) {
        order.paymentStatus = 'Refunded';
      }
    }

    // Override paymentStatus if provided and no refund this time
    if (paymentStatus && totalRefundedAmount === 0) {
      order.paymentStatus = paymentStatus;
    }

    await order.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: 'Order updated successfully',
      refundedItems: refundedItems.length > 0 ? refundedItems : undefined,
      redirectUrl: `/admin/orders/${orderId}`
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error updating order:', error);
    res.json({ success: false, message: 'Failed to update order', error: error.message });
  }
};

// POST /admin/orders/:id/return-request/:itemId - Handle return request
const handleReturnRequest = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id: orderId, itemId } = req.params;
    const { action, notes } = req.body;

    const order = await Orders.findById(orderId)
      .populate('orderedItem.productId', 'productName')
      .session(session);
    if (!order) {
      await session.abortTransaction();
      session.endSession();
      return res.json({ success: false, message: 'Order not found' });
    }

    const orderItem = order.orderedItem.find(item => item._id.toString() === itemId);
    if (!orderItem) {
      await session.abortTransaction();
      session.endSession();
      return res.json({ success: false, message: 'Order item not found' });
    }

    if (orderItem.productStatus !== 'Return Requested') {
      await session.abortTransaction();
      session.endSession();
      return res.json({ success: false, message: 'No return request found for this item' });
    }

    let refundedItems = [];

    if (action === 'approve') {
      // Calculate CURRENT active subtotal (before this return)
      let currentSubtotal = 0;
      order.orderedItem.forEach(item => {
        if (!['Returned', 'Cancelled'].includes(item.productStatus)) {
          currentSubtotal += item.totalProductPrice;
        }
      });

      const itemPrice = orderItem.totalProductPrice;

      // Get coupon details
      const coupon = order.couponCode 
        ? await Coupon.findOne({ couponCode: order.couponCode }).session(session) 
        : null;

      // Calculate CURRENT applicable discount
      let currentDiscount = 0;
      if (coupon && currentSubtotal >= coupon.minPurchase) {
        if (coupon.type === 'percentageDiscount') {
          currentDiscount = Math.round((currentSubtotal * coupon.discount) / 100);
        } else {
          currentDiscount = coupon.discount;
        }
      }

      const shippingCharge = order.deliveryCharge || 0;
      const currentFinal = currentSubtotal + shippingCharge - currentDiscount;

      console.log('=== RETURN REQUEST - BEFORE ===');
      console.log('Current Subtotal:', currentSubtotal);
      console.log('Current Discount:', currentDiscount);
      console.log('Current Final:', currentFinal);

      // Calculate NEW state after return
      const newSubtotal = currentSubtotal - itemPrice;
      
      // Calculate NEW applicable discount
      let newDiscount = 0;
      if (coupon && newSubtotal >= coupon.minPurchase) {
        if (coupon.type === 'percentageDiscount') {
          newDiscount = Math.round((newSubtotal * coupon.discount) / 100);
        } else {
          newDiscount = coupon.discount;
        }
      }

      const newFinal = newSubtotal + shippingCharge - newDiscount;

      console.log('=== RETURN REQUEST - AFTER ===');
      console.log('New Subtotal:', newSubtotal);
      console.log('New Discount:', newDiscount);
      console.log('New Final:', newFinal);

      // Calculate refund amount
      let refundAmount = Math.max(0, currentFinal - newFinal);

      console.log('=== RETURN REQUEST - REFUND ===');
      console.log('Refund Amount:', refundAmount);
      console.log('Payment Status:', order.paymentStatus);
      console.log('Payment Method:', order.paymentMethod);
      console.log('Refund Condition Check:');
      console.log('  - refundAmount > 0:', refundAmount > 0);
      console.log('  - Payment Status Valid:', ['Paid', 'Partially Refunded'].includes(order.paymentStatus));
      console.log('  - Payment Method Valid:', ['razorpay', 'wallet', 'cod'].includes(order.paymentMethod));

      // Update item status
      orderItem.productStatus = 'Returned';
      orderItem.returnStatus = 'Approved';
      orderItem.returnApproved = true;
      orderItem.returnApprovedDate = new Date();
      orderItem.returnNotes = notes || '';

      // Process refund if applicable
      if (refundAmount > 0 && ['Paid', 'Partially Refunded'].includes(order.paymentStatus) && ['razorpay', 'wallet', 'cod'].includes(order.paymentMethod)) {
        console.log('>>> PROCESSING WALLET REFUND <<<');
        let wallet = await Wallet.findOne({ userId: order.userId }).session(session);
        if (!wallet) {
          wallet = await Wallet.create({
            userId: order.userId,
            balance: 0,
            transaction: []
          }, { session });
        }

        await Wallet.updateOne(
          { userId: order.userId },
          {
            $inc: { balance: refundAmount },
            $push: {
              transaction: {
                amount: refundAmount,
                transactionsMethod: 'Refund',
                orderId: order._id,
                date: new Date()
              }
            }
          },
          { session }
        );

        console.log('>>> WALLET UPDATED SUCCESSFULLY <<<');
        console.log('Refunded Amount:', refundAmount);

        refundedItems.push({
          productName: orderItem.productId?.productName || 'Unknown Product',
          refundedAmount: refundAmount
        });
      } else {
        console.log('>>> WALLET REFUND SKIPPED <<<');
        console.log('Reason: Condition failed');
      }

      // Restore stock
      await Product.updateOne(
        { _id: orderItem.productId, 'stock.size': orderItem.size },
        {
          $inc: {
            'stock.$.quantity': orderItem.quantity,
            totalstock: orderItem.quantity
          }
        },
        { session }
      );

      // Update stored couponDiscount to reflect current state
      order.couponDiscount = newDiscount;

      // Update payment status based on cumulative refunds
      const originalSubtotal = order.orderedItem.reduce((sum, item) => sum + item.totalProductPrice, 0);
      
      // Calculate original discount
      let originalDiscount = 0;
      if (coupon && originalSubtotal >= coupon.minPurchase) {
        if (coupon.type === 'percentageDiscount') {
          originalDiscount = Math.round((originalSubtotal * coupon.discount) / 100);
        } else {
          originalDiscount = coupon.discount;
        }
      }
      
      const originalFinal = originalSubtotal + shippingCharge - originalDiscount;
      const cumulativeRefunded = originalFinal - newFinal;
      
      if (cumulativeRefunded > 0) {
        order.paymentStatus = 'Partially Refunded';
        if (newFinal <= 0) {
          order.paymentStatus = 'Refunded';
        }
      }

    } else if (action === 'reject') {
      orderItem.productStatus = 'Return Rejected';
      orderItem.returnStatus = 'Rejected';
      orderItem.returnApproved = false;
      orderItem.returnNotes = notes || '';
    }

    // Update order status if all items returned
    const allReturned = order.orderedItem.every(item => item.productStatus === 'Returned');
    if (allReturned) {
      order.orderStatus = 'Returned';
    }

    await order.save({ session });
    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: `Return request ${action === 'approve' ? 'approved' : 'rejected'} successfully`,
      refundedItems: refundedItems.length > 0 ? refundedItems : undefined,
      redirectUrl: `/admin/orders/${orderId}`
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error handling return request:', error);
    res.json({ success: false, message: 'Failed to process return request', error: error.message });
  }
};

module.exports = {
    ordersListPage,
     orderDetailsPage,
    updateOrderDetails,
    handleReturnRequest
}