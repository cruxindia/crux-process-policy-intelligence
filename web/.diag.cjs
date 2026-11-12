const { createClient } = require('@supabase/supabase-js');
const URL = 'https://pahzxpileudulljgaciw.supabase.co', KEY = 'sb_publishable_L2ykSIC91lAxg1Verk-8yQ_rP9-p80F';
(async () => {
  const sb = createClient(URL, KEY, { auth: { persistSession: false } });
  const { data } = await sb.auth.signInWithPassword({ email: 'e2e.lead@example.invalid', password: process.env.E2E_PASSWORD });
  const r = await fetch(URL + '/functions/v1/interview-ai', { method: 'POST', headers: { authorization: 'Bearer ' + data.session.access_token, apikey: KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ action: process.argv[2] || 'diagnose', company_id: 'e2e00000-0000-4000-8000-0000000000c0' }) });
  console.log(r.status, JSON.stringify(await r.json(), null, 1));
})();
