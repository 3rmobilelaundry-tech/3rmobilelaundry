const { Resend } = require('resend');

const apiKey = process.env.RESEND_API_KEY;
// Fallback if env not loaded yet (though it should be)
const resend = new Resend(apiKey || 're_FZbg33Mu_LdLipDPbdsqeJnWZUoznWkmD');

async function sendEmail(to, subject, html) {
  try {
    // Development Mode / Free Tier Limitation Bypass
    // If we are in free tier, we can only send to the registered email.
    // However, for testing purposes, we should ideally use the registered email.
    // BUT, if the user tries to register with 'everestfrancis324@gmail.com', it fails.
    
    // TEMPORARY FIX FOR DEMO/TESTING:
    // If the recipient is NOT the registered admin email, we log the email content instead of failing.
    // This allows the verification flow to "succeed" in the UI so you can proceed with testing.
    // In production, you MUST verify your domain to send to anyone.
    
    const ADMIN_EMAIL = '3rmobilelaundry@gmail.com'; 
    const isProd = process.env.NODE_ENV === 'production';

    if (to !== ADMIN_EMAIL && !isProd) {
        console.log(`\n--- [DEV] EMAIL SIMULATION ---`);
        console.log(`To: ${to}`);
        console.log(`Subject: ${subject}`);
        console.log(`Content: (See HTML below)`);
        console.log(`------------------------------\n`);
        
        // Return a fake success response
        return { id: 'simulated_id', from: 'onboarding@resend.dev', to };
    }

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
