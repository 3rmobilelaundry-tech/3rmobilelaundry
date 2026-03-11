const puppeteer = require('puppeteer');
const http = require('http');
const https = require('https');

function req(base, method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL(path, base);
    const isHttps = u.protocol === 'https:';
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
    };
    const client = isHttps ? https : http;
    const r = client.request(u, opts, (res) => {
      let buf = '';
      res.on('data', (d) => (buf += d));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, json: buf ? JSON.parse(buf) : {} });
        } catch (e) {
          reject(e);
        }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function registerStudent(base, phone, password, email) {
  const res = await req(base, 'POST', '/auth/register', { full_name: 'Student User', email, phone_number: phone, password, role: 'student' });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Register student failed ${res.status}`);
  }
  return res.json;
}

async function run() {
  const base = process.env.BASE_URL || 'http://localhost:5000';
  const userWeb = process.env.USER_WEB_URL || 'http://localhost:5000/user/';
  const phone = `081${Math.floor(Math.random() * 90000000 + 10000000)}`;
  const email = `student_${Date.now()}@example.com`;
  const password = 'student123!';
  console.log('E2E_LOGIN_DETAILS', JSON.stringify({ phone, password }));

  await registerStudent(base, phone, password, email);

  console.log('Launching browser...');
  const browser = await puppeteer.launch({ 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error') consoleErrors.push(msg.text());
  });

  console.log('Navigating to', userWeb);
  await page.goto(userWeb, { waitUntil: 'domcontentloaded' });
  console.log('Navigation complete. Waiting for selector...');

  await page.waitForSelector('input[placeholder="Phone Number"]', { timeout: 30000 });
  console.log('Selector found. Typing credentials...');
  await page.type('input[placeholder="Phone Number"]', phone);
  await page.type('input[placeholder="Password"]', password);
  console.log('Credentials typed. Clicking login...');

  const buttons = await page.$$('button');
  for (const b of buttons) {
    const txt = await page.evaluate(el => el.textContent.trim(), b);
    if (txt.toLowerCase() === 'login') {
      await b.click();
      break;
    }
  }

  console.log('Waiting for Home screen...');
  await page.waitForFunction(() => document.body.innerText.includes('Home'), { timeout: 30000 });
  console.log('Home screen loaded.');

  // Verify Book Pickup tile exists and click it
  console.log('Looking for Book Pickup...');
  await page.waitForFunction(() => document.body.innerText.includes('Book Pickup'), { timeout: 10000 });
  
  // Find and click the "Book Pickup" element. 
  const bookPickupClicked = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('div, span, p'));
    for (const el of elements) {
      if (el.textContent.trim() === 'Book Pickup') {
        el.click();
        return true;
      }
    }
    return false;
  });

  if (!bookPickupClicked) {
    throw new Error('Could not find or click "Book Pickup"');
  }

  // Wait for navigation to Book Pickup Screen
  console.log('Waiting for pickup screen...');
  await page.waitForFunction(() => document.body.innerText.includes('Schedule a laundry pickup'), { timeout: 10000 });
  
  console.log('OK student app logged in and navigated to pickup');
  await browser.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('E2E student web failed:', err.message || err);
  process.exit(1);
});
