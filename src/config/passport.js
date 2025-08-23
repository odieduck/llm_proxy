const passport = require('passport');
const User = require('../models/User');
const { logger } = require('../utils/logger');

// Only configure OAuth strategies if environment variables are present
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const GoogleStrategy = require('passport-google-oauth20').Strategy;
  
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
  }, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await User.findOne({
      $or: [
        { email: profile.emails[0].value },
        { 'socialProviders.provider': 'google', 'socialProviders.providerId': profile.id }
      ]
    });

    if (user) {
      const googleProvider = user.socialProviders.find(p => p.provider === 'google');
      if (!googleProvider) {
        user.socialProviders.push({
          provider: 'google',
          providerId: profile.id,
          email: profile.emails[0].value,
          name: profile.displayName,
          picture: profile.photos[0]?.value
        });
        await user.save();
      }
    } else {
      user = new User({
        email: profile.emails[0].value,
        socialProviders: [{
          provider: 'google',
          providerId: profile.id,
          email: profile.emails[0].value,
          name: profile.displayName,
          picture: profile.photos[0]?.value
        }]
      });
      await user.save();
    }

    user.lastLogin = new Date();
    await user.save();
    
    logger.info('Google login successful', { userId: user._id, email: user.email });
    return done(null, user);
  } catch (error) {
    logger.error('Google authentication error:', error);
    return done(error, null);
  }
  }));
} else {
  logger.info('Google OAuth not configured - skipping Google strategy');
}

if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY) {
  const AppleStrategy = require('passport-apple').Strategy;
  
  passport.use(new AppleStrategy({
    clientID: process.env.APPLE_CLIENT_ID,
    teamID: process.env.APPLE_TEAM_ID,
    keyID: process.env.APPLE_KEY_ID,
    privateKeyString: process.env.APPLE_PRIVATE_KEY,
    callbackURL: "/auth/apple/callback"
  }, async (accessToken, refreshToken, idToken, profile, done) => {
  try {
    const email = profile.email;
    const appleId = profile.sub;
    
    let user = await User.findOne({
      $or: [
        { email: email },
        { 'socialProviders.provider': 'apple', 'socialProviders.providerId': appleId }
      ]
    });

    if (user) {
      const appleProvider = user.socialProviders.find(p => p.provider === 'apple');
      if (!appleProvider) {
        user.socialProviders.push({
          provider: 'apple',
          providerId: appleId,
          email: email,
          name: profile.name?.firstName + ' ' + profile.name?.lastName || 'Apple User'
        });
        await user.save();
      }
    } else {
      user = new User({
        email: email,
        socialProviders: [{
          provider: 'apple',
          providerId: appleId,
          email: email,
          name: profile.name?.firstName + ' ' + profile.name?.lastName || 'Apple User'
        }]
      });
      await user.save();
    }

    user.lastLogin = new Date();
    await user.save();
    
    logger.info('Apple login successful', { userId: user._id, email: user.email });
    return done(null, user);
  } catch (error) {
    logger.error('Apple authentication error:', error);
    return done(error, null);
  }
  }));
} else {
  logger.info('Apple OAuth not configured - skipping Apple strategy');
}

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;