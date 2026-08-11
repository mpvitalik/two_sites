module.exports = async (page, scenario, viewport, isReference) => {
  const context = page.context ? page.context() : null;
  if (context) {
    await require('./loadCookies')(context, scenario);
  }

  if (scenario.basicAuth && scenario.basicAuth.username) {
    const username = scenario.basicAuth.username;
    const password = scenario.basicAuth.password || '';
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');

    try {
      // 1. Native Playwright HTTP credentials on browser context
      if (context && typeof context.setHTTPCredentials === 'function') {
        await context.setHTTPCredentials({ username, password });
      }

      // 2. Extra HTTP Headers for initial navigation
      if (typeof page.setExtraHTTPHeaders === 'function') {
        await page.setExtraHTTPHeaders({
          'Authorization': `Basic ${credentials}`
        });
      }

      // 3. Route interception for all subresources (images, scripts, styles, fonts)
      if (typeof page.route === 'function') {
        await page.route('**/*', async (route) => {
          const headers = { ...route.request().headers() };
          headers['authorization'] = `Basic ${credentials}`;
          await route.continue({ headers });
        });
      }

      console.log(`HTTP Basic Auth set up for scenario: ${scenario.label}`);
    } catch (err) {
      console.error('Error setting Basic Auth:', err.message);
    }
  }
};
