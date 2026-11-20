// E2E: P4 platform AI pool with SYNTHETIC (invalid) keys — real providers reject them, which proves that nothing is shown as
// connected without a real round-trip. The lead is platform owner only for this run. Cleanup SQL: e2e/ai-pool-cleanup.sql.
// Env: BASE, E2E_PASSWORD, E2E_OUT.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.E2E_OUT || '/tmp';
const tag = Date.now().toString(36);
const fake = (p, i) => `${p}SyntheticE2E${tag}${i}xxxxxxxxxxxxxxxxxxxx`;   // obviously fake, unique per run
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);

(async () => {
  const b = await chromium.launch(); const errs = [];
  try {
    const l = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); l.on('pageerror', (x) => errs.push(x.message));
    await l.goto(BASE + '/login'); await l.fill('#email', 'e2e.lead@example.invalid'); await l.fill('#password', process.env.E2E_PASSWORD);
    await l.getByRole('button', { name: 'Sign in', exact: true }).click(); await l.waitForLoadState('networkidle');
    await l.goto(BASE + '/platform/ai');
    check('AI pool page in the platform console', (await l.getByRole('heading', { name: 'AI pool' }).count()) === 1 && (await l.getByRole('link', { name: 'AI pool' }).count()) >= 1);

    await l.selectOption('#ap-provider', 'groq');
    check('provider defaults filled (model) and the data rule explained', (await l.inputValue('#ap-model')) === 'llama-3.3-70b-versatile' && /Zero Data Retention/.test(await l.getByTestId('add-keys').innerText()));
    const keys = [fake('gsk_', 1), fake('gsk_', 2), fake('gsk_', 1), 'short'];
    await l.fill('#ap-keys', keys.join('\n'));
    await l.getByRole('button', { name: 'Store and test' }).click();
    await l.getByTestId('add-result').waitFor({ timeout: 90000 });
    const res = await l.getByTestId('add-result').innerText();
    check('two keys stored; duplicate in the paste dropped; non-key refused', (res.match(/— stored/g) || []).length === 2 && /not stored: does not look like an API key/.test(res), res.replace(/\n/g, ' | '));
    check('a rejected key is NOT shown as connected', /Authentication failed|Key rejected/.test(res) && !/Connected and tested/.test(res));
    check('the key box is cleared after sending', (await l.inputValue('#ap-keys')) === '');
    const html = await l.content();
    check('the page never contains a full key', !html.includes(fake('gsk_', 1)) && !html.includes(fake('gsk_', 2)));

    await l.fill('#ap-keys', fake('gsk_', 1)); await l.getByRole('button', { name: 'Store and test' }).click();
    await l.getByTestId('add-result').filter({ hasText: 'already in the pool' }).waitFor({ timeout: 60000 }).catch(() => {});
    check('the same key again is refused (fingerprint)', /already in the pool/.test(await l.getByTestId('add-result').innerText()));

    await l.reload();
    const table = await l.getByTestId('pool-keys').innerText();
    check('keys listed with last 4 characters and "Key rejected"', /••••xxxx/.test(table) && /Key rejected/.test(table));
    check('provider summary shows Groq with 0 connected', /Groq\s+2\s+0/.test(await l.getByTestId('pool-providers').innerText()));

    const row = l.locator('[data-testid="pool-keys"] tr', { hasText: 'Groq' }).first();
    await row.locator('summary').click();
    await row.getByRole('button', { name: 'Remove' }).click(); await l.waitForURL(/e=/);
    check('remove needs an explicit tick', /Tick/.test(await l.locator('.notice.error').innerText()));
    const row2 = l.locator('[data-testid="pool-keys"] tr', { hasText: 'Groq' }).first();
    await row2.locator('summary').click(); await row2.locator('input[name="confirm"]').check();
    await row2.getByRole('button', { name: 'Remove' }).click(); await l.waitForURL(/ok=/);
    check('removed key stays as history marked "Removed"', /Removed/.test(await l.getByTestId('pool-keys').innerText()));

    await l.setViewportSize({ width: 390, height: 844 }); await l.reload();
    check('phone: no horizontal page scroll', (await l.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);
    await l.screenshot({ path: `${OUT}/p4-ai-pool-phone.png`, fullPage: true });
    check('no browser errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  } catch (x) { check('no crash', false, x.message.split('\n')[0]); }
  finally { await b.close(); }
  console.log(results.join('\n'));
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})();
