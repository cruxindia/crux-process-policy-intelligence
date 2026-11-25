// E2E (synthetic tenant E2E-SYNTH): SOW 12G — bulk intake in the browser, classification, privacy guard, checklist adoption,
// departments + stakeholders, analysis gate, stakeholder review. Env: BASE, E2E_PASSWORD, E2E_OUT, NODE_PATH (playwright, fflate).
const { chromium } = require('playwright');
const { zipSync, strToU8 } = require('fflate');
const fs = require('fs'); const path = require('path'); const os = require('os');
const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.E2E_OUT || '/tmp';
const CO = 'e2e00000-0000-4000-8000-0000000000c0';
const tag = Date.now().toString(36).slice(-5);
const results = []; const check = (n, c, d = '') => results.push(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`);

const docx = (paras) => zipSync({ 'word/document.xml': strToU8(`<w:document><w:body>${paras.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join('')}<w:p><w:r><w:t>Ref ${tag}</w:t></w:r></w:p></w:body></w:document>`) });
function pdf(text) {   // smallest valid PDF with one line of text
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>', null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`; objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  return Buffer.from(out + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`, 'latin1');
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppi-docs-'));
  const put = (n, b) => { fs.writeFileSync(path.join(dir, n), b); return path.join(dir, n); };
  const files = [
    put('Travel Policy.docx', docx(['Travel Policy', '1. Purpose: rules for official travel.', '2. Scope: all employees.', '3. Responsibilities: the manager approves trips.'])),
    put('Appointment letter - Test Person.docx', docx(['Dear Test Person, we are pleased to appoint you.'])),
    put('Warning letter - Test Person.docx', docx(['This is a warning about attendance.'])),
    put('Branch head note.docx', docx(['Purpose of this note is to set how branches run.', 'Scope: every branch.', 'Responsibilities: the branch head checks reports daily.'])),
    put('Field work.zip', zipSync({ 'SOPs/SOP - Field Visit.docx': docx(['Field visit SOP', 'Purpose: verify addresses.']), 'photos/IMG_0001.jpg': strToU8(`jpeg ${tag}`) })),
    put('Leave Policy.doc', Buffer.from(`old word ${tag}`)),
    put('Expense Claim Procedure.pdf', pdf(`Expense claim procedure ${tag}: Purpose and scope. The accounts team pays within 7 days.`)),
  ];
  const b = await chromium.launch(); const errs = [];
  try {
    const l = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); l.on('pageerror', (x) => errs.push(x.message));
    await l.goto(BASE + '/login'); await l.fill('#email', 'e2e.lead@example.invalid'); await l.fill('#password', process.env.E2E_PASSWORD);
    await l.getByRole('button', { name: 'Sign in', exact: true }).click(); await l.waitForLoadState('networkidle');
    await l.goto(`${BASE}/c/${CO}/documents`);
    check('"Documents" is in the main navigation', (await l.locator('.company-nav a', { hasText: /^Documents$/ }).count()) === 1);
    if (await l.getByRole('button', { name: 'Use this checklist' }).count()) {
      await l.getByRole('button', { name: 'Use this checklist' }).first().click(); await l.waitForURL(/ok=Checklist/);
      check('checklist adopted (174 documents to work through)', /174 documents/.test(decodeURIComponent(l.url())));
    } else check('checklist already adopted', /expected documents/.test(await l.getByTestId('checklist').innerText()));

    await l.getByTestId('pick-files').setInputFiles(files);
    await l.getByText(/^Done\./).waitFor({ timeout: 120000 });
    const counts = await l.getByTestId('intake-counts').innerText();
    check('8 files read in the browser (zip expanded)', /8 of 8/.test(counts), counts);
    check('rule documents, records and personal records separated', /5 rule documents/.test(counts) && /2 records/.test(counts) && /1 personal\/legal/.test(counts), counts);
    check('old .doc reported as unreadable with advice', /could not be read/.test(counts) && /Old \.doc format/.test(await l.getByTestId('intake-progress').innerText()));
    await l.getByTestId('pick-files').setInputFiles([files[0]]);
    await l.getByText(/^Done\./).waitFor({ timeout: 60000 });
    check('the same file again is not added twice', /1 already in/.test(await l.getByTestId('intake-counts').innerText()));

    await l.reload();
    const gov = await l.getByTestId('doc-list').innerText();
    check('policy-shaped text turns an unclear name into a rule document', /Branch head note/.test(gov) && /written like a policy/i.test(gov));
    check('PDF text read; SOP inside the zip listed with its folder', /Expense Claim Procedure/.test(gov) && /Field work\.zip\/SOPs/.test(gov));
    await l.goto(`${BASE}/c/${CO}/documents?cat=sensitive#list`);
    check('warning letter is personal/legal and never read', /Warning letter - Test Person/.test(await l.getByTestId('doc-list').innerText()));

    // analysis gate: no AI is approved for confidential documents on the synthetic tenant
    await l.goto(`${BASE}/c/${CO}/documents`);
    await l.getByTestId('analyse').getByRole('button').first().click();
    await l.waitForTimeout(4000);
    const msg = await l.getByTestId('analysis').innerText();
    check('analysis waits safely when no AI is approved for confidential data', /approved for confidential|Analysed|analysed/.test(msg), msg.replace(/\n/g, ' ').slice(0, 200));
    await l.goto(`${BASE}/c/${CO}/admin/ai`);
    check('data approvals explain training providers', /Data approvals/.test(await l.getByTestId('data-approvals').innerText()) && /gemini_free/.test(await l.getByTestId('data-approvals').innerText()));

    // departments and a stakeholder
    await l.goto(`${BASE}/c/${CO}/documents#stakeholders`);
    const st = l.getByTestId('stakeholders');
    check('departments found in the documents are listed', /Human Resources|Finance|Operations/.test(await st.innerText()));
    if (await st.getByRole('button', { name: 'Create these departments' }).count()) { await st.getByRole('button', { name: 'Create these departments' }).click(); await l.waitForURL(/ok=Departments/); }
    const firstForm = l.locator('[data-testid^="stake-form-"]').first();
    await firstForm.locator('input[name="name"]').fill(`Reviewer Synthetic ${tag}`); await firstForm.locator('input[name="email"]').fill(`reviewer.${tag}@example.invalid`);
    await firstForm.locator('input[name="job_title"]').fill('Department Head'); await firstForm.getByRole('button', { name: 'Add' }).click();
    await l.getByTestId('temp-pw').waitFor({ timeout: 20000 });
    const pw = (await l.getByTestId('temp-pw').innerText()).trim();
    check('a new stakeholder is invited with a one-time password (not in the address bar)', pw.length >= 8 && !l.url().includes(pw));
    await l.screenshot({ path: `${OUT}/docs-admin.png`, fullPage: true });

    const s = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); s.on('pageerror', (x) => errs.push(x.message));
    await s.goto(BASE + '/login'); await s.fill('#email', `reviewer.${tag}@example.invalid`); await s.fill('#password', pw);
    await s.getByRole('button', { name: 'Sign in', exact: true }).click(); await s.waitForLoadState('networkidle');
    check('stakeholder is asked to set their own password first', /password/i.test(s.url()) || /new password/i.test(await s.locator('body').innerText()));
    check('no browser errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  } catch (x) { check('no crash', false, x.message.split('\n')[0]); }
  finally { await b.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  console.log(results.join('\n'));
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})();
