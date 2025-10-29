const User=require('../../models/userSchema')
const Wallet = require('../../models/walletSchema')
const env = require("dotenv").config
const nodemailer = require("nodemailer")
const bcrypt=require('bcrypt');
const validator = require('validator');
const mongoose = require('mongoose')

const { session } = require('passport');

// Hash password
async function securePassword(password) {
  try {
    return await bcrypt.hash(password, 10);
  } catch (error) {
    console.log(error.message);
  }
}


const login=async (req,res) => {


   try {
    
      const {email,password}  = req.body
   const user = await User.findOne({email})
   
   console.log(user)
   if(!user){
    console.log("User not found")
    return res.render('login',{message : "User not found"})
   }

     if (user.isBlocked) {
      console.log("Blocked user tried to login");
      return res.render("login", { 
        message: "Your account has been temporarily disabled. Please contact the administrator.", 
        alertType: "blocked" 
      });
    }


   const isMatch = await bcrypt.compare(password,user.password)
   if(!isMatch){
    console.log("Incorrect Password")
    return res.render('login',{message : "Incorrect password"})
   }

 req.session.user = user._id;
req.session.save(err => {
    if (err) {
        console.error("Session save error:", err);
        return res.redirect("/login");
    }
    console.log("Login Successful");
    res.redirect("/");
});


   } catch (error) {

    console.log("Login error",error);
    res.render("login",{message:"login failed. Please try again later"})
    
   }
}


function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}




async function sendverificationEmail(email,otp){
  try {
    
      const transporter  = nodemailer.createTransport({

        service:"gmail",
        port:587,
        secure:false,
        requireTLS:true,
        auth:{
          user:process.env.NODEMAILER_EMAIL,
          pass:process.env.NODEMAILER_PASSWORD
        }
      })

      const info = await transporter.sendMail({
        from:process.env.NODEMAILER_EMAIL,
        to:email,
        subject:"Verify your account",
        text:`Your OTP is ${otp}`,
        html:`<b>Your OTP : ${otp}</b>`,

      })

      return info.accepted.length >0

  } catch (error) {
    console.error("Error sending email",error)
    return false
  }
}



const register = async (req, res) => {
  try {
    const { name, phone, email, password, confirmPassword, referralCode } = req.body;

    // Server-side validation
    if (!name || !email || !phone || !password || !confirmPassword) {
      return res.json({ success: false, message: 'All fields are required' });
    }

    const namePattern = /^[A-Za-z]+$/;
    const phonePattern = /^[6-9]\d{9}$/;
    const passwordPattern = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
    const referralCodePattern = /^[A-Za-z0-9]{6}$/;

    if (!namePattern.test(name)) {
      return res.json({ success: false, message: 'Name must contain only alphabets without spaces or symbols' });
    }

    if (!validator.isEmail(email)) {
      return res.json({ success: false, message: 'Invalid email format' });
    }

    if (!phonePattern.test(phone) || /^(\d)\1{9}$/.test(phone)) {
      return res.json({ success: false, message: 'Phone must be 10 digits starting with 6-9 and not all same digits' });
    }

    if (!passwordPattern.test(password)) {
      return res.json({ success: false, message: 'Password must be at least 8 characters with 1 uppercase and 1 number' });
    }

    if (password !== confirmPassword) {
      return res.json({ success: false, message: 'Passwords do not match' });
    }

    if (referralCode && !referralCodePattern.test(referralCode)) {
      return res.json({ success: false, message: 'Referral code must be 6 alphanumeric characters' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.json({ success: false, message: 'Email or phone already registered' });
    }

    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (!referrer) {
        return res.json({ success: false, message: 'Invalid referral code' });
      }
    }

    const otp = generateOtp();
    console.log('Generated OTP:', otp);

    const emailSent = await sendverificationEmail(email, otp);
    if (!emailSent) {
      console.error('Failed to send OTP email to:', email);
      return res.json({ success: false, message: 'Failed to send OTP email' });
    }

    console.log('OTP sent successfully:', otp);

    req.session.userOtp = otp;
    req.session.userData = { name, phone, email, password, referralCode };
    req.session.otpTimestamp = Date.now();

    res.json({ success: true, redirectUrl: '/otp' });
  } catch (error) {
    console.error('Signup error:', error);
    res.json({ success: false, message: 'An error occurred during signup' });
  }
};



const generateReferralCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const verifyOtp = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { otp } = req.body;
    const { userOtp, userData, otpTimestamp } = req.session;

    if (!userData || !userOtp || !otpTimestamp) {
      await session.abortTransaction();
      session.endSession();
      return res.json({ success: false, message: 'Session expired or invalid' });
    }

    if (Date.now() - otpTimestamp > 10 * 60 * 1000) {
      req.session.userOtp = null;
      req.session.userData = null;
      req.session.otpTimestamp = null;
      await session.abortTransaction();
      session.endSession();
      return res.json({ success: false, message: 'OTP has expired' });
    }

    if (otp !== userOtp) {
      await session.abortTransaction();
      session.endSession();
      return res.json({ success: false, message: 'Invalid OTP, please try again' });
    }

    // Generate unique referral code
    let referralCode;
    let isUnique = false;
    while (!isUnique) {
      referralCode = generateReferralCode();
      const existingUser = await User.findOne({ referralCode }).session(session);
      if (!existingUser) isUnique = true;
    }

    const passwordHash = await bcrypt.hash(userData.password, 10);

    const newUser = new User({
      name: userData.name,
      email: userData.email,
      phone: userData.phone,
      password: passwordHash,
      referralCode
    });

    await newUser.save({ session });

    // Create wallet for new user
    const walletData = {
      userId: newUser._id,
      balance: 0,
      transaction: []
    };

    // Handle referral bonuses if referral code was provided
    let showJoiningBonusPopup = false;
    if (userData.referralCode) {
      const referrer = await User.findOne({ referralCode: userData.referralCode }).session(session);
      if (referrer) {
        // Add ₹100 joining bonus to new user
        walletData.balance += 100;
        walletData.transaction.push({
          amount: 100,
          transactionsMethod: 'Referral',
          description: 'Joining bonus via referral',
          date: new Date()
        });
        showJoiningBonusPopup = true;

        // Add ₹50 referral bonus to referrer
        const referrerWallet = await Wallet.findOne({ userId: referrer._id }).session(session);
        if (!referrerWallet) {
          await Wallet.create({
            userId: referrer._id,
            balance: 50,
            transaction: [{
              amount: 50,
              transactionsMethod: 'Referral',
              description: `Referral bonus for ${newUser.email}`,
              date: new Date()
            }]
          }, { session });
        } else {
          await Wallet.updateOne(
            { userId: referrer._id },
            {
              $inc: { balance: 50 },
              $push: {
                transaction: {
                  amount: 50,
                  transactionsMethod: 'Referral',
                  description: `Referral bonus for ${newUser.email}`,
                  date: new Date()
                }
              }
            },
            { session }
          );
        }
      }
    }

   await Wallet.create([walletData], { session });

    req.session.user = newUser._id;
    req.session.showJoiningBonusPopup = showJoiningBonusPopup;
    req.session.userOtp = null;
    req.session.userData = null;
    req.session.otpTimestamp = null;

    await session.commitTransaction();
    session.endSession();

    res.json({ success: true, redirectUrl: '/login', showJoiningBonusPopup });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error verifying OTP:', error);
    res.json({ success: false, message: 'An error occurred during OTP verification' });
  }
};

const resendOtp = async (req,res) => {
  try {
    
    const {email} = req.session.userData;
    if(!email){
      return res.status(400).json({success:false,message:"Email not found in session"})
    }

    const otp = generateOtp();
    req.session.userOtp = otp;

    const emailSent = await sendverificationEmail(email,otp);
    if(emailSent){
       console.log("Resend OTP: ",otp)
       res.status(200).json({success:true,message:"OTP Resend Succesfully"})
    }else{
      res.status(500).json({success:false,message:"Failed to resend OTP, Please try again"})
    }

  } catch (error) {
    
    console.log("Error resending OTP",error)
    res.status(500).json({success:false,message:"Internal server error. Please try again"})

  }
}


const pageNotFound = async(req,res) => {
    try{
      
        res.render("page-404")

    }catch(error){
        res.redirect("/pageNotFound")
    }
}




const loadHomePage = async (req, res) => {
  try {
    return res.render("home", {
      user: req.session.user,  
      title: "Home"
    });
  } catch (error) {
    console.log("Home page not found");
    res.status(500).send("Server error");
  }
};


const loadSignUp = async (req, res) => {
    try {
        return res.render('signup', { message: '', data: {} });
    } catch (error) {
        console.log("Home page not loading:", error);
        res.status(500).send('Server Error');
    }
};



const loadOtp = async(req,res)=>{
    try{

       const email = req.session.email;
       
    res.render('otp', { email });

    }catch(error){
       
        console.log("Home page nont loading:",error)
        res.status(500).send('Server Error');
    }
}

const loadLogin = async (req, res) => {
  try {
    
    if (req.session.user) {
      return res.redirect('/');
    }

    if (req.query.blocked === "1") {
      return res.render("login", {
        message: "Your account has been temporarily disabled. Please contact the administrator.",
        alertType: "blocked"
      });
    }
    res.render("login");

  } catch (error) {
    console.error("Error in loadLogin:", error);
    res.redirect("page-404");
  }
};





const loadProductPage = async (req,res) => {
  try {

    res.render("product_details")
    
  } catch (error) {
    
  }
}




const logout = async (req,res) => {
  req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).send('Logout failed');
        }
        res.clearCookie('connect.sid'); 
        res.sendStatus(200); 
    });
}




async function sendForgotPasswordEmail(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD
      }
    });

    const info = await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: "Password Reset Code",
      text: `Your password reset code is ${otp}`,
      html: `<b>Your password reset code: ${otp}</b>`,
    });

    return info.accepted.length > 0;
  } catch (error) {
    console.error("Error sending forgot password email", error);
    return false;
  }
}




// Load Forgot Password Page
const forgotPassword = async (req, res, next) => {
  try {
    res.render('forgotPassword');
  } catch (error) {
    next(error);
  }
};

// Handle Forgot Password Email Submission
const sendForgotPasswordOtp = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) throw new Error("Email not found");

    const otp = generateOtp();
    req.session.forgotPasswordOtp = otp;
    req.session.forgotPasswordEmail = email;

    const emailSent = await sendForgotPasswordEmail(email, otp);
    if (!emailSent) throw new Error("Failed to send reset code. Please try again");

    console.log("Forgot Password OTP:", otp);
    res.status(200).json({
      success: true,
      message: "Reset code sent to your email successfully"
    });

  } catch (error) {
    next(error);
  }
};

//  Load Forgot Password OTP Page
const loadForgotPasswordOtp = async (req, res, next) => {
  try {
    const email = req.session.forgotPasswordEmail;
    if (!email) return res.redirect('/forgotPassword');
    res.render('passwordOtp', { email });
  } catch (error) {
    next(error);
  }
};

//  Verify Forgot Password OTP
const verifyForgotPasswordOtp = async (req, res, next) => {
  try {
    const enteredOtp = req.body.otp;
    const sessionOtp = req.session.forgotPasswordOtp;

    if (enteredOtp === sessionOtp) {
      return res.json({
        success: true,
        message: "OTP verified successfully",
        redirectUrl: '/resetPassword'
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Invalid OTP. Please try again"
      });
    }
  } catch (error) {
    next(error);
  }
};

//  Resend Forgot Password OTP
const resendForgotPasswordOtp = async (req, res, next) => {
  try {
    const email = req.session.forgotPasswordEmail;
    if (!email) return res.status(400).json({ success: false, message: "Email not found in session" });

    const otp = generateOtp();
    req.session.forgotPasswordOtp = otp;

    const emailSent = await sendForgotPasswordEmail(email, otp);
    if (!emailSent) throw new Error("Failed to resend OTP. Please try again");

    console.log("Resent Forgot Password OTP:", otp);
    res.status(200).json({
      success: true,
      message: "OTP resent successfully to your email"
    });

  } catch (error) {
    next(error);
  }
};

// Load Reset Password Page
const loadResetPassword = async (req, res, next) => {
  try {
    if (!req.session.forgotPasswordEmail) return res.redirect('/forgotPassword');
    res.render('resetPassword');
  } catch (error) {
    next(error);
  }
};

// Handle Reset Password Submission
const resetPassword = async (req, res, next) => {
  try {
    const { newPassword, confirmPassword } = req.body;
    const email = req.session.forgotPasswordEmail;

    if (!email) throw new Error("Session expired, please try again");
    if (!newPassword || !confirmPassword) throw new Error("Please enter both password fields");
    if (newPassword !== confirmPassword) throw new Error("Passwords do not match");
    if (newPassword.length < 6) throw new Error("Password must be at least 6 characters");

    const hashedPassword = await securePassword(newPassword);
    await User.updateOne({ email }, { $set: { password: hashedPassword } });

    req.session.forgotPasswordEmail = null;
    req.session.forgotPasswordOtp = null;

    res.status(200).json({
      success: true,
      message: "Password reset successfully. Please log in.",
      redirectUrl: '/login'
    });

  } catch (error) {
    next(error);
  }
};


const getAboutPage = async(req,res,next) => {
  try {
    res.render("about")
  } catch (error) {
    next(error)
  }
}

const getContactPage = async( req , res , next) => {
  try {
    res.render("contact")
  } catch (error) {
    (next)
  }
}


module.exports = {
    loadHomePage,
    pageNotFound,
    loadSignUp,
    register,
    loadOtp,
    loadLogin,
    login,
    verifyOtp,
    resendOtp,
    loadProductPage,
    logout,
    forgotPassword,
    sendForgotPasswordOtp,
    loadForgotPasswordOtp,
    verifyForgotPasswordOtp,
    resendForgotPasswordOtp,
    loadResetPassword,
    resetPassword,
    getAboutPage,
    getContactPage
}