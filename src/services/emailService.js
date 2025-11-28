const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        // Create transporter - using Gmail by default, but configurable via env vars
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER || process.env.EMAIL_USER,
                pass: process.env.SMTP_PASS || process.env.EMAIL_PASSWORD
            }
        });

        // Verify connection on startup
        this.transporter.verify((error, success) => {
            if (error) {
                console.warn('⚠️  Email service not configured. Emails will be logged to console only.');
                console.warn('   Set SMTP_USER, SMTP_PASS environment variables to enable email sending.');
            } else {
                console.log('✅ Email service configured and ready');
            }
        });
    }

    async sendTrialLicenseKey(email, firstName, licenseKey, trialDays = 30) {
        const trialExpiresDate = new Date();
        trialExpiresDate.setDate(trialExpiresDate.getDate() + trialDays);

        const emailHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background: linear-gradient(135deg, #00ff88, #5865f2);
            color: white;
            padding: 30px;
            border-radius: 12px 12px 0 0;
            text-align: center;
        }
        .content {
            background: #f5f5f5;
            padding: 30px;
            border-radius: 0 0 12px 12px;
        }
        .license-box {
            background: #151a30;
            color: #00ff88;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            font-family: 'Courier New', monospace;
            font-size: 24px;
            font-weight: bold;
            letter-spacing: 2px;
            margin: 20px 0;
            border: 2px solid #00ff88;
            box-shadow: 0 0 20px rgba(0, 255, 136, 0.3);
        }
        .button {
            display: inline-block;
            background: linear-gradient(135deg, #00ff88, #00dd77);
            color: #05070f;
            padding: 16px 32px;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 700;
            margin: 20px 0;
        }
        .footer {
            text-align: center;
            color: #888;
            font-size: 12px;
            margin-top: 30px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 Welcome to Arbitrage Flow!</h1>
        <p>Your Free Trial License Key</p>
    </div>
    <div class="content">
        <p>Hi ${firstName || 'there'},</p>
        
        <p>Thank you for signing up for Arbitrage Flow! Your free trial account has been created.</p>
        
        <p><strong>Your Trial License Key:</strong></p>
        <div class="license-box">${licenseKey}</div>
        
        <p>This license key is valid for <strong>${trialDays} days</strong> (expires: ${trialExpiresDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })})</p>
        
        <p><strong>Next Steps:</strong></p>
        <ol>
            <li>Copy your license key above</li>
            <li>Go to the login page</li>
            <li>Enter your email, password, and this license key</li>
            <li>Start finding guaranteed arbitrage opportunities!</li>
        </ol>
        
        <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'https://arbitrageflow.com'}/login.html" class="button">Login Now</a>
        </div>
        
        <p><strong>Important:</strong></p>
        <ul>
            <li>Keep this license key safe - you'll need it every time you log in</li>
            <li>Your trial gives you full access to all features</li>
            <li>No credit card required during the trial period</li>
        </ul>
        
        <p>If you have any questions, just reply to this email.</p>
        
        <p>Happy arbitrage betting!<br>
        <strong>The Arbitrage Flow Team</strong></p>
    </div>
    <div class="footer">
        <p>Arbitrage Flow - Turn Sports Betting Into Guaranteed Profits</p>
        <p>© 2025 Arbitrage Flow. All rights reserved.</p>
    </div>
</body>
</html>
        `;

        const emailText = `
Welcome to Arbitrage Flow!

Hi ${firstName || 'there'},

Thank you for signing up! Your free trial account has been created.

Your Trial License Key: ${licenseKey}

This license key is valid for ${trialDays} days (expires: ${trialExpiresDate.toLocaleDateString()}).

Next Steps:
1. Copy your license key above
2. Go to the login page
3. Enter your email, password, and this license key
4. Start finding guaranteed arbitrage opportunities!

Keep this license key safe - you'll need it every time you log in.

Login: ${process.env.FRONTEND_URL || 'https://arbitrageflow.com'}/login.html

Happy arbitrage betting!
The Arbitrage Flow Team
        `;

        const mailOptions = {
            from: `"Arbitrage Flow" <${process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@arbitrageflow.com'}>`,
            to: email,
            subject: '🚀 Your Arbitrage Flow Trial License Key',
            text: emailText,
            html: emailHTML
        };

        try {
            // If email is not configured, just log it
            if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
                console.log('\n📧 EMAIL NOT CONFIGURED - License key would be sent:');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log(`To: ${email}`);
                console.log(`Subject: ${mailOptions.subject}`);
                console.log(`\nLicense Key: ${licenseKey}`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
                return { success: true, method: 'console' };
            }

            const info = await this.transporter.sendMail(mailOptions);
            console.log(`✅ Trial license key email sent to ${email}`);
            return { success: true, messageId: info.messageId, method: 'email' };
        } catch (error) {
            console.error('❌ Error sending email:', error);
            // Fallback: log to console so user still gets their key
            console.log('\n📧 EMAIL FAILED - License key logged to console:');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log(`To: ${email}`);
            console.log(`License Key: ${licenseKey}`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            return { success: false, error: error.message, method: 'console' };
        }
    }
}

module.exports = new EmailService();

