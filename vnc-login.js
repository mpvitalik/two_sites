#!/usr/bin/env node

/**
 * Remote VNC One-time Manual Login Helper.
 * 
 * Runs Xvfb and x11vnc on port 5900 on the server.
 * You connect using macOS Screen Sharing or VNC Viewer (vnc://94.176.211.242:5900),
 * perform the manual login + captcha solve in the visible Chromium window,
 * and press Enter in terminal to save session (cookies + localStorage).
 */

const { spawn, execSync } = require('child_process');
const { chromium } = require('playwright');
const path = require('path');
const readline = require('readline');
const fs = require('fs');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer); }));
}

function runCmd(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' });
  } catch (e) {}
}

async function main() {
  console.log('=== Starting Xvfb & x11vnc for Remote Login ===');

  // Clean up any old Xvfb / x11vnc processes
  runCmd('pkill -9 -f "Xvfb :99" || true');
  runCmd('pkill -9 -f "x11vnc.*5900" || true');

  // Start Xvfb on display :99
  const xvfb = spawn('Xvfb', [':99', '-screen', '0', '1440x900x24'], { stdio: 'ignore' });
  process.env.DISPLAY = ':99';
  await new Promise(r => setTimeout(r, 1200));

  // Start x11vnc on port 5900
  const x11vnc = spawn('x11vnc', ['-display', ':99', '-rfbport', '5900', '-nopw', '-forever', '-shared'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));

  console.log('\n✅ Xvfb та VNC сервер успішно запущені на порту 5900!');
  console.log('---------------------------------------------------------');
  console.log('📌 Для підключення до екранного вікна:');
  console.log('   На Mac відкрийте Finder -> Cmd+K -> введіть:');
  console.log('   vnc://94.176.211.242:5900');
  console.log('   або скористайтеся VNC Viewer на порт 5900.');
  console.log('---------------------------------------------------------\n');

  const rootDir = __dirname;
  const refPath = path.join(rootDir, 'backstop_data', 'engine_scripts', 'cookies_reference.json');
  const testPath = path.join(rootDir, 'backstop_data', 'engine_scripts', 'cookies_test.json');

  // Launch headed Chromium on DISPLAY=:99
  const browser = await chromium.launch({
    headless: false,
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

  const page = await context.newPage();

  // 1. Reference Site Login
  console.log('1. Відкриваємо https://bons.com ...');
  await page.goto('https://bons.com', { waitUntil: 'domcontentloaded' }).catch(() => {});

  console.log('-> Підключіться через VNC, здійсніть вхід (включно з капчею) на bons.com.');
  await ask('-> Після того, як авторизація завершиться (з\'явиться баланс/профіль), поверніться сюди та натисніть ENTER... ');

  await context.storageState({ path: refPath });
  console.log(`✅ Сесію для Reference (bons.com) збережено у ${refPath}\n`);

  // 2. Test Site Login
  console.log('2. Відкриваємо https://rc.bons.com ...');
  await page.goto('https://rc.bons.com', { waitUntil: 'domcontentloaded' }).catch(() => {});

  console.log('-> Якщо потрібно, здійсніть вхід на rc.bons.com у VNC вікні.');
  await ask('-> Після авторизації поверніться сюди та натисніть ENTER... ');

  await context.storageState({ path: testPath });
  console.log(`✅ Сесію для Test (rc.bons.com) збережено у ${testPath}\n`);

  await browser.close();
  xvfb.kill();
  x11vnc.kill();
  runCmd('pkill -9 -f "Xvfb :99" || true');
  runCmd('pkill -9 -f "x11vnc.*5900" || true');

  console.log('🎉 Авторизаційні сесії збережено! Тепер у веб-інтерфейсі залишайте поля Логін/Пароль порожніми.');
  process.exit(0);
}

main().catch(err => {
  console.error('Помилка виконання VNC входу:', err);
  process.exit(1);
});
