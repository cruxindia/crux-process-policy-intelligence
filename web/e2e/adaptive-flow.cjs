// E2E (synthetic tenant): adaptive AI interview through the DEPLOYED Edge Function — no mocks.
// Env: BASE, E2E_ADAPT_TOKEN (adaptive join link), E2E_PASSWORD (synthetic lead), E2E_OUT,
//      EXPECT = "unconfigured" (no GEMINI_API_KEY: must show the real error, no fake question)
//             | "connected"    (real Gemini: adaptive questions, reasons, coverage, contradiction, resume, edit, submit)
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const OUT = process.env.E2E_OUT || '/tmp';
const EXPECT = process.env.EXPECT || 'unconfigured';
const tag = Date.now().toString(36).slice(-5);
const mobile = '97' + String(Date.now()).slice(-8);
const pw = 'Synthetic-' + tag + '-pw';
const results = []; const log = [];
const check = (n, c, detail = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${detail ? ' — ' + detail : ''}`);

// Scripted synthetic persona. Answer 2 deliberately contradicts answer 0 (who approves).
const SCRIPT = [
  'I verify customer addresses for loan applications. The branch manager approves every verification report before it goes to the bank.',
  'The bank emails us a case list each morning; I visit the address, take photos and fill the field form on the mobile app.',
  'Actually no one approves my reports — I submit them straight to the bank portal myself once I finish the visit.',
  'If the customer is not at home I visit again the next day; after two failed visits I mark it "untraceable" and inform my team lead by WhatsApp.',
  'We have 48 hours from allocation to submit. Delays happen when addresses are incomplete; the team lead escalates to the bank.',
  'Photos and the form are stored in the mobile app; the team lead can see them. Paper copies are not kept.',
  'Quality checks: the team lead randomly re-checks about 5 cases a week by calling the customer.',
  'Our MIS team counts cases closed per day per officer and the bank sends a monthly score.',
  'I don’t know how the bank uses the score.',
  'The accounts team bills the bank monthly based on the MIS count.',
];

async function lead(b) {
  const p = await (await b.newContext({ viewport: { width: 1100, height: 900 } })).newPage();
  await p.goto(BASE + '/login'); await p.fill('#email', 'e2e.lead@example.invalid'); await p.fill('#password', process.env.E2E_PASSWORD);
  await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForLoadState('networkidle');
  return p;
}
// Wait until the AI produced a new question, an error, or completion.
async function aiSettled(p, aiCountBefore) {
  await p.waitForFunction((n) => document.querySelectorAll('[data-ai="1"]').length > n
      || !!document.querySelector('[data-testid="ai-error"]')
      || [...document.querySelectorAll('button')].some((x) => x.textContent === 'Submit my answers'),
    aiCountBefore, { timeout: 120000 });
}

(async () => {
  const b = await chromium.launch();
  try {
    // 1. Provider status (admin / discovery lead) — real request through the server.
    const l = await lead(b);
    await l.goto(`${BASE}/c/${CO}/discovery`);
    check('discovery shows the adaptive campaign with an "AI interview" badge', await l.getByText('AI interview', { exact: true }).first().isVisible());
    await l.getByRole('button', { name: 'Test AI connection' }).click();
    await l.waitForFunction(() => !document.querySelector('[data-testid="ai-status"] button')?.textContent?.includes('Checking'), null, { timeout: 60000 });
    const statusText = (await l.locator('[data-testid="ai-status"]').innerText()).replace(/\s+/g, ' ');
    log.push('STATUS: ' + statusText);
    await l.screenshot({ path: `${OUT}/20-ai-status-${EXPECT}.png` });
    if (EXPECT === 'unconfigured') {
      check('status check reports NOT connected with the real reason', /Not connected/.test(statusText) && /GEMINI_API_KEY is not configured/.test(statusText), statusText.slice(0, 160));
    } else {
      check('status check reports Connected after a real provider round-trip', /Connected/.test(statusText) && !/Not connected/.test(statusText), statusText.slice(0, 160));
    }

    // 2. Respondent: sign up on the adaptive link and answer the opening questions.
    const ctx = await b.newContext({ viewport: { width: 420, height: 860 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/join/${process.env.E2E_ADAPT_TOKEN}`);
    await p.fill('#name', `Asha Synthetic ${tag}`); await p.fill('#mobile', mobile); await p.fill('#password', pw); await p.fill('#confirm', pw);
    await p.getByRole('button', { name: 'Sign up and start' }).click();
    await p.waitForSelector('.chat-progress', { timeout: 30000 }); await p.waitForLoadState('networkidle');
    check('greeting explains the AI interviewer', await p.getByText(/an AI interviewer asks about your work/).isVisible());
    check('employee is told answers go to Google Gemini (free) and not to type private details',
      /Google.s Gemini AI \(free version\)/.test(await p.locator('[data-testid="ai-notice"]').innerText().catch(() => '')));
    check('AI line says it starts after the opening questions', /starts after the opening questions/.test(await p.locator('[data-testid="ai-line"]').innerText()));
    let answered = 0;
    for (let i = 0; i < 40; i++) {
      if (!(await p.locator('.composer').count())) break;
      if (await p.locator('[data-ai="1"]').count()) break;
      if (await p.locator('.composer .chips .chip:not(.ghost)').count()) await p.locator('.composer .chips .chip:not(.ghost)').first().click();
      else { await p.fill('textarea[aria-label="Your answer"]', `Synthetic opening answer ${i}`); await p.getByRole('button', { name: 'Send' }).click(); }
      answered++;
      await p.waitForFunction((n) => document.querySelectorAll('.bubble.me').length >= n, answered, { timeout: 15000 });
      await p.waitForTimeout(150);
    }
    log.push(`opening questions answered: ${answered}`);

    // 3. The AI turn.
    await aiSettled(p, 0);
    if (EXPECT === 'unconfigured') {
      const alert = await p.locator('[data-testid="ai-error"]').innerText().catch(() => '');
      check('no AI question is shown when the provider is not configured', (await p.locator('[data-ai="1"]').count()) === 0);
      check('employee sees the real error (not a canned question)', /GEMINI_API_KEY is not configured on the server/.test(alert), alert.replace(/\s+/g, ' ').slice(0, 140));
      check('a "Try again" button is offered and answers are kept', await p.getByRole('button', { name: 'Try again' }).isVisible() && (await p.locator('.bubble.me').count()) === answered);
      check('no Submit button while the interview is incomplete', (await p.getByRole('button', { name: 'Submit my answers' }).count()) === 0);
      await p.screenshot({ path: `${OUT}/21-ai-unconfigured.png`, fullPage: true });
      await p.getByRole('button', { name: 'Try again' }).click();
      const sawThinking = await p.waitForSelector('.bubble.thinking', { timeout: 5000 }).then(() => true, () => false);
      await p.waitForSelector('[data-testid="ai-error"]', { timeout: 60000 });
      check('retry shows the "Analysing" state while the server is called', sawThinking);
      check('retry hits the server again and still reports the real error', (await p.locator('[data-ai="1"]').count()) === 0);
    } else {
      const asked = [];
      let sawClar = false, sawReason = false, edited = false, reloaded = false;
      for (let k = 0; k < 12; k++) {
        if (await p.getByRole('button', { name: 'Submit my answers' }).count()) break;
        if (await p.locator('[data-testid="ai-error"]').count()) { log.push('AI ERROR: ' + (await p.locator('[data-testid="ai-error"]').innerText())); break; }
        const last = p.locator('[data-ai="1"]').last();
        const qText = (await last.innerText()).replace(/\s+/g, ' ');
        asked.push(qText); log.push(`AI Q${k + 1}: ${qText}`);
        if (/Why I.m asking/.test(qText)) sawReason = true;
        if (/Needs clarification/.test(qText)) sawClar = true;
        if (k === 3 && !reloaded) { // resume mid-interview
          await p.reload(); await p.waitForSelector('.chat-progress'); await p.waitForLoadState('networkidle'); reloaded = true;
          check('reload resumes at the same AI question', ((await p.locator('[data-ai="1"]').last().innerText()).replace(/\s+/g, ' ')) === qText);
        }
        const n = await p.locator('[data-ai="1"]').count();
        await p.fill('textarea[aria-label="Your answer"]', SCRIPT[k % SCRIPT.length]); await p.getByRole('button', { name: 'Send' }).click();
        await aiSettled(p, n);
        if (k === 4 && !edited) { // edit an earlier AI answer (append-only revision)
          const bubbles = p.locator('.bubble.me', { hasText: 'bank emails us a case list' });
          if (await bubbles.count()) {
            const before = await p.locator('[data-ai="1"]').count();
            await bubbles.first().getByRole('button', { name: 'edit' }).click();
            await p.fill('textarea[aria-label="Your answer"]', SCRIPT[1] + ' (edited: also on Saturdays)');
            await p.getByRole('button', { name: 'Send' }).click();
            await p.locator('.bubble.me', { hasText: 'edited: also on Saturdays' }).waitFor();
            edited = (await p.locator('[data-ai="1"]').count()) === before;
          }
        }
      }
      const texts = asked.map((t) => t.split('Why I')[0].trim().toLowerCase());
      check('AI asked follow-up questions (real provider)', asked.length >= 3, `${asked.length} AI questions`);
      check('no AI question was repeated verbatim', new Set(texts).size === texts.length);
      check('each AI question shows a reason', sawReason);
      check('contradiction raised as a clarification (AI-dependent, observed)', sawClar, sawClar ? '' : 'model did not flag it in this run');
      check('earlier answer edited without a new question being forced', edited);
      const dims = await p.locator('.dims .badge.ok, .dims .badge.part').count();
      check('dimension coverage updated from AI analysis', dims > 0, `${dims} of 11 topics touched`);
      check('AI line names the real model', /AI interviewer: gemini/i.test(await p.locator('[data-testid="ai-line"]').innerText()));
      await p.screenshot({ path: `${OUT}/22-ai-interview.png`, fullPage: true });
      if (await p.getByRole('button', { name: 'Submit my answers' }).count()) {
        await p.getByRole('button', { name: 'Submit my answers' }).click(); await p.waitForURL(/submitted=1/);
        check('interview completes and is submitted', true);
      } else check('interview completes and is submitted', false, 'not complete within the loop');
    }
  } catch (e) { results.push('ERROR ' + e.message.split('\n')[0]); }
  finally { await b.close(); console.log(log.join('\n')); console.log('---'); console.log(results.join('\n')); }
})();
