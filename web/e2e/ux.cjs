// E2E (synthetic tenant): P7 — welcome with one next action, personal contribution + badges, company progress, grouped navigation.
// Env: BASE, E2E_PASSWORD, E2E_JOIN_TOKEN, E2E_OUT.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.E2E_OUT || '/tmp';
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const tag = Date.now().toString(36).slice(-5);
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);

(async () => {
  const b = await chromium.launch(); const errs = [];
  try {
    const l = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); l.on('pageerror', (x) => errs.push(x.message));
    await l.goto(BASE + '/login'); await l.fill('#email', 'e2e.lead@example.invalid'); await l.fill('#password', process.env.E2E_PASSWORD);
    await l.getByRole('button', { name: 'Sign in', exact: true }).click(); await l.waitForLoadState('networkidle');
    await l.goto(`${BASE}/c/${CO}`);
    const w = await l.getByTestId('welcome').innerText();
    check('welcome greets by first name with one clear next action', /^(Good (morning|afternoon|evening)|Hello), \S+/.test(w) && (await l.getByTestId('next-action').count()) === 1, w.split('\n')[0]);
    check('personal contribution and company progress shown', (await l.getByTestId('impact').count()) === 1 && /What we.re building together/.test(await l.getByTestId('impact').innerText()));
    check('old row of duplicate buttons removed', (await l.getByRole('link', { name: 'Administration', exact: true }).count()) === 0 || (await l.locator('main > .row > a.button').count()) === 0);
    const navText = await l.locator('.company-nav').innerText();
    check('navigation shows a few main items plus "More"', /Home/.test(navText) && /My work/.test(navText) && /More/.test(navText) && !/Billing/.test(navText));
    await l.getByTestId('nav-more').locator('summary').click();
    const menu = l.getByTestId('nav-more').locator('.nav-more-menu');
    check('"More" opens a menu with a one-line hint per item', (await menu.locator('a').count()) >= 6 && (await menu.locator('.hint').count()) >= 6);
    await menu.getByRole('menuitem', { name: /Reports \(MIS\)/ }).click(); await l.waitForURL(/\/reports$/);
    check('the active page inside "More" is named on the button', /Reports \(MIS\)/.test(await l.getByTestId('nav-more').locator('summary').innerText()));
    await l.screenshot({ path: `${OUT}/p7-reports-desktop.png` });

    await l.setViewportSize({ width: 390, height: 844 }); await l.goto(`${BASE}/c/${CO}`);
    check('phone: home fits the screen', (await l.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);
    await l.getByTestId('nav-more').locator('summary').click();
    const box = await l.getByTestId('nav-more').locator('.nav-more-menu').boundingBox();
    check('phone: "More" menu stays on screen', !!box && box.x >= 0 && box.x + box.width <= 391, JSON.stringify(box));
    await l.screenshot({ path: `${OUT}/p7-home-phone.png`, fullPage: true });

    // a brand-new employee
    const e = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); e.on('pageerror', (x) => errs.push(x.message));
    await e.goto(`${BASE}/join/${process.env.E2E_JOIN_TOKEN}`);
    const pw = `Synthetic-${tag}-pw`;
    await e.fill('#name', `Ux Synthetic ${tag}`); await e.fill('#mobile', '95' + String(Date.now()).slice(-8)); await e.fill('#password', pw); await e.fill('#confirm', pw);
    await e.getByRole('button', { name: 'Sign up and start' }).click(); await e.waitForLoadState('networkidle');
    await e.goto(`${BASE}/c/${CO}`);
    check('new employee: greeted as "Ux"', /, Ux\b/.test(await e.getByTestId('welcome').innerText()));
    check('new employee: next action is the conversation', /conversation/i.test(await e.getByTestId('next-action').innerText()));
    check('new employee: encouraging note before the first badge', /first answer earns your first badge/.test(await e.getByTestId('impact').innerText()));
    const enav = await e.locator('.company-nav').innerText();
    check('new employee: no administration items anywhere in navigation', !/Administration|Billing|Reports|Dashboard/.test(enav + (await e.getByTestId('nav-more').innerText().catch(() => ''))));
    await e.screenshot({ path: `${OUT}/p7-home-employee.png`, fullPage: true });
    check('no browser errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  } catch (x) { check('no crash', false, x.message.split('\n')[0]); }
  finally { await b.close(); }
  console.log(results.join('\n'));
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})();
