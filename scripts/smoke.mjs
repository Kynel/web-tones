// End-to-end smoke test: builds must exist (npm run build). Serves dist with
// `vite preview`, plays a DI track through every factory preset and every
// effect type in headless Chromium, and checks that real audio comes out.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
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

// 4) TONE3000 integration against a mocked API (documented response shapes):
//    key setup -> popup select flow -> token exchange -> tone + models -> download -> NAM loads it.
await page.setViewportSize({ width: 1280, height: 860 });
const t3kCalls = [];
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, Authorization' };
const tone = {
  id: 42, title: 'Mock Plexi', description: null, gear: 'amp', format: 'nam', license: 't3k', images: null, models_count: 2,
  url: 'https://www.tone3000.com/tones/mock-plexi-42',
  user: { id: 1, username: 'mockuser', display_name: null, is_verified: false, avatar_url: null, url: 'https://www.tone3000.com/mockuser' },
};
const model = (id, name, arch) => ({ id, name, size: 'standard', tone_id: 42, architecture_version: arch, model_url: `https://www.tone3000.com/api/v1/models/${id}/file` });
await page.context().route('https://www.tone3000.com/**', async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const path = url.pathname.replace('/api/v1', '');
  t3kCalls.push(`${req.method()} ${path}`);
  const json = (body, status = 200) => route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  if (path === '/oauth/authorize') {
    const q = url.searchParams;
    if (q.get('client_id') !== 't3k_pub_test' || q.get('prompt') !== 'select_tone' || q.get('code_challenge_method') !== 'S256') fail.push('authorize params');
    const back = `${q.get('redirect_uri')}?code=mockcode&state=${q.get('state')}&tone_id=42`;
    return route.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(back)})</script>` });
  }
  if (path === '/oauth/token') {
    const body = new URLSearchParams(req.postData() ?? '');
    if (body.get('code') !== 'mockcode' || !body.get('code_verifier') || body.get('client_id') !== 't3k_pub_test') return json({ error: 'invalid_grant' }, 400);
    return json({ access_token: 'at', refresh_token: 'rt', token_type: 'bearer', expires_in: 3600 });
  }
  if (req.headers().authorization !== 'Bearer at') return json({ error: 'unauthorized' }, 401);
  if (path === '/tones/42') return json(tone);
  if (path === '/models') return json({ data: url.searchParams.get('architecture') === '2' ? [model(7, 'Gain 5', '2')] : [model(8, 'Gain 5 (A1)', '1')] });
  if (path.startsWith('/tones/')) return json({ data: [tone, { ...tone, id: 43, title: 'Mock Cab', format: 'ir', gear: 'cab' }] });
  if (path === '/models/7/file') return route.fulfill({ headers: cors, contentType: 'application/json', body: readFileSync('public/models/ac10.nam') });
  return json({ error: 'not_found' }, 404);
});

const namStatus = () => page.locator('.asset-status').textContent();
await page.getByRole('button', { name: /^NAM Capture —/ }).click();
await page.getByRole('button', { name: 'TONE3000에서 찾기' }).click();
await page.getByLabel('Publishable key').fill('t3k_pub_test');
await page.getByRole('button', { name: '이 브라우저에 저장' }).click();
await page.getByRole('button', { name: /전체 카탈로그에서 고르기/ }).click();
await page.getByRole('button', { name: /^Gain 5 A2/ }).click({ timeout: 15000 });
await page.waitForFunction(() => !document.querySelector('dialog.t3k'), null, { timeout: 15000 });
await page.waitForTimeout(1500);
const picked = await page.evaluate(() => {
  const s = window.__webTones.store.getState();
  const b = s.blocks.find((x) => x.type === 'nam');
  const a = s.userAssets.find((x) => x.id === b.params.model);
  return { model: b.params.model, name: a?.name, tag: a?.tag, href: a?.href, status: s.status[b.id] };
});
const t3kOk = picked.model === 'user:t3k-7' && picked.name === 'Mock Plexi — Gain 5' && picked.tag === 'TONE3000 · @mockuser' && picked.href === tone.url && picked.status?.info?.startsWith('NAM A2');
console.log(`${t3kOk ? 'ok  ' : 'FAIL'} tone3000 popup flow  ${JSON.stringify(picked)}`);
if (!t3kOk) fail.push('tone3000 popup flow');
if ((await page.context().pages()).length !== 1) fail.push('tone3000 popup was not closed');

// Signed in now: bounded lists show only tones this block can load.
await page.getByRole('button', { name: 'TONE3000에서 찾기' }).click();
const t3kDialog = page.locator('dialog.t3k');
await t3kDialog.getByRole('button', { name: /^Mock Plexi/ }).waitFor({ timeout: 10000 });
if (await t3kDialog.getByRole('button', { name: /^Mock Cab/ }).count()) fail.push('tone3000 list should hide IR tones for a NAM block');
if (shots) await page.screenshot({ path: 'scripts/out/tone3000.png' });

// Popup blocked -> full-page redirect round trip restores the chain and reopens on the chosen tone.
const chainBefore = await page.evaluate(() => window.__webTones.store.getState().blocks.map((b) => b.type).join(','));
await page.evaluate(() => (window.open = () => null));
await page.getByRole('button', { name: /전체 카탈로그에서 고르기/ }).click();
await page.getByRole('button', { name: /^Gain 5 A2/ }).waitFor({ timeout: 15000 });
const after = await page.evaluate(() => ({ chain: window.__webTones.store.getState().blocks.map((b) => b.type).join(','), search: location.search }));
const redirectOk = after.chain === chainBefore && after.search === '';
console.log(`${redirectOk ? 'ok  ' : 'FAIL'} tone3000 redirect fallback  ${JSON.stringify(after)}`);
if (!redirectOk) fail.push('tone3000 redirect fallback');
if (!t3kCalls.includes('GET /models/7/file')) fail.push('model file was not fetched');

if (errors.length) fail.push(...errors.map((e) => `console: ${e}`));
await browser.close();
stop();
if (fail.length) {
  console.error('\nFAILED:\n' + fail.join('\n'));
  process.exit(1);
}
console.log('\nsmoke test passed');
process.exit(0);
