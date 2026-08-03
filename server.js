const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3030;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/backstop_data', express.static(path.join(__dirname, 'backstop_data')));

// Utility to run a command as Promise
function runCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

// Endpoint to run comparison
app.post('/api/compare', async (req, res) => {
  try {
    const { referenceUrl, testUrl, width = 1920, height = 1080, label = 'Custom Comparison', misMatchThreshold = 2.0 } = req.body;

    if (!referenceUrl || !testUrl) {
      return res.status(400).json({ success: false, error: 'Reference and Test URLs are required.' });
    }

    const parsedThreshold = parseFloat(misMatchThreshold) || 2.0;

    // Build backstop config
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
      scenarios: [
        {
          label: label || 'Custom Comparison',
          cookiePath: 'backstop_data/engine_scripts/cookies.json',
          url: testUrl,
          referenceUrl: referenceUrl,
          readyEvent: '',
          readySelector: '',
          delay: 3000,
          hideSelectors: [],
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
      ],
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

    console.log('Running backstop reference...');
    const refResult = await runCommand('npx backstop reference', __dirname);
    if (refResult.error && refResult.error.code !== 0 && !refResult.stdout.includes('Command "reference" successfully executed')) {
      console.error('Reference error:', refResult.stderr || refResult.stdout);
    }

    console.log('Running backstop test...');
    const testResult = await runCommand('npx backstop test', __dirname);

    // Read report JSON if exists
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
      reportData,
      reportUrl: '/backstop_data/html_report/index.html',
      logs: {
        referenceLogs: refResult.stdout,
        testLogs: testResult.stdout
      }
    });
  } catch (err) {
    console.error('Comparison error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint to approve test results
app.post('/api/approve', async (req, res) => {
  try {
    const result = await runCommand('npx backstop approve', __dirname);
    res.json({ success: true, stdout: result.stdout });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backstop Visual UI Server running on http://localhost:${PORT}`);
});
