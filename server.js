const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { request: playwrightRequest, chromium } = require('playwright');
const backstop = require('backstopjs');

const app = express();
const PORT = process.env.PORT || 3030;

let activeChildProcess = null;

// Helper to ensure all required Backstop directories exist on disk
function ensureBackstopDirectories() {
  const dirs = [
    path.join(__dirname, 'backstop_data'),
    path.join(__dirname, 'backstop_data', 'bitmaps_reference'),
    path.join(__dirname, 'backstop_data', 'bitmaps_test'),
    path.join(__dirname, 'backstop_data', 'engine_scripts'),
    path.join(__dirname, 'backstop_data', 'html_report'),
    path.join(__dirname, 'backstop_data', 'ci_report'),
    path.join(__dirname, 'backstop_data', 'debug')
  ];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (e) {}
    }
  });

  // Ensure html_report template files (index.html, index_bundle.js, etc.) exist
  const htmlReportDir = path.join(__dirname, 'backstop_data', 'html_report');
  const indexHtmlPath = path.join(htmlReportDir, 'index.html');
  if (!fs.existsSync(indexHtmlPath)) {
    try {
      const templateDir = path.join(__dirname, 'node_modules', 'backstopjs', 'compare', 'output');
      if (fs.existsSync(templateDir)) {
        fs.cpSync(templateDir, htmlReportDir, { recursive: true });
        console.log('Successfully copied BackstopJS HTML report templates to backstop_data/html_report.');
      }
    } catch (e) {
      console.warn('Could not copy BackstopJS HTML report templates:', e.message);
    }
  }
}
ensureBackstopDirectories();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/backstop_data', express.static(path.join(__dirname, 'backstop_data'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// Serve noVNC HTML5 client static files
if (fs.existsSync('/usr/share/novnc')) {
  app.use('/novnc', express.static('/usr/share/novnc'));
}

// Helper to fetch text content using Playwright HTTP client with fallback to native node http
async function fetchUrlContent(url, username, password) {
  const extraHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };

  if (username) {
    extraHeaders['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password || ''}`).toString('base64');
  }

  try {
    const apiReq = await playwrightRequest.newContext({
      extraHTTPHeaders: extraHeaders,
      ignoreHTTPSErrors: true
    });
    const res = await apiReq.get(url, { timeout: 15000 });
    const text = await res.text();
    await apiReq.dispose();
    if (res.status() === 200 && text && text.trim().length > 0) {
      return text;
    }
  } catch (e) {
    console.warn(`Playwright fetch failed for ${url}, trying fallback:`, e.message);
  }

  // Fallback to native https/http module
  return new Promise((resolve, reject) => {
    try {
      const options = {
        headers: extraHeaders
      };
      const client = url.startsWith('https') ? https : http;
      client.get(url, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let redirectUrl = res.headers.location;
          if (redirectUrl.startsWith('/')) {
            const parsed = new URL(url);
            redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
          }
          return fetchUrlContent(redirectUrl, username, password).then(resolve).catch(reject);
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', err => reject(err));
    } catch (e) {
      reject(e);
    }
  });
}

// Helper to extract locale prefix from a pathname
function getUrlLocale(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length > 0 && /^[a-z]{2}(-[a-z]{2,4})?$/i.test(parts[0])) {
    return parts[0].toLowerCase();
  }
  return 'root';
}

// Helper to extract <loc> URLs from sitemap XML content
function extractSitemapUrls(xmlContent) {
  if (!xmlContent) return [];
  const locRegex = /<loc>(.*?)<\/loc>/g;
  const urls = [];
  let match;
  while ((match = locRegex.exec(xmlContent)) !== null) {
    if (match[1]) urls.push(match[1].trim());
  }
  return urls;
}

// Helper to filter URLs based on user checkboxes
function filterUrls(urls, allowedLocales = [], excludeGames = true, excludeSports = true) {
  return urls.filter(url => {
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname;

      if (excludeGames && pathname.includes('/game/')) {
        return false;
      }

      if (excludeSports && (pathname.includes('/sport') || pathname.includes('/sports'))) {
        return false;
      }

      if (allowedLocales && allowedLocales.length > 0) {
        const locale = getUrlLocale(pathname);
        if (!allowedLocales.includes(locale)) {
          return false;
        }
      }

      return true;
    } catch (e) {
      return false;
    }
  });
}

// Helper to pair reference URLs with test domain URLs
function pairSitemapUrls(refUrls, testSitemapUrl, testUrls = []) {
  let testOrigin = '';
  try {
    const testParsed = new URL(testSitemapUrl);
    testOrigin = `${testParsed.protocol}//${testParsed.host}`;
  } catch (e) {
    testOrigin = '';
  }

  const testMap = new Map();
  testUrls.forEach(u => {
    try {
      const p = new URL(u).pathname;
      testMap.set(p, u);
    } catch (e) {}
  });

  const pairs = [];
  const counts = {};

  refUrls.forEach(refUrl => {
    try {
      const pathname = new URL(refUrl).pathname;
      let targetTestUrl = testMap.get(pathname);
      if (!targetTestUrl && testOrigin) {
        targetTestUrl = `${testOrigin}${pathname}`;
      }

      if (targetTestUrl) {
        let label = pathname;
        if (!label || label === '/') label = 'Homepage';

        if (counts[label]) {
          counts[label]++;
          label = `${label} (${counts[label]})`;
        } else {
          counts[label] = 1;
        }

        pairs.push({
          label,
          referenceUrl: refUrl,
          url: targetTestUrl
        });
      }
    } catch (e) {}
  });

  return pairs;
}

// Saves a screenshot + light DOM dump so a failed login can be diagnosed without
// needing live access to the target site.
async function saveLoginDebugArtifacts(page, origin, tag) {
  try {
    const debugDir = path.join(__dirname, 'backstop_data', 'debug');
    if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
    const safeName = origin.replace(/[^a-z0-9]+/gi, '_') + '_' + tag;
    const pngPath = path.join(debugDir, `${safeName}.png`);
    const jsonPath = path.join(debugDir, `${safeName}.json`);

    await page.screenshot({ path: pngPath, fullPage: false }).catch(() => {});

    const info = await page.evaluate(() => {
      const clickables = [...document.querySelectorAll('a, button')]
        .map(n => ({
          tag: n.tagName,
          text: (n.innerText || '').trim().slice(0, 40),
          href: n.getAttribute('href') || null,
          cls: (n.className && typeof n.className === 'string') ? n.className.slice(0, 100) : ''
        }))
        .filter(n => n.text.length > 0)
        .slice(0, 60);
      const inputs = [...document.querySelectorAll('input')].map(i => ({
        type: i.type, id: i.id, name: i.name, placeholder: i.placeholder
      }));
      return {
        title: document.title,
        bodyTextSnippet: (document.body.innerText || '').slice(0, 500),
        clickables,
        inputs
      };
    }).catch(() => ({}));

    fs.writeFileSync(jsonPath, JSON.stringify({ url: page.url(), ...info }, null, 2), 'utf8');
    console.log(`[ONE-TIME-LOGIN] Debug artifacts saved: ${pngPath}`);
  } catch (e) {
    console.warn('[ONE-TIME-LOGIN] Failed to save debug artifacts:', e.message);
  }
}

// Dedicated One-Time Login Helper using Playwright
async function performOneTimeSiteLogin(origin, username, password, httpAuthUsername, httpAuthPassword, storageStatePath) {
  const extraHeaders = {};
  if (httpAuthUsername) {
    extraHeaders['Authorization'] = 'Basic ' + Buffer.from(`${httpAuthUsername}:${httpAuthPassword || ''}`).toString('base64');
  }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    extraHTTPHeaders: extraHeaders,
    ignoreHTTPSErrors: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
  });

  if (httpAuthUsername) {
    await context.setHTTPCredentials({ username: httpAuthUsername, password: httpAuthPassword || '' });
  }

  const page = await context.newPage();
  const cleanOrigin = origin.replace(/\/$/, '');

  const emailSelector = '#login, input[type="email"], input[id="login"], input[id="email"], input[name="login"]';
  const passwordSelector = '#password, input[type="password"], input[id="password"]';
  // Header "Login" button only — must not match "Sign Up" / registration links.
  const headerLoginSelector = 'header a[href*="login"]:not([href*="registration"]), header button:has-text("Login"), a[href$="/login"], button:has-text("Log in")';
  // Text-based fallback in case the button isn't inside a <header> or is a styled <div>/<span>.
  const textLoginLocator = 'text=/^\\s*(Login|Log in|Вхід|Войти)\\s*$/i';
  // The "Already have an account? Log in" link that switches a registration modal back to login.
  const switchToLoginSelector = 'a:has-text("Log in"), button:has-text("Log in"), a:has-text("Вхід"), a:has-text("Войти")';

  console.log(`[ONE-TIME-LOGIN] Opening ${cleanOrigin} for user ${username}...`);
  await page.goto(cleanOrigin, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);

  let loginFormOpened = false;

  // 1) Preferred path: click the header "Login" button. On SPA sites (e.g. bons.com)
  //    a direct /login navigation redirects to the registration flow instead, so we
  //    open the login form the same way a real visitor would — via the header button.
  try {
    const headerBtn = await page.$(headerLoginSelector);
    if (headerBtn) {
      await headerBtn.click();
      await page.waitForTimeout(1500);
      if (await page.$(emailSelector)) loginFormOpened = true;
    }
  } catch (e) {}

  // 1b) Fallback: same intent, matched by visible text rather than tag/class,
  //     in case "Login" isn't an <a>/<button> inside a <header>.
  if (!loginFormOpened) {
    try {
      const textBtn = page.locator(textLoginLocator).first();
      if (await textBtn.count()) {
        await textBtn.click({ timeout: 5000 });
        await page.waitForTimeout(1500);
        if (await page.$(emailSelector)) loginFormOpened = true;
      }
    } catch (e) {}
  }

  // 2) If we still ended up on the registration modal (no header button, or the click
  //    itself redirected to /registration), use its "Already have an account? Log in"
  //    link to switch to the login form without leaving the page.
  if (!loginFormOpened) {
    try {
      const switchLink = await page.$(switchToLoginSelector);
      if (switchLink) {
        await switchLink.click();
        await page.waitForTimeout(1500);
        if (await page.$(emailSelector)) loginFormOpened = true;
      }
    } catch (e) {}
  }

  // 3) Last resort: some domains (e.g. rc.bons.com) serve a real standalone /login page.
  if (!loginFormOpened) {
    await page.goto(`${cleanOrigin}/login`, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(1500);
    if (await page.$(emailSelector)) loginFormOpened = true;
  }

  if (!loginFormOpened) {
    await saveLoginDebugArtifacts(page, cleanOrigin, 'form-not-found');
    await browser.close();
    throw new Error(`Не вдалося відкрити форму входу на ${cleanOrigin} (сайт постійно показує форму реєстрації замість логіну). Діагностику збережено в backstop_data/debug/.`);
  }

  await page.focus(emailSelector);
  await page.fill(emailSelector, username);
  await page.dispatchEvent(emailSelector, 'input');
  await page.dispatchEvent(emailSelector, 'change');

  await page.focus(passwordSelector);
  await page.fill(passwordSelector, password);
  await page.dispatchEvent(passwordSelector, 'input');
  await page.dispatchEvent(passwordSelector, 'change');

  await page.waitForTimeout(500);

  // Submit strictly the LOGIN button. The previous selector (".ui-button_kind-primary1")
  // also matched the registration modal's "Finish" button, which is how the login
  // silently turned into a registration attempt on bons.com.
  const submitSelector = 'button[type="submit"]:has-text("Login"), button[type="submit"]:has-text("Log in"), button:has-text("Log in"), button:has-text("Вхід"), button:has-text("Войти")';
  const submitBtn = await page.$(submitSelector);

  if (submitBtn) {
    await submitBtn.click();
  } else {
    await page.keyboard.press('Enter');
  }

  await page.waitForTimeout(4500);

  // Verify success by actual DOM/URL state instead of trusting a loosely-matched
  // network response (the old check treated ANY 200 response containing "/auth" as
  // proof of login, which false-positived while still stuck on the registration form).
  const currentUrl = page.url();
  const stillOnRegistration = currentUrl.includes('/registration');
  const loginBtnStillVisible = await page.$(headerLoginSelector).catch(() => null);

  if (stillOnRegistration || loginBtnStillVisible) {
    await saveLoginDebugArtifacts(page, cleanOrigin, 'login-verify-failed');
    const captchaBlocked = await page.evaluate(() => /captcha/i.test(document.body.innerText || '')).catch(() => false);
    await browser.close();
    if (captchaBlocked) {
      throw new Error(`Сайт ${cleanOrigin} заблокував автоматичний вхід через reCAPTCHA ("Wrong captcha value"). Це не проблема логіна/пароля — Google reCAPTCHA неможливо пройти скриптом. Виконайте одноразовий РУЧНИЙ вхід: у терміналі запустіть "npm run login:manual", залогіньтесь у вікні браузера, що відкриється (включно з капчею), і натисніть Enter. Після цього залиште поля Логін/Пароль порожніми при запуску порівняння — збережена сесія підхопиться автоматично.`);
    }
    throw new Error(`Авторизація на ${cleanOrigin} не вдалася: після входу сайт все ще показує форму реєстрації або кнопку "Login". Перевірте логін та пароль. Діагностику збережено в backstop_data/debug/.`);
  }

  // Save complete Playwright storageState (cookies + localStorage)
  await context.storageState({ path: storageStatePath });
  console.log(`[ONE-TIME-LOGIN] StorageState saved to ${storageStatePath}`);

  await browser.close();
}

// API: Stop active comparison process
app.post('/api/stop', (req, res) => {
  if (activeChildProcess) {
    try {
      activeChildProcess.kill('SIGKILL');
      activeChildProcess = null;
      console.log('Process killed by user request.');
      return res.json({ success: true, message: 'Процес порівняння успішно зупинено.' });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
  res.json({ success: true, message: 'Немає активних процесів для зупинки.' });
});

let activeVncState = {
  active: false,
  xvfbProc: null,
  x11vncProc: null,
  browser: null,
  context: null,
  startedAt: null
};

async function stopVncSession() {
  if (activeVncState.browser) {
    try { await activeVncState.browser.close(); } catch (e) {}
  }
  if (activeVncState.xvfbProc) {
    try { activeVncState.xvfbProc.kill('SIGKILL'); } catch (e) {}
  }
  if (activeVncState.x11vncProc) {
    try { activeVncState.x11vncProc.kill('SIGKILL'); } catch (e) {}
  }
  try {
    exec('pkill -9 -f "Xvfb :99" || true; pkill -9 -f "x11vnc.*5900" || true');
  } catch (e) {}
  activeVncState = { active: false, xvfbProc: null, x11vncProc: null, browser: null, context: null, startedAt: null };
}

// API: Get VNC Status
app.get('/api/vnc/status', (req, res) => {
  const host = req.headers.host ? req.headers.host.split(':')[0] : '94.176.211.242';
  res.json({
    success: true,
    active: activeVncState.active,
    startedAt: activeVncState.startedAt,
    vncUrl: activeVncState.active ? `vnc://${host}:5900` : null
  });
});

// API: Start Remote VNC Session
app.post('/api/vnc/start', async (req, res) => {
  try {
    if (activeVncState.active) {
      await stopVncSession();
    }

    const { spawn } = require('child_process');

    exec('pkill -9 -f "Xvfb :99" || true; pkill -9 -f "x11vnc.*5900" || true');
    await new Promise(r => setTimeout(r, 600));

    const xvfbProc = spawn('Xvfb', [':99', '-screen', '0', '1440x900x24'], { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 1000));

    const x11vncProc = spawn('x11vnc', ['-display', ':99', '-rfbport', '5900', '-nopw', '-forever', '-shared'], { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 1000));

    const browser = await chromium.launch({
      headless: false,
      env: { ...process.env, DISPLAY: ':99' },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1440,900'
      ]
    });

    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36'
    });

    const page1 = await context.newPage();
    await page1.goto('https://bons.com', { waitUntil: 'domcontentloaded' }).catch(() => {});

    const page2 = await context.newPage();
    await page2.goto('https://rc.bons.com', { waitUntil: 'domcontentloaded' }).catch(() => {});

    activeVncState = {
      active: true,
      xvfbProc,
      x11vncProc,
      browser,
      context,
      startedAt: Date.now()
    };

    const host = req.headers.host ? req.headers.host.split(':')[0] : '94.176.211.242';
    const vncUrl = `vnc://${host}:5900`;

    res.json({
      success: true,
      active: true,
      message: 'VNC сервер успішно запущено на порту 5900!',
      vncUrl
    });
  } catch (err) {
    console.error('Failed to start VNC session:', err);
    await stopVncSession();
    res.status(500).json({ success: false, error: `Не вдалося запустити VNC на сервері: ${err.message}` });
  }
});

// API: Save VNC Session
app.post('/api/vnc/save', async (req, res) => {
  try {
    if (!activeVncState.active || !activeVncState.context) {
      return res.status(400).json({ success: false, error: 'VNC сесія не активна.' });
    }

    const refPath = path.join(__dirname, 'backstop_data', 'engine_scripts', 'cookies_reference.json');
    const testPath = path.join(__dirname, 'backstop_data', 'engine_scripts', 'cookies_test.json');

    ensureBackstopDirectories();

    await activeVncState.context.storageState({ path: refPath });
    await activeVncState.context.storageState({ path: testPath });

    console.log(`[VNC-WEB] StorageState saved to ${refPath} & ${testPath}`);

    await stopVncSession();

    res.json({
      success: true,
      message: 'Авторизаційні кукі успішно збережено у cookies_reference.json та cookies_test.json!'
    });
  } catch (err) {
    console.error('Failed to save VNC session:', err);
    res.status(500).json({ success: false, error: `Помилка збереження сесії VNC: ${err.message}` });
  }
});

// API: Stop VNC Session
app.post('/api/vnc/stop', async (req, res) => {
  try {
    await stopVncSession();
    res.json({ success: true, message: 'VNC сесію зупинено.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Count Sitemap Pages
app.post('/api/count-sitemap', async (req, res) => {
  try {
    const { referenceSitemapUrl, testSitemapUrl, allowedLocales = [], excludeGames = true, excludeSports = true, httpAuthUsername, httpAuthPassword } = req.body;

    if (!referenceSitemapUrl) {
      return res.status(400).json({ success: false, error: 'Reference Sitemap URL is required.' });
    }

    let refXml = '';
    try {
      refXml = await fetchUrlContent(referenceSitemapUrl, httpAuthUsername, httpAuthPassword);
    } catch (err) {
      return res.status(400).json({ success: false, error: `Не вдалося завантажити Reference Sitemap: ${err.message}` });
    }

    const refUrls = extractSitemapUrls(refXml);
    if (refUrls.length === 0) {
      return res.status(400).json({ success: false, error: 'Не знайдено жодного <loc> URL у Reference Sitemap. Перевірте посилання на sitemap.xml' });
    }

    let testUrls = [];
    if (testSitemapUrl) {
      try {
        const testXml = await fetchUrlContent(testSitemapUrl, httpAuthUsername, httpAuthPassword);
        testUrls = extractSitemapUrls(testXml);
      } catch (e) {}
    }

    const filteredRefUrls = filterUrls(refUrls, allowedLocales, excludeGames, excludeSports);
    const pairs = pairSitemapUrls(filteredRefUrls, testSitemapUrl || referenceSitemapUrl, testUrls);

    res.json({
      success: true,
      totalFoundInSitemap: refUrls.length,
      count: pairs.length,
      samplePairs: pairs.slice(0, 10)
    });
  } catch (err) {
    console.error('Count sitemap error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Single Pair Compare
app.post('/api/compare', async (req, res) => {
  try {
    const { referenceUrl, testUrl, width = 1920, height = 1080, label = 'Custom Comparison', misMatchThreshold = 6.0, hideSelectors = [], siteUserUsername, siteUserPassword, httpAuthUsername, httpAuthPassword, delay = 6000 } = req.body;

    if (!referenceUrl || !testUrl) {
      return res.status(400).json({ success: false, error: 'Reference and Test URLs are required.' });
    }

    const parsedThreshold = parseFloat(misMatchThreshold) || 6.0;
    const parsedDelay = parseInt(delay) || 6000;

    const parsedHideSelectors = Array.isArray(hideSelectors)
      ? hideSelectors
      : (typeof hideSelectors === 'string' && hideSelectors.trim() ? hideSelectors.split(',').map(s => s.trim()) : []);

    const basicAuth = httpAuthUsername ? { username: httpAuthUsername, password: httpAuthPassword || '' } : null;

    const scenarios = [
      {
        label: label || 'Custom Comparison',
        cookiePath: 'backstop_data/engine_scripts/cookies_reference.json',
        url: testUrl,
        referenceUrl: referenceUrl,
        basicAuth: basicAuth,
        httpAuthUsername: httpAuthUsername || '',
        httpAuthPassword: httpAuthPassword || '',
        readyEvent: '',
        readySelector: '',
        delay: parsedDelay,
        hideSelectors: parsedHideSelectors,
        removeSelectors: [],
        hoverSelector: '',
        clickSelector: '',
        postInteractionWait: 0,
        selectors: ['document'],
        selectorExpansion: true,
        expect: 0,
        misMatchThreshold: parsedThreshold,
        requireSameDimensions: false
      }
    ];

    await runBackstopSuite(scenarios, width, height, siteUserUsername, siteUserPassword, httpAuthUsername, httpAuthPassword, res);
  } catch (err) {
    console.error('Comparison error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: List Bulk Compare
app.post('/api/compare-list', async (req, res) => {
  try {
    const { referenceUrls = [], testUrls = [], width = 1920, height = 1080, misMatchThreshold = 6.0, hideSelectors = [], siteUserUsername, siteUserPassword, httpAuthUsername, httpAuthPassword, delay = 6000 } = req.body;

    const refList = Array.isArray(referenceUrls)
      ? referenceUrls.map(u => u.trim()).filter(Boolean)
      : (typeof referenceUrls === 'string' ? referenceUrls.split('\n').map(u => u.trim()).filter(Boolean) : []);

    const testList = Array.isArray(testUrls)
      ? testUrls.map(u => u.trim()).filter(Boolean)
      : (typeof testUrls === 'string' ? testUrls.split('\n').map(u => u.trim()).filter(Boolean) : []);

    if (refList.length === 0) {
      return res.status(400).json({ success: false, error: 'Список еталонних сторінок порожній.' });
    }

    const parsedThreshold = parseFloat(misMatchThreshold) || 6.0;
    const parsedDelay = parseInt(delay) || 6000;
    const parsedHideSelectors = Array.isArray(hideSelectors)
      ? hideSelectors
      : (typeof hideSelectors === 'string' && hideSelectors.trim() ? hideSelectors.split(',').map(s => s.trim()) : []);

    const basicAuth = httpAuthUsername ? { username: httpAuthUsername, password: httpAuthPassword || '' } : null;

    const pairs = [];
    const counts = {};

    refList.forEach((refUrl, idx) => {
      let targetTestUrl = testList[idx];
      if (!targetTestUrl) {
        try {
          const p = new URL(refUrl);
          if (!p.hostname.startsWith('rc.')) {
            p.hostname = 'rc.' + p.hostname;
          }
          targetTestUrl = p.toString();
        } catch (e) {
          targetTestUrl = refUrl;
        }
      }

      let label = '';
      try {
        label = new URL(refUrl).pathname;
      } catch (e) {
        label = `Page ${idx + 1}`;
      }
      if (!label || label === '/') label = 'Homepage';

      if (counts[label]) {
        counts[label]++;
        label = `${label} (${counts[label]})`;
      } else {
        counts[label] = 1;
      }

      pairs.push({
        label,
        referenceUrl: refUrl,
        url: targetTestUrl
      });
    });

    const scenarios = pairs.map(p => ({
      label: p.label,
      cookiePath: 'backstop_data/engine_scripts/cookies_reference.json',
      url: p.url,
      referenceUrl: p.referenceUrl,
      basicAuth: basicAuth,
      httpAuthUsername: httpAuthUsername || '',
      httpAuthPassword: httpAuthPassword || '',
      readyEvent: '',
      readySelector: '',
      delay: parsedDelay,
      hideSelectors: parsedHideSelectors,
      removeSelectors: [],
      hoverSelector: '',
      clickSelector: '',
      postInteractionWait: 0,
      selectors: ['document'],
      selectorExpansion: true,
      expect: 0,
      misMatchThreshold: parsedThreshold,
      requireSameDimensions: false
    }));

    await runBackstopSuite(scenarios, width, height, siteUserUsername, siteUserPassword, httpAuthUsername, httpAuthPassword, res);
  } catch (err) {
    console.error('List comparison error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Sitemap Bulk Compare
app.post('/api/compare-sitemap', async (req, res) => {
  try {
    const { referenceSitemapUrl, testSitemapUrl, allowedLocales = [], excludeGames = true, excludeSports = true, width = 1920, height = 1080, misMatchThreshold = 6.0, hideSelectors = [], siteUserUsername, siteUserPassword, httpAuthUsername, httpAuthPassword, delay = 6000 } = req.body;

    if (!referenceSitemapUrl) {
      return res.status(400).json({ success: false, error: 'Reference Sitemap URL is required.' });
    }

    const parsedThreshold = parseFloat(misMatchThreshold) || 6.0;
    const parsedDelay = parseInt(delay) || 6000;

    const parsedHideSelectors = Array.isArray(hideSelectors)
      ? hideSelectors
      : (typeof hideSelectors === 'string' && hideSelectors.trim() ? hideSelectors.split(',').map(s => s.trim()) : []);

    let refXml = '';
    try {
      refXml = await fetchUrlContent(referenceSitemapUrl, httpAuthUsername, httpAuthPassword);
    } catch (err) {
      return res.status(400).json({ success: false, error: `Не вдалося завантажити Reference Sitemap: ${err.message}` });
    }

    const refUrls = extractSitemapUrls(refXml);

    let testUrls = [];
    if (testSitemapUrl) {
      try {
        const testXml = await fetchUrlContent(testSitemapUrl, httpAuthUsername, httpAuthPassword);
        testUrls = extractSitemapUrls(testXml);
      } catch (e) {}
    }

    const filteredRefUrls = filterUrls(refUrls, allowedLocales, excludeGames, excludeSports);
    const pairs = pairSitemapUrls(filteredRefUrls, testSitemapUrl || referenceSitemapUrl, testUrls);

    if (pairs.length === 0) {
      return res.status(400).json({ success: false, error: 'Не знайдено жодної пари сторінок для порівняння після застосування фільтрів.' });
    }

    const basicAuth = httpAuthUsername ? { username: httpAuthUsername, password: httpAuthPassword || '' } : null;

    const scenarios = pairs.map(p => ({
      label: p.label,
      cookiePath: 'backstop_data/engine_scripts/cookies_reference.json',
      url: p.url,
      referenceUrl: p.referenceUrl,
      basicAuth: basicAuth,
      httpAuthUsername: httpAuthUsername || '',
      httpAuthPassword: httpAuthPassword || '',
      readyEvent: '',
      readySelector: '',
      delay: parsedDelay,
      hideSelectors: parsedHideSelectors,
      removeSelectors: [],
      hoverSelector: '',
      clickSelector: '',
      postInteractionWait: 0,
      selectors: ['document'],
      selectorExpansion: true,
      expect: 0,
      misMatchThreshold: parsedThreshold,
      requireSameDimensions: false
    }));

    await runBackstopSuite(scenarios, width, height, siteUserUsername, siteUserPassword, httpAuthUsername, httpAuthPassword, res);
  } catch (err) {
    console.error('Sitemap comparison error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper function to build config and run BackstopJS suite using native JS API
async function runBackstopSuite(scenarios, width, height, siteUserUsername, siteUserPassword, httpAuthUsername, httpAuthPassword, res) {
  const targetWidth = parseInt(width) || 1920;
  const targetHeight = parseInt(height) || 1080;

  // Execute one-time login if site user credentials are provided
  if (siteUserUsername && siteUserPassword && scenarios.length > 0) {
    const firstRefUrl = scenarios[0].referenceUrl;
    const firstTestUrl = scenarios[0].url;

    try {
      const refOrigin = new URL(firstRefUrl).origin;
      const testOrigin = new URL(firstTestUrl).origin;

      const refStatePath = path.join(__dirname, 'backstop_data', 'engine_scripts', 'cookies_reference.json');
      const testStatePath = path.join(__dirname, 'backstop_data', 'engine_scripts', 'cookies_test.json');

      console.log(`Performing one-time login for Reference origin: ${refOrigin}`);
      await performOneTimeSiteLogin(refOrigin, siteUserUsername, siteUserPassword, httpAuthUsername, httpAuthPassword, refStatePath);

      console.log(`Performing one-time login for Test origin: ${testOrigin}`);
      await performOneTimeSiteLogin(testOrigin, siteUserUsername, siteUserPassword, httpAuthUsername, httpAuthPassword, testStatePath);

    } catch (authErr) {
      console.error('One-time login failed:', authErr.message);
      return res.status(400).json({ success: false, error: `Авторизація на сайті не вдалася: ${authErr.message}` });
    }
  }

  const asyncLimit = (siteUserUsername && siteUserPassword) ? 1 : 5;

  const config = {
    id: 'backstop_web_ui',
    viewports: [
      {
        label: 'desktop',
        width: targetWidth,
        height: targetHeight
      }
    ],
    onBeforeScript: 'playwright/onBefore.js',
    onReadyScript: 'playwright/onReady.js',
    resembleOutputOptions: {
      ignoreAntialiasing: true
    },
    scenarios: scenarios,
    paths: {
      bitmaps_reference: 'backstop_data/bitmaps_reference',
      bitmaps_test: 'backstop_data/bitmaps_test',
      engine_scripts: 'backstop_data/engine_scripts',
      html_report: 'backstop_data/html_report',
      ci_report: 'backstop_data/ci_report'
    },
    report: ['CI', 'browser'],
    engine: 'playwright',
    engineOptions: {
      args: ['--no-sandbox']
    },
    asyncCaptureLimit: asyncLimit,
    asyncCompareLimit: 50,
    debug: false,
    debugWindow: false
  };

  // Save config
  fs.writeFileSync(path.join(__dirname, 'backstop.json'), JSON.stringify(config, null, 2));

  console.log(`Running backstop reference for ${scenarios.length} scenario(s)...`);
  await backstop('reference', { config }).catch(e => console.warn('Reference run warning:', e.message));

  console.log(`Running backstop test for ${scenarios.length} scenario(s)...`);
  try {
    await backstop('test', { config });
  } catch (err) {
    console.log('Backstop test completed with comparison report');
  }

  // Read report JSON and sync html_report/config.js
  ensureBackstopDirectories();
  const bitmapsTestPath = path.join(__dirname, 'backstop_data', 'bitmaps_test');
  let testDirs = [];
  try {
    if (fs.existsSync(bitmapsTestPath)) {
      testDirs = fs.readdirSync(bitmapsTestPath).filter(f => {
        try {
          return f !== '.DS_Store' && fs.statSync(path.join(bitmapsTestPath, f)).isDirectory();
        } catch (e) {
          return false;
        }
      });
      testDirs.sort().reverse();
    }
  } catch (e) {
    console.warn('Could not read bitmaps_test dir:', e.message);
  }

  let reportData = null;
  if (testDirs.length > 0) {
    const latestDir = testDirs[0];
    const reportJsonPath = path.join(__dirname, 'backstop_data', 'bitmaps_test', latestDir, 'report.json');
    if (fs.existsSync(reportJsonPath)) {
      reportData = JSON.parse(fs.readFileSync(reportJsonPath, 'utf8'));

      // Write reportData directly as config.js for the html_report iframe!
      try {
        const configJsPath = path.join(__dirname, 'backstop_data', 'html_report', 'config.js');
        fs.writeFileSync(configJsPath, `report(${JSON.stringify(reportData, null, 2)});`, 'utf8');
        console.log(`Synced html_report/config.js with latest test run (${latestDir}) containing ${reportData.tests ? reportData.tests.length : 0} test(s).`);
      } catch (e) {
        console.error('Failed to sync html_report/config.js:', e.message);
      }
    }
  }

  res.json({
    success: true,
    totalScenarios: scenarios.length,
    reportData,
    reportUrl: '/backstop_data/html_report/index.html'
  });
}

// Endpoint to approve test results
app.post('/api/approve', async (req, res) => {
  try {
    await backstop('approve', { configPath: path.join(__dirname, 'backstop.json') });
    res.json({ success: true, message: 'Тестові скріншоти успішно затверджено як новий еталон!' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Express JSON Error Handler Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
});

const WebSocket = require('ws');
const net = require('net');

const wss = new WebSocket.Server({ noServer: true });

wss.on('connection', (ws) => {
  console.log('[VNC-WS] Client connected via WebSocket bridge');
  const tcpSocket = net.connect(5900, '127.0.0.1', () => {
    console.log('[VNC-WS] Connected to local X11VNC (127.0.0.1:5900)');
  });

  ws.on('message', (message) => {
    tcpSocket.write(message);
  });

  tcpSocket.on('data', (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data, { binary: true });
    }
  });

  ws.on('close', () => {
    tcpSocket.end();
  });

  tcpSocket.on('close', () => {
    ws.close();
  });

  ws.on('error', (err) => {
    console.warn('[VNC-WS] WebSocket error:', err.message);
    tcpSocket.destroy();
  });

  tcpSocket.on('error', (err) => {
    console.warn('[VNC-WS] TCP socket error:', err.message);
    ws.close();
  });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Backstop Visual UI Server running on http://localhost:${PORT}`);
});

server.on('upgrade', (request, socket, head) => {
  const parsedUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (parsedUrl.pathname === '/websockify' || parsedUrl.pathname === '/vncws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});
