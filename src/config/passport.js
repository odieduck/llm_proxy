const passport = require('passport');
const dynamoDBService = require('./dynamodb');
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
    let user = await dynamoDBService.getUserByEmail(profile.emails[0].value);

    if (user) {
      // Check if Google provider is already linked
      const googleProvider = user.socialProviders?.find(p => p.provider === 'google');
      if (!googleProvider) {
        // Add Google provider to existing user
        const updatedProviders = [...(user.socialProviders || []), {
          provider: 'google',
          providerId: profile.id,
          email: profile.emails[0].value,
          name: profile.displayName,
          picture: profile.photos[0]?.value
        }];
        
        await dynamoDBService.updateUserSubscription(user.userId, {
          ...user.subscription,
          socialProviders: updatedProviders
        });
      }
    } else {
      // Create new user with Google provider
      user = await dynamoDBService.createUser({
        email: profile.emails[0].value,
        username: profile.displayName?.toLowerCase().replace(/\s+/g, '') || 'googleuser',
        socialProviders: [{
          provider: 'google',
          providerId: profile.id,
          email: profile.emails[0].value,
          name: profile.displayName,
          picture: profile.photos[0]?.value
        }]
      });
    }

    await dynamoDBService.updateUserLogin(user.email);
    
    logger.info('Google login successful', { userId: user.userId, email: user.email });
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
    
    let user = await dynamoDBService.getUserByEmail(email);

    if (user) {
      // Check if Apple provider is already linked
      const appleProvider = user.socialProviders?.find(p => p.provider === 'apple');
      if (!appleProvider) {
        // Add Apple provider to existing user
        const updatedProviders = [...(user.socialProviders || []), {
          provider: 'apple',
          providerId: appleId,
          email: email,
          name: profile.name?.firstName + ' ' + profile.name?.lastName || 'Apple User'
        }];
        
        await dynamoDBService.updateUserSubscription(user.userId, {
          ...user.subscription,
          socialProviders: updatedProviders
        });
      }
    } else {
      // Create new user with Apple provider
      user = await dynamoDBService.createUser({
        email: email,
        username: (profile.name?.firstName + profile.name?.lastName)?.toLowerCase().replace(/\s+/g, '') || 'appleuser',
        socialProviders: [{
          provider: 'apple',
          providerId: appleId,
          email: email,
          name: profile.name?.firstName + ' ' + profile.name?.lastName || 'Apple User'
        }]
      });
    }

    await dynamoDBService.updateUserLogin(user.email);
    
    logger.info('Apple login successful', { userId: user.userId, email: user.email });
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
  done(null, user.userId);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await dynamoDBService.getUserById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;