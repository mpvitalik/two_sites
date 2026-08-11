module.exports = async (page, scenario, viewport, isReference, browserContext) => {
  await require('./loadCookies')(browserContext, scenario);

  if (scenario.basicAuth && scenario.basicAuth.username) {
    const credentials = Buffer.from(`${scenario.basicAuth.username}:${scenario.basicAuth.password || ''}`).toString('base64');
    try {
      if (browserContext && typeof browserContext.setHTTPCredentials === 'function') {
        await browserContext.setHTTPCredentials({
          username: scenario.basicAuth.username,
          password: scenario.basicAuth.password || ''
        });
      }
      await page.setExtraHTTPHeaders({
        'Authorization': `Basic ${credentials}`
      });
      console.log(`HTTP Basic Auth set for ${scenario.label}`);
    } catch (err) {
      console.error('Error setting Basic Auth:', err.message);
    }
  }
};
