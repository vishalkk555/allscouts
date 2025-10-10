const Offer = require("../../models/offerSchema")
const Product = require("../../models/productSchema")
const Category = require("../../models/categorySchema")


const getAddOfferPage = async (req, res,next) => {
    try {
        const categories = await Category.find({ isActive: true }).sort({ name: 1 });
   
        const products = await Product.find({ 
            isBlocked: false,
            status: 'Available'
        }).sort({ productName: 1 });

        res.render('addOffer', {
            title: 'Add Offer',
            categories,
            products
        });
    } catch (error) {
       next(error)
    }
};

const addOffer =  async(req,res,next) => {
    try{
     
        const {offerName , discount , type , startDate , endDate , productId , categoryId , status } = req.body

        if(!offerName || !discount || !type || !startDate || !endDate || !productId || !categoryId | !status){
            return res.status(400).json({success:false , message:"Fields need to be filled propelry"})
        }

       if(offerName.length<3){
        return res.status(400).json({success:false ,message:"Offername should be more than 3 "})
       }

       const existingOffer = await Offer.find({offerName})

       if(existingOffer){
        return res.status(400).json({success:false, message:"Offer already existing"})
       }
       
        if(discount >= 100 && discount <0){
            return res.status(400).json({success:false, message:"Discount value should be betweeen 0 and 100"})
        }

        // date validation

        const newOffer = new Offer({
            offerName , 
            offerType,
            startDate,
            endDate,
            productId,
            categoryId,
            status
        })

        await newOffer.save()

        return res.status(201).json({success:true, message:"New OFfer saved succssfully"})

    }catch(error){
        next(error)
    }
}


// Create new offer
const createOffer = async (req, res) => {
    try {
        const {
            offerName,
            discount,
            offerType,
            categoryId,
            productId,
            startDate,
            endDate
        } = req.body;

        if (!offerName || !discount || !offerType || !startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'All required fields must be provided'
            });
        }

        if (offerName.length < 3) {
            return res.status(400).json({
                success: false,
                message: 'Offer name must be at least 3 characters'
            });
        }

        const discountValue = parseFloat(discount);
        if (isNaN(discountValue) || discountValue < 1 || discountValue > 100) {
            return res.status(400).json({
                success: false,
                message: 'Discount must be between 1% and 100%'
            });
        }

        if (!['category', 'product'].includes(offerType)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid offer type'
            });
        }

        if (offerType === 'category') {
            if (!categoryId || !Array.isArray(categoryId) || categoryId.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Please select at least one category'
                });
            }
        } else if (offerType === 'product') {
            if (!productId || !Array.isArray(productId) || productId.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Please select at least one product'
                });
            }
        }

        const existingOffer = await Offer.findOne({ offerName: offerName.trim() });
             if (existingOffer) {
             return res.status(400).json({
              success: false,
               message: 'An offer with this name already exists'
         });
      }

        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (startDateObj < today) {
            return res.status(400).json({
                success: false,
                message: 'Start date must be today or in the future'
            });
        }

        if (endDateObj <= startDateObj) {
            return res.status(400).json({
                success: false,
                message: 'End date must be after start date'
            });
        }

        const overlappingQuery = {
            offerType: offerType,
            status: true,
            $or: [
                {
                    startDate: { $lte: endDateObj },
                    endDate: { $gte: startDateObj }
                }
            ]
        };

        if (offerType === 'category') {
            overlappingQuery.categoryId = { $in: categoryId };
        } else {
            overlappingQuery.productId = { $in: productId };
        }

        const overlappingOffer = await Offer.findOne(overlappingQuery);

        if (overlappingOffer) {
            return res.status(400).json({
                success: false,
                message: `An active offer already exists for the selected ${offerType}(s) during this time period`
            });
        }

        const newOffer = new Offer({
            offerName,
            discount: discountValue,
            offerType,
            startDate: startDateObj,
            endDate: endDateObj,
            categoryId: offerType === 'category' ? categoryId : [],
            productId: offerType === 'product' ? productId : [],
            status: true
        });

        await newOffer.save();

        res.status(201).json({
            success: true,
            message: 'Offer created successfully',
            offer: newOffer
        });

    } catch (error) {
        next(error)
    }
};


const getOffersPage = async (req, res ,next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4; 
        const skip = (page - 1) * limit;
        const searchQuery = req.query.search || '';

        let filter = {};
        if (searchQuery) {
            filter.offerName = { $regex: searchQuery, $options: 'i' };
        }

        const totalOffers = await Offer.countDocuments(filter);
        const totalPages = Math.ceil(totalOffers / limit);

        const offers = await Offer.find(filter)
            .populate('categoryId', 'name')
            .populate('productId', 'productName')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        res.render('offers', {
            title: 'Offers',
            offers,
            currentPage: page,
            totalPages,
            totalOffers,
            limit,
            searchQuery
        });
    } catch (error) {
       next(error)
    }
};


// Toggle offer status (Block/Unblock)
const toggleOfferStatus = async (req, res , next) => {
    try {
        const { id } = req.params;

        const offer = await Offer.findById(id);

        if (!offer) {
            return res.status(404).json({
                success: false,
                message: 'Offer not found'
            });
        }
        // Check if offer is expired
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = new Date(offer.endDate);
        endDate.setHours(0, 0, 0, 0);

        if (endDate < today) {
            return res.status(400).json({
                success: false,
                message: 'Cannot modify status of expired offer'
            });
        }

        // Toggle status
        offer.status = !offer.status;
        await offer.save();

        res.status(200).json({
            success: true,
            message: `Offer ${offer.status ? 'activated' : 'deactivated'} successfully`,
            status: offer.status
        });

    } catch (error) {
        next(error)
    }
};


// Get edit offer page
const getEditOfferPage = async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch the offer with populated references
        const offer = await Offer.findById(id)
            .populate('categoryId', 'name')
            .populate('productId', 'productName');

        if (!offer) {
            return res.status(404).render('admin/error', {
                title: 'Offer Not Found',
                message: 'The offer you are looking for does not exist'
            });
        }

        // Fetch all active categories
        const categories = await Category.find({ isActive: true }).sort({ name: 1 });
        
        // Fetch all available products (not blocked and in stock)
        const products = await Product.find({ 
            isBlocked: false,
            status: 'Available'
        }).sort({ productName: 1 });

        res.render('editOffer', {
            title: 'Edit Offer',
            offer,
            categories,
            products
        });
    } catch (error) {
        console.error('Error fetching offer for edit:', error);
        res.status(500).send('Server Error');
    }
};

// Update offer
const updateOffer = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            offerName,
            discount,
            offerType,
            categoryId,
            productId,
            startDate,
            endDate
        } = req.body;

        // Find existing offer
        const existingOffer = await Offer.findById(id);

        if (!existingOffer) {
            return res.status(404).json({
                success: false,
                message: 'Offer not found'
            });
        }

        // Server-side validation
        if (!offerName || !discount || !offerType || !startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'All required fields must be provided'
            });
        }

        // Validate offer name
        if (offerName.length < 3) {
            return res.status(400).json({
                success: false,
                message: 'Offer name must be at least 3 characters'
            });
        }

        // Validate discount
        const discountValue = parseFloat(discount);
        if (isNaN(discountValue) || discountValue < 1 || discountValue > 100) {
            return res.status(400).json({
                success: false,
                message: 'Discount must be between 1% and 100%'
            });
        }

        // Validate offer type
        if (!['category', 'product'].includes(offerType)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid offer type'
            });
        }

        // Validate category or product selection
        if (offerType === 'category') {
            if (!categoryId || !Array.isArray(categoryId) || categoryId.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Please select at least one category'
                });
            }
        } else if (offerType === 'product') {
            if (!productId || !Array.isArray(productId) || productId.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Please select at least one product'
                });
            }
        }

        // Validate dates
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (startDateObj < today) {
            return res.status(400).json({
                success: false,
                message: 'Start date must be today or in the future'
            });
        }

        if (endDateObj <= startDateObj) {
            return res.status(400).json({
                success: false,
                message: 'End date must be after start date'
            });
        }

        // Check for overlapping offers (excluding current offer)
        const overlappingQuery = {
            _id: { $ne: id },
            offerType: offerType,
            status: true,
            $or: [
                {
                    startDate: { $lte: endDateObj },
                    endDate: { $gte: startDateObj }
                }
            ]
        };

        if (offerType === 'category') {
            overlappingQuery.categoryId = { $in: categoryId };
        } else {
            overlappingQuery.productId = { $in: productId };
        }

        const overlappingOffer = await Offer.findOne(overlappingQuery);

        if (overlappingOffer) {
            return res.status(400).json({
                success: false,
                message: `An active offer already exists for the selected ${offerType}(s) during this time period`
            });
        }

        // Update offer
        existingOffer.offerName = offerName;
        existingOffer.discount = discountValue;
        existingOffer.offerType = offerType;
        existingOffer.startDate = startDateObj;
        existingOffer.endDate = endDateObj;
        existingOffer.categoryId = offerType === 'category' ? categoryId : [];
        existingOffer.productId = offerType === 'product' ? productId : [];

        await existingOffer.save();

        res.status(200).json({
            success: true,
            message: 'Offer updated successfully',
            offer: existingOffer
        });

    } catch (error) {
        console.error('Error updating offer:', error);

        // Handle mongoose validation errors
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: messages.join(', ')
            });
        }

        res.status(500).json({
            success: false,
            message: 'Server error while updating offer'
        });
    }
};



module.exports = {
    getAddOfferPage,
    createOffer,
    getOffersPage,
    toggleOfferStatus,
    getEditOfferPage,
    updateOffer
}