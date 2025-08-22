const User = require("../../models/userSchema");
const mongoose = require("mongoose");

const customerInfo = async (req, res) => {
    try {
        let search = req.query.search || "";
        let page = parseInt(req.query.page) || 1;
        const limit = 4;

        const userData = await User.find({
            isAdmin: false,
            $or: [
                { name: { $regex: ".*" + search + ".*", $options: 'i' } },
                { email: { $regex: ".*" + search + ".*", $options: 'i' } }
            ]
        })
        .limit(limit)
        .skip((page - 1) * limit)
        .exec();

        const count = await User.countDocuments({
            isAdmin: false,
            $or: [
                { name: { $regex: ".*" + search + ".*", $options: 'i' } },
                { email: { $regex: ".*" + search + ".*", $options: 'i' } }
            ]
        });

        const totalPages = Math.ceil(count / limit);

        res.render("customers", {
            customers: userData,
            currentPage: page,
            totalPages: totalPages,
            search: search
        });

    } catch (error) {
        console.log("There is an error in loading customer page", error);
        res.status(500).json({ success: false });
    }
};

const getCustomersAPI = async (req, res) => {
    try {
        let search = req.query.search || "";
        let page = parseInt(req.query.page) || 1;
        const limit = 4;

        const userData = await User.find({
            isAdmin: false,
            $or: [
                { name: { $regex: ".*" + search + ".*", $options: 'i' } },
                { email: { $regex: ".*" + search + ".*", $options: 'i' } }
            ]
        })
        .limit(limit)
        .skip((page - 1) * limit)
        .exec();

        const count = await User.countDocuments({
            isAdmin: false,
            $or: [
                { name: { $regex: ".*" + search + ".*", $options: 'i' } },
                { email: { $regex: ".*" + search + ".*", $options: 'i' } }
            ]
        });

        const totalPages = Math.ceil(count / limit);

        res.json({
            success: true,
            users: userData,
            currentPage: page,
            totalPages: totalPages,
            search: search,
            totalCount: count
        });

    } catch (error) {
        console.log("There is an error in fetching customers API", error);
        res.status(500).json({ success: false, message: "Failed to fetch customers" });
    }
};

// Block customer - Fixed version for isBlocked schema
const blockCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log("Attempting to block user with ID:", id);
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            console.log("Invalid ObjectId:", id);
            return res.status(400).json({ success: false, message: "Invalid user ID" });
        }

        // First, find the user to check if it exists
        const existingUser = await User.findById(id);
        if (!existingUser) {
            console.log("User not found:", id);
            return res.status(404).json({ success: false, message: "User not found" });
        }

        console.log("Found user:", existingUser.name, "Current isBlocked:", existingUser.isBlocked);

        // Update the user to blocked
        const user = await User.findByIdAndUpdate(
            id,
            { isBlocked: true },
            { new: true, runValidators: true }
        );

        console.log("Updated user isBlocked:", user.isBlocked);

        res.json({ 
            success: true, 
            message: "User blocked successfully",
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                isBlocked: user.isBlocked
            }
        });

    } catch (error) {
        console.error("Error blocking user:", error);
        res.status(500).json({ success: false, message: "Failed to block user" });
    }
};

// Unblock customer - Fixed version for isBlocked schema
const unblockCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log("Attempting to unblock user with ID:", id);
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            console.log("Invalid ObjectId:", id);
            return res.status(400).json({ success: false, message: "Invalid user ID" });
        }

        // First, find the user to check if it exists
        const existingUser = await User.findById(id);
        if (!existingUser) {
            console.log("User not found:", id);
            return res.status(404).json({ success: false, message: "User not found" });
        }

        console.log("Found user:", existingUser.name, "Current isBlocked:", existingUser.isBlocked);

        // Update the user to unblocked
        const user = await User.findByIdAndUpdate(
            id,
            { isBlocked: false },
            { new: true, runValidators: true }
        );

        console.log("Updated user isBlocked:", user.isBlocked);

        res.json({ 
            success: true, 
            message: "User unblocked successfully",
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                isBlocked: user.isBlocked
            }
        });

    } catch (error) {
        console.error("Error unblocking user:", error);
        res.status(500).json({ success: false, message: "Failed to unblock user" });
    }
};

module.exports = {
    customerInfo,
    getCustomersAPI,
    blockCustomer,
    unblockCustomer
};