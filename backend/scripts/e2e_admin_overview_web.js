const puppeteer = require('puppeteer');

async function run() {
  const adminWeb = process.env.ADMIN_WEB_URL || 'http://localhost:5000/admin/';
  const phone = process.env.ADMIN_PHONE || '09000000000';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  console.log('E2E_ADMIN_OVERVIEW: Starting...', { phone, target: adminWeb });

  console.log('Launching browser...');
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    console.log('Navigating to', adminWeb);
    
    await page.goto(adminWeb, { waitUntil: 'domcontentloaded' });
    
    // LOGIN
    console.log('Waiting for login inputs...');
    await page.waitForSelector('input[placeholder="Phone Number"]', { timeout: 15000 });
    
    await page.type('input[placeholder="Phone Number"]', phone);
    await page.type('input[placeholder="Password"]', password);
    
    // const loginButton = await page.$x("//div[contains(text(), 'Login')]");
    let loginButton = [];
    try {
        if (page.$x) {
             loginButton = await page.$x("//div[contains(text(), 'Login')]");
        }
    } catch (e) {}

    if (loginButton.length > 0) {
        await loginButton[0].click();
    } else {
        // Fallback for button element
        const buttons = await page.$$('button');
        for (const b of buttons) {
            const txt = await page.evaluate(el => el.textContent, b);
            if (txt.includes('Login')) {
                await b.click();
                break;
            }
        }
    }
    
    console.log('Login clicked. Waiting for dashboard...');
    
    // Wait for "Command Center" which is unique to the new Overview page
    // The text might be inside a React Native Web element which usually maps to divs with specific classes or text content
    try {
        await page.waitForFunction(
            () => document.body.innerText.includes('Command Center'),
            { timeout: 30000 }
        );
        console.log('Found "Command Center" text - Overview page loaded.');
    } catch (e) {
        console.log('Could not find "Command Center". Dumping text content:');
        const text = await page.evaluate(() => document.body.innerText);
        console.log(text.substring(0, 500));
        throw new Error('Overview page did not load or "Command Center" title missing');
    }

    // Verify key metrics presence
    const pageContent = await page.evaluate(() => document.body.innerText);
    const requiredTexts = ['Total Users', 'Active Subs', 'Revenue Snapshot', 'Order Pipeline'];
    
    const missing = requiredTexts.filter(t => !pageContent.includes(t));
    
    if (missing.length > 0) {
        throw new Error(`Missing elements on Overview page: ${missing.join(', ')}`);
    }

    console.log('SUCCESS: Overview page loaded with all key sections.');

  } catch (err) {
    console.error('TEST FAILED:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
