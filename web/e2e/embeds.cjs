// Guard (25-Nov-2026): every PostgREST embed used by the app resolves on the hosted API (a new table can make one ambiguous, PGRST201).
// Usage: PW=<e2e lead password> node e2e/embeds.cjs <repo root>  (env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
const fs=require('fs'),path=require('path');
const files=[];(function walk(d){for(const f of fs.readdirSync(d)){const p=path.join(d,f);if(f==='node_modules'||f==='.next')continue;const s=fs.statSync(p);if(s.isDirectory())walk(p);else if(/\.(ts|tsx)$/.test(f))files.push(p);}})(process.argv[2]);
const pairs=new Map();
for(const f of files){const t=fs.readFileSync(f,'utf8');for(const m of t.matchAll(/from\("(\w+)"\)\s*\.select\("([^"]*\([^"]*)"/g))pairs.set(m[1]+'|'+m[2],f);}
const U=process.env.NEXT_PUBLIC_SUPABASE_URL,K=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
(async()=>{const r=await fetch(U+"/auth/v1/token?grant_type=password",{method:"POST",headers:{apikey:K,"content-type":"application/json"},body:JSON.stringify({email:"e2e.lead@example.invalid",password:process.env.PW})});const t=(await r.json()).access_token;
for(const [k,f] of pairs){const [tb,sel]=k.split('|');const x=await fetch(`${U}/rest/v1/${tb}?select=${encodeURIComponent(sel.replace(/\s+/g,''))}&limit=1`,{headers:{apikey:K,authorization:"Bearer "+t}});
const b=await x.text();console.log(x.status===200?'ok ':'BAD',x.status,tb,'|',f.replace(process.argv[2],''),x.status===200?'':b.slice(0,140));}})();
