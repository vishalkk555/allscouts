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
    loadDashboard,
    pageerror,
   
}