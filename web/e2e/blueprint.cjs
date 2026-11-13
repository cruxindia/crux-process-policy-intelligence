// E2E (synthetic tenant, live AI): Company Operating Blueprint — leadership interview → AI consultant synthesis → management review →
// CTQ target maker-checker → publish → everyone reads it. The synthetic lead plays the MD. Env as catalogue.cjs.
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const BASE = process.env.BASE || 'http://localhost:3000';
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const OUT = process.env.E2E_OUT || '/tmp';
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
// Synthetic answers (test data only — not facts about any real company).
const ANSWERS = {
  'L-01': 'Synthetic test company founded in 2005 as one private limited company, owned by its two founders; grown from one city to a national network.',
  'L-02': 'We give banks and NBFCs independent, reliable verification of borrowers and collateral so they can lend with confidence.',
  'L-03': 'Clients pay a fee per verified case under rate cards in each client agreement; franchise branches receive a share of the fee for cases they complete.',
  'L-04': 'Residence and office verification, property and collateral checks, document verification, investigation of suspected fraud, and MSME field visits.',
  'L-05': 'Public and private sector banks and NBFCs; the three largest banks give most of the volume and drive our quality standards.',
  'L-06': 'Clients expect reports within the agreed turnaround, accurate photos and GPS evidence, and strict confidentiality. Most complaints are about late reports and rework.',
  'L-07': 'Zones across the country, served by self-operated branches in metros and franchise branches in smaller towns.',
  'L-08': 'Operations, quality check, MIS and billing, finance, HR and business development; quality check sometimes overlaps with operations.',
  'L-09': 'The managing director approves pricing and new clients; zonal heads approve exceptions; branch managers approve reassignments; finance approves refunds.',
  'L-10': 'A case management system, email, Excel for allocation, WhatsApp for field instructions, and client bank portals for report upload.',
  'L-11': 'Franchise partners and freelance field officers do much of the field work; a courier vendor moves original documents.',
  'L-12': 'Grow MSME business, improve on-time delivery, reduce rework and improve margins per case over the next two years.',
  'L-13': 'Allocation is manual, incomplete addresses delay cases, rework from quality check is high, and billing reconciliation takes too long.',
  'L-14': 'We accept some delay on difficult rural cases; we never accept a data leak, a fabricated report or a missed bank audit finding.',
  'L-15': 'Client agreements require confidentiality, audit rights and data protection; data protection law and the banks\' outsourcing rules apply.',
  'L-16': 'Automate allocation, expand franchise coverage in MSME clusters, and add digital verification services.',
  'L-17': 'Clear ownership of each step, fewer manual spreadsheets, and faster answers from clients on incomplete addresses.',
  'L-18': 'An auditor would check evidence of confidentiality controls and access to client data; partner oversight is our weakest area.',
  'L-19': 'We watch on-time delivery, rework, cases per officer and client complaints; what is good is still to be agreed by management.',
  'L-20': 'Most institutional knowledge sits with a few experienced branch managers.',
};
(async () => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email: 'e2e.lead@example.invalid', password: process.env.E2E_PASSWORD });
  const { data: { user } } = await db.auth.getUser();
  const { data: me } = await db.from('memberships').select('id').eq('company_id', CO).eq('user_id', user.id).single();
  const b = await chromium.launch();
  try {
    const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(BASE + '/login'); await p.fill('#email', 'e2e.lead@example.invalid'); await p.fill('#password', process.env.E2E_PASSWORD);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForLoadState('networkidle');
    await p.goto(`${BASE}/c/${CO}`);
    await p.getByRole('link', { name: 'Company blueprint' }).click(); await p.waitForURL(/\/blueprint/);
    check('blueprint page opens from home', await p.locator('h1', { hasText: 'Company Operating Blueprint' }).count() === 1);

    // 1. Leadership interview: invite the MD (the synthetic lead)
    await p.goto(`${BASE}/c/${CO}/blueprint?tab=leadership`);
    const box = p.locator(`[data-testid="start-leadership"] input[value="${me.id}"]`);
    if (await box.count()) { await box.check(); await p.getByRole('button', { name: 'Invite to the leadership interview' }).click(); await p.waitForURL(/ok=/, { timeout: 30000 }); }
    check('leader invited', await p.locator('[data-testid="leaders-table"] tbody tr').count() >= 1);
    const { data: asg } = await db.from('interview_assignments').select('id, status, interview_campaigns!inner(purpose_kind)').eq('company_id', CO)
      .eq('respondent_membership_id', me.id).eq('interview_campaigns.purpose_kind', 'leadership').single();

    // 2. Answer the 20 leadership questions in the ordinary interview screen
    await p.goto(`${BASE}/c/${CO}/interviews/${asg.id}`); await p.waitForLoadState('networkidle');
    let answered = 0;
    for (let i = 0; i < 25; i++) {
      const ta = p.getByLabel('Your answer');
      if (!(await ta.count())) break;
      const { data: sess } = await db.from('interview_sessions').select('id').eq('company_id', CO).eq('assignment_id', asg.id).order('started_at', { ascending: false }).limit(1).single();
      const { data: qs } = await db.from('interview_questions').select('id, question_templates(code)').eq('company_id', CO).eq('session_id', sess.id).order('seq');
      const { data: done } = await db.from('interview_current_answers').select('question_id').eq('company_id', CO).in('question_id', qs.map((q) => q.id));
      const next = qs.find((q) => !done.some((d) => d.question_id === q.id));
      if (!next) break;
      await ta.fill(ANSWERS[next.question_templates?.code] ?? 'Synthetic answer for testing.');
      await p.getByRole('button', { name: 'Send', exact: true }).click();
      await p.waitForFunction((n) => document.querySelectorAll('.bubble.me, .bubble.user').length >= n, answered + 1, { timeout: 30000 }).catch(() => {});
      await p.waitForTimeout(600); answered++;
    }
    const submit = p.getByRole('button', { name: 'Submit my answers' });
    if (await submit.count()) { await submit.click(); await p.waitForTimeout(3000); }
    const { count: ansCount } = await db.from('interview_current_answers').select('question_id', { count: 'exact', head: true }).eq('company_id', CO)
      .in('question_id', (await db.from('interview_questions').select('id, interview_sessions!inner(assignment_id)').eq('company_id', CO).eq('interview_sessions.assignment_id', asg.id)).data.map((q) => q.id));
    check('the leader answered the 20 leadership questions', ansCount >= 20, `${ansCount} answers`);

    // 3. AI consultant synthesis (live Gemini) — runs in the background; the page refreshes itself
    await p.goto(`${BASE}/c/${CO}/blueprint`);
    const before = (await db.from('blueprint_entries').select('id', { count: 'exact', head: true }).eq('company_id', CO)).count ?? 0;
    await p.getByTestId('run-synthesis').click();
    let st = 'running'; const until = Date.now() + 4 * 60_000;
    while (Date.now() < until) {
      await p.waitForTimeout(5000);
      const { data: r } = await db.from('blueprint_syntheses').select('status, counts, error_text').eq('company_id', CO).order('started_at', { ascending: false }).limit(1).single();
      st = r.status; if (st !== 'running') { check('AI synthesis finished', st === 'succeeded', st === 'succeeded' ? JSON.stringify(r.counts) : r.error_text); break; }
    }
    const { data: props } = await db.from('blueprint_entries').select('id, section, statement, source_refs').eq('company_id', CO).eq('status', 'proposed').eq('source_kind', 'ai_synthesis');
    check('AI proposed cited statements', (props?.length ?? 0) >= 5 && props.every((e) => e.source_refs.length > 0 && e.source_refs.every((r) => r.ref && r.kind)), `${props?.length} proposals, total entries ${before}→`);
    const { data: allEntries } = await db.from('blueprint_entries').select('section').eq('company_id', CO).in('status', ['proposed', 'confirmed']);
    check('the core areas are covered (proposed or agreed)', ['purpose', 'business_model', 'services', 'customers', 'objectives'].every((s) => allEntries?.some((e) => e.section === s)));
    const { data: ctqs } = await db.from('ctq_items').select('code, name, measure, target_value, target_text, status').eq('company_id', CO);
    check('AI proposed CTQs without any target', (ctqs?.length ?? 0) >= 1 && ctqs.filter((c) => c.status === 'proposed').every((c) => c.target_value === null && c.target_text === null),
      (ctqs ?? []).map((c) => c.name).slice(0, 4).join('; '));
    const names = ['E2E Discovery Lead', 'Discovery Lead'];
    check('no person is named in the proposals', !(props ?? []).some((e) => names.some((n) => e.statement.includes(n))));
    await p.screenshot({ path: OUT + '/blueprint-overview.png', fullPage: true });

    // 4. Review: confirm with an edit, reject with a reason, make sure the core is agreed
    await p.goto(`${BASE}/c/${CO}/blueprint?tab=review`);
    const first = p.locator('[data-testid="proposed-entry"]').first();
    const edited = 'Synthetic E2E: ' + (await first.locator('textarea').inputValue()).slice(0, 200);
    await first.locator('textarea').fill(edited); await first.getByRole('button', { name: 'Confirm' }).click(); await p.waitForURL(/ok=/, { timeout: 30000 });
    check('confirm with edited wording', (await db.from('blueprint_entries').select('original_statement').eq('company_id', CO).eq('statement', edited).single()).data?.original_statement !== null);
    const rej = p.locator('[data-testid="proposed-entry"]').first();
    await rej.getByRole('button', { name: 'Reject' }).click(); await p.waitForURL(/e=/, { timeout: 30000 });
    check('reject without a reason is refused', /reason/i.test(await p.locator('.notice.error').innerText()));
    const rej2 = p.locator('[data-testid="proposed-entry"]').first();
    await rej2.getByLabel('Reason').fill('Synthetic E2E: duplicate of another statement'); await rej2.getByRole('button', { name: 'Reject' }).click(); await p.waitForURL(/ok=/, { timeout: 30000 });
    for (const sec of ['purpose', 'business_model', 'services', 'customers', 'objectives']) {
      const { count } = await db.from('blueprint_entries').select('id', { count: 'exact', head: true }).eq('company_id', CO).eq('section', sec).eq('status', 'confirmed');
      if (count) continue;
      const card = p.locator('[data-testid="proposed-entry"]').filter({ has: p.locator(`xpath=preceding::h3[1][normalize-space()="${{ purpose: 'Purpose', business_model: 'Business model', services: 'Products and services', customers: 'Customers', objectives: 'Business objectives' }[sec]}"]`) }).first();
      if (await card.count()) { await card.getByRole('button', { name: 'Confirm' }).click(); await p.waitForURL(/ok=/, { timeout: 30000 }); await p.goto(`${BASE}/c/${CO}/blueprint?tab=review`); }
      else {
        await p.locator('details summary', { hasText: 'Add a statement yourself' }).click();
        await p.selectOption('#section', sec); await p.fill('#statement', `Synthetic E2E statement for ${sec}`);
        await p.getByRole('button', { name: 'Add (counts as agreed)' }).click(); await p.waitForURL(/ok=/, { timeout: 30000 });
      }
    }
    // 5. CTQ target: proposed by the lead, refused when the same person approves
    await p.goto(`${BASE}/c/${CO}/blueprint?tab=ctq`);
    if (!(await p.locator('[data-testid="target-form"]').count())) {
      await p.locator('details summary', { hasText: 'Add a CTQ' }).click(); await p.fill('#ctq-name', 'Synthetic turnaround'); await p.fill('#ctq-measure', 'Share of cases closed within the agreed turnaround');
      await p.getByRole('button', { name: 'Add', exact: true }).click(); await p.waitForURL(/ok=/, { timeout: 30000 });
    }
    const row = p.locator('[data-testid="ctq-table"] tbody tr').filter({ has: p.locator('[data-testid="target-form"]') }).first();
    await row.locator('summary', { hasText: /Propose target|Change target/ }).click();
    await row.getByLabel('Target number').fill('95'); await row.getByLabel('Target text').fill('% within agreed turnaround');
    await row.getByLabel('Where the target comes from').fill('Synthetic E2E: management review of November');
    await row.getByRole('button', { name: 'Send for approval' }).click(); await p.waitForURL(/ok=/, { timeout: 30000 });
    check('target sent for approval', await p.locator('[data-testid="pending-targets"]').count() === 1);
    await p.locator('[data-testid="ctq-table"] tbody tr').filter({ hasText: 'Target waiting for approval' }).first().getByRole('button', { name: 'Approve' }).click();
    await p.waitForURL(/e=/, { timeout: 30000 });
    check('nobody approves their own target', /someone else/i.test(await p.locator('.notice.error').innerText()));

    // 6. Open questions → answer becomes a proposed entry
    await p.goto(`${BASE}/c/${CO}/blueprint?tab=questions`);
    const q = p.locator('[data-testid="open-question"]').first();
    if (await q.count()) {
      await q.getByLabel('Answer').fill('Synthetic E2E answer from leadership.'); await q.getByRole('button', { name: 'Send answer' }).click(); await p.waitForURL(/ok=/, { timeout: 30000 });
      check('an open question is answered and goes to review', (await db.from('blueprint_entries').select('id').eq('company_id', CO).eq('source_kind', 'leadership_followup').eq('statement', 'Synthetic E2E answer from leadership.')).data?.length >= 1);
    } else check('AI raised open questions for leadership', false, 'none raised');

    // 7. Publish and read
    await p.goto(`${BASE}/c/${CO}/blueprint`);
    await p.getByLabel('Version note').fill('Synthetic E2E publication');
    await p.locator('[data-testid="publish-form"] button').click(); await p.waitForURL(/ok=/, { timeout: 30000 });
    check('blueprint version published', /published/i.test(await p.locator('.notice.ok').innerText()) && await p.locator('[data-testid="published"]').count() === 1);
    check('published blueprint shows the agreed statements', (await p.locator('[data-testid="published"]').innerText()).includes(edited.slice(0, 40)));
    await p.setViewportSize({ width: 390, height: 844 }); await p.goto(`${BASE}/c/${CO}/blueprint`);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('phone layout has no sideways scroll', sw <= 4, `${sw}px`);
    await p.screenshot({ path: OUT + '/blueprint-phone.png', fullPage: true });
    check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  } finally { await b.close(); }
  console.log(results.join('\n')); console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})();
