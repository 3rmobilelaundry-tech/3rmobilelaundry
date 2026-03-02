const puppeteer = require('puppeteer');

(async () => {
  try {
    console.log('Launching...');
    const browser = await puppeteer.launch({ 
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    console.log('Navigating...');
    await page.goto('http://example.com');
    console.log('Page title:', await page.title());
    await browser.close();
    console.log('Done');
  } catch (e) {
    console.error(e);
  }
})();
