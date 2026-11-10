// End-to-end smoke test: builds must exist (npm run build). Serves dist with
// `vite preview`, plays a DI track through every factory preset and every
// effect type in headless Chromium, and checks that real audio comes out.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

// Playwright is expected to be installed globally or as a dev dependency (not bundled with the app).
const { chromium } = createRequire(import.meta.url)('playwright');

const PORT = 4319;
const shots = process.argv.includes('--screenshots');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
const stop = () => server.kill();
process.on('exit', stop);
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes('localhost') && resolve());
  server.on('exit', (c) => reject(new Error(`preview exited ${c}`)));
  setTimeout(() => reject(new Error('preview did not start')), 15000);
});

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${PORT}/`);

const fail = [];
const peakOver = (ms) =>
  page.evaluate(async (ms) => {
    const { engine } = window.__webTones;
    let input = 0, output = 0;
    const end = performance.now() + ms;
    while (performance.now() < end) {
      const l = engine.levels();
      input = Math.max(input, l.input);
      output = Math.max(output, l.output);
      await new Promise((r) => setTimeout(r, 20));
    }
    return { input, output };
  }, ms);
const blockErrors = () =>
  page.evaluate(() => {
    const s = window.__webTones.store.getState();
    return s.blocks.flatMap((b) => {
      const st = s.status[b.id];
      return st?.error ? [`${b.type}: ${st.error}`] : st?.loading ? [`${b.type}: still loading`] : [];
    });
  });
const db = (x) => (20 * Math.log10(Math.max(x, 1e-9))).toFixed(1);

await page.getByRole('button', { name: '재생' }).click();
await page.waitForFunction(() => window.__webTones.store.getState().audio === 'on', null, { timeout: 15000 });

const presets = await page.evaluate(() => window.__webTones.store.getState().userPresets.length);
if (presets !== 0) fail.push('expected a clean profile');

// 1) every factory preset
const names = await page.getByRole('button', { name: /^톤/ }).click().then(() => page.getByRole('listbox', { name: '프리셋' }).getByRole('option').allTextContents());
await page.keyboard.press('Escape');
for (let i = 0; i < names.length; i++) {
  await page.getByRole('button', { name: /^톤/ }).click();
  await page.getByRole('listbox', { name: '프리셋' }).getByRole('option').nth(i).click();
  await page.waitForTimeout(1500);
  const lv = await peakOver(3000);
  const errs = await blockErrors();
  const ok = lv.input > 0.01 && lv.output > 0.01 && lv.output < 1.2 && errs.length === 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} preset ${names[i].slice(0, 22).padEnd(22)} in ${db(lv.input)} dB  out ${db(lv.output)} dB ${errs.join('; ')}`);
  if (!ok) fail.push(`preset ${names[i]}`);
}

// 2) every effect type on its own, toggled on: must pass audio, stay finite
const types = await page.evaluate(async () => {
  const mod = window.__webTones;
  return mod.effects.map((e) => e.type);
});
for (const type of types) {
  await page.evaluate((type) => window.__webTones.store.getState().loadTone({ name: 'solo', blocks: [[type, {}]] }), type);
  // Restart the same guitar DI so every effect is measured on identical material.
  await page.evaluate(() => window.__webTones.store.getState().setTrack('brit'));
  await page.waitForTimeout(900);
  const lv = await peakOver(2500);
  const errs = await blockErrors();
  const ok = lv.output > 0.003 && Number.isFinite(lv.output) && lv.output < 4 && errs.length === 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} effect ${type.padEnd(12)} in ${db(lv.input)} dB  out ${db(lv.output)} dB ${errs.join('; ')}`);
  if (!ok) fail.push(`effect ${type}`);
}

// 3) UI flow: add, select, tweak, bypass, remove; screenshot
await page.getByRole('button', { name: /^톤/ }).click();
await page.getByRole('listbox', { name: '프리셋' }).getByRole('option').first().click();
await page.getByRole('button', { name: '이펙트 추가' }).click();
await page.getByRole('button', { name: /^Chorus/ }).click();
const count = await page.evaluate(() => window.__webTones.store.getState().blocks.length);
if (count !== 7) fail.push(`add effect: expected 7 blocks, got ${count}`);
await page.getByRole('slider', { name: 'Rate' }).press('ArrowUp');
await page.getByRole('button', { name: /^NAM Capture —/ }).click();
await page.waitForTimeout(600);
mkdirSync('scripts/out', { recursive: true });
if (shots) await page.screenshot({ path: 'scripts/out/desktop.png', fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
if (shots) await page.screenshot({ path: 'scripts/out/mobile.png', fullPage: true });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
if (overflow > 1) fail.push(`mobile horizontal overflow ${overflow}px`);

if (errors.length) fail.push(...errors.map((e) => `console: ${e}`));
await browser.close();
stop();
if (fail.length) {
  console.error('\nFAILED:\n' + fail.join('\n'));
  process.exit(1);
}
console.log('\nsmoke test passed');
process.exit(0);
