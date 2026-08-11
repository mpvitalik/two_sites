module.exports = async (page, scenario, viewport, isReference) => {
  const context = page.context ? page.context() : null;
  if (context) {
    await require('./loadCookies')(context, scenario);
  }

  let username = scenario.basicAuth ? scenario.basicAuth.username : '';
  let password = scenario.basicAuth ? scenario.basicAuth.password : '';

  // Fallback: extract credentials directly from URL if basicAuth object is empty
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

      console.log(`HTTP Basic Auth (${username}) applied for ${scenario.label}`);
    } catch (err) {
      console.error('Error setting Basic Auth:', err.message);
    }
  }
};
