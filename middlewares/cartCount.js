const Cart = require('../models/cartSchema');

const getCartCount = async (req, res, next) => {
    try {
        // Check if session exists and has user
        if (req.session && req.session.user && req.session.user._id) {
            const cart = await Cart.findOne({ userId: req.session.user._id });
            res.locals.cartCount = cart && cart.item ? cart.item.length : 0;
        } else {
            res.locals.cartCount = 0;
        }
        next();
    } catch (error) {
        console.error('Error fetching cart count:', error);
        res.locals.cartCount = 0;
        next();
    }
};

module.exports = getCartCount;