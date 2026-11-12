// E2E (synthetic tenant): AI connections admin. Real server round-trips only; no API key is typed (key storage is covered by
// pgTAP test 18 with the Vault stub). Env: BASE, E2E_PASSWORD (synthetic lead with org.manage), E2E_DISC_TOKEN, E2E_OUT.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const OUT = process.env.E2E_OUT || '/tmp';
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
const NAME = 'E2E keyless connection';

(async () => {
  const b = await chromium.launch();
  try {
    const p = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
    await p.goto(BASE + '/login'); await p.fill('#email', 'e2e.lead@example.invalid'); await p.fill('#password', process.env.E2E_PASSWORD);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForLoadState('networkidle');
    await p.goto(`${BASE}/c/${CO}/admin`);
    check('Administration links to AI connections', await p.getByRole('link', { name: /AI connections/ }).isVisible());
    await p.goto(`${BASE}/c/${CO}/admin/ai`);
    check('AI connections page opens for an administrator', /AI connections/.test(await p.locator('h1').innerText()));

    // Server default: real provider round-trip.
    await p.getByRole('button', { name: 'Test default' }).click();
    await p.waitForSelector('[data-testid="test-result"]', { timeout: 60000 });
    const def = await p.locator('[data-testid="test-result"]').first().innerText();
    check('server default key: "Connected and tested" only after a real request', /Connected and tested/.test(def) && /ms/.test(def), def);

    // Add (once) a connection without a key: it must never show Connected.
    if (!(await p.locator('[data-testid="connection"] summary', { hasText: NAME }).count())) {
      await p.getByText('Add a connection').click();
      const f = p.locator('details.card:has-text("Add a connection") form');
      await f.locator('input[name="name"]').fill(NAME);
      await f.getByRole('button', { name: 'Add connection' }).click(); await p.waitForLoadState('networkidle');
      check('connection added', /Connection added/.test(await p.locator('.notice.ok').innerText().catch(() => '')));
    }
    const card = p.locator('[data-testid="connection"]', { hasText: NAME }).first();
    await card.locator(':scope > summary').click();
    check('new connection shows the key is not stored', /Key: not stored yet/.test(await card.innerText()));
    await card.getByRole('button', { name: 'Test', exact: true }).click();
    await card.locator('[data-testid="test-result"]').waitFor({ timeout: 60000 });
    const t = await card.locator('[data-testid="test-result"]').innerText();
    check('keyless connection test says "Not configured" (never Connected)', /Not configured/.test(t) && !/Connected/.test(t), t);
    await p.reload(); await p.waitForLoadState('networkidle');
    const health = await p.locator('[data-testid="connection"]', { hasText: NAME }).first().locator('[data-testid="health"]').innerText();
    check('stored health is "Not configured"', /Not configured/.test(health), health);

    // Assignment: route a department to it, then switch it off.
    const c2 = p.locator('[data-testid="connection"]', { hasText: NAME }).first();
    await c2.locator(':scope > summary').click();
    const before = await c2.locator('ul.small li').count();
    await c2.locator('select[name="interview_category"]').selectOption('documents');
    await c2.getByRole('button', { name: 'Assign' }).click();
    await p.locator('.notice.ok', { hasText: 'Assignment added' }).waitFor({ timeout: 20000 });
    const c3 = p.locator('[data-testid="connection"]', { hasText: NAME }).first();
    const lis = c3.locator('ul.small li');
    check('assignment added and listed', (await lis.count()) === before + 1 && /Documents/.test(await c3.textContent()), `before=${before} after=${await lis.count()}`);
    await c3.locator(':scope > summary').click();
    await lis.filter({ hasText: 'Documents' }).last().getByRole('button', { name: 'switch off' }).click();
    await p.locator('.notice.ok', { hasText: 'switched off' }).waitFor({ timeout: 20000 });
    check('assignment can be switched off (no deletes)', true);
    check('queue and usage sections present', (await p.getByRole('heading', { name: /Waiting work/ }).count()) === 1 && (await p.getByRole('heading', { name: /Usage/ }).count()) === 1);
    const pageText = await p.locator('main, body').first().innerText();
    check('no key material on the page', !/AIza[0-9A-Za-z_-]{20,}|AQ\.[0-9A-Za-z_-]{20,}/.test(pageText));
    await p.screenshot({ path: `${OUT}/40-admin-ai.png`, fullPage: true });

    // A respondent cannot open it.
    const q = await (await b.newContext()).newPage();
    const mobile = '92' + String(Date.now()).slice(-8); const pw = 'Synthetic-' + Date.now().toString(36) + '-pw';
    await q.goto(`${BASE}/join/${process.env.E2E_DISC_TOKEN}`);
    await q.fill('#name', 'Mira Synthetic'); await q.fill('#mobile', mobile); await q.fill('#password', pw); await q.fill('#confirm', pw);
    await q.getByRole('button', { name: 'Sign up and start' }).click(); await q.waitForSelector('.welcome', { timeout: 30000 });
    const r = await q.goto(`${BASE}/c/${CO}/admin/ai`);
    check('employee gets 404 on AI connections', r.status() === 404, `status=${r.status()}`);
  } catch (e) { check('no crash', false, e.message.split('\n')[0]); }
  finally { await b.close(); }
  console.log(results.join('\n'));
  process.exit(results.some((x) => x.startsWith('FAIL')) ? 1 : 0);
})();
