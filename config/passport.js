const passport = require("passport")
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/userSchema");
require("dotenv").config();


passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.NODE_ENV === "production" ? "https://allscouts.online/google/callback" : '/google/callback'
},
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id });

      if (!user) {
        user = await User.findOne({ email: profile.emails[0].value });
      }

      // 🚨 Blocked user check
      if (user && user.isBlocked) {
        return done(null, false, { message: "blocked" });
      }

      // If user doesn’t exist → create
      if (!user) {
        user = new User({
          name: profile.displayName,
          email: profile.emails[0].value,
          googleId: profile.id
        });
        await user.save();
      }

      return done(null, user);

    } catch (error) {
      return done(error, null);
    }
  }
));



passport.serializeUser((user, done) => {

  done(null, user.id)

});

passport.deserializeUser((id, done) => {
  User.findById(id)
    .then(user => {
      done(null, user)
    })
    .catch(err => {
      done(err, null)
    })
})


module.exports = passport;
