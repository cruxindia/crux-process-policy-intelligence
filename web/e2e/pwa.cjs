// E2E: the platform is installable from the browser (manifest, icons, service worker, offline page). Env: BASE, E2E_PASSWORD.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);
(async () => {
  const b = await chromium.launch(); const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage(); p.on('pageerror', (x) => errs.push(x.message));
    const m = await (await p.request.get(BASE + '/manifest.webmanifest')).json();
    check('manifest: name, standalone, start_url', m.name && m.display === 'standalone' && m.start_url === '/', m.short_name);
    check('manifest: 192 + 512 icons and a maskable icon', ['192x192', '512x512'].every((s) => m.icons.some((i) => i.sizes === s)) && m.icons.some((i) => i.purpose === 'maskable'));
    for (const i of m.icons) check(`icon reachable without sign-in ${i.src}`, (await p.request.get(BASE + i.src)).status() === 200);
    await p.goto(BASE + '/login');
    check('login page links the manifest', (await p.locator('link[rel="manifest"]').count()) === 1);
    check('theme colour and apple touch icon set', (await p.locator('meta[name="theme-color"]').count()) >= 1 && (await p.locator('link[rel="apple-touch-icon"]').count()) >= 1);
    const sw = await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; return r.active?.scriptURL ?? null; });
    check('service worker active', /\/sw\.js$/.test(sw ?? ''), sw);
    await p.fill('#email', 'e2e.lead@example.invalid'); await p.fill('#password', process.env.E2E_PASSWORD);
    await p.getByRole('button', { name: 'Sign in', exact: true }).click(); await p.waitForLoadState('networkidle');
    const cached = await p.evaluate(async () => { const c = await caches.open('ppi-static-v1'); return (await c.keys()).map((r) => new URL(r.url).pathname); });
    check('no pages or data cached on the device (only build files, icons, offline page)', cached.every((u) => /^\/(_next\/static\/|icons\/|offline\.html$)/.test(u)), `${cached.length} entries`);
    await ctx.setOffline(true);
    await p.goto(BASE + '/').catch(() => {});
    check('offline: friendly page instead of a browser error', /You're offline/.test(await p.locator('body').innerText().catch(() => '')));
    await ctx.setOffline(false);
    check('no browser errors', errs.length === 0, errs.join(' | ').slice(0, 200));
  } catch (e) { check('no crash', false, String(e.message).slice(0, 200)); }
  finally { await b.close(); console.log(results.join('\n')); }
})();
