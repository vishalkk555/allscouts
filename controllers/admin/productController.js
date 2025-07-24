const product = require("../../models/productSchema")
const Category = require("../../models/categorySchema")
const mongoose = require('mongoose');


const loadAddProduct = async (req,res) => {
    try {

        const categories = await Category.find({ isActive: true }); // fetch active categories
    res.render("addProduct", { categories });
        
    } catch (error) {
        console.log('fialed to load addProduct page',error)
    }
    
}



const editProduct = async (req,res) => {
    try {
        
     res.render("editProduct")

    } catch (error) {
        
     res.status(500).json({success:false})

    }
    
}



module.exports = {
    loadAddProduct,
    editProduct
}