const { Resend } = require('resend');

const apiKey = process.env.RESEND_API_KEY;
const resend = new Resend(apiKey);

async function sendEmail(to, subject, html) {
  try {
    const sender = '3R Mobile Laundry <noreply@info.3rmobilelaundry.com.ng>';
    
    console.log(`Sending email to: ${to} from ${sender}`);

    const response = await resend.emails.send({
      from: sender,
      to: to,
      subject: subject,
      html: html
    });
    
    if (response.error) {
        console.error("Resend API Error:", response.error);
        throw new Error(response.error.message);
    }

    console.log("Email sent successfully:", response.id);
    return response;
  } catch (error) {
    console.error("Email sending failed:", error);
    // Don't swallow the error, let the caller handle it (e.g. to show error to user)
    throw error;
  }
}

module.exports = { sendEmail };
