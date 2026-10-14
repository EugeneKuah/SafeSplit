// Selenium integration/UI tests for SafeSplit.
//
// These drive a real Chrome browser (via the selenium/standalone-chrome
// Docker image) against the full docker-compose stack (nginx -> frontend
// -> backend -> postgres), matching Lab X07's "integration and UI testing"
// section. Unlike the backend unit tests (backend/tests/*.test.js), these
// exercise the whole request path end to end.
//
// Usage:
//   node tests/e2e/selenium.test.mjs [local|github]
//
// Environment variables (all optional, sensible defaults for the CI setup
// described in .github/workflows/ci.yml):
//   BASE_URL      Origin the app is served from, from Chrome's point of
//                 view. Chrome runs *inside* the selenium/standalone-chrome
//                 container, so this must be an address reachable from
//                 there - the Compose service name (https://nginx) over
//                 the shared "safesplit-network", not 127.0.0.1/localhost
//                 (that would be the container's own loopback, not the
//                 host - see docker-compose.ci.yml for details).
//   SELENIUM_URL  Selenium WebDriver server. The Node process running this
//                 file executes on the host, not in a container, so this
//                 one *is* localhost - it reaches the Selenium container
//                 via its published port (4444:4444).
//   HEALTH_CHECK_URL  Address this same host-side Node process uses for its
//                 own pre-flight health check, before touching Selenium.
//                 Defaults to the host-published port (https://127.0.0.1),
//                 deliberately different from BASE_URL - this check runs
//                 on the host, not inside the browser container.
//
// Requires: the stack + Selenium to already be up via:
//   docker compose -f compose.yaml -f docker-compose.ci.yml up -d --build
// and FRONTEND_URL in .env set to match BASE_URL exactly (the backend's
// CORS check compares it against the browser's Origin header).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Builder, By, until } from 'selenium-webdriver';

// selenium-webdriver's browser-specific submodules (e.g. "chrome") are
// CommonJS and not reliably resolvable via a plain ESM subpath import
// across versions, so pull this one in via require() instead.
const require = createRequire(import.meta.url);
const chrome = require('selenium-webdriver/chrome');

const mode = process.argv[2] || 'local';
const BASE_URL = process.env.BASE_URL || 'https://nginx';
const SELENIUM_URL = process.env.SELENIUM_URL || 'http://localhost:4444/wd/hub';
const HEALTH_CHECK_URL = process.env.HEALTH_CHECK_URL || 'https://127.0.0.1';
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

console.log(`Running Selenium tests in '${mode}' environment`);
console.log(`Selenium URL: ${SELENIUM_URL}`);
console.log(`Base URL (browser-side): ${BASE_URL}`);
console.log(`Health check URL (host-side): ${HEALTH_CHECK_URL}`);

// The stack uses a self-signed certificate (see scripts/generate-selfsigned-cert.sh),
// so both the Node-side health check below and the browser need to be told
// not to reject it.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let driver;

before(async () => {
  await waitForServer(`${HEALTH_CHECK_URL}/api/health`, 60_000);

  const options = new chrome.Options();
  options.addArguments('--ignore-certificate-errors', '--window-size=1280,900');
  options.setAcceptInsecureCerts(true);

  driver = await new Builder()
    .forBrowser('chrome')
    .usingServer(SELENIUM_URL)
    .setChromeOptions(options)
    .build();
});

after(async () => {
  if (driver) await driver.quit();
});

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastErr = new Error(`Health check returned ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Server at ${url} did not become healthy in time: ${lastErr?.message}`);
}

// Reads the verification link the backend logs instead of sending real
// email (see backend/src/services/notificationService.js). Works both
// locally and in CI because both run docker compose directly on the host.
function readVerificationLink(email) {
  const logs = execSync('docker compose logs backend --no-color', {
    cwd: REPO_ROOT,
    maxBuffer: 20 * 1024 * 1024
  }).toString();

  const escapedEmail = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = logs.match(new RegExp(`Verification link for ${escapedEmail}: (\\S+)`));
  if (!match) {
    throw new Error(`Could not find verification link for ${email} in backend logs`);
  }
  return match[1];
}

function uniqueUser() {
  const stamp = Date.now();
  return {
    username: `seltest${stamp}`.slice(0, 30),
    email: `selenium-test-${stamp}@example.com`,
    password: 'SeleniumTest!23'
  };
}

test('login page loads with the expected form fields', async () => {
  await driver.get(BASE_URL);

  const emailInput = await driver.wait(until.elementLocated(By.css('input[name="email"]')), 15000);
  const passwordInput = await driver.findElement(By.css('input[name="password"]'));
  const submitButton = await driver.findElement(By.css('button[type="submit"]'));

  assert.equal(await emailInput.isDisplayed(), true);
  assert.equal(await passwordInput.isDisplayed(), true);
  assert.equal((await submitButton.getText()).trim(), 'Login');
});

test('logging in with invalid credentials shows an error', async () => {
  await driver.get(BASE_URL);

  await driver.wait(until.elementLocated(By.css('input[name="email"]')), 15000);
  await driver.findElement(By.css('input[name="email"]')).sendKeys('does-not-exist@example.com');
  await driver.findElement(By.css('input[name="password"]')).sendKeys('WrongPassword123!');
  await driver.findElement(By.css('button[type="submit"]')).click();

  const message = await driver.wait(until.elementLocated(By.css('.auth-card .message')), 15000);
  await driver.wait(until.elementTextContains(message, 'Invalid email or password'), 10000);
});

test('register, verify email, and log in end to end', async () => {
  const user = uniqueUser();

  // --- Register ---
  await driver.get(BASE_URL);
  await driver.wait(until.elementLocated(By.css('.tabs button')), 15000);
  const tabs = await driver.findElements(By.css('.tabs button'));
  for (const tab of tabs) {
    if ((await tab.getText()).trim() === 'Register') {
      await tab.click();
      break;
    }
  }

  await driver.wait(until.elementLocated(By.css('input[name="username"]')), 15000);
  await driver.findElement(By.css('input[name="username"]')).sendKeys(user.username);
  await driver.findElement(By.css('input[name="email"]')).sendKeys(user.email);
  await driver.findElement(By.css('input[name="password"]')).sendKeys(user.password);
  await driver.findElement(By.css('input[name="confirmPassword"]')).sendKeys(user.password);
  await driver.findElement(By.css('button[type="submit"]')).click();

  const registerMessage = await driver.wait(until.elementLocated(By.css('.auth-card .message')), 15000);
  await driver.wait(until.elementTextContains(registerMessage, 'Check your email'), 10000);

  // --- Verify email (link comes from backend container logs, dev/CI mode) ---
  const verificationLink = readVerificationLink(user.email);
  await driver.get(verificationLink);

  const verifyButton = await driver.wait(
    until.elementLocated(By.xpath("//button[contains(., 'Verify email address')]")),
    15000
  );
  await verifyButton.click();

  const verifiedMessage = await driver.wait(until.elementLocated(By.css('.auth-card .message')), 15000);
  await driver.wait(until.elementTextContains(verifiedMessage, 'Email verified'), 10000);

  // --- Log in with the now-verified account ---
  await driver.findElement(By.xpath("//button[contains(., 'Go to login')]")).click();
  await driver.wait(until.elementLocated(By.css('input[name="email"]')), 15000);
  await driver.findElement(By.css('input[name="email"]')).sendKeys(user.email);
  await driver.findElement(By.css('input[name="password"]')).sendKeys(user.password);
  await driver.findElement(By.css('button[type="submit"]')).click();

  // A successful login swaps the auth screen for the app shell/dashboard.
  await driver.wait(until.elementLocated(By.css('button.logout-button')), 20000);
});
