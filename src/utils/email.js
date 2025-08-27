const crypto = require('crypto');
const { logger } = require('./logger');

class EmailService {
  constructor() {
    // For now, we'll use console logging. In production, you'd integrate with:
    // - AWS SES
    // - SendGrid
    // - Nodemailer
    this.emailEnabled = process.env.EMAIL_SERVICE_ENABLED === 'true';
    this.fromEmail = process.env.FROM_EMAIL || 'noreply@finbrightai.com';
    this.baseUrl = process.env.BASE_URL || 'https://api.finbrightai.com';
  }

  generateVerificationToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  getTokenExpiration(hours = 24) {
    const now = new Date();
    now.setHours(now.getHours() + hours);
    return now.toISOString();
  }

  async sendVerificationEmail(email, token, username = null) {
    const verificationUrl = `${this.baseUrl}/auth/verify-email?token=${token}`;
    const displayName = username || email.split('@')[0];

    const emailContent = {
      to: email,
      from: this.fromEmail,
      subject: 'Verify your email address - FinBright AI',
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
            <h1 style="margin: 0;">FinBright AI</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">LLM Proxy Service</p>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #333; margin-top: 0;">Welcome ${displayName}!</h2>
            
            <p style="color: #666; line-height: 1.6;">
              Thank you for registering with FinBright AI. To complete your registration and start using our LLM proxy service, please verify your email address.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Verify Email Address
              </a>
            </div>
            
            <p style="color: #888; font-size: 14px; line-height: 1.6;">
              If the button doesn't work, you can also copy and paste this link into your browser:
              <br><br>
              <code style="background: #eee; padding: 5px; word-break: break-all;">${verificationUrl}</code>
            </p>
            
            <p style="color: #888; font-size: 14px;">
              This verification link will expire in 24 hours for security reasons.
            </p>
          </div>
          
          <div style="padding: 20px; text-align: center; color: #888; font-size: 12px;">
            <p>This email was sent by FinBright AI LLM Proxy Service.</p>
            <p>If you didn't create an account, you can safely ignore this email.</p>
          </div>
        </div>
      `,
      text: `
Welcome to FinBright AI!

Please verify your email address by clicking this link:
${verificationUrl}

This link will expire in 24 hours.

If you didn't create an account, you can safely ignore this email.
      `
    };

    if (this.emailEnabled) {
      // TODO: Integrate with actual email service (AWS SES, SendGrid, etc.)
      logger.info('Email service not configured - would send email:', {
        to: email,
        subject: emailContent.subject,
        verificationUrl
      });
      
      return { success: false, message: 'Email service not configured' };
    } else {
      // Development mode - log email content
      logger.info('🔗 Email verification link (development mode):', {
        email,
        verificationUrl,
        token
      });
      
      console.log('\n📧 EMAIL VERIFICATION (Development Mode)');
      console.log('====================================');
      console.log(`To: ${email}`);
      console.log(`Subject: ${emailContent.subject}`);
      console.log(`Verification URL: ${verificationUrl}`);
      console.log('====================================\n');
      
      return { success: true, message: 'Verification email logged to console (development mode)' };
    }
  }

  async sendPasswordResetEmail(email, token, username = null) {
    const resetUrl = `${this.baseUrl}/auth/reset-password?token=${token}`;
    const displayName = username || email.split('@')[0];

    const emailContent = {
      to: email,
      from: this.fromEmail,
      subject: 'Reset your password - FinBright AI',
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
            <h1 style="margin: 0;">FinBright AI</h1>
            <p style="margin: 10px 0 0 0; opacity: 0.9;">LLM Proxy Service</p>
          </div>
          
          <div style="padding: 30px; background: #f9f9f9;">
            <h2 style="color: #333; margin-top: 0;">Password Reset Request</h2>
            
            <p style="color: #666; line-height: 1.6;">
              Hi ${displayName}, we received a request to reset your password. Click the button below to create a new password:
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Reset Password
              </a>
            </div>
            
            <p style="color: #888; font-size: 14px; line-height: 1.6;">
              If the button doesn't work, copy and paste this link:
              <br><br>
              <code style="background: #eee; padding: 5px; word-break: break-all;">${resetUrl}</code>
            </p>
            
            <p style="color: #888; font-size: 14px;">
              This reset link will expire in 1 hour for security reasons.
            </p>
          </div>
          
          <div style="padding: 20px; text-align: center; color: #888; font-size: 12px;">
            <p>If you didn't request this password reset, you can safely ignore this email.</p>
          </div>
        </div>
      `
    };

    if (this.emailEnabled) {
      logger.info('Email service not configured - would send password reset email:', {
        to: email,
        resetUrl
      });
      return { success: false, message: 'Email service not configured' };
    } else {
      logger.info('🔗 Password reset link (development mode):', {
        email,
        resetUrl,
        token
      });
      
      console.log('\n📧 PASSWORD RESET EMAIL (Development Mode)');
      console.log('====================================');
      console.log(`To: ${email}`);
      console.log(`Reset URL: ${resetUrl}`);
      console.log('====================================\n');
      
      return { success: true, message: 'Password reset email logged to console (development mode)' };
    }
  }
}

module.exports = new EmailService();