const fs = require('fs');
const path = require('path');

module.exports = async (page, scenario, viewport, isReference) => {
  const context = page.context ? page.context() : null;

  // 1. HTTP Basic Auth (for Nginx 401 wall only)
  const httpUsername = scenario.httpAuthUsername || (scenario.basicAuth ? scenario.basicAuth.username : '');
  const httpPassword = scenario.httpAuthPassword || (scenario.basicAuth ? scenario.basicAuth.password : '');

  if (httpUsername && context && typeof context.setHTTPCredentials === 'function') {
    try {
      await context.setHTTPCredentials({ username: httpUsername, password: httpPassword || '' });
    } catch (err) {}
  }

  // 2. Load pre-authenticated storageState for both reference and test domains
  const rootDir = process.cwd();
  const stateFiles = [
    path.join(rootDir, 'backstop_data', 'engine_scripts', 'cookies_reference.json'),
    path.join(rootDir, 'backstop_data', 'engine_scripts', 'cookies_test.json'),
    path.join(rootDir, 'backstop_data', 'engine_scripts', 'cookies.json')
  ];

  for (const targetStatePath of stateFiles) {
    if (fs.existsSync(targetStatePath) && context) {
      try {
        const stateContent = fs.readFileSync(targetStatePath, 'utf8');
        const storageState = JSON.parse(stateContent);

        if (storageState.cookies && Array.isArray(storageState.cookies) && storageState.cookies.length > 0) {
          await context.addCookies(storageState.cookies).catch(() => {});
        }

        if (storageState.origins && Array.isArray(storageState.origins)) {
          for (const originState of storageState.origins) {
            if (originState.localStorage && Array.isArray(originState.localStorage) && originState.localStorage.length > 0) {
              await page.addInitScript(({ targetOrigin, entries }) => {
                try {
                  if (window.location.origin === targetOrigin || targetOrigin.includes(window.location.hostname)) {
                    for (const entry of entries) {
                      window.localStorage.setItem(entry.name, entry.value);
                    }
                  }
                } catch (e) {}
              }, { targetOrigin: originState.origin, entries: originState.localStorage }).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.warn('StorageState load warning:', err.message);
      }
    }
  }
};
