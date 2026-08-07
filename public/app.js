document.addEventListener('DOMContentLoaded', () => {
  const compareForm = document.getElementById('compareForm');
  const referenceUrlInput = document.getElementById('referenceUrl');
  const testUrlInput = document.getElementById('testUrl');
  const scenarioLabelInput = document.getElementById('scenarioLabel');
  const runBtn = document.getElementById('runBtn');
  const btnText = runBtn.querySelector('.btn-text');
  const btnLoader = runBtn.querySelector('.btn-loader');

  // Preset Buttons
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

  // Progress Section
  const progressSection = document.getElementById('progressSection');
  const progressStepText = document.getElementById('progressStepText');
  const progressBar = document.getElementById('progressBar');
  const logConsole = document.getElementById('logConsole');

  // Results Section
  const resultsSection = document.getElementById('resultsSection');
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const mismatchValue = document.getElementById('mismatchValue');
  const approveBtn = document.getElementById('approveBtn');
  const reportIframe = document.getElementById('reportIframe');

  // Images
  const refImg = document.getElementById('refImg');
  const diffImg = document.getElementById('diffImg');
  const testImg = document.getElementById('testImg');

  // Tabs
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

  // Handle Form Submit
  compareForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const referenceUrl = referenceUrlInput.value.trim();
    const testUrl = testUrlInput.value.trim();
    const label = scenarioLabelInput.value.trim() || 'Custom Comparison';
    const misMatchThresholdInput = document.getElementById('misMatchThreshold');
    const misMatchThreshold = parseFloat(misMatchThresholdInput ? misMatchThresholdInput.value : 2.0) || 2.0;
    const hideSelectorsInput = document.getElementById('hideSelectors');
    const hideSelectors = hideSelectorsInput ? hideSelectorsInput.value.trim() : '';

    if (!referenceUrl || !testUrl) return;

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
      addLog(`Еталон (Reference): ${referenceUrl}`, 'info');
      addLog(`Тест (Test): ${testUrl}`, 'info');
      addLog(`Роздільна здатність: ${selectedWidth}x${selectedHeight}`, 'info');
      addLog(`Допустиме розходження (Поріг): ${misMatchThreshold}%`, 'info');
      if (hideSelectors) addLog(`Приховані селектори: ${hideSelectors}`, 'info');

      setProgress(40, 'Зйомка еталонного та тестового скріншотів');

      const response = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceUrl,
          testUrl,
          label,
          width: selectedWidth,
          height: selectedHeight,
          misMatchThreshold,
          hideSelectors
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Помилка виконання порівняння');
      }

      setProgress(90, 'Аналіз розходжень та звіт');
      addLog('Обчислення розходжень завершено!', 'success');

      // Process report data
      const pair = data.reportData && data.reportData.tests && data.reportData.tests[0] && data.reportData.tests[0].pair;
      
      const mismatch = pair && pair.diff ? pair.diff.misMatchPercentage : '0.00';
      const isSame = parseFloat(mismatch) <= misMatchThreshold;

      mismatchValue.textContent = `${mismatch}%`;

      if (isSame) {
        statusBadge.className = 'status-badge status-pass';
        statusText.textContent = 'УСПІШНО (ЗБІГ)';
        addLog(`Результат: Сторінки повністю збігаються (Розходження: ${mismatch}%)`, 'success');
      } else {
        statusBadge.className = 'status-badge status-fail';
        statusText.textContent = 'ЗНАЙДЕНО РОЗХОДЖЕННЯ';
        addLog(`Результат: Виявлено розходження! (Розходження: ${mismatch}%)`, 'error');
      }

      function formatImagePath(relativePath) {
        if (!relativePath) return '';
        let cleaned = relativePath.replace(/^(\.\.\/|\.\/|\/)+/, '');
        if (!cleaned.startsWith('backstop_data/')) {
          cleaned = 'backstop_data/' + cleaned;
        }
        return '/' + cleaned;
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
    if (!confirm('Затвердити поточний тестовий скріншот як новий еталон?')) return;

    try {
      approveBtn.disabled = true;
      approveBtn.textContent = 'Затвердження...';

      const res = await fetch('/api/approve', { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        alert('Успішно затверджено як новий еталон!');
        statusBadge.className = 'status-badge status-pass';
        statusText.textContent = 'УСПІШНО (ЗАТВЕРДЖЕНО)';
        mismatchValue.textContent = '0.00%';
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
