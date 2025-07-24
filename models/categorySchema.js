const mongoose = require("mongoose");
const {Schema} = mongoose;


const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    }}, {
    timestamps: true 
});

const Category = mongoose.model("category",categorySchema);

module.exports  = Category; 