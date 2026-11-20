// E2E (synthetic tenant E2E-SYNTH): P5 document API + website embed, end to end against the hosted doc-api function.
// Needs the synthetic approved PUBLIC case e2e…d1 (see docs/pack test notes). Env: BASE, E2E_PASSWORD, E2E_OUT, SUPA_URL.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.E2E_OUT || '/tmp';
const API = `${process.env.SUPA_URL}/functions/v1/doc-api/v1`;
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const tag = Date.now().toString(36).slice(-5);
const slug = `complaints-${tag}`;
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);

(async () => {
  const b = await chromium.launch(); const errs = [];
  try {
    const l = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); l.on('pageerror', (x) => errs.push(x.message));
    await l.goto(BASE + '/login'); await l.fill('#email', 'e2e.lead@example.invalid'); await l.fill('#password', process.env.E2E_PASSWORD);
    await l.getByRole('button', { name: 'Sign in', exact: true }).click(); await l.waitForLoadState('networkidle');
    await l.goto(`${BASE}/c/${CO}/integrations`);
    check('"Websites & apps" in the company navigation', (await l.getByRole('navigation').getByRole('link', { name: 'Websites & apps' }).count()) === 1);
    const docs = await l.getByTestId('int-docs').innerText();
    check('confidential documents are marked "Never shared"', /Never shared/.test(docs));

    const row = l.locator('[data-testid="int-docs"] tr', { hasText: 'Synthetic Customer Complaints Policy' });
    await row.locator('summary').click();
    await row.locator('input[name="slug"]').fill(slug); await row.locator('input[name="embed"]').check();
    await row.getByRole('button', { name: /^(Share|Save)$/ }).click(); await l.waitForURL(/ok=Document/);
    check('public document shared on website + API', /Website \+ API/.test(await l.locator('[data-testid="int-docs"] tr', { hasText: 'Synthetic Customer Complaints Policy' }).innerText()));
    check('embed snippet shows a working link', (await l.getByTestId('embed-snippet').innerText()).includes(`/embed/E2E-SYNTH/${slug}`));

    const emb = await fetch(`${API}/embed/E2E-SYNTH/${slug}`);
    const html = await emb.text();
    check('embed page served (no key) with strict CSP and no scripts', emb.status === 200 && /default-src 'none'/.test(emb.headers.get('content-security-policy') || '') && !/<script/i.test(html) && /1 working day/.test(html) && /<table>/.test(html));

    await l.fill('#k-name', `E2E website ${tag}`); await l.getByRole('button', { name: 'Create API key' }).click();
    await l.getByTestId('new-key').waitFor({ timeout: 20000 });
    const key = (await l.getByTestId('key-value').innerText()).trim();
    check('API key shown once', /^ppi_[0-9a-f]{48}$/.test(key));
    const list = await (await fetch(`${API}/documents`, { headers: { 'x-api-key': key } })).json();
    check('API lists released documents only', Array.isArray(list.documents) && list.documents.some((d) => d.slug === slug) && list.documents.every((d) => d.classification !== 'confidential'));
    const one = await (await fetch(`${API}/documents/${slug}?format=html`, { headers: { 'x-api-key': key } })).json();
    check('API returns the document as markdown and safe HTML', /1 working day/.test(one.document?.body_markdown || '') && /<strong>1 working day<\/strong>/.test(one.document?.body_html || ''));
    await l.reload();
    check('the key is not shown again after reload', !(await l.content()).includes(key));

    await l.locator('[data-testid="int-keys"] tr', { hasText: `E2E website ${tag}` }).getByRole('button', { name: 'Revoke' }).click(); await l.waitForURL(/ok=Key/);
    check('revoked key stops working immediately', (await fetch(`${API}/documents`, { headers: { 'x-api-key': key } })).status === 401);

    const row2 = l.locator('[data-testid="int-docs"] tr', { hasText: 'Synthetic Customer Complaints Policy' });
    await row2.locator('summary').click(); await row2.getByRole('button', { name: 'Stop sharing' }).click(); await l.waitForURL(/ok=Document/);
    check('stop sharing removes it from websites at once', (await fetch(`${API}/embed/E2E-SYNTH/${slug}`)).status === 404);

    await l.setViewportSize({ width: 390, height: 844 }); await l.reload();
    check('phone: no horizontal page scroll', (await l.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);
    await l.screenshot({ path: `${OUT}/p5-integrations-phone.png`, fullPage: true });
    check('no browser errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  } catch (x) { check('no crash', false, x.message.split('\n')[0]); }
  finally { await b.close(); }
  console.log(results.join('\n'));
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})();
