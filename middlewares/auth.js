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
    User.findOne({ isAdmin: true })
        .then(data => {
            if (data) {
                next(); // Admin found, proceed to the route
            } else if (req.query.format === 'json') {
                res.status(401).json({ message: 'Please log in as admin' });
            } else {
                res.redirect('/admin/login');
            }
        })
        .catch(error => {
            console.error('Error in adminAuth middleware:', error);
            if (req.query.format === 'json') {
                res.status(500).json({ message: 'Server error' });
            } else {
                res.status(500).send('Server error');
            }
        });
};




module.exports = {
    userAuth,
    adminAuth,
    guestAuth
}


