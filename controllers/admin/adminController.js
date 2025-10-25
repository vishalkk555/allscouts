const User = require("../../models/userSchema");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");


const pageerror = async (req,res) => {
    res.render("admin-error")
}


const loadLogin = (req,res)=>{

    if(req.session.admin){
        return res.redirect("/admin/dashboard")
    }
    res.render("adminLogin",{message:null})
}


const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const admin = await User.findOne({ email, isAdmin: true });

        if (admin) {
            const passwordMatch = await bcrypt.compare(password, admin.password);
            if (passwordMatch) {
                req.session.admin = true;
                return res.redirect("/admin/dashboard");
            } else {
                return res.render("adminLogin", { message: "Incorrect password" });
            }
        } else {
            return res.render("adminLogin", { message: "Admin not found" });
        }
    } catch (error) {
        console.log("Login error: ", error);
        return res.redirect("/pageerror");
    }
};


const logout = async(req,res) => {
      try {
        // Destroy the admin session
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destruction error:', err);
                return res.status(500).json({ success: false, message: 'Logout failed' });
            }
            // Clear the session cookie
            res.clearCookie('connect.sid', { path: '/admin' }); // Adjust cookie name if different
            return res.json({ success: true, message: 'Logged out successfully' });
        });
    } catch (error) {
        console.error('Logout error:', error);
        return res.status(500).json({ success: false, message: 'Logout failed' });
    }
}



const loadDashboard = async (req,res) => {
    if(req.session.admin){
        try{
            res.render("dashboard");
        }catch(error){
            res.redirect("/pageerror")
        }
    }
}


module.exports = {
    loadLogin,
    login,
    logout,
    loadDashboard,
    pageerror,
   
}