module.exports = async (page, scenario, viewport, isReference, browserContext) => {
  console.log('SCENARIO > ' + scenario.label);
  await require('./clickAndHoverHelper')(page, scenario);

  // Freeze CSS animations & transitions
  await require('./overrideCSS')(page, scenario);

  // Wait for initial splash loader or preloader overlay to disappear
  try {
    await page.waitForFunction(() => {
      const splash = document.querySelector('.splash-screen, .app-preloader, #preloader, [class*="preloader"], [class*="splash-loader"]');
      if (!splash) return true;
      const style = window.getComputedStyle(splash);
      return style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
    }, { timeout: 8000 }).catch(() => {});
  } catch (e) {}

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

  // Small delay for any pending lazy-loaded images to finish rendering
  await page.waitForTimeout(2000);
};
