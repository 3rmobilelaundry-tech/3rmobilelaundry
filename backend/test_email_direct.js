const nodemailer = require('nodemailer');

async function testDirect() {
    console.log('Testing Direct Nodemailer Connection...');
    
    const user = '3rmobilelaundry@gmail.com';
    // Remove spaces manually
    const pass = 'jebz tlqk ndbx dmjr'.replace(/\s/g, ''); 
    
    console.log(`User: ${user}`);
    console.log(`Pass: ${pass} (length: ${pass.length})`);
    
    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: user,
            pass: pass
        },
        debug: true, // Enable debug output
        logger: true  // Enable logger
    });

    try {
        console.log('Verifying...');
        await transporter.verify();
        console.log('✅ Connection Successful!');
        
        console.log('Sending email...');
        await transporter.sendMail({
            from: user,
            to: user,
            subject: 'Direct Test',
            text: 'It works!'
        });
        console.log('✅ Email Sent!');
        
    } catch (error) {
        console.error('❌ Failed:', error.message);
        if (error.response) console.error('Response:', error.response);
    }
}

testDirect();