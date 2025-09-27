const Product = require("../../models/productSchema");
const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema")
const Orders = require("../../models/orderSchema")
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
      .populate('orderedItem.productId', 'name price images')
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
            .populate('orderedItem.productId', 'name productImage price description')
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
    try {
        const orderId = req.params.id;
        const { orderStatus, paymentStatus, orderedItems } = req.body;
        
        const order = await Orders.findById(orderId);
        if (!order) {
            return res.json({ success: false, message: 'Order not found' });
        }
        
        // Update order-level status
        if (orderStatus) {
            order.orderStatus = orderStatus;
            
            // Update dates based on status
            if (orderStatus === 'Shipped' && !order.shippingDate) {
                order.shippingDate = new Date();
            }
            if (orderStatus === 'Delivered' && !order.deliveryDate) {
                order.deliveryDate = new Date();
            }
        }
        
        if (paymentStatus) {
            order.paymentStatus = paymentStatus;
        }
        
        // Update individual product statuses
        if (orderedItems && Array.isArray(orderedItems)) {
            orderedItems.forEach(item => {
                const orderItem = order.orderedItem.find(oi => 
                    oi._id.toString() === item.itemId
                );
                if (orderItem && item.productStatus) {
                    orderItem.productStatus = item.productStatus;
                }
            });
        }
        
        await order.save();
        
        res.json({ 
            success: true, 
            message: 'Order updated successfully',
            redirectUrl: `/admin/orders/${orderId}`
        });
        
    } catch (error) {
        console.error('Error updating order:', error);
        res.json({ success: false, message: 'Failed to update order', error: error.message });
    }
};

// POST /admin/orders/:id/return-request/:itemId - Handle return request
const handleReturnRequest = async (req, res) => {
    try {
        const { id: orderId, itemId } = req.params;
        const { action, notes } = req.body; // action: 'approve' or 'reject'
        
        const order = await Orders.findById(orderId);
        if (!order) {
            return res.json({ success: false, message: 'Order not found' });
        }
        
        const orderItem = order.orderedItem.find(item => 
            item._id.toString() === itemId
        );
        
        if (!orderItem) {
            return res.json({ success: false, message: 'Order item not found' });
        }
        
        if (action === 'approve') {
            orderItem.productStatus = 'Return Approved';
            orderItem.returnStatus = 'Approved';
            orderItem.returnApproved = true;
            orderItem.returnApprovedDate = new Date();
            orderItem.returnNotes = notes || '';
        } else if (action === 'reject') {
            orderItem.productStatus = 'Return Rejected';
            orderItem.returnStatus = 'Rejected';
            orderItem.returnApproved = false;
            orderItem.returnNotes = notes || '';
        }
        
        await order.save();
        
        res.json({ 
            success: true, 
            message: `Return request ${action}d successfully`,
            redirectUrl: `/admin/orders/${orderId}`
        });
        
    } catch (error) {
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