// Browser E2E (synthetic tenant): AI-led discovery UI through the deployed discovery-ai function — no mocks.
// Env: BASE, E2E_DISC_TOKEN, E2E_OUT. Verifies: sign-up lands in the conversation, AI opener, live side panel
// (process map rendered by React Flow, activities list, profile), quick chips, phone layout, resume after reload.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.E2E_OUT || '/tmp';
const tag = Date.now().toString(36).slice(-5);
const mobile = '93' + String(Date.now()).slice(-8);
const pw = 'Synthetic-' + tag + '-pw';
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
const SCRIPT = [
  'Collections Team Lead in the Retail Loans department, Mumbai. I report to Anita Rao, the collections manager.',
  'I manage a team of 8 tele-callers. I handle daily allocation of overdue accounts, call quality reviews and the weekly recovery report.',
  'Every morning the system gives an overdue list. I split it by bucket and assign accounts to callers in the dialer. I review 10 recorded calls per caller every week. Every Monday I send the recovery report to Anita.',
  'Yes, that covers everything.',
  'The overdue list comes at 9am as an Excel from the MIS team. I sort by days past due, give 0-30 days to junior callers and 30-90 to seniors, then upload the allocation into the dialer.',
  'If a customer promises to pay, the caller logs the promise date. If the promise is broken twice, I escalate the account to the field team.',
];

(async () => {
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/join/${process.env.E2E_DISC_TOKEN}`);
    await p.fill('#name', `Ravi Synthetic ${tag}`); await p.fill('#mobile', mobile); await p.fill('#password', pw); await p.fill('#confirm', pw);
    await p.getByRole('button', { name: 'Sign up and start' }).click();
    await p.waitForSelector('.welcome', { timeout: 30000 });
    check('home: "Let\'s understand the work you do." with one Start button, nothing to choose',
      /understand the work you do/i.test(await p.locator('h1').innerText()) && (await p.locator('.welcome button').count()) === 1 && (await p.locator('.welcome select, .welcome input').count()) === 0);
    await p.screenshot({ path: `${OUT}/29-discovery-welcome.png` });
    await p.getByRole('button', { name: 'Start conversation' }).click();
    await p.waitForSelector('.disc', { timeout: 30000 });
    await p.waitForSelector('textarea[aria-label="Your answer"]', { timeout: 60000 });
    check('Start conversation opens the AI conversation', true);
    check('opening question asks about the role', /designation|department/i.test(await p.locator('.bubble.bot').last().innerText()));
    check('privacy notice shown (Gemini free)', await p.getByTestId('ai-notice').isVisible());
    check('quick chips present (not sure / explain / forgot / correct)', (await p.locator('.composer .chip').count()) === 4);
    const timings = [];
    for (let i = 0; i < SCRIPT.length; i++) {
      const before = await p.locator('.bubble.me').count();
      await p.fill('textarea[aria-label="Your answer"]', SCRIPT[i]);
      await p.getByRole('button', { name: 'Send' }).click();
      await p.waitForFunction((n) => document.querySelectorAll('.bubble.me').length > n, before, { timeout: 20000 });
      const t0 = Date.now();
      await p.waitForFunction(() => !!document.querySelector('textarea[aria-label="Your answer"]') || !!document.querySelector('[data-testid="ai-error"]')
        || !!document.querySelector('[data-testid="ai-queued"]') || !!document.querySelector('[data-testid="disc-complete"]'), null, { timeout: 120000 });
      timings.push(Date.now() - t0);
      if (await p.getByTestId('ai-error').count()) { check(`turn ${i} without error`, false, await p.getByTestId('ai-error').innerText()); break; }
    }
    check('every turn produced a next question', !(await p.getByTestId('ai-error').count()), `ms=${timings.join(',')}`);
    // Ask for an explanation via chip: the AI should rephrase rather than move on.
    const lastQ = await p.locator('.bubble.bot[data-ai="1"]').last().innerText();
    const n0 = await p.locator('.bubble.me').count();
    await p.getByRole('button', { name: 'Can you explain?' }).click();
    await p.waitForFunction((n) => document.querySelectorAll('.bubble.me').length > n, n0, { timeout: 20000 });
    await p.waitForSelector('textarea[aria-label="Your answer"]', { timeout: 120000 });
    const rephrased = await p.locator('.bubble.bot[data-ai="1"]').last().innerText();
    check('"Can you explain?" gets a new, rephrased question', rephrased !== lastQ, rephrased.slice(0, 120));

    // Side panel
    await p.getByRole('tab', { name: /Activities/ }).click();
    const acts = await p.locator('.proc-list li').count();
    check('activities list built automatically (>=2)', acts >= 2, await p.locator('.proc-list').innerText().then((t) => t.replace(/\s+/g, ' ').slice(0, 200)));
    await p.getByRole('tab', { name: 'About you' }).click();
    const me = (await p.locator('.kv').innerText()).replace(/\s+/g, ' ');
    check('profile panel shows reporting manager from the conversation', /Anita/i.test(me), me.slice(0, 160));
    await p.getByRole('tab', { name: 'Process map' }).click();
    const hasMap = await p.getByTestId('process-map').count();
    const nodes = hasMap ? await p.locator('.react-flow__node').count() : 0;
    check('interactive process map (React Flow) rendered with nodes', nodes >= 3, `nodes=${nodes}`);
    check('map has zoom controls (interactive, not an image)', hasMap ? (await p.locator('.react-flow__controls').count()) > 0 : false);
    await p.screenshot({ path: `${OUT}/30-discovery-desktop.png`, fullPage: false });

    // Resume after reload: same conversation, same panel.
    const qCount = await p.locator('.bubble.bot[data-ai="1"]').count();
    await p.reload(); await p.waitForSelector('textarea[aria-label="Your answer"]', { timeout: 60000 });
    check('reload resumes exactly where the employee stopped', (await p.locator('.bubble.bot[data-ai="1"]').count()) === qCount);

    // Review Centre
    const sumHref = await p.getByRole('link', { name: /Full summary/ }).getAttribute('href');
    const w = await ctx.newPage(); await w.setViewportSize({ width: 1280, height: 900 });
    await w.goto(BASE + sumHref); await w.waitForSelector('#library');
    const sections = await w.locator('section h2').allInnerTexts();
    check('Review Centre: profile, charter, process library, clarifications', ['Professional profile', 'Responsibility charter', 'Process library', 'Clarifications'].every((x) => sections.includes(x)), sections.join(' | '));
    check('Review Centre: draft SOP lines generated from the map', (await w.locator('.sop li').count()) >= 3, `lines=${await w.locator('.sop li').count()}`);
    check('Review Centre: process map rendered', (await w.locator('.react-flow__node').count()) >= 3);
    check('Review Centre: clearly marked as draft, correction via conversation', /Draft\./.test(await w.locator('.notice').first().innerText()) && (await w.getByRole('link', { name: /Tell me in the conversation/ }).count()) === 1);
    await w.screenshot({ path: `${OUT}/32-review-centre.png`, fullPage: true });
    await w.close();

    // Phone layout
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(400);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('phone: no horizontal scroll', overflow <= 1, `overflow=${overflow}`);
    check('phone: panel hidden until requested', !(await p.locator('.disc-panel').isVisible()));
    await p.getByRole('button', { name: /what I.ve understood/ }).click();
    check('phone: panel opens on demand', await p.locator('.disc-panel').isVisible());
    await p.screenshot({ path: `${OUT}/31-discovery-phone.png`, fullPage: false });
  } catch (e) { check('no crash', false, e.message.split('\n')[0]); }
  finally { await b.close(); }
  console.log(results.join('\n'));
  process.exit(results.some((x) => x.startsWith('FAIL')) ? 1 : 0);
})();
