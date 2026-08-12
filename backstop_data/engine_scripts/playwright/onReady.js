module.exports = async (page, scenario, viewport, isReference, browserContext) => {
  console.log('SCENARIO > ' + scenario.label);
  await require('./clickAndHoverHelper')(page, scenario);

  // Wait for initial JS bundle and rendering
  const initialWait = scenario.delay || 5000;
  await page.waitForTimeout(initialWait);

  // Reset all Swiper/Slick carousels to slide 0 and stop auto-rotation
  await page.evaluate(() => {
    try {
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
          } catch (e) {}
        }
      });
    } catch (e) {}
  });

  // Auto-scroll down the page gradually to trigger lazy loading of all game cards & images
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 120);
    });
  });

  // Wait for all <img> tags to complete loading
  await page.evaluate(async () => {
    const images = Array.from(document.querySelectorAll('img'));
    await Promise.all(images.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(res => {
        img.onload = res;
        img.onerror = res;
        setTimeout(res, 2500);
      });
    }));
    window.scrollTo(0, 0);
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

  // Final small delay for layout to settle at top of page
  await page.waitForTimeout(1500);
};
