module.exports = async (page, scenario, viewport, isReference, browserContext) => {
  console.log('SCENARIO > ' + scenario.label);

  try {
    await require('./clickAndHoverHelper')(page, scenario);
  } catch (e) {}

  // 1. Initial short wait for rendering
  try {
    await page.waitForTimeout(2000);
  } catch (e) {}

  // 2. Reset Swiper/Slick carousels to slide 0 and stop auto-rotation
  try {
    await page.evaluate(() => {
      const swipers = document.querySelectorAll('.swiper, .swiper-container, [class*="swiper"], .slick-slider');
      swipers.forEach(s => {
        if (s && s.swiper) {
          try {
            if (s.swiper.autoplay && typeof s.swiper.autoplay.stop === 'function') {
              s.swiper.autoplay.stop();
            }
            if (typeof s.swiper.slideTo === 'function') {
              s.swiper.slideTo(0, 0);
            }
          } catch (err) {}
        }
      });
    });
  } catch (e) {}

  // 3. Smooth auto-scroll down the page to trigger lazy loading of images
  try {
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
            resolve();
          }
        }, 80);
      });
    });
  } catch (e) {}

  // 4. Force hide lingering splash loaders, registration/login modals, and dark backdrops, then scroll to top
  try {
    await page.evaluate(() => {
      const selectors = [
        '.splash-screen', '.app-preloader', '#preloader', '[class*="preloader"]', '[class*="splash-loader"]',
        '[class*="login-modal"]', '[class*="auth-modal"]', '[class*="registration"]', '[class*="signup"]',
        '.ui-modal', '[class*="modal-backdrop"]', '[class*="overlay-backdrop"]', '[class*="dimmer"]'
      ];
      const elements = document.querySelectorAll(selectors.join(', '));
      elements.forEach(el => {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('opacity', '0', 'important');
      });
      window.scrollTo(0, 0);
    });
  } catch (e) {}

  // 5. Freeze CSS animations for static screenshot capture
  try {
    await require('./overrideCSS')(page, scenario);
  } catch (e) {}

  // 6. Settlement delay at top of page
  try {
    await page.waitForTimeout(1000);
  } catch (e) {}
};
