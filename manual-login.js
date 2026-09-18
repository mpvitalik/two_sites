#!/usr/bin/env node
//
// One-time MANUAL login helper.
//
// bons.com / rc.bons.com protect their login form with Google reCAPTCHA, which an
// automated (headless) Playwright login can never pass — that is what "Wrong captcha
// value" in backstop_data/debug/*.png means. It is not a wrong login/password, and
// there is no selector fix for it.
//
// This script opens a REAL, visible Chromium window. You log in yourself (and solve
// the captcha), then press Enter in this terminal — the script saves the resulting
// session (cookies + localStorage) to the file the comparison tool already reuses for
// every run, so you only need to repeat this when the session actually expires.
//
// Usage:
//   node manual-login.js                    -> logs in to both bons.com and rc.bons.com
//   node manual-login.js <origin> <outFile>  -> logs in to one specific origin

const { chromium } = require('playwright');
const path = require('path');
const readline = require('readline');

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer); }));
}

async function loginOnce(origin, outputPath) {
  console.log(`\n=== ${origin} ===`);
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(origin, { waitUntil: 'domcontentloaded' }).catch(() => {});

  console.log('Відкрито вікно браузера.');
  console.log('Залогіньтесь вручну (включно з капчею) і дочекайтесь, поки в шапці зникне кнопка "Login"');
  console.log('(з\'явиться баланс/аватар).');
  await ask('Після цього поверніться сюди і натисніть Enter... ');

  await context.storageState({ path: outputPath });
  console.log(`Сесію збережено у ${outputPath}`);

  await browser.close();
}

async function main() {
  const args = process.argv.slice(2);
  const rootDir = __dirname;

  if (args.length >= 2) {
    await loginOnce(args[0], args[1]);
    return;
  }

  await loginOnce(
    'https://bons.com',
    path.join(rootDir, 'backstop_data', 'engine_scripts', 'cookies_reference.json')
  );
  await loginOnce(
    'https://rc.bons.com',
    path.join(rootDir, 'backstop_data', 'engine_scripts', 'cookies_test.json')
  );

  console.log('\nГотово! Тепер можна запускати порівняння як зазвичай.');
  console.log('Поля "Логін"/"Пароль" можна лишити порожніми — збережена сесія підхопиться автоматично.');
  console.log('Якщо через якийсь час сайт знову покаже неавторизований стан — просто перезапустіть цей скрипт.');
}

main();
