const User = require("../models/userSchema")


// Prevent logged-in users from visiting login/signup/otp
const guestAuth = (req, res, next) => {
    if (req.session.user) {   
        return res.redirect("/");
    }
    next();
};

// Restrict sensitive pages (wishlist, cart, etc.)
const userAuth = (req, res, next) => {
    console.log("Session user:", req.session.user);
    if (req.session.user) {
        User.findById(req.session.user)
            .then(data => {
                if (data && !data.isBlocked) {
                    return next();
                } else {
                    req.session.destroy(() => {
                        res.redirect("/login");
                    });
                }
            })
            .catch(error => {
                console.error("Error in userAuth:", error);
                res.status(500).send("Internal server error");
            });
    } else {
        res.redirect("/login");
    }
};

const adminAuth = (req, res, next) => {
    // Check if admin is logged in
    if (!req.session.admin) {
        if (req.path.startsWith('/admin/api/') || req.query.format === 'json') {
            return res.status(401).json({ success: false, message: 'Please log in as admin' });
        }
        return res.redirect('/admin/login');
    }

    // Admin is authenticated, proceed
    next();
};



module.exports = {
    userAuth,
    adminAuth,
    guestAuth
}


