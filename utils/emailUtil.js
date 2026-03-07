const nodemailer = require('nodemailer');

/**
 * Creates a Nodemailer transporter using Gmail credentials from .env
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    family: 4,             // force IPv4 — prevents ENETUNREACH on Render
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

/**
 * Generates a cryptographically random 6-digit OTP string
 */
exports.generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Sends a 6-digit OTP to the given email address.
 * Throws an error if the mail cannot be delivered (bad address, SMTP rejection, etc.)
 *
 * @param {string} toEmail   - Recipient email address
 * @param {string} otp       - The 6-digit code to send
 * @param {string} firstName - Used to personalise the greeting
 */
exports.sendOtpEmail = async (toEmail, otp, firstName) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"StayNow" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Verify your StayNow account — Your OTP Code',
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Email Verification</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0"
               style="background-color:#f3f4f6;padding:40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0"
                     style="background-color:#ffffff;border-radius:12px;
                            box-shadow:0 4px 12px rgba(0,0,0,0.1);overflow:hidden;
                            max-width:600px;width:100%;">

                <!-- Header -->
                <tr>
                  <td style="background-color:#ef4444;padding:32px;text-align:center;">
                    <h1 style="color:#ffffff;margin:0;font-size:28px;font-weight:700;
                               letter-spacing:-0.5px;">StayNow</h1>
                    <p style="color:#fecaca;margin:8px 0 0;font-size:14px;">
                      Email Verification
                    </p>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:40px 40px 24px;">
                    <p style="font-size:20px;font-weight:600;color:#1f2937;margin:0 0 12px;">
                      Hi ${firstName},
                    </p>
                    <p style="font-size:15px;color:#6b7280;line-height:1.6;margin:0 0 32px;">
                      Thanks for signing up! To complete your registration please enter
                      the verification code below on the website. This code expires in
                      <strong style="color:#ef4444;">10 minutes</strong>.
                    </p>

                    <!-- OTP Box -->
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center">
                          <div style="background-color:#fef2f2;border:2px dashed #ef4444;
                                      border-radius:12px;padding:24px 40px;
                                      display:inline-block;text-align:center;">
                            <p style="font-size:13px;color:#6b7280;
                                      text-transform:uppercase;letter-spacing:2px;
                                      margin:0 0 8px;">Your Verification Code</p>
                            <p style="font-size:42px;font-weight:700;color:#ef4444;
                                      letter-spacing:12px;margin:0;font-family:monospace;">
                              ${otp}
                            </p>
                          </div>
                        </td>
                      </tr>
                    </table>

                    <p style="font-size:13px;color:#9ca3af;margin:32px 0 0;
                               text-align:center;line-height:1.6;">
                      If you didn't create an account, you can safely ignore this email.<br/>
                      Never share this code with anyone.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background-color:#f9fafb;padding:20px 40px;
                             border-top:1px solid #e5e7eb;text-align:center;">
                    <p style="font-size:12px;color:#9ca3af;margin:0;">
                      &copy; ${new Date().getFullYear()} StayNow. All rights reserved.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
};
