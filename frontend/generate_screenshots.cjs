const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('Generating screenshots from .txt benchmarks...');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const screenshotsDir = path.join(__dirname, '../benchmarks/screenshots');
  const files = fs.readdirSync(screenshotsDir).filter(f => f.endsWith('.txt'));

  for (const file of files) {
    const filePath = path.join(screenshotsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Create terminal-like HTML
    const html = `
      <html>
        <body style="background-color: #1e1e1e; color: #d4d4d4; font-family: 'Consolas', 'Courier New', monospace; padding: 20px; margin: 0; width: 800px;">
          <h3 style="color: #4CAF50; margin-top: 0;">${file}</h3>
          <div style="background-color: #252526; padding: 15px; border-radius: 5px; border: 1px solid #333; display: inline-block;">
            <pre style="margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.4;">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
          </div>
        </body>
      </html>
    `;
    
    await page.setContent(html);
    
    // Allow rendering time
    await page.waitForTimeout(100);
    
    // Take a full-page screenshot
    const pngPath = path.join(screenshotsDir, file.replace('.txt', '.png'));
    await page.screenshot({ path: pngPath, fullPage: true });
    
    console.log('Generated:', pngPath);
    
    // Clean up .txt file
    fs.unlinkSync(filePath);
  }

  await browser.close();
  console.log('Done! All screenshots generated correctly.');
})().catch(err => {
  console.error("Failed:", err);
  process.exit(1);
});
