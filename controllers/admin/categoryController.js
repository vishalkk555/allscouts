const Category = require('../../models/categorySchema');
const mongoose = require('mongoose');

const categoryInfo = async (req, res) => {
    try {
        const search = req.query.search || '';
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

       
       const query = search 
    ? { name: { $regex: search, $options: 'i' } }
    : {};  

        const categoryData = await Category.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

     
        const totalCategories = await Category.countDocuments(query);
        const totalPages = Math.ceil(totalCategories / limit);

        

        res.render("category", {
            categories: categoryData,
            currentPage: page,
            totalPages: totalPages,
            totalItems: totalCategories,
            search
        });

    } catch (error) {
        console.error(error);
        res.redirect("/pageerror");
    }
};


const addCategory = async (req, res) => {
    const { name } = req.body;
    
    try {
        if (!name || name.trim() === '') {
            return res.status(400).json({ success: false, error: "Category name is required" });
        }

        const existingCategory = await Category.findOne({ 
            name: { $regex: new RegExp(`^${name.trim()}$`, 'i') } 
        });

        if (existingCategory) {
            return res.status(400).json({ success: false, error: "Category already exists" });
        }

        const newCategory = new Category({
            name: name.trim(),
            isActive: true,  
        });

        await newCategory.save();
        return res.json({ success: true, message: "Category added successfully" });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ success: false, error: "Internal server error" });
    }
};


const getCategoriesAPI = async (req, res) => {
    try {
        const search = req.query.search || '';
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

        const query = search 
            ? { name: { $regex: search, $options: 'i' } }
            : {};

        const categories = await Category.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalCategories = await Category.countDocuments(query);
        const totalPages = Math.ceil(totalCategories / limit);

        res.json({
            success: true,
            categories,
            currentPage: page,
            totalPages
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};




const loadAddCategory = async (req, res) => {
    try {
        res.render("addCategory");
    } catch (error) {
        console.error(error);
        res.redirect("/pageerror");
    }
};

const blockCategory = async (req, res) => {
    try {
        const categoryId = req.params.id;
        await Category.findByIdAndUpdate(categoryId, { isActive: false });
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false });
    }
};

const unblockCategory = async (req, res) => {
    try {
        const categoryId = req.params.id;
        await Category.findByIdAndUpdate(categoryId, { isActive: true });
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false });
    }
};


const editCategory = async (req, res) => {
    try {
        const categoryId = req.params.id;
        const category = await Category.findById(categoryId);
        
        if (!category) {
            return res.redirect("/admin/categories");
        }
        
        res.render("updateCategory", { category });
    } catch (error) {
        console.error(error);
        res.redirect("/pageerror");
    }
};


const updateCategory = async (req, res) => {
    try {
        const categoryId = req.params.id;
        const { name } = req.body;

        if (!name || name.trim().length < 2) {
            return res.status(400).json({ success: false, message: 'Invalid name' });
        }

        const existing = await Category.findOne({
            name: { $regex: `^${name.trim()}$`, $options: 'i' },
            _id: { $ne: categoryId }
        });

        if (existing) {
            return res.status(409).json({ success: false, message: 'Category already exists' });
        }

        await Category.findByIdAndUpdate(categoryId, { name: name.trim() });

        res.status(200).json({ success: true, message: 'Category updated successfully' });
    } catch (error) {
        console.error("Error updating category:", error);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};


const getActiveCategories = async (req,res) => {
    try {

         const categories =  await Category.find({isActive:true}).sort({name:1})
         
         const formatted = categories.map(cat => ({
            value : cat._id,
            name:cat.name
         }))

         res.status(200).json({success:true,categories : formatted})

    } catch (error) {
        res.status(500).json({success:false, message : "failed to fetch categories"})
    }


}





module.exports = {
    categoryInfo,
    addCategory,
    loadAddCategory,
    blockCategory,
    unblockCategory,
    editCategory,
    getCategoriesAPI,
    updateCategory,
    getActiveCategories
};