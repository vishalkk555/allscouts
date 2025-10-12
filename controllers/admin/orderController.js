const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema")
const Orders = require("../../models/orderSchema")
const Wallet = require("../../models/walletSchema")
const Cart = require("../../models/cartSchema")
const Offer = require("../../models/offerSchema")
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
        
        // Calculate totals
        const subtotal = order.orderedItem.reduce((sum, item) => sum + item.totalProductPrice, 0);
        const shippingCharge = order.deliveryCharge || 0;
        const couponDiscount = order.couponDiscount || 0;
        const finalTotal = subtotal + shippingCharge - couponDiscount;
        
        // Format order data
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
            subtotal,
            shippingCharge,
            couponDiscount,
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

    const refundedItems = [];
    let totalRefundedAmount = 0;
    const subtotal = order.orderedItem.reduce((sum, item) => sum + item.totalProductPrice, 0);
    const totalDiscount = order.couponDiscount || 0;

    // Handle whole order cancellation/return
    if (orderStatus && ['Cancelled', 'Returned'].includes(orderStatus) && order.orderStatus !== orderStatus) {
      if (order.paymentStatus === 'Paid' && ['razorpay', 'wallet', 'cod'].includes(order.paymentMethod)) {
        const refundAmount = order.finalTotal;
        const wallet = await Wallet.findOne({ userId: order.userId }).session(session);
        if (!wallet) {
          await Wallet.create({
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

        order.paymentStatus = 'Refunded';
        totalRefundedAmount += refundAmount;
        refundedItems.push({
          productName: 'Entire Order',
          refundedAmount: refundAmount
        });

        // Restore stock for all items
        for (const item of order.orderedItem) {
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
          item.productStatus = orderStatus; // Update all items to match order status
        }
      } else if (order.paymentStatus === 'Pending' && order.paymentMethod === 'cod') {
        // No refund for COD with Pending status, just update stock
        for (const item of order.orderedItem) {
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
          item.productStatus = orderStatus;
        }
      }
    }

    // Handle individual product status updates
    if (orderedItems && Array.isArray(orderedItems)) {
      for (const itemUpdate of orderedItems) {
        const orderItem = order.orderedItem.find(oi => oi._id.toString() === itemUpdate.itemId);
        if (orderItem && itemUpdate.productStatus && orderItem.productStatus !== itemUpdate.productStatus) {
          if (['Cancelled', 'Returned'].includes(itemUpdate.productStatus) && order.paymentStatus === 'Paid' && ['razorpay', 'wallet', 'cod'].includes(order.paymentMethod)) {
            // Calculate refund amount including proportional coupon discount
            const productPrice = orderItem.totalProductPrice;
            const discountPerProduct = totalDiscount > 0 ? Math.round((productPrice / subtotal) * totalDiscount) : 0;
            const refundAmount = productPrice - discountPerProduct;

            const wallet = await Wallet.findOne({ userId: order.userId }).session(session);
            if (!wallet) {
              await Wallet.create({
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

            // Update stock for the item
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

            refundedItems.push({
              productName: orderItem.productId?.productName || 'Unknown Product',
              refundedAmount: refundAmount
            });
            totalRefundedAmount += refundAmount;
          } else if (['Cancelled', 'Returned'].includes(itemUpdate.productStatus) && order.paymentStatus === 'Pending' && order.paymentMethod === 'cod') {
            // No refund, just update stock
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
          }
          orderItem.productStatus = itemUpdate.productStatus;
        }
      }
    }

    // Update paymentStatus for partial refunds
    if (totalRefundedAmount > 0 && totalRefundedAmount < order.finalTotal && order.paymentStatus === 'Paid') {
      order.paymentStatus = 'Partially Refunded';
    }

    // Update order-level status
    if (orderStatus && !['Cancelled', 'Returned'].includes(orderStatus)) {
      order.orderStatus = orderStatus;
      if (orderStatus === 'Shipped' && !order.shippingDate) {
        order.shippingDate = new Date();
      }
      if (orderStatus === 'Delivered' && !order.deliveryDate) {
        order.deliveryDate = new Date();
      }
    }

    if (paymentStatus && !refundedItems.length) {
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
      orderItem.productStatus = 'Returned';
      orderItem.returnStatus = 'Approved';
      orderItem.returnApproved = true;
      orderItem.returnApprovedDate = new Date();
      orderItem.returnNotes = notes || '';

      if (order.paymentStatus === 'Paid' && ['razorpay', 'wallet', 'cod'].includes(order.paymentMethod)) {
        // Calculate refund amount including proportional coupon discount
        const subtotal = order.orderedItem.reduce((sum, item) => sum + item.totalProductPrice, 0);
        const totalDiscount = order.couponDiscount || 0;
        const productPrice = orderItem.totalProductPrice;
        const discountPerProduct = totalDiscount > 0 ? Math.round((productPrice / subtotal) * totalDiscount) : 0;
        const refundAmount = productPrice - discountPerProduct;

        const wallet = await Wallet.findOne({ userId: order.userId }).session(session);
        if (!wallet) {
          await Wallet.create({
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

        // Update stock
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

        refundedItems.push({
          productName: orderItem.productId?.name || 'Unknown Product',
          refundedAmount: refundAmount
        });

        // Update paymentStatus if necessary
        const totalRefundedAmount = order.orderedItem.reduce((sum, item) => {
          if (['Cancelled', 'Returned'].includes(item.productStatus)) {
            const itemDiscount = totalDiscount > 0 ? Math.round((item.totalProductPrice / subtotal) * totalDiscount) : 0;
            return sum + item.totalProductPrice - itemDiscount;
          }
          return sum;
        }, refundAmount);

        if (totalRefundedAmount >= order.finalTotal) {
          order.paymentStatus = 'Refunded';
        } else if (totalRefundedAmount > 0) {
          order.paymentStatus = 'Partially Refunded';
        }
      } else if (order.paymentStatus === 'Pending' && order.paymentMethod === 'cod') {
        // No refund, just update stock
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
      }
    } else if (action === 'reject') {
      orderItem.productStatus = 'Return Rejected';
      orderItem.returnStatus = 'Rejected';
      orderItem.returnApproved = false;
      orderItem.returnNotes = notes || '';
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