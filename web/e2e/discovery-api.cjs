// Live API test (synthetic tenant): AI-led discovery through the DEPLOYED discovery-ai Edge Function — no mocks.
// Env: E2E_DISC_TOKEN (discovery join link), NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
// Prints metadata only (stage, counts, question text from the AI) — the persona is synthetic.
const { createClient } = require('@supabase/supabase-js');
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
const tag = Date.now().toString(36).slice(-5);
const mobile = '96' + String(Date.now()).slice(-8);
const pw = 'Synthetic-' + tag + '-pw';

// Synthetic branch-operations persona. Answer 6 adds a forgotten responsibility; answer 9 corrects an earlier one.
const SCRIPT = [
  'Operations Executive in Field Verification, I report to Rohan Mehta, the Pune branch manager. I work from the Pune office.',
  'I do not manage anyone. I mainly handle allocation of verification cases to field officers and quality checking their reports.',
  'Every morning I download the case list the bank emails, split it by area and assign cases to six field officers on WhatsApp. During the day I check reports they upload and send them to the bank portal. Monthly I prepare the TAT report for the branch manager.',
  'I think that is the main work. Also sometimes I handle customer complaints when a field officer misbehaves.',
  'Yes, that is all.',
  'For allocation: the email comes at about 9am, I open the Excel, sort by pincode and assign by area. If an officer is on leave I give his cases to the nearest officer.',
  'I forgot one more responsibility — every Friday I reconcile the cases billed with the MIS count and send it to accounts.',
  'For quality checks I open the report in the app, check photos, GPS tag and that all fields are filled. If something is missing I send it back to the officer; if okay I submit to the bank portal.',
  'Nobody checks my quality review; the branch manager only sees the monthly TAT report.',
  'Let me correct my earlier answer — the branch manager actually signs off any case I reject twice, before it goes back to the bank as negative.',
  'Turnaround is 48 hours from allocation. Delays happen when the address is incomplete; then I call the bank coordinator.',
  'I am not sure what the bank does with the negative cases after that.',
  'We use the bank portal, our mobile app and Excel. Reports are stored in the app.',
  'Most of the manual effort is the morning allocation — it takes about an hour and could be automated by pincode.',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const db = createClient(URL, KEY, { auth: { persistSession: false } });
  const { data: reg, error: regErr } = await db.rpc('register_with_join_link', { p_token: process.env.E2E_DISC_TOKEN, p_mobile: mobile, p_full_name: `Neha Synthetic ${tag}`, p_password: pw });
  check('register on the discovery join link', !regErr, regErr?.message);
  const { error: signErr } = await db.auth.signInWithPassword({ email: reg.login, password: pw });
  check('sign in', !signErr, signErr?.message);
  const { data: { user } } = await db.auth.getUser();
  const { data: me } = await db.from('memberships').select('id, company_id').eq('status', 'active').eq('user_id', user.id).single();
  const { data: asg } = await db.from('interview_assignments').select('id, interview_campaigns(code, interview_mode)').eq('respondent_membership_id', me.id).limit(1).single();
  check('assignment is on the discovery campaign', asg?.interview_campaigns?.interview_mode === 'discovery', asg?.interview_campaigns?.code);
  const { error: stErr } = await db.rpc('start_interview_session', { p_assignment: asg.id });
  check('start session', !stErr, stErr?.message);
  const { data: sess } = await db.from('interview_sessions').select('id').eq('assignment_id', asg.id).single();
  const co = me.company_id;

  const turn = async () => {
    for (let i = 0; i < 6; i++) {
      const { data, error } = await db.functions.invoke('discovery-ai', { body: { action: 'turn', session_id: sess.id } });
      let body = data;
      if (error && error.context?.json) body = await error.context.json().catch(() => null);
      if (body?.error?.class === 'busy') { await sleep(5000); continue; }
      return body;
    }
    return null;
  };

  let r = await turn();
  check('opener is a deterministic first question (no AI call)', r?.ok && r.next_question?.generated_by === 'branch_rule', r?.next_question?.text);
  const kinds = []; const intents = []; let lastFlowNodes = 0; let queued = 0; let errors = 0;
  for (let i = 0; i < SCRIPT.length && r?.next_question; i++) {
    const q = r.next_question;
    const { error: aErr } = await db.from('interview_answers').insert({ company_id: co, question_id: q.id, answer_kind: 'answer', answer_text: SCRIPT[i], knowledge_basis: 'direct', answered_by_membership_id: me.id });
    if (aErr) { check(`answer ${i} saved`, false, aErr.message); break; }
    const t0 = Date.now(); r = await turn(); const ms = Date.now() - t0;
    if (!r?.ok) { errors++; console.log(`#${i} ERROR ${r?.error?.class}: ${r?.error?.message}`); if (r?.error?.class === 'queued') queued++; break; }
    kinds.push(r.next_question?.kind); intents.push(r.intent);
    const focus = (r.processes ?? []).find((p) => p.key === r.focus_process_key);
    lastFlowNodes = Math.max(lastFlowNodes, ...(r.processes ?? []).map((p) => p.flow?.nodes?.length ?? 0), 0);
    console.log(`#${i} ${ms}ms stage=${r.stage} intent=${r.intent} procs=${(r.processes ?? []).length} focus=${r.focus_process_key} flowNodes=${focus?.flow?.nodes?.length ?? 0} progress=${r.progress} served_by=${r.served_by}`);
    console.log(`    ack: ${r.acknowledgement ?? ''}`);
    console.log(`    Q(${r.next_question?.kind ?? '-'}): ${r.next_question?.text ?? '(complete) ' + r.complete_reason}`);
  }
  const { data: procs } = await db.from('discovered_processes').select('process_key, name, status, completeness, flow_version').eq('session_id', sess.id);
  const { data: prof } = await db.from('discovery_profiles').select('profile, responsibilities, inventory_confirmed, stage').eq('session_id', sess.id).single();
  const { data: flows } = await db.from('discovered_process_flows').select('version').eq('company_id', co);
  console.log('PROCESSES', JSON.stringify(procs)); console.log('PROFILE KEYS', Object.keys(prof?.profile ?? {}).join(','), 'RESP', (prof?.responsibilities ?? []).length, 'INV', prof?.inventory_confirmed, 'STAGE', prof?.stage);
  check('every turn returned a question or completion (no provider errors)', errors === 0, `errors=${errors} queued=${queued}`);
  check('profile captured from conversation (reporting manager, designation)', !!prof?.profile?.reporting_manager && !!(prof?.profile?.designation || prof?.profile?.functions_handled));
  check('responsibilities captured', (prof?.responsibilities ?? []).length >= 3, String((prof?.responsibilities ?? []).length));
  check('process inventory built automatically (>=3 processes)', (procs ?? []).length >= 3, (procs ?? []).map((p) => p.name).join(' | '));
  check('forgotten responsibility (reconciliation) added to the inventory', (procs ?? []).some((p) => /reconcil|mis|billing/i.test(p.name)));
  check('inventory confirmed by the employee', !!prof?.inventory_confirmed);
  check('live flowchart built and versioned for at least one process', lastFlowNodes >= 3 && (flows ?? []).length >= 1, `maxNodes=${lastFlowNodes} versions=${(flows ?? []).length}`);
  check('intent classification seen (adds_responsibility or corrects_earlier)', intents.some((x) => ['adds_responsibility', 'corrects_earlier', 'reports_change'].includes(x)), intents.join(','));
  check('employee cannot write discovery tables directly', !!(await db.from('discovered_processes').insert({ company_id: co, session_id: sess.id, membership_id: me.id, process_key: 'hack_x', name: 'x' })).error);
  console.log('\n' + results.join('\n'));
  process.exit(results.some((x) => x.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.error('CRASH', e?.message); process.exit(2); });
