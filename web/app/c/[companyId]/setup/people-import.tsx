"use client";
import { useActionState } from "react";
import { importPeople, type ImportState } from "./actions";

/** Paste a people list from Excel or CSV. Temporary passwords appear once, here, and can be saved as a file for hand-over. */
export function PeopleImport({ companyId }: { companyId: string }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importPeople.bind(null, companyId), null);
  const rows = state && "rows" in state ? state.rows : [];
  const download = () => {
    const csv = ["Name,E-mail,Temporary password", ...rows.filter((r) => r.password).map((r) => `"${r.name}","${r.email}","${r.password}"`)].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "new-people-temporary-passwords.csv"; a.click();
  };
  return (
    <form action={action} data-testid="people-import">
      <label htmlFor="people-list" className="small">One person per line — <strong>name, e-mail, job title, department code</strong> (copy the columns straight from Excel).</label>
      <textarea id="people-list" name="people" rows={5} placeholder={"Priya Shah, priya.shah@example.com, Head of HR, HR\nRahul Mehta, rahul.m@example.com, Operations Manager, OPS"} />
      <button type="submit" disabled={pending} style={{ marginTop: 8 }}>{pending ? "Adding…" : "Add these people"}</button>
      {state && "error" in state && <p className="notice error">{state.error}</p>}
      {rows.length > 0 && (
        <div style={{ marginTop: 10 }} data-testid="people-result">
          <p className="small">{rows.filter((r) => r.status === "invited").length} added · {rows.filter((r) => r.status === "exists").length} already members ·
            {" "}{rows.filter((r) => r.status === "error").length} need attention.
            {rows.some((r) => r.password) && <> Temporary passwords are shown <strong>only now</strong>. <button type="button" className="secondary" onClick={download}>Save as file</button></>}</p>
          <div style={{ overflowX: "auto" }}><table className="small"><thead><tr><th>Line</th><th>Name</th><th>E-mail</th><th>Result</th><th>Temporary password</th></tr></thead><tbody>
            {rows.map((r) => <tr key={r.line}><td>{r.line}</td><td>{r.name}</td><td>{r.email}</td>
              <td>{r.status === "invited" ? "Added" : r.status === "exists" ? "Already a member" : "Not added"}{r.detail && <div className="muted">{r.detail}</div>}</td>
              <td className="mono">{r.password ?? "—"}</td></tr>)}
          </tbody></table></div>
        </div>)}
    </form>
  );
}
