const mongoose = require("mongoose")
const {Schema} = mongoose;

const reviewSchema = new Schema({
  userName: { type: String, required: true },
  email: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

const productSchema = new Schema({
    productName: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: "Category",
        required: true
    },
    regularPrice: {
        type: Number,
        required: true
    },
    stock: [{
        size: {
            type: String,
            required: true
        },
        quantity: {
            type: Number,
            required: true
        }
    }],
    totalStock: {
        type: Number,
        required: false
    },
    productImage: {
        type: [String],
        required: true
    },
    reviews: [reviewSchema],
    isBlocked: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ["Available", "out of stock", "Discontinued"],
        required: true,
        default: "Available"
    }
}, { timestamps: true });


const Product = mongoose.model("Product",productSchema);

module.exports  = Product;