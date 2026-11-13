// E2E (synthetic tenant, live AI): M3 interview upgrade — suggested answers, save for later, not applicable with a reason,
// ask a colleague (reply comes back into the interview), "Your answer in action", and department-head validation of the
// ONE company process. Env: BASE, E2E_DISC_TOKEN, E2E_PASSWORD (lead), E2E_OUT, NEXT_PUBLIC_SUPABASE_URL/PUBLISHABLE_KEY.
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.E2E_OUT || '/tmp';
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const LEAD = 'e2e.lead@example.invalid';
const tag = Date.now().toString(36).slice(-5);
const mobile = '94' + String(Date.now()).slice(-8);
const pw = 'Synthetic-' + tag + '-pw';
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
const SCRIPT = [
  'Operations Executive in Field Verification, Pune branch. I report to the branch manager.',
  'I allocate verification cases to six field officers every morning and I quality-check their reports before they go to the bank portal.',
  'Each morning the bank emails an Excel list; I sort it by pincode, assign cases on WhatsApp, and later check photos and GPS tags in the app.',
  'If a report is incomplete I send it back to the officer; if it is fine I submit it to the bank portal.',
  'That covers my work.',
];

async function waitTurn(p) {
  await p.waitForFunction(() => !!document.querySelector('textarea[aria-label="Your answer"]') || !!document.querySelector('[data-testid="ai-error"]')
    || !!document.querySelector('[data-testid="ai-queued"]') || !!document.querySelector('[data-testid="disc-complete"]'), null, { timeout: 120000 });
  if (await p.getByTestId('ai-error').count()) throw new Error('AI error: ' + await p.getByTestId('ai-error').innerText());
  if (await p.getByTestId('ai-queued').count()) throw new Error('AI queued (quota)');
}
async function answered(p, before) { await p.waitForFunction((n) => document.querySelectorAll('.bubble.me').length > n, before, { timeout: 20000 }); }

(async () => {
  const b = await chromium.launch();
  const lead = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await lead.auth.signInWithPassword({ email: LEAD, password: process.env.E2E_PASSWORD });
  let inAction = 0;
  try {
    // ---- employee: sign up and talk until the AI offers suggested answers ----
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${BASE}/join/${process.env.E2E_DISC_TOKEN}`);
    await p.fill('#name', `Meera Synthetic ${tag}`); await p.fill('#mobile', mobile); await p.fill('#password', pw); await p.fill('#confirm', pw);
    await p.getByRole('button', { name: 'Sign up and start' }).click();
    await p.waitForSelector('.welcome', { timeout: 30000 });
    await p.getByRole('button', { name: 'Start conversation' }).click();
    await p.waitForSelector('textarea[aria-label="Your answer"]', { timeout: 60000 });
    let sugSeen = 0;
    for (let i = 0; i < SCRIPT.length; i++) {
      const before = await p.locator('.bubble.me').count();
      await p.fill('textarea[aria-label="Your answer"]', SCRIPT[i]); await p.getByRole('button', { name: 'Send' }).click();
      await answered(p, before); await waitTurn(p);
      inAction = Math.max(inAction, await p.getByTestId('in-action').count());
      sugSeen = await p.getByTestId('suggestion').count();
      if (sugSeen && i >= 2) break;
    }
    check('AI questions come with suggested answers (max 3)', sugSeen >= 1 && sugSeen <= 3, `suggestions=${sugSeen}`);
    check('"write your own" box and all answer options stay available next to suggestions',
      (await p.locator('textarea[aria-label="Your answer"]').count()) === 1 && (await p.locator('.composer .chip.ghost:not([data-testid="suggestion"])').count()) === 7);
    await p.screenshot({ path: `${OUT}/m3-suggestions.png` });

    // 1. tap a suggestion → it fills the box; Send → recorded as "from a suggestion"
    const sug = (await p.getByTestId('suggestion').first().innerText()).trim();
    await p.getByTestId('suggestion').first().click();
    check('tapping a suggestion fills the answer box (editable, not sent yet)', (await p.inputValue('textarea[aria-label="Your answer"]')) === sug);
    let before = await p.locator('.bubble.me').count();
    await p.getByRole('button', { name: 'Send' }).click(); await answered(p, before);
    check('the suggested answer is shown as the employee\'s answer', (await p.locator('.bubble.me').last().innerText()).trim() === sug);
    await waitTurn(p); inAction = Math.max(inAction, await p.getByTestId('in-action').count());

    // 2. save for later
    const laterQ = (await p.locator('.bubble.bot[data-ai="1"]').last().innerText()).trim();
    before = await p.locator('.bubble.me').count();
    await p.getByRole('button', { name: 'Save for later' }).click(); await answered(p, before);
    check('"Save for later" is recorded and shown', /Saved for later/.test(await p.locator('.bubble.me').last().innerText()));
    await waitTurn(p); inAction = Math.max(inAction, await p.getByTestId('in-action').count());
    check('a "Saved for later" tab lists it', (await p.getByRole('tab', { name: /Saved for later \(1\)/ }).count()) === 1);

    // 3. not applicable needs a reason
    await p.getByRole('button', { name: 'Not applicable' }).click();
    check('"Not applicable" asks for a reason (OK disabled while empty)', await p.getByRole('button', { name: 'OK' }).isDisabled());
    await p.fill('input[aria-label="Why it does not apply"]', 'I do not handle approvals in this work');
    before = await p.locator('.bubble.me').count();
    await p.getByRole('button', { name: 'OK' }).click(); await answered(p, before);
    check('"Not applicable" is saved with its reason', /Not applicable — I do not handle approvals/.test(await p.locator('.bubble.me').last().innerText()));
    await waitTurn(p); inAction = Math.max(inAction, await p.getByTestId('in-action').count());

    // 4. ask a colleague (the synthetic discovery lead)
    await p.getByRole('button', { name: 'Ask a colleague' }).click();
    await p.getByTestId('ask-colleague').waitFor();
    await p.selectOption('select[aria-label="Colleague"]', { label: 'E2E Discovery Lead (synthetic)' });
    await p.fill('input[aria-label="Note to your colleague"]', 'You know how the bank portal rejections work');
    before = await p.locator('.bubble.me').count();
    await p.getByRole('button', { name: 'Send request' }).click(); await answered(p, before);
    check('"Ask a colleague" records "I asked a colleague"', /I asked a colleague/.test(await p.locator('.bubble.me').last().innerText()));
    await waitTurn(p); inAction = Math.max(inAction, await p.getByTestId('in-action').count());
    check('"Your answer in action" card shown during the conversation', inAction >= 1, `cards=${inAction}`);
    const sessionUrl = p.url();

    // ---- lead: reply in Requests ----
    const lp = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); lp.on('pageerror', (e) => errs.push(e.message));
    await lp.goto(BASE + '/login'); await lp.fill('#email', LEAD); await lp.fill('#password', process.env.E2E_PASSWORD);
    await lp.getByRole('button', { name: 'Sign in', exact: true }).click(); await lp.waitForLoadState('networkidle');
    const { data: task } = await lead.from('clarification_tasks').select('id, question_text, context_text').eq('company_id', CO)
      .like('question_text', 'A colleague asked for your help%').order('created_at', { ascending: false }).limit(1).single();
    check('the request reaches the colleague in Requests', !!task && task.context_text === 'You know how the bank portal rejections work');
    await lp.goto(`${BASE}/c/${CO}/requests/${task.id}`); await lp.fill('#rep', 'Rejected reports are re-opened by the bank within one working day.');
    await lp.getByRole('button', { name: 'Send reply' }).click(); await lp.waitForURL(/ok=/);
    await p.goto(sessionUrl); await p.waitForSelector('.disc');
    check('the colleague\'s reply appears in the employee\'s interview', /Rejected reports are re-opened/.test(await p.getByTestId('colleague-reply').first().innerText().catch(() => '')));

    // 5. answer the saved question from the panel
    await p.getByRole('tab', { name: /Saved for later/ }).click();
    await p.locator('[data-testid="later-list"] textarea').first().fill('Reports are checked the same day they are uploaded.');
    await p.locator('[data-testid="later-list"]').getByRole('button', { name: 'Answer' }).first().click();
    await p.waitForFunction(() => !document.querySelector('[data-testid="later-list"] textarea'), null, { timeout: 20000 });
    check('a saved question can be answered later from the panel', (await p.getByRole('tab', { name: /Saved for later/ }).count()) === 0, laterQ.slice(0, 80));
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
    check('phone: no horizontal scroll with the new answer options', (await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);
    await p.screenshot({ path: `${OUT}/m3-phone.png` });

    // DB evidence (as the lead, who may review the session)
    const sessId = sessionUrl.split('/').pop();
    const { data: sess } = await lead.from('interview_sessions').select('id').eq('assignment_id', sessId).maybeSingle();
    const { data: qs } = await lead.from('interview_questions').select('id').eq('company_id', CO).eq('session_id', sess?.id ?? '00000000-0000-0000-0000-000000000000');
    const { data: cur } = qs?.length ? await lead.from('interview_current_answers').select('answer_kind, from_suggestion').in('question_id', qs.map((q) => q.id)) : { data: [] };
    check('stored: one answer from a suggestion, N/A with reason, colleague referral',
      (cur ?? []).some((a) => a.from_suggestion) && (cur ?? []).some((a) => a.answer_kind === 'not_applicable') && (cur ?? []).some((a) => a.answer_kind === 'refer_to_owner'),
      (cur ?? []).map((a) => a.answer_kind + (a.from_suggestion ? '*' : '')).join(','));

    // ---- lead: validate the company process built from this description ----
    const { data: dp } = await lead.from('discovered_processes').select('id, name').eq('company_id', CO).eq('session_id', sess?.id ?? '').neq('status', 'removed').limit(1).maybeSingle();
    const { data: fn } = await lead.from('catalogue_functions').select('id').eq('company_id', CO).eq('status', 'active').limit(1).single();
    const code = `E2E-VAL-${Date.now().toString(36).toUpperCase()}`;
    const { data: item, error: addErr } = await lead.rpc('catalogue_save_item', { p_company: CO, p_id: null, p_kind: 'process', p_code: code,
      p_title: 'Synthetic case allocation (validation test)', p_description: null, p_function: fn.id, p_ownership_note: null });
    const { error: linkErr } = await lead.rpc('catalogue_link_source', { p_company: CO, p_item: item, p_discovered: dp?.id, p_method: 'manual' });
    check('company item created and the employee\'s description linked', !addErr && !linkErr && !!dp, addErr?.message || linkErr?.message || dp?.name);
    await lp.goto(`${BASE}/c/${CO}/catalogue/${item}`); await lp.getByTestId('validation').waitFor();
    check('item shows "Not validated yet" and what is still open', /Not validated yet/.test(await lp.getByTestId('validation-state').innerText()));
    const open = await lp.locator('[data-testid="open-items"] li').count();
    if (open > 0) {
      await lp.getByRole('button', { name: 'Record decision' }).click(); await lp.waitForURL(/e=/);
      check('validating while questions are open needs a note', /still open/.test(decodeURIComponent(lp.url())), `${open} open`);
      await lp.goto(`${BASE}/c/${CO}/catalogue/${item}`); await lp.getByTestId('validate-form').waitFor();
    }
    await lp.fill('textarea[aria-label="Validation note"]', 'Checked with the team; open points are minor.');
    await lp.getByRole('button', { name: 'Record decision' }).click(); await lp.waitForURL(/ok=/);
    check('department head validates the company process', /✓ Validated/.test(await lp.getByTestId('validation-state').innerText()));
    await lp.screenshot({ path: `${OUT}/m3-validation.png`, fullPage: true });
    await lp.goto(`${BASE}/c/${CO}/catalogue?q=${code}`);
    check('catalogue list shows the validation badge', /validated/.test(await lp.getByTestId('validation-badge').first().innerText().catch(() => '')));
    check('no browser errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  } catch (e) { check('no crash', false, e.message.split('\n')[0]); }
  finally { await b.close(); }
  console.log(results.join('\n'));
  process.exit(results.some((x) => x.startsWith('FAIL')) ? 1 : 0);
})();
