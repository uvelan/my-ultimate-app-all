const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`[PAGE LOG] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.error(`[PAGE ERROR] ${err.toString()}\n${err.stack}`);
  });

  console.log("Navigating to http://localhost:3000/resume-builder ...");
  try {
    await page.goto('http://localhost:3000/resume-builder', { waitUntil: 'networkidle2', timeout: 30000 });
  } catch (e) {
    console.error("Navigation error:", e);
  }

  // Wait a bit to let React render and throw errors if any
  await new Promise(r => setTimeout(r, 5000));
  
  await browser.close();
  console.log("Done.");
})();
