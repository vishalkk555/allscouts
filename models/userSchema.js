const mongoose  = require("mongoose");
const {Schema} = mongoose;


const userSchema  = new Schema({
    name : {
        type:String,
        required : true
    },
    email : {
        type:String,
        required : true,
        unique: true
    },
    phone : {
        type : String,
        required: false,
        unique: true,
        sparse: true,
        default:null
    },
    googleId: {
        type:String,
        unique:true,
    },
    password: {
        type:String,
        required : false
    },
    dob:{
        type: String,
        required:false,
    },
    profileImage:{
        type: Array,
        required: false,
    },
    isBlocked: {
        type : Boolean,
        default : false
    },
     wishlist: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true
        },
        dateAdded: {
          type: Date,
          default: Date.now
        }
      }
    ],
    isAdmin: {
        type:Boolean,
        default:false
    },
    
     referralCode:{
      type:String,
      required:false
    },
   
   
    createdOn : {
        type:Date,
        default:Date.now
    }
})


const User = mongoose.model("User",userSchema);


module.exports = User;