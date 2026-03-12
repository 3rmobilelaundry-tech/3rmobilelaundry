const { Resend } = require('resend');

const apiKey = process.env.RESEND_API_KEY;
// Fallback if env not loaded yet (though it should be)
const resend = new Resend(apiKey || 're_FZbg33Mu_LdLipDPbdsqeJnWZUoznWkmD');

async function sendEmail(to, subject, html) {
  try {
    const response = await resend.emails.send({
      from: '3R Mobile Laundry <onboarding@resend.dev>',
      to: to,
      subject: subject,
      html: html
    });
    
    if (response.error) {
        console.error("Resend API Error:", response.error);
        throw new Error(response.error.message);
    }

    return response;
  } catch (error) {
    console.error("Email sending failed:", error);
    throw error;
  }
}

module.exports = { sendEmail };
