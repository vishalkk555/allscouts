const Wallet = require("../../models/walletSchema");
const User = require("../../models/userSchema");
const Orders = require("../../models/orderSchema");
const Product = require("../../models/productSchema");

const getWalletPage = async (req, res) => {
    try {
        const userId = req.session.user;

        if (!userId) {
            return res.redirect('/login');
        }

        const page = parseInt(req.query.page) || 1;
        const limit = 10;

        let wallet = await Wallet.findOne({ userId });

        if (!wallet) {
            wallet = new Wallet({
                userId: userId,
                balance: 0,
                transaction: []
            });
            await wallet.save();
        }
        const user = await User.findById(userId);

        // Get total transactions count
        const totalTransactions = wallet.transaction.length;
        const totalPages = Math.ceil(totalTransactions / limit);

        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        
        const paginatedTransactions = wallet.transaction
            .slice()
            .reverse()
            .slice(startIndex, endIndex);

        // Enhance transactions with order and product details
        const enhancedTransactions = await Promise.all(
            paginatedTransactions.map(async (transaction) => {
                const enhancedTransaction = { ...transaction.toObject() };
                
                if (transaction.orderId) {
                    try {
                        const order = await Orders.findById(transaction.orderId)
                            .populate({
                                path: 'orderedItem.productId',
                                select: 'productName'
                            })
                            .lean();
                        
                        if (order) {
                            enhancedTransaction.orderDetails = {
                                orderNumber: order.orderNumber || order._id.toString().slice(-8).toUpperCase(),
                                orderStatus: order.orderStatus,
                                paymentMethod: order.paymentMethod,
                                productNames: order.orderedItem.map(item => 
                                    item.productId ? item.productId.productName : 'Product not found'
                                ).join(', '),
                                totalItems: order.orderedItem.length
                            };
                        }
                    } catch (error) {
                        console.error('Error fetching order details:', error);
                        enhancedTransaction.orderDetails = {
                            orderNumber: transaction.orderId.toString().slice(-8).toUpperCase(),
                            error: 'Order details not available'
                        };
                    }
                }
                
                // Add more descriptive transaction method
                enhancedTransaction.description = transaction.description || getTransactionDescription(transaction);
                
                return enhancedTransaction;
            })
        );

        res.render('wallet', {
            title: 'My Wallet',
            wallet,
            user,
            transactions: enhancedTransactions,
            currentPage: page,
            totalPages,
            totalTransactions,
            limit
        });

    } catch (error) {
        console.error('Error fetching wallet:', error);
        res.status(500).send('Server Error');
    }
};

// Helper function to generate transaction descriptions
const getTransactionDescription = (transaction) => {
    const method = transaction.transactionsMethod;
    const amount = transaction.amount;
    
    switch (method) {
        case 'Payment':
            return `Payment for order`;
        case 'Refund':
            return `Refund for cancelled/returned items`;
        case 'Credit':
            return `Wallet top-up`;
        case 'Razorpay':
            return `Payment via Razorpay`;
        case 'Referral':
            return `Referral bonus`;
        default:
            return method || 'Transaction';
    }
};

module.exports = {
    getWalletPage
};


