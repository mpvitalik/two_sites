module.exports = async (page, scenario, viewport, isReference, browserContext) => {
  console.log('SCENARIO > ' + scenario.label);

  // 1. User Authorization Check & On-page Login
  const siteUsername = scenario.authUsername || (scenario.basicAuth ? scenario.basicAuth.username : '');
  const sitePassword = scenario.authPassword || (scenario.basicAuth ? scenario.basicAuth.password : '');

  if (siteUsername && sitePassword) {
    try {
      // Check if user is not authorized (Login button is visible in header)
      const loginBtnSelector = 'a[href*="login"], button:has-text("Login"), button:has-text("Вхід"), button:has-text("Вход"), .login-btn, [aria-label*="sign in" i]';
      const loginBtn = await page.$(loginBtnSelector);

      if (loginBtn) {
        console.log(`[AUTH] User not logged in on ${scenario.label}. Performing on-page login for ${siteUsername}...`);
        await loginBtn.click().catch(() => {});
        await page.waitForTimeout(2000);

        const emailSelector = '#login, #email, input[type="email"], input[id="login"], input[id="email"], input[name="login"]';
        const passwordSelector = '#password, input[type="password"], input[id="password"]';

        const emailInput = await page.$(emailSelector);
        if (emailInput) {
          await page.focus(emailSelector);
          await page.fill(emailSelector, siteUsername);
          await page.dispatchEvent(emailSelector, 'input');
          await page.dispatchEvent(emailSelector, 'change');

          await page.focus(passwordSelector);
          await page.fill(passwordSelector, sitePassword);
          await page.dispatchEvent(passwordSelector, 'input');
          await page.dispatchEvent(passwordSelector, 'change');

          await page.waitForTimeout(500);

          const submitSelector = 'button[type="submit"], .ui-button_kind-primary1, button:has-text("Login"), button:has-text("Вхід"), button:has-text("Войти")';
          const submitBtn = await page.$(submitSelector);
          if (submitBtn) {
            await submitBtn.click().catch(() => {});
          } else {
            await page.keyboard.press('Enter').catch(() => {});
          }

          // Wait for login request, cookies, and UI transition to user account state
          await page.waitForTimeout(6000);
          console.log(`[AUTH] On-page login complete for ${scenario.label}`);
        }
      } else {
        console.log(`[AUTH] User is already authorized on ${scenario.label}`);
      }
    } catch (err) {
      console.warn('[AUTH] On-page login warning:', err.message);
    }
  }

  try {
    await require('./clickAndHoverHelper')(page, scenario);
  } catch (e) {}

  // 2. Initial short wait for rendering
  try {
    await page.waitForTimeout(2000);
  } catch (e) {}

  // 3. Reset Swiper/Slick carousels to slide 0 and stop auto-rotation
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

  // 4. Smooth auto-scroll down the page to trigger lazy loading of images
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

  // 5. Force hide lingering splash loaders, registration/login modals, and dark backdrops, then scroll to top
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

  // 6. Freeze CSS animations for static screenshot capture
  try {
    await require('./overrideCSS')(page, scenario);
  } catch (e) {}

  // 7. Settlement delay at top of page
  try {
    await page.waitForTimeout(1000);
  } catch (e) {}
};
