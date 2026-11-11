import { createClient } from "@/lib/supabase/server";
import { JoinForm } from "./join-form";

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("join_link_info", { p_token: token });
  const info = data as { company: string; campaign: string; purpose: string | null } | null;
  if (!info) {
    return (
      <div style={{ maxWidth: 440, margin: "40px auto" }}>
        <h1>Link not valid</h1>
        <p className="muted">This sign-up link has expired or is incorrect. Ask the person who sent it for a new one.</p>
      </div>
    );
  }
  return (
    <div style={{ maxWidth: 440, margin: "24px auto" }}>
      <p className="muted small" style={{ marginBottom: 4 }}>{info.company}</p>
      <h1>{info.campaign}</h1>
      {info.purpose && <p>{info.purpose}</p>}
      <p className="muted small">Takes about 20–30 minutes. You can stop any time and continue later — your answers are saved.</p>
      <JoinForm token={token} />
    </div>
  );
}
