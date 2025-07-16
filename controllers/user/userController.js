const User=require('../../models/userSchema')
const env = require("dotenv").config
const nodemailer = require("nodemailer")
const bcrypt=require('bcrypt')


const login=async (req,res) => {
   try {
    
      const {email,password}  = req.body
   const user = await User.findOne({email})
   console.log(user)
   if(!user){
    console.log("User not found")
    return res.render('login',{message : "User not found"})
   }
   const isMatch = await bcrypt.compare(password,user.password)
   if(!isMatch){
    console.log("Incorrect Password")
    return res.render('login',{message : "Incorrect password"})
   }

   req.session.user = user._id;
   console.log("Login Succesful  ")
   res.redirect('/')


   } catch (error) {

    console.log("Login error",error);
    res.render("login",{message:"login failed. Please try again later"})
    
   }
}


function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}



// const register=async (req,res) => {
//     const {name,email,phone,password}=req.body
//     console.log(req.body)
//     const hashPassword=await bcrypt.hash(password,10)

//     const newUser=new User({
//         name,
//         email,
//         phone,
//         password:hashPassword
//     })

//     await newUser.save()


//     const otp  = generateOtp()
//     req.session.otp = otp 
//       req.session.email = email;

//        console.log("Generated OTP (for demo):", otp); 

//     //    res.redirect("/login");

//     res.redirect('/otp')

// }

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
    const { name, phone, email, password, confirmPassword } = req.body;

    if (!name || !email || !phone || !password || !confirmPassword) {
      return res.render("signup", { message: "All fields required to be filled", data: req.body });
    }

    if (password !== confirmPassword) {
      return res.render("signup", { message: "Passwords do not match", data: req.body });
    }

    const findUser = await User.findOne({ email });
    if (findUser) {
      return res.render("signup", { message: "User with this email already exists", data: req.body });
    }

    const otp = generateOtp();
    const emailSent = await sendverificationEmail(email, otp);

    if (!emailSent) {
      return res.json("email error");
    }

    req.session.userOtp = otp;
    req.session.userData = { name, phone, email, password };

    res.render("otp", { email: email, error: null });
    console.log("OTP sent ", otp);

  } catch (error) {
    console.log("Signup error", error);
    res.redirect("page-404");
  }
};

const securePassword = async (password) =>{
  try {
    
    const passwordHash = await bcrypt.hash(password,10)
    return passwordHash

  } catch (error) {
    
        console.error("Error hashing password:", error.message);

  }
}


const verifyOtp = async (req, res) => {
  try {
    
   const enteredOtp = req.body.otp;
   const sessionOtp = req.session.userOtp;

  if (enteredOtp === sessionOtp) {
    const user = req.session.userData
    const passwordHash = await securePassword(user.password)
    

    const saveUserData = new User({
      name : user.name,
      email : user.email,
      phone : user.phone,
      password : passwordHash
    })

    await saveUserData.save();
    req.session.user = saveUserData._id;
   return res.json({ success: true, redirectUrl: '/login' });
  } else {
    res.status(400).json({success:false,message:"Invalid OTP , Please try again"})
  }

  } catch (error) {
    
  console.error("Error verifying OTP",error)
  res.status(500).json({success:false,mesage:"An error occured"})

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

const loadLogin = async (req,res) => {
   try{
    
    if(!req.session.user){
      res.render('login')
    }else{
      res.redirect('/')
    }

   }catch(error){
      res.redirect('page-404')
   }
}


const loadShopPage = async (req,res) => {
    try{
        const user = req.session.user || null;
         res.render('shop')
    }catch(error){
        console.log("Shop page loading error ",error)
    }
}


const loadProductPage = async (req,res) => {
  try {

    res.render("product_details")
    
  } catch (error) {
    
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
    loadShopPage,
    verifyOtp,
    resendOtp,
    loadProductPage
}