import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { acceptInvitation } from "./actions";

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { supabase, userId } = await requireUser();
  const { data: mustChange } = await supabase.rpc("password_change_required");
  if (mustChange) redirect("/account/password");
  // Straight into an open interview: nothing to choose for respondents.
  const { data: open } = await supabase.from("interview_assignments")
    .select("id, company_id, memberships!inner(user_id)")
    .eq("memberships.user_id", userId).in("status", ["invited", "accepted", "in_progress"]).limit(1);
  if (open?.[0]) redirect(`/c/${open[0].company_id}/interviews/${open[0].id}`);
  const { data: memberships, error } = await supabase
    .from("memberships")
    .select("id, status, job_title, company_id, companies(name, code)")
    .eq("user_id", userId)
    .in("status", ["invited", "active"])
    .order("created_at");

  return (
    <>
      <h1>Your organisations</h1>
      <p className="muted">Choose where to work. Invitations must be accepted before any access applies.</p>
      {sp.e && <div className="notice error">{sp.e}</div>}
      {sp.pw && <div className="notice ok">Password saved.</div>}
      {error && <div className="notice error">Could not load your organisations: {error.message}</div>}
      {memberships?.length === 0 && (
        <div className="notice">You are signed in but not a member of any organisation yet. Ask your administrator for an invitation.</div>
      )}
      {memberships?.map((m) => (
        <div key={m.id} className="card row">
          <div className="grow">
            <strong>{m.companies?.name ?? "Organisation"}</strong>{" "}
            <span className={`badge ${m.status === "active" ? "ok" : "warn"}`}>{m.status === "active" ? "Member" : "Invited"}</span>
            {m.job_title && <div className="muted small">{m.job_title}</div>}
          </div>
          {m.status === "active" ? (
            <Link className="button" href={`/c/${m.company_id}`}>Open</Link>
          ) : (
            <form action={acceptInvitation}>
              <input type="hidden" name="company_id" value={m.company_id} />
              <button type="submit">Accept invitation</button>
            </form>
          )}
        </div>
      ))}
    </>
  );
}
