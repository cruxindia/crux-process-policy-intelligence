// P8 full run over the DEMO company (fictional, 100 people): every page an administrator/stakeholder can open, at desktop and
// phone width — no error notices, no server errors, no browser errors, no sideways scrolling, and a load-time budget.
// The synthetic lead is a TEMPORARY member of DEMO for this run (added before, removed after). Env: BASE, E2E_PASSWORD, E2E_OUT, SUPA_URL, DEMO_IDS (json).
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.E2E_OUT || '/tmp';
const I = JSON.parse(process.env.DEMO_IDS);
const C = `/c/${I.co}`;
const REPORTS = ['participation', 'people_progress', 'recognition', 'process_register', 'discovery_funnel', 'documents', 'open_questions', 'tickets_sla', 'workload', 'improvements', 'projects', 'ai_usage', 'api_usage', 'billing'];
const PAGES = [
  ['home', C], ['my work', `${C}/tasks`], ['task', `${C}/tasks/${I.task}`], ['dashboard', `${C}/dashboard`], ['processes', `${C}/catalogue`],
  ['process item', `${C}/catalogue/${I.item}`], ['blueprint', `${C}/blueprint`], ['blueprint CTQs', `${C}/blueprint?tab=ctq`], ['expert board', `${C}/board`],
  ['board case (approved)', `${C}/board/${I.case}`], ['board case (awaiting)', `${C}/board/${I.case_wait}`], ['questions', `${C}/requests`], ['question', `${C}/requests/${I.request}`],
  ['projects', `${C}/projects`], ['project', `${C}/projects/${I.project}`], ['reports', `${C}/reports`], ...REPORTS.map((r) => [`report ${r}`, `${C}/reports/${r}`]),
  ['websites & apps', `${C}/integrations`], ['billing', `${C}/billing`], ['invoice', `${C}/billing/${I.invoice}`], ['administration', `${C}/admin`], ['AI connections', `${C}/admin/ai`],
  ['discovery setup', `${C}/discovery`], ['review answers', `${C}/review`], ['what we understood', `${C}/work/${I.session}`], ['interview (submitted)', `${C}/interviews/${I.assignment}`],
];
const SHOTS = new Set(['home', 'dashboard', 'processes', 'board case (approved)', 'project', 'what we understood', 'interview (submitted)', 'report recognition', 'billing']);
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);

(async () => {
  const b = await chromium.launch();
  const issues = []; const slow = []; const timings = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage(); let errs = [];
    p.on('pageerror', (x) => errs.push(x.message));
    p.on('response', (r) => { if (r.status() >= 500 && r.url().startsWith(BASE)) errs.push(`HTTP ${r.status()} ${r.url().replace(BASE, '')}`); });
    await p.goto(BASE + '/login'); await p.fill('#email', 'e2e.lead@example.invalid'); await p.fill('#password', process.env.E2E_PASSWORD);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForLoadState('networkidle');
    for (const [name, url] of PAGES) {
      errs = [];
      const t0 = Date.now(); const res = await p.goto(BASE + url, { waitUntil: 'networkidle' }).catch((e) => ({ status: () => 0, e }));
      const ms = Date.now() - t0; timings.push([name, ms]);
      const status = res.status();
      const errorNotice = await p.locator('.notice.error').count();
      const notFound = /This page could not be found|404/.test(await p.locator('h1, h2').first().innerText().catch(() => ''));
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (status >= 400 || errorNotice || notFound || errs.length || overflow > 1) issues.push(`${name}: status ${status}${errorNotice ? ', error notice' : ''}${notFound ? ', not found' : ''}${overflow > 1 ? `, overflow ${overflow}px` : ''}${errs.length ? ', ' + errs.slice(0, 2).join(' | ') : ''}`);
      if (ms > 4000) slow.push(`${name} ${ms} ms`);
      if (SHOTS.has(name)) await p.screenshot({ path: `${OUT}/demo-${name.replace(/[^a-z]+/g, '-')}.png`, fullPage: true });
    }
    check(`desktop: all ${PAGES.length} pages open without errors or sideways scroll`, issues.length === 0, issues.join(' || '));
    check('desktop: every page under 4 s (local server, hosted DB)', slow.length === 0, slow.join(', '));

    // phone pass
    await p.setViewportSize({ width: 390, height: 844 }); const pissues = [];
    for (const [name, url] of PAGES) {
      errs = [];
      await p.goto(BASE + url, { waitUntil: 'networkidle' });
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1 || errs.length) pissues.push(`${name}: overflow ${overflow}px ${errs.join(' | ')}`);
      if (['home', 'dashboard', 'what we understood'].includes(name)) await p.screenshot({ path: `${OUT}/demo-phone-${name.replace(/[^a-z]+/g, '-')}.png`, fullPage: true });
    }
    check('phone: no page scrolls sideways', pissues.length === 0, pissues.join(' || '));

    // content sanity: the demo tells a believable story
    await p.setViewportSize({ width: 1280, height: 900 });
    await p.goto(BASE + `${C}/dashboard`);
    const kpis = await p.getByTestId('dash-kpis').innerText();
    check('dashboard shows the engagement (people, interviews, documents)', /9\d/.test(kpis) && /%/.test(kpis) && /Documents approved/.test(kpis), kpis.replace(/\n/g, ' ').slice(0, 160));
    check('champions are named', (await p.locator('[data-testid="champions"] .champion').count()) === 5);
    await p.goto(BASE + `${C}/work/${I.session}`);
    check('"What we understood" shows a process map', (await p.locator('.react-flow, .pm-wrap, svg').count()) > 0);
    const emb = await fetch(`${process.env.SUPA_URL}/functions/v1/doc-api/v1/embed/DEMO/${I.embed}`);
    check('a shared DEMO policy is live on the public embed', emb.status === 200 && /Velora/.test(await emb.text()));
  } catch (x) { check('no crash', false, x.message.split('\n')[0]); }
  finally { await b.close(); }
  console.log(results.join('\n'));
  console.log('slowest: ' + timings.sort((a, z) => z[1] - a[1]).slice(0, 6).map(([n, ms]) => `${n} ${ms}ms`).join(', '));
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})();
