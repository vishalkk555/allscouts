const Razorpay = require("razorpay");
require('dotenv').config();

const razorpayConfig = {
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
};

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: razorpayConfig.key_id,
  key_secret: razorpayConfig.key_secret
});

module.exports = {
  razorpayConfig,
  razorpay
};