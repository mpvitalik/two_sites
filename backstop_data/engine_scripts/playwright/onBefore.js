module.exports = async (page, scenario, viewport, isReference, browserContext) => {
  await require('./loadCookies')(browserContext, scenario);

  if (scenario.basicAuth && scenario.basicAuth.username) {
    const credentials = Buffer.from(`${scenario.basicAuth.username}:${scenario.basicAuth.password || ''}`).toString('base64');
    try {
      await page.setExtraHTTPHeaders({
        'Authorization': `Basic ${credentials}`
      });
      console.log(`HTTP Basic Auth header set for ${scenario.label}`);
    } catch (err) {
      console.error('Error setting Basic Auth header:', err.message);
    }
  }
};
