document.addEventListener('DOMContentLoaded', () => {
  const compareForm = document.getElementById('compareForm');

  // Mode Switcher
  const modeBtns = document.querySelectorAll('.mode-btn');
  const singleModeSection = document.getElementById('singleModeSection');
  const listModeSection = document.getElementById('listModeSection');
  const sitemapModeSection = document.getElementById('sitemapModeSection');
  const scenarioLabelGroup = document.getElementById('scenarioLabelGroup');
  let currentMode = 'single'; // 'single', 'list', or 'sitemap'

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;

      singleModeSection.classList.add('hidden');
      listModeSection.classList.add('hidden');
      sitemapModeSection.classList.add('hidden');

      if (currentMode === 'single') {
        singleModeSection.classList.remove('hidden');
        scenarioLabelGroup.classList.remove('hidden');
      } else if (currentMode === 'list') {
        listModeSection.classList.remove('hidden');
        scenarioLabelGroup.classList.add('hidden');
      } else if (currentMode === 'sitemap') {
        sitemapModeSection.classList.remove('hidden');
        scenarioLabelGroup.classList.add('hidden');
      }
    });
  });

  // Preset Viewport Buttons
  const presetBtns = document.querySelectorAll('.preset-btn');
  let selectedWidth = 1920;
  let selectedHeight = 1080;

  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedWidth = parseInt(btn.dataset.width);
      selectedHeight = parseInt(btn.dataset.height);
    });
  });

  // Inputs
  const referenceUrlInput = document.getElementById('referenceUrl');
  const testUrlInput = document.getElementById('testUrl');
  const referenceListInput = document.getElementById('referenceList');
  const testListInput = document.getElementById('testList');
  const addRcPrefixBtn = document.getElementById('addRcPrefixBtn');
  const listCountNumber = document.getElementById('listCountNumber');
  const referenceSitemapUrlInput = document.getElementById('referenceSitemapUrl');
  const testSitemapUrlInput = document.getElementById('testSitemapUrl');
  const scenarioLabelInput = document.getElementById('scenarioLabel');
  const misMatchThresholdInput = document.getElementById('misMatchThreshold');
  const hideSelectorsInput = document.getElementById('hideSelectors');
  const autoHideDynamicBtn = document.getElementById('autoHideDynamicBtn');

  if (autoHideDynamicBtn && hideSelectorsInput) {
    autoHideDynamicBtn.addEventListener('click', () => {
      const current = hideSelectorsInput.value.trim();
      const defaultDynamic = '[class*="winning-zone"], [class*="live-bets"], [class*="ticker"], [class*="banner-timer"]';
      if (!current) {
        hideSelectorsInput.value = defaultDynamic;
      } else if (!current.includes('winning-zone')) {
        hideSelectorsInput.value = current + ', ' + defaultDynamic;
      }
    });
  }

  // Helper to format/transform a URL string by inserting "rc." into host
  function addRcToUrl(urlStr) {
    if (!urlStr || !urlStr.trim()) return '';
    let trimmed = urlStr.trim();
    try {
      const parsed = new URL(trimmed);
      if (!parsed.hostname.startsWith('rc.')) {
        parsed.hostname = 'rc.' + parsed.hostname;
      }
      return parsed.toString();
    } catch (e) {
      return trimmed.replace(/^(https?:\/\/)(?!rc\.)/, '$1rc.');
    }
  }

  // Click handler for + "rc." button
  if (addRcPrefixBtn) {
    addRcPrefixBtn.addEventListener('click', () => {
      const refText = referenceListInput ? referenceListInput.value : '';
      const testText = testListInput ? testListInput.value : '';

      if (!testText.trim() && refText.trim()) {
        const lines = refText.split('\n');
        const transformed = lines.map(line => addRcToUrl(line));
        testListInput.value = transformed.join('\n');
      } else if (testText.trim()) {
        const lines = testText.split('\n');
        const transformed = lines.map(line => addRcToUrl(line));
        testListInput.value = transformed.join('\n');
      }
      updateListCount();
    });
  }

  // Update List count on typing
  function updateListCount() {
    if (!referenceListInput) return;
    const refLines = referenceListInput.value.split('\n').map(l => l.trim()).filter(Boolean);
    if (listCountNumber) {
      listCountNumber.textContent = refLines.length;
    }
  }

  if (referenceListInput) referenceListInput.addEventListener('input', updateListCount);
  if (testListInput) testListInput.addEventListener('input', updateListCount);

  // Sitemap Filters
  const excludeGamesCheckbox = document.getElementById('excludeGames');
  const excludeSportsCheckbox = document.getElementById('excludeSports');
  const countPagesBtn = document.getElementById('countPagesBtn');
  const pageCountDisplay = document.getElementById('pageCountDisplay');
  const pageCountNumber = document.getElementById('pageCountNumber');

  // Helper to gather selected locales
  function getSelectedLocales() {
    const checked = document.querySelectorAll('input[name="locales"]:checked');
    return Array.from(checked).map(cb => cb.value);
  }

  // Count Pages Handler
  if (countPagesBtn) {
    countPagesBtn.addEventListener('click', async () => {
      const referenceSitemapUrl = referenceSitemapUrlInput.value.trim();
      const testSitemapUrl = testSitemapUrlInput.value.trim();
      const allowedLocales = getSelectedLocales();
      const excludeGames = excludeGamesCheckbox ? excludeGamesCheckbox.checked : true;
      const excludeSports = excludeSportsCheckbox ? excludeSportsCheckbox.checked : true;
      const authUsernameInput = document.getElementById('authUsername');
      const authPasswordInput = document.getElementById('authPassword');
      const authUsername = authUsernameInput ? authUsernameInput.value.trim() : '';
      const authPassword = authPasswordInput ? authPasswordInput.value.trim() : '';

      if (!referenceSitemapUrl) {
        alert('Будь ласка, заповніть URL для Reference Sitemap!');
        return;
      }

      try {
        countPagesBtn.disabled = true;
        countPagesBtn.textContent = 'Рахуємо...';
        addLog('Запит на підрахунок сторінок у sitemap.xml...');

        const res = await fetch('/api/count-sitemap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            referenceSitemapUrl,
            testSitemapUrl,
            allowedLocales,
            excludeGames,
            excludeSports,
            authUsername,
            authPassword
          })
        });

        const data = await res.json();
        if (!data.success) {
          throw new Error(data.error);
        }

        pageCountNumber.textContent = data.count;
        pageCountDisplay.classList.remove('hidden');
        addLog(`Знайдено ${data.totalFoundInSitemap} URL. Для порівняння вибрано: ${data.count} сторінок.`, 'success');

      } catch (err) {
        addLog(`Помилка підрахунку сторінок: ${err.message}`, 'error');
        alert(`Помилка підрахунку сторінок: ${err.message}`);
      } finally {
        countPagesBtn.disabled = false;
        countPagesBtn.textContent = 'Порахувати сторінки';
      }
    });
  }

  // Progress Section
  const progressSection = document.getElementById('progressSection');
  const progressStepText = document.getElementById('progressStepText');
  const progressBar = document.getElementById('progressBar');
  const logConsole = document.getElementById('logConsole');

  // Results Section
  const resultsSection = document.getElementById('resultsSection');
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const totalScenariosValue = document.getElementById('totalScenariosValue');
  const mismatchValue = document.getElementById('mismatchValue');
  const approveBtn = document.getElementById('approveBtn');
  const reportIframe = document.getElementById('reportIframe');

  // Images
  const refImg = document.getElementById('refImg');
  const diffImg = document.getElementById('diffImg');
  const testImg = document.getElementById('testImg');

  // View Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.add('hidden'));

      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      document.getElementById(tabId).classList.remove('hidden');
    });
  });

  function addLog(text, type = 'info') {
    const div = document.createElement('div');
    div.className = `log-line ${type}`;
    div.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    logConsole.appendChild(div);
    logConsole.scrollTop = logConsole.scrollHeight;
  }

  function setProgress(percent, stepText) {
    progressBar.style.width = `${percent}%`;
    progressStepText.textContent = stepText;
  }

  function formatImagePath(relativePath) {
    if (!relativePath) return '';
    let cleaned = relativePath.replace(/^(\.\.\/|\.\/|\/)+/, '');
    if (!cleaned.startsWith('backstop_data/')) {
      cleaned = 'backstop_data/' + cleaned;
    }
    return '/' + cleaned;
  }

  // Handle Form Submit
  const runBtn = document.getElementById('runBtn');
  const btnText = runBtn.querySelector('.btn-text');
  const btnLoader = runBtn.querySelector('.btn-loader');

  compareForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const misMatchThreshold = parseFloat(misMatchThresholdInput ? misMatchThresholdInput.value : 6.0) || 6.0;
    const hideSelectors = hideSelectorsInput ? hideSelectorsInput.value.trim() : '';

    const siteUserUsernameInput = document.getElementById('siteUserUsername');
    const siteUserPasswordInput = document.getElementById('siteUserPassword');
    const siteUserUsername = siteUserUsernameInput ? siteUserUsernameInput.value.trim() : '';
    const siteUserPassword = siteUserPasswordInput ? siteUserPasswordInput.value.trim() : '';

    const httpAuthUsernameInput = document.getElementById('httpAuthUsername');
    const httpAuthPasswordInput = document.getElementById('httpAuthPassword');
    const httpAuthUsername = httpAuthUsernameInput ? httpAuthUsernameInput.value.trim() : '';
    const httpAuthPassword = httpAuthPasswordInput ? httpAuthPasswordInput.value.trim() : '';

    const renderDelayInput = document.getElementById('renderDelay');
    const delay = parseInt(renderDelayInput ? renderDelayInput.value : 6000) || 6000;

    let endpoint = '';
    let payload = {};

    if (currentMode === 'single') {
      const referenceUrl = referenceUrlInput.value.trim();
      const testUrl = testUrlInput.value.trim();
      const label = scenarioLabelInput.value.trim() || 'Custom Comparison';

      if (!referenceUrl || !testUrl) {
        alert('Будь ласка, заповніть вхідні URL для порівняння 2-х сторінок!');
        return;
      }

      endpoint = '/api/compare';
      payload = {
        referenceUrl,
        testUrl,
        label,
        width: selectedWidth,
        height: selectedHeight,
        misMatchThreshold,
        hideSelectors,
        siteUserUsername,
        siteUserPassword,
        httpAuthUsername,
        httpAuthPassword,
        delay
      };

    } else if (currentMode === 'list') {
      const refLines = referenceListInput ? referenceListInput.value.split('\n').map(l => l.trim()).filter(Boolean) : [];
      const testLines = testListInput ? testListInput.value.split('\n').map(l => l.trim()).filter(Boolean) : [];

      if (refLines.length === 0) {
        alert('Будь ласка, введіть хоча б 1 посилання у список еталонних сторінок (Reference List)!');
        return;
      }

      endpoint = '/api/compare-list';
      payload = {
        referenceUrls: refLines,
        testUrls: testLines,
        width: selectedWidth,
        height: selectedHeight,
        misMatchThreshold,
        hideSelectors,
        siteUserUsername,
        siteUserPassword,
        httpAuthUsername,
        httpAuthPassword,
        delay
      };

    } else {
      const referenceSitemapUrl = referenceSitemapUrlInput.value.trim();
      const testSitemapUrl = testSitemapUrlInput.value.trim();
      const allowedLocales = getSelectedLocales();
      const excludeGames = excludeGamesCheckbox ? excludeGamesCheckbox.checked : true;
      const excludeSports = excludeSportsCheckbox ? excludeSportsCheckbox.checked : true;

      if (!referenceSitemapUrl) {
        alert('Будь ласка, заповніть URL для Reference Sitemap!');
        return;
      }

      endpoint = '/api/compare-sitemap';
      payload = {
        referenceSitemapUrl,
        testSitemapUrl,
        allowedLocales,
        excludeGames,
        excludeSports,
        width: selectedWidth,
        height: selectedHeight,
        misMatchThreshold,
        hideSelectors,
        siteUserUsername,
        siteUserPassword,
        httpAuthUsername,
        httpAuthPassword,
        delay
      };
    }

    // Reset UI
    runBtn.disabled = true;
    btnText.textContent = 'Виконується...';
    btnLoader.classList.remove('hidden');

    progressSection.classList.remove('hidden');
    resultsSection.classList.add('hidden');
    logConsole.innerHTML = '';

    addLog('Запуск процесу візуального порівняння...', 'info');
    setProgress(15, 'Генерація конфігурації');

    try {
      if (currentMode === 'single') {
        addLog(`Режим: Порівняння 2-х сторінок`, 'info');
      } else if (currentMode === 'list') {
        addLog(`Режим: Порівняння за списком сторінок`, 'info');
        addLog(`Кількість сторінок у списку: ${payload.referenceUrls ? payload.referenceUrls.length : 0}`, 'info');
      } else {
        addLog(`Режим: Порівняння за sitemap.xml`, 'info');
        if (payload.allowedLocales && Array.isArray(payload.allowedLocales)) {
          addLog(`Обрані локалі: ${payload.allowedLocales.join(', ') || 'усі'}`, 'info');
        }
        addLog(`Ігнорувати ігри: ${payload.excludeGames ? 'Так' : 'Ні'}`, 'info');
        addLog(`Ігнорувати спорт: ${payload.excludeSports ? 'Так' : 'Ні'}`, 'info');
      }

      addLog(`Роздільна здатність: ${selectedWidth}x${selectedHeight}`, 'info');
      addLog(`Допустиме розходження (Поріг): ${misMatchThreshold}%`, 'info');
      if (hideSelectors) addLog(`Приховані селектори: ${hideSelectors}`, 'info');

      setProgress(40, 'Зйомка еталонних та тестових скріншотів');

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const compareText = await response.text();
      let data;
      try {
        data = JSON.parse(compareText);
      } catch (e) {
        throw new Error(`Сервер повернув помилку (${response.status}): ${compareText.slice(0, 150)}`);
      }

      if (!data.success) {
        throw new Error(data.error || 'Помилка виконання порівняння');
      }

      setProgress(90, 'Аналіз розходжень та звіт');
      addLog(`Обчислення розходжень для ${data.totalScenarios || 1} сторінок завершено!`, 'success');

      totalScenariosValue.textContent = data.totalScenarios || 1;

      // Process report data
      const pair = data.reportData && data.reportData.tests && data.reportData.tests[0] && data.reportData.tests[0].pair;
      
      const mismatch = pair && pair.diff ? pair.diff.misMatchPercentage : '0.00';

      // Check if any test in report failed
      const hasFailures = data.reportData && data.reportData.tests && data.reportData.tests.some(t => t.status === 'fail');

      mismatchValue.textContent = `${mismatch}%`;

      if (!hasFailures) {
        statusBadge.className = 'status-badge status-pass';
        statusText.textContent = 'УСПІШНО (УСІ ЗБІГАЮТЬСЯ)';
        addLog(`Результат: Усі сторінки збігаються!`, 'success');
      } else {
        statusBadge.className = 'status-badge status-fail';
        statusText.textContent = 'ЗНАЙДЕНО РОЗХОДЖЕННЯ';
        addLog(`Результат: Знайдено розходження в тесті!`, 'error');
      }

      // Update Iframe
      reportIframe.src = `${data.reportUrl}?t=${Date.now()}`;

      // Update Side by Side Images
      if (pair) {
        refImg.src = `${formatImagePath(pair.reference)}?t=${Date.now()}`;
        testImg.src = `${formatImagePath(pair.test)}?t=${Date.now()}`;
        diffImg.src = `${formatImagePath(pair.diffImage || pair.test)}?t=${Date.now()}`;
      }

      setProgress(100, 'Завершено');
      resultsSection.classList.remove('hidden');

    } catch (err) {
      addLog(`Помилка: ${err.message}`, 'error');
      alert(`Помилка: ${err.message}`);
    } finally {
      runBtn.disabled = false;
      btnText.textContent = 'Запустити порівняння';
      btnLoader.classList.add('hidden');
    }
  });

  // Handle Approve
  approveBtn.addEventListener('click', async () => {
    if (!confirm('Затвердити поточні тестові скріншоти як нові еталони?')) return;

    try {
      approveBtn.disabled = true;
      approveBtn.textContent = 'Затвердження...';

      const res = await fetch('/api/approve', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        alert('Успішно затверджено як новий еталон!');
        statusBadge.className = 'status-badge status-pass';
        statusText.textContent = 'УСПІШНО (ЗАТВЕРДЖЕНО)';
      } else {
        alert('Помилка затвердження');
      }
    } catch (e) {
      alert(`Помилка: ${e.message}`);
    } finally {
      approveBtn.disabled = false;
      approveBtn.textContent = 'Затвердити як новий еталон';
    }
  });

  // Handle Stop Comparison
  const stopBtn = document.getElementById('stopBtn');
  if (stopBtn) {
    stopBtn.addEventListener('click', async () => {
      try {
        stopBtn.disabled = true;
        addLog('Запит на зупинку порівняння...', 'error');

        const res = await fetch('/api/stop', { method: 'POST' });
        const data = await res.json();

        addLog(data.message || 'Процес зупинено', 'error');
        setProgress(0, 'Зупинено користувачем');
      } catch (err) {
        addLog(`Помилка зупинки: ${err.message}`, 'error');
      } finally {
        stopBtn.disabled = false;
        runBtn.disabled = false;
        btnText.textContent = 'Запустити порівняння';
        btnLoader.classList.add('hidden');
      }
    });
  }

  // VNC Remote Login Helper Handlers
  const startVncBtn = document.getElementById('startVncBtn');
  const saveVncBtn = document.getElementById('saveVncBtn');
  const stopVncBtn = document.getElementById('stopVncBtn');
  const vncActivePanel = document.getElementById('vncActivePanel');
  const vncUrlText = document.getElementById('vncUrlText');

  async function checkVncStatus() {
    try {
      const res = await fetch('/api/vnc/status');
      const data = await res.json();
      if (data.active && vncActivePanel) {
        vncActivePanel.classList.remove('hidden');
        if (vncUrlText && data.vncUrl) vncUrlText.textContent = data.vncUrl;
        if (startVncBtn) {
          startVncBtn.disabled = true;
          startVncBtn.textContent = 'VNC запущен';
        }
      } else if (vncActivePanel) {
        vncActivePanel.classList.add('hidden');
        if (startVncBtn) {
          startVncBtn.disabled = false;
          startVncBtn.textContent = '🚀 Запустити VNC на сервері';
        }
      }
    } catch (e) {}
  }

  checkVncStatus();

  if (startVncBtn) {
    startVncBtn.addEventListener('click', async () => {
      try {
        startVncBtn.disabled = true;
        startVncBtn.textContent = 'Запуск VNC...';
        addLog('Запуск Xvfb, x11vnc та Playwright Chromium на сервері...');

        const res = await fetch('/api/vnc/start', { method: 'POST' });
        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error || 'Помилка запуску VNC');
        }

        addLog(`✅ VNC сервер запущено! Адреса: ${data.vncUrl}`, 'success');
        if (vncUrlText) vncUrlText.textContent = data.vncUrl;
        if (vncActivePanel) vncActivePanel.classList.remove('hidden');
        startVncBtn.textContent = 'VNC запущен';
      } catch (err) {
        addLog(`Помилка запуску VNC: ${err.message}`, 'error');
        alert(`Помилка запуску VNC: ${err.message}`);
        startVncBtn.disabled = false;
        startVncBtn.textContent = '🚀 Запустити VNC на сервері';
      }
    });
  }

  if (saveVncBtn) {
    saveVncBtn.addEventListener('click', async () => {
      try {
        saveVncBtn.disabled = true;
        saveVncBtn.textContent = 'Збереження кукі...';
        addLog('Збереження авторизаційних кукі (storageState)...');

        const res = await fetch('/api/vnc/save', { method: 'POST' });
        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error || 'Помилка збереження');
        }

        addLog(`✅ ${data.message}`, 'success');
        alert(data.message);
        if (vncActivePanel) vncActivePanel.classList.add('hidden');
        if (startVncBtn) {
          startVncBtn.disabled = false;
          startVncBtn.textContent = '🚀 Запустити VNC на сервері';
        }
      } catch (err) {
        addLog(`Помилка збереження VNC сесії: ${err.message}`, 'error');
        alert(`Помилка: ${err.message}`);
      } finally {
        saveVncBtn.disabled = false;
        saveVncBtn.textContent = '✅ Зберегти сесію та закрити VNC';
      }
    });
  }

  if (stopVncBtn) {
    stopVncBtn.addEventListener('click', async () => {
      try {
        stopVncBtn.disabled = true;
        const res = await fetch('/api/vnc/stop', { method: 'POST' });
        const data = await res.json();
        addLog(data.message || 'VNC сесію зупинено.', 'info');
        if (vncActivePanel) vncActivePanel.classList.add('hidden');
        if (startVncBtn) {
          startVncBtn.disabled = false;
          startVncBtn.textContent = '🚀 Запустити VNC на сервері';
        }
      } catch (err) {
        addLog(`Помилка зупинки VNC: ${err.message}`, 'error');
      } finally {
        stopVncBtn.disabled = false;
      }
    });
  }
});
