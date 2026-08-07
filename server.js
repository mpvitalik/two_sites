const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { request: playwrightRequest } = require('playwright');

const app = express();
const PORT = process.env.PORT || 3030;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/backstop_data', express.static(path.join(__dirname, 'backstop_data')));

// Helper to fetch text content using Playwright HTTP client with fallback to native node http
async function fetchUrlContent(url) {
  try {
    const apiReq = await playwrightRequest.newContext({
      extraHTTPHeaders: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
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
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      };
      const client = url.startsWith('https') ? https : http;
      client.get(url, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let redirectUrl = res.headers.location;
          if (redirectUrl.startsWith('/')) {
            const parsed = new URL(url);
            redirectUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
          }
          return fetchUrlContent(redirectUrl).then(resolve).catch(reject);
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

// Utility to run a command as Promise
function runCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

// API: Count Sitemap Pages
app.post('/api/count-sitemap', async (req, res) => {
  try {
    const { referenceSitemapUrl, testSitemapUrl, allowedLocales = [], excludeGames = true, excludeSports = true } = req.body;

    if (!referenceSitemapUrl) {
      return res.status(400).json({ success: false, error: 'Reference Sitemap URL is required.' });
    }

    let refXml = '';
    try {
      refXml = await fetchUrlContent(referenceSitemapUrl);
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
        const testXml = await fetchUrlContent(testSitemapUrl);
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
    const { referenceUrl, testUrl, width = 1920, height = 1080, label = 'Custom Comparison', misMatchThreshold = 2.0, hideSelectors = [] } = req.body;

    if (!referenceUrl || !testUrl) {
      return res.status(400).json({ success: false, error: 'Reference and Test URLs are required.' });
    }

    const parsedThreshold = parseFloat(misMatchThreshold) || 2.0;

    const parsedHideSelectors = Array.isArray(hideSelectors)
      ? hideSelectors
      : (typeof hideSelectors === 'string' && hideSelectors.trim() ? hideSelectors.split(',').map(s => s.trim()) : []);

    const scenarios = [
      {
        label: label || 'Custom Comparison',
        cookiePath: 'backstop_data/engine_scripts/cookies.json',
        url: testUrl,
        referenceUrl: referenceUrl,
        readyEvent: '',
        readySelector: '',
        delay: 3000,
        hideSelectors: parsedHideSelectors,
        removeSelectors: [],
        hoverSelector: '',
        clickSelector: '',
        postInteractionWait: 0,
        selectors: ['document'],
        selectorExpansion: true,
        expect: 0,
        misMatchThreshold: parsedThreshold,
        requireSameDimensions: true
      }
    ];

    await runBackstopSuite(scenarios, width, height, res);
  } catch (err) {
    console.error('Comparison error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Sitemap Bulk Compare
app.post('/api/compare-sitemap', async (req, res) => {
  try {
    const { referenceSitemapUrl, testSitemapUrl, allowedLocales = [], excludeGames = true, excludeSports = true, width = 1920, height = 1080, misMatchThreshold = 2.0, hideSelectors = [] } = req.body;

    if (!referenceSitemapUrl) {
      return res.status(400).json({ success: false, error: 'Reference Sitemap URL is required.' });
    }

    const parsedThreshold = parseFloat(misMatchThreshold) || 2.0;

    const parsedHideSelectors = Array.isArray(hideSelectors)
      ? hideSelectors
      : (typeof hideSelectors === 'string' && hideSelectors.trim() ? hideSelectors.split(',').map(s => s.trim()) : []);

    let refXml = '';
    try {
      refXml = await fetchUrlContent(referenceSitemapUrl);
    } catch (err) {
      return res.status(400).json({ success: false, error: `Не вдалося завантажити Reference Sitemap: ${err.message}` });
    }

    const refUrls = extractSitemapUrls(refXml);

    let testUrls = [];
    if (testSitemapUrl) {
      try {
        const testXml = await fetchUrlContent(testSitemapUrl);
        testUrls = extractSitemapUrls(testXml);
      } catch (e) {}
    }

    const filteredRefUrls = filterUrls(refUrls, allowedLocales, excludeGames, excludeSports);
    const pairs = pairSitemapUrls(filteredRefUrls, testSitemapUrl || referenceSitemapUrl, testUrls);

    if (pairs.length === 0) {
      return res.status(400).json({ success: false, error: 'Не знайдено жодної пари сторінок для порівняння після застосування фільтрів.' });
    }

    const scenarios = pairs.map(p => ({
      label: p.label,
      cookiePath: 'backstop_data/engine_scripts/cookies.json',
      url: p.url,
      referenceUrl: p.referenceUrl,
      readyEvent: '',
      readySelector: '',
      delay: 3000,
      hideSelectors: parsedHideSelectors,
      removeSelectors: [],
      hoverSelector: '',
      clickSelector: '',
      postInteractionWait: 0,
      selectors: ['document'],
      selectorExpansion: true,
      expect: 0,
      misMatchThreshold: parsedThreshold,
      requireSameDimensions: true
    }));

    await runBackstopSuite(scenarios, width, height, res);
  } catch (err) {
    console.error('Sitemap comparison error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper function to build config and run BackstopJS suite
async function runBackstopSuite(scenarios, width, height, res) {
  const config = {
    id: 'backstop_web_ui',
    viewports: [
      {
        label: 'desktop',
        width: parseInt(width),
        height: parseInt(height)
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
    report: ['CI'],
    engine: 'playwright',
    engineOptions: {
      args: ['--no-sandbox']
    },
    asyncCaptureLimit: 5,
    asyncCompareLimit: 50,
    debug: false,
    debugWindow: false
  };

  // Save config
  fs.writeFileSync(path.join(__dirname, 'backstop.json'), JSON.stringify(config, null, 2));

  console.log(`Running backstop reference for ${scenarios.length} scenario(s)...`);
  const refResult = await runCommand('npx backstop reference', __dirname);

  console.log(`Running backstop test for ${scenarios.length} scenario(s)...`);
  const testResult = await runCommand('npx backstop test', __dirname);

  // Read report JSON
  const testDirs = fs.readdirSync(path.join(__dirname, 'backstop_data', 'bitmaps_test')).filter(f => f !== '.DS_Store' && fs.statSync(path.join(__dirname, 'backstop_data', 'bitmaps_test', f)).isDirectory());
  testDirs.sort().reverse();

  let reportData = null;
  if (testDirs.length > 0) {
    const latestDir = testDirs[0];
    const reportJsonPath = path.join(__dirname, 'backstop_data', 'bitmaps_test', latestDir, 'report.json');
    if (fs.existsSync(reportJsonPath)) {
      reportData = JSON.parse(fs.readFileSync(reportJsonPath, 'utf8'));
    }
  }

  res.json({
    success: true,
    totalScenarios: scenarios.length,
    reportData,
    reportUrl: '/backstop_data/html_report/index.html',
    logs: {
      referenceLogs: refResult.stdout,
      testLogs: testResult.stdout
    }
  });
}

// Endpoint to approve test results
app.post('/api/approve', async (req, res) => {
  try {
    const result = await runCommand('npx backstop approve', __dirname);
    res.json({ success: true, stdout: result.stdout });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Express JSON Error Handler Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Backstop Visual UI Server running on http://localhost:${PORT}`);
});
