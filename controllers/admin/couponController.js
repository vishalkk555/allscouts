const Coupon = require("../../models/couponSchema")
const mongoose = require("mongoose") 


const getAddCoupon = async (req,res,next) => {
    try {

      res.render('addCoupon')
        
    } catch (error) {
        next(error)
    }
}


const createCoupon = async (req, res, next) => {
    try {
        const {
            couponCode,
            type,
            discount,
            status,
            minPurchase,
            maxRedeem,
            expiry,
            description
        } = req.body;

        // Required fields
        if (!couponCode || !type || !discount || !minPurchase || !expiry) {
            return res.status(400).json({
                success: false,
                message: 'All required fields must be provided'
            });
        }

        // Coupon code format
        if (!/^[A-Z0-9]+$/.test(couponCode)) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code must contain only letters and numbers'
            });
        }

        // Check duplicate
        const existingCoupon = await Coupon.findOne({ couponCode: couponCode.toUpperCase() });
        if (existingCoupon) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code already exists'
            });
        }

        const discountValue = parseFloat(discount);
        if (discountValue <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Discount must be greater than 0'
            });
        }

        if (type === 'percentageDiscount') {
            if (discountValue >= 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Percentage discount cannot exceed 100%'
                });
            }
            if (!maxRedeem || parseFloat(maxRedeem) <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Max discount cap is required for percentage coupons'
                });
            }
        }

        const minPurchaseValue = parseFloat(minPurchase);
        if (minPurchaseValue < 0) {
            return res.status(400).json({
                success: false,
                message: 'Minimum purchase amount cannot be negative'
            });
        }

        // Fixed discount cannot exceed min purchase
        if (type === 'flatDiscount' && discountValue > minPurchaseValue) {
            return res.status(400).json({
                success: false,
                message: 'Fixed discount cannot be greater than minimum purchase amount'
            });
        }

        const expiryDate = new Date(expiry);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (expiryDate < today) {
            return res.status(400).json({
                success: false,
                message: 'Expiry date must be today or in the future'
            });
        }

        // Build coupon object
        const couponData = {
            couponCode: couponCode.toUpperCase(),
            type,
            discount: discountValue,
            minPurchase: minPurchaseValue,
            expiry: expiryDate,
            status: true,
            description: description || ''
        };

        // Only add maxRedeem if percentage
        if (type === 'percentageDiscount') {
            couponData.maxRedeem = parseFloat(maxRedeem);
        }
        // For flat: maxRedeem stays undefined → Mongo won't save it

        const newCoupon = new Coupon(couponData);
        await newCoupon.save();

        res.status(201).json({
            success: true,
            message: 'Coupon created successfully',
            coupon: newCoupon
        });

    } catch (error) {
        next(error);
    }
};

const getCouponPage = async(req,res,next) => {
    try{
    
      const page = parseInt(req.query.page) || 1;
        const limit = 4; // Items per page
        const skip = (page - 1) * limit;
        const searchQuery = req.query.search || '';

        // Build search filter
        let filter = {};
        if (searchQuery) {
            filter.couponCode = { $regex: searchQuery, $options: 'i' };
        }

        // Get total count for pagination
        const totalCoupons = await Coupon.countDocuments(filter);
        const totalPages = Math.ceil(totalCoupons / limit);

        // Fetch coupons with pagination
        const coupons = await Coupon.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.render('coupons', {
            title: 'Coupons',
            coupons,
            currentPage: page,
            totalPages,
            totalCoupons,
            limit,
            searchQuery
        });

    }catch{
        next(error)
    }
}


const toggleCouponStatus = async (req, res) => {
    try {
        const { id } = req.params;

        const coupon = await Coupon.findById(id);

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        // Check if coupon is expired
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const expiryDate = new Date(coupon.expiry);
        expiryDate.setHours(0, 0, 0, 0);

        if (expiryDate < today) {
            return res.status(400).json({
                success: false,
                message: 'Cannot modify status of expired coupon'
            });
        }

        // Toggle status
        coupon.status = !coupon.status;
        await coupon.save();

        res.status(200).json({
            success: true,
            message: `Coupon ${coupon.status ? 'activated' : 'deactivated'} successfully`,
            status: coupon.status
        });

    } catch (error) {
        console.error('Error toggling coupon status:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating coupon status'
        });
    }
};



 const getEditCoupon = async (req, res,next) => {
    try {
        const { id } = req.params;

        const coupon = await Coupon.findById(id);

        if (!coupon) {
            return res.status(404).render('admin/error', {
                title: 'Coupon Not Found',
                message: 'The coupon you are looking for does not exist'
            });
        }

        res.render('editCoupon', {
            title: 'Edit Coupon',
            coupon
        });
    } catch (error) {
        next(error)
    }
};


// Update coupon
const updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            couponCode,
            type,
            discount,
            status,
            minPurchase,
            maxRedeem,
            expiry,
            description
        } = req.body;

        const existingCoupon = await Coupon.findById(id);
        if (!existingCoupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found' });
        }

        // Required fields
        if (!couponCode || !type || !discount || !minPurchase || !expiry) {
            return res.status(400).json({ success: false, message: 'All required fields must be provided' });
        }

        if (!/^[A-Z0-9]+$/.test(couponCode)) {
            return res.status(400).json({ success: false, message: 'Coupon code: uppercase letters & numbers only' });
        }

        // Check duplicate (exclude self)
        const duplicate = await Coupon.findOne({ couponCode: couponCode.toUpperCase(), _id: { $ne: id } });
        if (duplicate) {
            return res.status(400).json({ success: false, message: 'Coupon code already exists' });
        }

        const discountValue = parseFloat(discount);
        if (discountValue <= 0) {
            return res.status(400).json({ success: false, message: 'Discount must be > 0' });
        }

        if (type === 'percentageDiscount') {
            if (discountValue >= 100) {
                return res.status(400).json({ success: false, message: 'Percentage must be < 100%' });
            }
            if (!maxRedeem || parseFloat(maxRedeem) <= 0) {
                return res.status(400).json({ success: false, message: 'Max discount cap required for percentage coupons' });
            }
        }

        const minPurchaseValue = parseFloat(minPurchase);
        if (minPurchaseValue < 0) {
            return res.status(400).json({ success: false, message: 'Min purchase ≥ 0' });
        }

        if (type === 'flatDiscount' && discountValue > minPurchaseValue) {
            return res.status(400).json({ success: false, message: 'Fixed discount cannot exceed min purchase' });
        }

        const expiryDate = new Date(expiry);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (expiryDate < today) {
            return res.status(400).json({ success: false, message: 'Expiry must be today or later' });
        }

        // Build update
        existingCoupon.couponCode = couponCode.toUpperCase();
        existingCoupon.type = type;
        existingCoupon.discount = discountValue;
        existingCoupon.status = status === true || status === 'true';
        existingCoupon.minPurchase = minPurchaseValue;
        existingCoupon.expiry = expiryDate;
        existingCoupon.description = description || '';

        if (type === 'percentageDiscount') {
            existingCoupon.maxRedeem = parseFloat(maxRedeem);
        }
        // For flat: maxRedeem not sent → leave as-is or null if needed

        await existingCoupon.save();

        res.status(200).json({
            success: true,
            message: 'Coupon updated successfully',
            coupon: existingCoupon
        });

    } catch (error) {
        console.error('Error updating coupon:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};


module.exports = {
    getAddCoupon,
    createCoupon,
    getCouponPage,
    toggleCouponStatus,
    getEditCoupon,
    updateCoupon
}