document.addEventListener('DOMContentLoaded', () => {
  const compareForm = document.getElementById('compareForm');

  // Mode Switcher
  const modeBtns = document.querySelectorAll('.mode-btn');
  const singleModeSection = document.getElementById('singleModeSection');
  const sitemapModeSection = document.getElementById('sitemapModeSection');
  const scenarioLabelGroup = document.getElementById('scenarioLabelGroup');
  let currentMode = 'single'; // 'single' or 'sitemap'

  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;

      if (currentMode === 'single') {
        singleModeSection.classList.remove('hidden');
        sitemapModeSection.classList.add('hidden');
        scenarioLabelGroup.classList.remove('hidden');
      } else {
        singleModeSection.classList.add('hidden');
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
  const referenceSitemapUrlInput = document.getElementById('referenceSitemapUrl');
  const testSitemapUrlInput = document.getElementById('testSitemapUrl');
  const scenarioLabelInput = document.getElementById('scenarioLabel');
  const misMatchThresholdInput = document.getElementById('misMatchThreshold');
  const hideSelectorsInput = document.getElementById('hideSelectors');

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
  countPagesBtn.addEventListener('click', async () => {
    const referenceSitemapUrl = referenceSitemapUrlInput.value.trim();
    const testSitemapUrl = testSitemapUrlInput.value.trim();

    if (!referenceSitemapUrl) {
      alert('Будь ласка, вкажіть URL для Reference Sitemap!');
      return;
    }

    try {
      countPagesBtn.disabled = true;
      countPagesBtn.innerHTML = '<span>Рахуємо...</span>';
      pageCountDisplay.classList.add('hidden');

      const allowedLocales = getSelectedLocales();
      const excludeGames = excludeGamesCheckbox ? excludeGamesCheckbox.checked : true;
      const excludeSports = excludeSportsCheckbox ? excludeSportsCheckbox.checked : true;

      const response = await fetch('/api/count-sitemap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceSitemapUrl,
          testSitemapUrl,
          allowedLocales,
          excludeGames,
          excludeSports
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Помилка підрахунку сторінок');
      }

      pageCountNumber.textContent = data.count;
      pageCountDisplay.classList.remove('hidden');

    } catch (err) {
      alert(`Помилка: ${err.message}`);
    } finally {
      countPagesBtn.disabled = false;
      countPagesBtn.innerHTML = '<span>Порахувати сторінки</span>';
    }
  });

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

    const misMatchThreshold = parseFloat(misMatchThresholdInput ? misMatchThresholdInput.value : 2.0) || 2.0;
    const hideSelectors = hideSelectorsInput ? hideSelectorsInput.value.trim() : '';

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
        hideSelectors
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
        hideSelectors
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
      } else {
        addLog(`Режим: Порівняння за sitemap.xml`, 'info');
        addLog(`Обрані локалі: ${payload.allowedLocales.join(', ') || 'усі'}`, 'info');
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

      const data = await response.json();

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
});
