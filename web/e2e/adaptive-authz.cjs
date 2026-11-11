// Server-side authorisation of the interview-ai Edge Function (real deployed function, synthetic tenant). Env: E2E_ADAPT_TOKEN, E2E_PASSWORD.
const { createClient } = require('@supabase/supabase-js');
const URL = 'https://pahzxpileudulljgaciw.supabase.co', KEY = 'sb_publishable_L2ykSIC91lAxg1Verk-8yQ_rP9-p80F';
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const call = async (tok, body) => { const r = await fetch(URL + '/functions/v1/interview-ai', { method: 'POST', headers: { authorization: 'Bearer ' + tok, apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify(body) }); return [r.status, await r.json()]; };
const out = []; const check = (n, c, d) => out.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
(async () => {
  const anon = createClient(URL, KEY, { auth: { persistSession: false } });
  const mobile = '96' + String(Date.now()).slice(-8), pw = 'Synthetic-authz-' + Date.now().toString(36);
  const reg = await anon.rpc('register_with_join_link', { p_token: process.env.E2E_ADAPT_TOKEN, p_mobile: mobile, p_full_name: 'Authz Synthetic', p_password: pw, p_email: null });
  if (reg.error) { console.log('register', reg.error.message); return; }
  const { data: idd } = await anon.rpc('mobile_login_id', { p_mobile: mobile });
  const emp = createClient(URL, KEY, { auth: { persistSession: false } });
  const s = await emp.auth.signInWithPassword({ email: idd, password: pw }); if (s.error) { console.log('signin', s.error.message); return; }
  const etok = s.data.session.access_token;
  let [st, j] = await call(etok, { action: 'status', company_id: CO });
  check('employee cannot run the provider status check', st === 403 && j.error.class === 'forbidden', `${st} ${j.error?.class}`);
  const { data: asg } = await emp.from('interview_assignments').select('id').limit(1).single();
  const st1 = await emp.rpc('start_interview_session', { p_assignment: asg.id }); 
  const { data: sess } = await emp.from('interview_sessions').select('id').eq('assignment_id', asg.id).single();
  [st, j] = await call(etok, { action: 'turn', session_id: sess.id });
  check('turn before any answer returns the pending opening question (no AI call)', j.ok && j.pending && j.next_question && j.next_question.generated_by === 'template', JSON.stringify(j).slice(0, 90));
  const lead = createClient(URL, KEY, { auth: { persistSession: false } });
  const l = await lead.auth.signInWithPassword({ email: 'e2e.lead@example.invalid', password: process.env.E2E_PASSWORD });
  [st, j] = await call(l.data.session.access_token, { action: 'turn', session_id: sess.id });
  check('another user (even the discovery lead) cannot drive the interview', !j.ok && j.error.class === 'forbidden', JSON.stringify(j.error));
  [st, j] = await call('not-a-jwt', { action: 'turn', session_id: sess.id });
  check('invalid token is rejected', st === 401, String(st));
  console.log(out.join('\n'));
})();
