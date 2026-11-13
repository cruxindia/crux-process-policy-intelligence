// Live API test (synthetic tenant): the expert review board through the DEPLOYED board-ai Edge Function — no mocks.
// Env: E2E_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, BOARD_KIND (agreement|improvement, default both).
// Prints metadata only (roles, kinds, verdicts, sizes) — the content is synthetic.
const { createClient } = require('@supabase/supabase-js');
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KIND = process.env.BOARD_KIND || 'both';

async function runToEnd(db, caseId, label) {
  const t0 = Date.now(); let lastStatus = ''; let kicks = 0;
  const kick = async () => { kicks++; const { data, error } = await db.functions.invoke('board-ai', { body: { action: 'run', case_id: caseId } });
    if (error) console.log(label, 'invoke error', error.message); return data; };
  await kick();
  while (Date.now() - t0 < 12 * 60_000) {
    await sleep(6000);
    const { data: c } = await db.from('board_cases').select('status, next_step, revision_rounds, last_error, plan').eq('id', caseId).single();
    if (c.status !== lastStatus) { console.log(label, `${Math.round((Date.now() - t0) / 1000)}s`, c.status, `step ${c.next_step}/${(c.plan || []).length}`, c.last_error || ''); lastStatus = c.status; }
    if (['awaiting_approval', 'failed', 'approved', 'rejected'].includes(c.status)) return { c, kicks, secs: Math.round((Date.now() - t0) / 1000) };
    if (c.status === 'waiting') {
      if (/resting/.test(c.last_error || '')) return { c, kicks, secs: Math.round((Date.now() - t0) / 1000) };
      await kick();   // the page does this automatically when someone is watching
    }
  }
  const { data: c } = await db.from('board_cases').select('*').eq('id', caseId).single();
  return { c, kicks, secs: -1 };
}

async function report(db, caseId, label, res) {
  const { data: turns } = await db.from('board_turns').select('seq, step, role_code, team_code, kind, addressed_to, citations, verdict, summary, content').eq('case_id', caseId).order('seq');
  const { data: outs } = await db.from('board_outputs').select('version, title, body_md, audit_verdict, dissent').eq('case_id', caseId).order('version');
  for (const t of turns) console.log(label, `#${t.seq}`, t.kind.padEnd(13), t.role_code.padEnd(17), `→ ${t.addressed_to.join(',')}`, `cites ${t.citations.length}`, t.verdict || '', `| ${t.summary.slice(0, 90)}`);
  const final = outs.at(-1);
  console.log(label, 'outputs', outs.map((o) => `v${o.version}:${o.body_md.length}ch${o.audit_verdict ? ':' + o.audit_verdict : ''}`).join(' '));
  check(`${label}: finished and waits for a person`, res.c.status === 'awaiting_approval', `${res.c.status} in ${res.secs}s, ${res.kicks} start(s)`);
  check(`${label}: every planned expert spoke once`, turns.length === (res.c.plan || []).length, `${turns.length} turns / ${(res.c.plan || []).length} steps`);
  check(`${label}: critiques come from several teams`, new Set(turns.filter((t) => t.kind === 'critique').map((t) => t.team_code)).size >= 3);
  check(`${label}: final audit verdict recorded on the output`, !!final?.audit_verdict, final?.audit_verdict);
  check(`${label}: final document is substantial`, (final?.body_md.length ?? 0) > 2500, `${final?.body_md.length} chars`);
  check(`${label}: house format applied (document control + revision history)`, /Document ID/i.test(final?.body_md || '') && /Revision history/i.test(final?.body_md || ''));
  check(`${label}: placeholders used instead of invented facts`, /\[(TO CONFIRM|to be confirmed|Name|Date)/i.test(final?.body_md || ''));
  const secNum = (final?.body_md || '').match(/\bSection\s+\d+[A-Z]?\b(?![^\[]*\])/g) || [];
  check(`${label}: no unbracketed statutory section numbers`, secNum.length === 0, secNum.slice(0, 3).join(', '));
  return { turns, final };
}

(async () => {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const { error: se } = await db.auth.signInWithPassword({ email: 'e2e.lead@example.invalid', password: process.env.E2E_PASSWORD });
  check('lead signs in', !se, se?.message);
  const { data: teams } = await db.from('agent_teams').select('code'); const { data: roles } = await db.from('agent_roles').select('code, version, charter_sha256').eq('status', 'active');
  check('expert teams and charters are visible', teams.length === 7 && roles.length === 12, `${teams.length} teams, ${roles.length} roles`);

  if (KIND !== 'improvement') {
    const { data: id, error } = await db.rpc('open_board_case', { p_company: CO, p_kind: 'document_draft', p_doc_type: 'agreement',
      p_title: 'Mutual Non-Disclosure Agreement with a field verification sub-agency (synthetic)',
      p_brief: 'Synthetic test. CRUX wants a mutual NDA with a sub-agency that performs address and employment verification visits for CRUX\'s bank clients in Maharashtra. The sub-agency will see applicant names, addresses and phone numbers. Term 2 years. Arbitration seat Pune. The sub-agency may not sub-contract without written consent.',
      p_process_ids: [], p_classification: 'confidential' });
    check('agreement case opened (confidential)', !!id && !error, error?.message);
    if (id) {
      const res = await runToEnd(db, id, '[NDA]'); const r = await report(db, id, '[NDA]', res);
      // Outcome check: the protective clauses a top-tier draft needs survive every step (incl. formatting) as their own sections.
      // A clause counts when it is a heading or a bold clause label (e.g. "19.3. **Severability:**" under Miscellaneous — normal drafting).
      const body = r.final?.body_md || '';
      const labels = [...body.matchAll(/^#{1,4}\s+(.+)$/gm), ...body.matchAll(/\*\*([^*\n]{3,60})\*\*/g)].map((m) => m[1].toLowerCase()).join(' | ');
      const need = ['indemn', 'limitation of liability', 'notice', 'force majeure', 'severab', 'governing law', 'term'];
      const missing = need.filter((n) => !labels.includes(n));
      check('[NDA]: protective clauses present as clauses in the final document', missing.length === 0, missing.join(', ') || 'indemnity, liability cap, notices, force majeure, severability, governing law, term');
    }
  }
  if (KIND !== 'agreement') {
    const { data: procs } = await db.from('discovered_processes').select('id, name').eq('company_id', CO).not('flow', 'is', null).limit(1);
    check('a synthetic discovered process exists', !!procs?.length, procs?.[0]?.name);
    if (procs?.length) {
      const { data: id, error } = await db.rpc('open_board_case', { p_company: CO, p_kind: 'improvement_review', p_doc_type: null,
        p_title: `Improve: ${procs[0].name}`, p_brief: 'Synthetic test. Find waste and control gaps; quick wins first.', p_process_ids: [procs[0].id], p_classification: 'internal' });
      check('improvement case opened', !!id && !error, error?.message);
      if (id) { const res = await runToEnd(db, id, '[IMP]'); const r = await report(db, id, '[IMP]', res);
        check('[IMP]: experts cite the interview sources', r.turns.filter((t) => t.citations.length).length >= Math.ceil(r.turns.length / 2)); }
    }
  }
  console.log('\n' + results.join('\n'));
  console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})();
