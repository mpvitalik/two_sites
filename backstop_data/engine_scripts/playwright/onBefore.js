module.exports = async (page, scenario, viewport, isReference) => {
  const context = page.context ? page.context() : null;
  if (context) {
    await require('./loadCookies')(context, scenario);
  }

  let username = scenario.authUsername || (scenario.basicAuth ? scenario.basicAuth.username : '');
  let password = scenario.authPassword || (scenario.basicAuth ? scenario.basicAuth.password : '');

  const targetUrl = (isReference && scenario.referenceUrl) ? scenario.referenceUrl : scenario.url;

  if (!username && targetUrl) {
    try {
      const parsed = new URL(targetUrl);
      if (parsed.username) {
        username = decodeURIComponent(parsed.username);
        password = decodeURIComponent(parsed.password || '');
      }
    } catch (e) {}
  }

  // 1. HTTP Basic Auth
  if (username) {
    const credentials = Buffer.from(`${username}:${password || ''}`).toString('base64');
    try {
      if (context && typeof context.setHTTPCredentials === 'function') {
        await context.setHTTPCredentials({ username, password: password || '' });
      }
      if (typeof page.setExtraHTTPHeaders === 'function') {
        await page.setExtraHTTPHeaders({
          'Authorization': `Basic ${credentials}`
        });
      }
      if (typeof page.route === 'function') {
        await page.route('**/*', async (route) => {
          const headers = { ...route.request().headers() };
          headers['authorization'] = `Basic ${credentials}`;
          await route.continue({ headers });
        });
      }
    } catch (err) {}
  }

  // 2. Automated Web Site User Login
  if (username && password && targetUrl) {
    try {
      const parsedUrl = new URL(targetUrl);
      const origin = `${parsedUrl.protocol}//${parsedUrl.host}`;
      const loginUrl = `${origin}/login`;

      console.log(`[AUTH] Navigating to ${loginUrl} to log in user ${username}...`);
      await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
      await page.waitForTimeout(2000);

      const emailSelector = '#login, #email, input[type="email"], input[id="login"], input[id="email"], input[name="login"]';
      const hasEmailInput = await page.$(emailSelector);

      if (hasEmailInput) {
        await page.fill(emailSelector, username);
        const passwordSelector = '#password, input[type="password"], input[id="password"]';
        await page.fill(passwordSelector, password);

        const submitSelector = 'button[type="submit"], .ui-button_kind-primary1, button:has-text("Login"), button:has-text("Вхід"), button:has-text("Войти")';
        const submitBtn = await page.$(submitSelector);
        if (submitBtn) {
          await submitBtn.click();
        } else {
          await page.keyboard.press('Enter');
        }

        await page.waitForTimeout(4000);
        console.log(`[AUTH] Site user login completed for ${origin}`);
      }
    } catch (err) {
      console.warn('[AUTH] Site login warning:', err.message);
    }
  }
};
