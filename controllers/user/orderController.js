const  User = require("../../models/userSchema")
const Product = require("../../models/productSchema")
const Cart = require("../../models/cartSchema")
const Address = require("../../models/addressSchema")
const Orders = require("../../models/orderSchema")
const PDFDocument = require('pdfkit'); 
const mongoose = require('mongoose');


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
        details: stockValidationErrors
      });
    }

    // Calculate totals
    let totalAmount = 0;
    const orderedItem = validCartItems.map((item) => {
      const productPrice = item.offerPrice || item.price;
      const itemTotal = productPrice * item.quantity;
      totalAmount += itemTotal;

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

    // Apply shipping charge if total > 1000
    let shippingCharge = 0;
    if (totalAmount > 1000) {
      shippingCharge = 100;
      totalAmount += shippingCharge;
    }

    const orderNumber = "ORD" + Math.floor(Math.random() * 1000000);

    const newOrder = new Orders({
      userId,
      cartId: cart._id,
      orderedItem,
      deliveryAddress: addressId,
      orderAmount: totalAmount,
      shippingCharge,
      deliveryDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      shippingDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      paymentMethod: paymentMethod || "cod",
      paymentStatus: "Pending",
      orderNumber,
      orderStatus: "Pending"
    });

    await newOrder.save();

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

    // Clear cart
    await Cart.deleteOne({ userId });
    req.session.cartItem = 0;

    res.json({
      success: true,
      orderId: newOrder._id,
      orderNumber: newOrder.orderNumber,
      orderAmount: newOrder.orderAmount,
      shippingCharge,
      message: "Order placed successfully!"
    });

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

// const orderList = async (req,res) => {
//   try {
    
//    const userId = req.session.user

//    if(!userId){
//     return res.status(400).json({success:false,message:"User not found"})
//    }

//    const order = Order.findById({userId}).populate(Order)
   
   
 

//   const searchQuery = req.query.search || ""
//   const page = parseInt(req.query.page ) || 1
//    const limit = 6;

//    let query = {}

//    if(searchQuery.trim()!==""){
//     query.Order = {$regex: searchQuery , $options :"i"}
//    }

//    const totalItems = Order.countDocuments(query)

//    const orders = Orders.findById({userId}).populate({
//       orderId,
//       totalItems,
//       totalAmount,
//       paymentStatus,
//       shippingDate
//    }).sort((page-1)*limit)
//    .limit(limit)
//    .lean()


//    const totalPage = Math.ceil(totalItems/limit)
  

//    res.render("orders",{
//     orderId,
//     totalPages,
//     totalItems,
//     searchQuery
//    })



//   } catch (error) {
//      next(error)
//   }
// }


// Render user orders page
const loadOrdersPage = async (req, res) => {
    try {
        res.render('orderList', { 
            user: req.session.user,
            title: 'My Orders'
        });
    } catch (error) {
        console.error('Error rendering user orders page:', error);
        res.status(500).render('error', { 
            message: 'Failed to load orders page',
            user: req.session.user 
        });
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

// Get single order details for user

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

        // First, get the order without population to see what's stored
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
        console.log('Order data:', JSON.stringify(order, null, 2));

        // If deliveryAddress is an ObjectId, populate it separately
        if (order.deliveryAddress && mongoose.Types.ObjectId.isValid(order.deliveryAddress)) {
            
            const address = await Address.findById(order.deliveryAddress).lean();
            order.deliveryAddress = address;
            console.log('Populated address:', address);
        }

        // Populate product data
        if (order.orderedItem && order.orderedItem.length > 0) {
          
            
            for (let item of order.orderedItem) {
                if (item.productId && mongoose.Types.ObjectId.isValid(item.productId)) {
                    const product = await Product.findById(item.productId)
                        .select('productName productImage productPrice stock status')
                        .lean();
                    item.productId = product;
                    
                    // Process images
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

        // Check if order can be cancelled (allow more statuses than just 'Pending')
        const nonCancellableStatuses = ['Delivered', 'Cancelled', 'Shipped'];
        if (nonCancellableStatuses.includes(order.orderStatus)) {
            return res.status(400).json({
                success: false,
                message: `Order cannot be cancelled as it's already ${order.orderStatus}`
            });
        }

        // Update stock for all items in the order
        for (const item of order.orderedItem) {
            if (item.productId && item.productStatus !== 'Cancelled') {
                const quantity = Number(item.quantity);
                
                // Update totalStock instead of stock
                await Product.findByIdAndUpdate(
                    item.productId._id,
                    { 
                        $inc: { totalStock: quantity },
                        $set: { status: "Available" }
                    }
                );
                
                console.log(`Restored ${quantity} units to product: ${item.productId._id}`);
            }
        }

        // Update order status to cancelled
        order.orderStatus = 'Cancelled';
        order.cancelledAt = new Date();
        
        // Update all item statuses to cancelled
        order.orderedItem.forEach(item => {
            if (item.productStatus !== 'Cancelled') {
                item.productStatus = 'Cancelled';
            }
        });

        await order.save();

        console.log(`Order ${orderId} cancelled successfully`);

        res.json({
            success: true,
            message: 'Order cancelled successfully',
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

// Cancel individual item
const cancelItem = async (req, res) => {
    try {
        const { orderId, productId, itemIndex } = req.body;
        const userId = req.session.user;

        console.log('Cancel Item Request:', {
            orderId,
            productId,
            itemIndex,
            userId
        });

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User not authenticated'
            });
        }

        // Find the order with populated product details
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

        // Verify the product ID matches
        if (item.productId._id.toString() !== productId) {
            return res.status(400).json({
                success: false,
                message: 'Product ID mismatch'
            });
        }

        // Check if item can be cancelled
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

        console.log('Updating stock for product:', productId, 'Quantity:', quantity);

        // Update the product stock - using totalStock field
        const updateResult = await Product.findByIdAndUpdate(
            productId,
            { 
                $inc: { totalStock: quantity },
                $set: { 
                    status: "Available" // Ensure status is updated to Available
                }
            },
            { new: true, runValidators: true }
        );

        if (!updateResult) {
            return res.status(404).json({
                success: false,
                message: 'Product not found during stock update'
            });
        }

        console.log('Stock update successful. New totalStock:', updateResult.totalStock);

        // Update item status in the order
        order.orderedItem[index].productStatus = 'Cancelled';
        order.orderedItem[index].cancelledAt = new Date();

        // Update overall order status based on all items
        const activeItems = order.orderedItem.filter(item => 
            !['Cancelled', 'Returned'].includes(item.productStatus)
        );
        
        if (activeItems.length === 0) {
            // All items are cancelled or returned
            order.orderStatus = 'Cancelled';
        } else if (order.orderStatus === 'Cancelled') {
            // If some items are still active, change status back to appropriate status
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

        // Populate the updated order for response if needed
        await order.populate('orderedItem.productId', 'productName productImage');

        res.json({
            success: true,
            message: 'Item cancelled successfully',
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
                    newTotalStock: updateResult.totalStock
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

// Request return for individual item
const returnItem = async (req, res) => {
    try {
        const { orderId, productId, itemIndex, returnReason } = req.body;
        const userId = req.session.user

        if (!userId) {
            return res.json({
                success: false,
                message: 'User not authenticated'
            });
        }

        const order = await Orders.findOne({ _id: orderId, userId: userId });

        if (!order) {
            return res.json({
                success: false,
                message: 'Order not found'
            });
        }

        const item = order.orderedItem[itemIndex];
        
        if (!item || item.productId.toString() !== productId) {
            return res.json({
                success: false,
                message: 'Item not found'
            });
        }

        // Check if item can be returned
        if (item.productStatus !== 'Delivered') {
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

        await order.save();

        res.json({
            success: true,
            message: 'Return request submitted successfully'
        });

    } catch (error) {
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
                path: 'deliveryAddress'
            })
            .populate({
                path: 'userId',
                select: 'name email'
            })
            .lean();

        // Debug: Check the address structure
        console.log('Delivery Address:', order.deliveryAddress);
        console.log('Address Array:', order.deliveryAddress?.address);

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
    
    // Shipping Information - FIXED: Handle nested address array
    doc.fontSize(12).font('Helvetica-Bold')
       .text('Shipping Information:', 300, 170);
    
    // Check if deliveryAddress exists and has address array with at least one item
    if (order.deliveryAddress && order.deliveryAddress.address && order.deliveryAddress.address.length > 0) {
        const shippingAddress = order.deliveryAddress.address[0]; // Get first address from array
        
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
        
        yPosition += 20;
    });
    
    // Adjust yPosition for totals based on address height
    const totalsY = order.deliveryAddress && order.deliveryAddress.address && order.deliveryAddress.address.length > 0 ? yPosition + 40 : yPosition + 20;
    
    // Totals
    doc.fontSize(11).font('Helvetica-Bold')
       .text('Subtotal:', 350, totalsY)
       .text(`₹${subtotal.toFixed(2)}`, 450, totalsY);
    
    if (discount > 0) {
        doc.text('Discount:', 350, totalsY + 20)
           .text(`-₹${discount.toFixed(2)}`, 450, totalsY + 20);
    }
    
    doc.text('Shipping:', 350, totalsY + 40)
       .text('100', 450, totalsY + 40);
    
    doc.fontSize(14)
       .text('Grand Total:', 350, totalsY + 70)
       .text(`₹${(order.orderAmount || 0).toFixed(2)}`, 450, totalsY + 70);
    
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
                ${order.deliveryAddress ? `
                <div class="info-row">
                    <span class="info-label">Name:</span>
                    <span>${order.deliveryAddress.firstName} ${order.deliveryAddress.lastName}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Phone:</span>
                    <span>${order.deliveryAddress.phone || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Address:</span>
                    <span>${order.deliveryAddress.street}, ${order.deliveryAddress.city}, ${order.deliveryAddress.state} - ${order.deliveryAddress.zipCode}</span>
                </div>
                ` : '<p>No shipping address available</p>'}
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
                    <td>${item.productId ? item.productId.productName : 'Product not found'}</td>
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
                <span>Shipping: 100</span>
                <span>Free</span>
            </div>
            <div class="total-row grand-total">
                <span>Grand Total:</span>
                <span>₹${order.orderAmount.toFixed(2)}</span>
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


   

module.exports = {
    placeOrder,
    orderSuccessPage,
    loadOrdersPage,
    getUserOrders,
    getUserOrderDetails,
    cancelOrder,
    cancelItem,
    returnItem,
    generateInvoice
    



}