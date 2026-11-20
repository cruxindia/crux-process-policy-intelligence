// E2E (synthetic tenant): P6 dashboards, MIS reports + CSV, projects & milestones, platform reports, employee limits.
// The lead is platform owner only for this run (granted before, revoked after). Env: BASE, E2E_PASSWORD, E2E_JOIN_TOKEN, E2E_OUT.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.E2E_OUT || '/tmp';
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const tag = Date.now().toString(36).slice(-5).toUpperCase();
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
const REPORTS = ['participation', 'people_progress', 'recognition', 'process_register', 'discovery_funnel', 'documents', 'open_questions', 'tickets_sla', 'workload', 'improvements', 'projects', 'ai_usage', 'api_usage', 'billing'];

(async () => {
  const b = await chromium.launch(); const errs = [];
  try {
    const l = await (await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })).newPage(); l.on('pageerror', (x) => errs.push(x.message));
    await l.goto(BASE + '/login'); await l.fill('#email', 'e2e.lead@example.invalid'); await l.fill('#password', process.env.E2E_PASSWORD);
    await l.getByRole('button', { name: 'Sign in', exact: true }).click(); await l.waitForLoadState('networkidle');

    // dashboard
    await l.goto(`${BASE}/c/${CO}/dashboard`);
    check('dashboard: hero, KPIs, funnel, attention, departments', (await l.getByTestId('hero').count()) === 1 && (await l.locator('[data-testid="dash-kpis"] .kpi').count()) >= 6
      && (await l.getByTestId('funnel').count()) === 1 && (await l.getByTestId('attention').count()) === 1 && (await l.getByTestId('dept-table').count()) === 1);
    await l.screenshot({ path: `${OUT}/p6-dashboard.png`, fullPage: true });

    // MIS
    await l.goto(`${BASE}/c/${CO}/reports`);
    check('report catalogue lists 14 reports for an administrator', (await l.locator('[data-testid="mis-list"] a').count()) === 14);
    const bad = [];
    for (const r of REPORTS) {
      await l.goto(`${BASE}/c/${CO}/reports/${r}`);
      const okPage = (await l.locator('.notice.error').count()) === 0 && ((await l.getByTestId('mis-table').count()) + (await l.getByTestId('mis-empty').count())) === 1;
      if (!okPage) bad.push(r);
    }
    check('every company report opens without error', bad.length === 0, bad.join(', '));
    await l.goto(`${BASE}/c/${CO}/reports/participation?from=2026-01-01&to=2026-11-20`);
    check('period can be changed', (await l.inputValue('#from')) === '2026-01-01');
    const [dl] = await Promise.all([l.waitForEvent('download'), l.getByTestId('csv').click()]);
    const csv = require('fs').readFileSync(await dl.path(), 'utf8');
    check('CSV downloads with header row and Excel BOM', dl.suggestedFilename().endsWith('.csv') && csv.charCodeAt(0) === 0xfeff && /^﻿Department,Active people/.test(csv), dl.suggestedFilename());

    // projects
    await l.goto(`${BASE}/c/${CO}/projects`);
    if (!(await l.getByTestId('project-form').isVisible())) await l.locator('details.card summary').click();
    await l.fill('#pr-name', `Synthetic discovery wave ${tag}`); await l.fill('#pr-code', `E2E-${tag}`);
    await l.selectOption('#pr-mgr', { index: 1 }); await l.fill('#pr-start', '2026-11-01'); await l.fill('#pr-end', '2027-01-31');
    await l.getByRole('button', { name: 'Create project' }).click(); await l.waitForURL(/projects\/[0-9a-f-]{36}\?ok=/);
    check('project created; its dashboard shows', (await l.getByTestId('dashboard').count()) === 1 && /Project scope/.test(await l.getByTestId('hero').innerText()));
    await l.fill('#ms-title', 'All interviews completed'); await l.fill('#ms-due', '2026-11-10'); await l.getByRole('button', { name: 'Add' }).click(); await l.waitForURL(/ok=Milestone/);
    check('a late milestone is flagged', /late/.test(await l.getByTestId('milestones').innerText()));
    await l.getByTestId('milestones').getByRole('button', { name: 'Mark done' }).click();
    await l.getByTestId('milestones').filter({ hasText: '1 of 1 done' }).waitFor({ timeout: 15000 }).catch(() => {});
    check('milestone ticked done', /1 of 1 done/.test(await l.getByTestId('milestones').innerText()));
    await l.goto(`${BASE}/c/${CO}/projects`);
    check('projects list shows progress', new RegExp(`Synthetic discovery wave ${tag}`).test(await l.getByTestId('projects-table').innerText()));

    // platform reports
    await l.goto(`${BASE}/platform/reports`);
    check('platform report catalogue (5)', (await l.locator('[data-testid="platform-mis-list"] a').count()) === 5);
    const pbad = [];
    for (const r of ['portfolio', 'revenue', 'receivables', 'ai_pool', 'support']) {
      await l.goto(`${BASE}/platform/reports/${r}`);
      if ((await l.locator('.notice.error').count()) > 0) pbad.push(r);
    }
    check('every platform report opens without error', pbad.length === 0, pbad.join(', '));
    const pcsv = await l.evaluate(async () => (await fetch('/platform/reports/portfolio/csv')).status);
    check('platform CSV served to the owner', pcsv === 200);

    // employee
    const e = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); e.on('pageerror', (x) => errs.push(x.message));
    await e.goto(`${BASE}/join/${process.env.E2E_JOIN_TOKEN}`);
    const pw = `Synthetic-${tag}-pw`;
    await e.fill('#name', `Dash Synthetic ${tag}`); await e.fill('#mobile', '94' + String(Date.now()).slice(-8)); await e.fill('#password', pw); await e.fill('#confirm', pw);
    await e.getByRole('button', { name: 'Sign up and start' }).click(); await e.waitForLoadState('networkidle');
    await e.goto(`${BASE}/c/${CO}/projects`);
    const nav = await e.getByRole('navigation').innerText();
    check('employee: no Dashboard or Reports in navigation', !/Dashboard/.test(nav) && !/Reports/.test(nav));
    const st = await e.evaluate(async (co) => [(await fetch(`/c/${co}/reports/participation/csv`)).status, (await fetch(`/c/${co}/dashboard`)).status], CO);
    check('employee: report CSV and dashboard refused', st[0] === 403 && st[1] === 404, st.join('/'));
    check('phone: no horizontal page scroll on projects', (await e.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);

    await l.setViewportSize({ width: 390, height: 844 }); await l.goto(`${BASE}/c/${CO}/dashboard`);
    check('phone: no horizontal page scroll on the dashboard', (await l.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);
    await l.screenshot({ path: `${OUT}/p6-dashboard-phone.png`, fullPage: true });
    check('no browser errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  } catch (x) { check('no crash', false, x.message.split('\n')[0]); }
  finally { await b.close(); }
  console.log(results.join('\n'));
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})();
