const Coupon = require("../../models/couponSchema")
const mongoose = require("mongoose") 


const getAddCoupon = async (req,res,next) => {
    try {

      res.render('addCoupon')
        
    } catch (error) {
        next(error)
    }
}


const createCoupon = async(req,res,next) => {
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

        // Server-side validation
        if (!couponCode || !type || !discount || !minPurchase || !maxRedeem || !expiry) {
            return res.status(400).json({
                success: false,
                message: 'All required fields must be provided'
            });
        }

        if (!/^[A-Z0-9]+$/.test(couponCode)) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code must contain only letters and numbers'
            });
        }

        const existingCoupon = await Coupon.findOne({ 
            couponCode: couponCode.toUpperCase() 
        });

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
    if (discountValue <= 0 || discountValue >= 100) {
        return res.status(400).json({
            success: false,
            message: 'Percentage discount must be greater than 0% and less than 100%'
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

        // Validate that fixed discount doesn't exceed min purchase
        if (type === 'flatDiscount' && discountValue > minPurchaseValue) {
            return res.status(400).json({
                success: false,
                message: 'Fixed discount cannot be greater than minimum purchase amount'
            });
        }

        const maxRedeemValue = parseInt(maxRedeem);
        if (maxRedeemValue <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Maximum redemption must be greater than 0'
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

        const newCoupon = new Coupon({
            couponCode: couponCode.toUpperCase(),
            type,
            discount: discountValue,
            status: status === true || status === 'true',
            minPurchase: minPurchaseValue,
            maxRedeem: maxRedeemValue,
            expiry: expiryDate,
            description: description || ''
        });

        await newCoupon.save();

        res.status(201).json({
            success: true,
            message: 'Coupon created successfully',
            coupon: newCoupon
        });

    } catch (error) {
       next(error)
    }
}

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

    // Check if coupon exists
    const existingCoupon = await Coupon.findById(id);
    if (!existingCoupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    // Validate required fields
    if (!couponCode || !type || !discount || !minPurchase || !maxRedeem || !expiry) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided'
      });
    }

    // Validate coupon code format
    if (!/^[A-Z0-9]+$/.test(couponCode)) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code must contain only uppercase letters and numbers'
      });
    }

    // Check for duplicate coupon code (excluding current one)
    const duplicateCoupon = await Coupon.findOne({
      couponCode: couponCode.toUpperCase(),
      _id: { $ne: id }
    });

    if (duplicateCoupon) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code already exists'
      });
    }

    // Validate discount value
    const discountValue = parseFloat(discount);
    if (isNaN(discountValue) || discountValue <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Discount must be a number greater than 0'
      });
    }

    // ✅ FIX: Prevent 100% discount
    if (type === 'percentageDiscount') {
      if (discountValue >= 100) {
        return res.status(400).json({
          success: false,
          message: 'Percentage discount must be greater than 0% and less than 100%'
        });
      }
    }

    // Validate minimum purchase
    const minPurchaseValue = parseFloat(minPurchase);
    if (isNaN(minPurchaseValue) || minPurchaseValue < 0) {
      return res.status(400).json({
        success: false,
        message: 'Minimum purchase amount cannot be negative'
      });
    }

    // For flat discount, ensure discount isn't more than min purchase
    if (type === 'flatDiscount' && discountValue > minPurchaseValue) {
      return res.status(400).json({
        success: false,
        message: 'Flat discount cannot exceed minimum purchase amount'
      });
    }

    // Validate max redeem
    const maxRedeemValue = parseInt(maxRedeem);
    if (isNaN(maxRedeemValue) || maxRedeemValue <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Maximum redemption must be greater than 0'
      });
    }

    // Validate expiry date
    const expiryDate = new Date(expiry);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (expiryDate < today) {
      return res.status(400).json({
        success: false,
        message: 'Expiry date must be today or in the future'
      });
    }

    // Update coupon fields
    existingCoupon.couponCode = couponCode.toUpperCase();
    existingCoupon.type = type;
    existingCoupon.discount = discountValue;
    existingCoupon.status = status === true || status === 'true';
    existingCoupon.minPurchase = minPurchaseValue;
    existingCoupon.maxRedeem = maxRedeemValue;
    existingCoupon.expiry = expiryDate;
    existingCoupon.description = description || '';

    await existingCoupon.save();

    res.status(200).json({
      success: true,
      message: 'Coupon updated successfully',
      coupon: existingCoupon
    });

  } catch (error) {
    console.error('Error updating coupon:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating coupon'
    });
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