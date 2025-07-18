const mongoose = require("mongoose")
const {Schema} = mongoose;

const addressSchema = new Schema({
      userId : {
        type:Schema.Types.ObjectId,
        ref:"User",
        required: true
      },
      address:[{
        name:{
            type:String,
            required:true
        },
        city:{
            type:String,
            require:true,
        },
        landMark:{
            type:String,
            required:true
        },
        state:{
            type:String,
            required:true
        },
        pincode:{
            type:Number,
            required:true
        },
        phone:{
            type:String,
            required: true
        }
      }]
})


const Address = mongoose.model("Address",addressSchema);

module.exports = Address;