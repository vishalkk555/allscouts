// middleware/blockGuard.js
const User = require("../models/userSchema");

module.exports = async function blockGuard(req, res, next) {
  try {
    if (!req.session?.user) return next(); // no user, skip

    const u = await User.findById(req.session.user).select("isBlocked");

    if (u?.isBlocked) {
      req.session.destroy(() => {
        return res.redirect("/login?blocked=1");
      });
    } else {
      next();
    }
  } catch (e) {
    next(e);  
  }
};
