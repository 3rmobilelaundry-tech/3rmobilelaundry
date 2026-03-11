const IntegrationService = require('./src/services/integrationService');

async function testEmail() {
    console.log('Testing Email Configuration...');
    
    try {
        console.log('1. Verifying SMTP Connection...');
        // We can pass empty object to use the settings from app-settings.json
        const result = await IntegrationService.verifyEmailConfig({});
        console.log('✅ SMTP Connection Successful!');
        console.log(`   Host: ${result.host}`);
        console.log(`   Port: ${result.port}`);
        console.log(`   User: ${result.user}`);
        console.log(`   Secure: ${result.secure}`);
        
        console.log('\n2. Sending Test Email...');
        // Send a test email to the sender itself
        const success = await IntegrationService.sendEmail(
            '3rmobilelaundry@gmail.com', 
            'Test Email from 3R Mobile Laundry Backend',
            'This is a test email to verify the SMTP configuration is working correctly.\n\nTime: ' + new Date().toISOString()
        );
        
        if (success) {
            console.log('✅ Test Email Sent Successfully!');
        } else {
            console.error('❌ Failed to send test email (Integration disabled or returned false).');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('\n❌ Test Failed:');
        console.error(error.message);
        if (error.code) console.error('Code:', error.code);
        process.exit(1);
    }
}

testEmail();