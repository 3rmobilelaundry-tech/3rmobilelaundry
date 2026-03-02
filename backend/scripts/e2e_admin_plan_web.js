const puppeteer = require('puppeteer');

async function run() {
  const adminWeb = process.env.ADMIN_WEB_URL || 'http://localhost:19006';
  const phone = process.env.ADMIN_PHONE || '09000000000';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  console.log('E2E_ADMIN_LOGIN_DETAILS', JSON.stringify({ phone, password }));

  console.log('Launching browser...');
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  console.log('Browser launched. New page...');
  const page = await browser.newPage();
  console.log('Page created. Navigating to', adminWeb);

  const consoleErrors = [];
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error') consoleErrors.push(msg.text());
  });

  await page.goto(adminWeb, { waitUntil: 'domcontentloaded' });
  console.log('Navigation complete. Waiting for selector (timeout 10s)...');

  try {
    await page.waitForSelector('input[placeholder="Phone Number"]', { timeout: 10000 });
  } catch (e) {
    console.log('Selector not found. Page content dump:');
    const content = await page.content();
    console.log(content.substring(0, 1000)); // Print first 1000 chars
    throw e;
  }
  console.log('Selector found. Typing credentials...');
  await page.type('input[placeholder=\"Phone Number\"]', phone);
  await page.type('input[placeholder=\"Password\"]', password);
  console.log('Credentials typed. Clicking login...');

  const buttons = await page.$$('button');
  for (const b of buttons) {
    const txt = await page.evaluate((el) => el.textContent.trim(), b);
    if (txt.toLowerCase() === 'login') {
      await b.click();
      break;
    }
  }

  await page.waitForFunction(
    () => document.body.innerText.includes('Staff Portal'),
    { timeout: 30000 }
  );

  if (consoleErrors.length) {
    await browser.close();
    throw new Error(`Console errors: ${consoleErrors.join(' | ')}`);
  }

  console.log('OK admin app logged in and dashboard loaded');
  await browser.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('E2E admin web failed:', err.message || err);
  process.exit(1);
});
