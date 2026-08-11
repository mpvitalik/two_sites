module.exports = async (page, scenario, viewport, isReference, browserContext) => {
  console.log('SCENARIO > ' + scenario.label);
  await require('./clickAndHoverHelper')(page, scenario);

  // Wait for initial JS bundle and rendering
  await page.waitForTimeout(3000);

  // Auto-scroll down the page to trigger lazy loading of images & content
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 100);
    });
  });

  // Force hide any lingering splash / loader overlays before capturing screenshot
  await page.evaluate(() => {
    const loaders = document.querySelectorAll('.splash-screen, .app-preloader, #preloader, [class*="preloader"], [class*="splash-loader"]');
    loaders.forEach(el => {
      el.style.display = 'none';
      el.style.visibility = 'hidden';
      el.style.opacity = '0';
    });
  });

  // Freeze CSS animations for static screenshot capture
  await require('./overrideCSS')(page, scenario);

  // Final small delay for images to settle
  await page.waitForTimeout(1000);
};
