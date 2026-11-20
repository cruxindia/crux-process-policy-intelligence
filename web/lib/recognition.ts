// Recognition (P7, D-101): plain, earned badges from a person's own counts. No ranking of others is shown.
export type Impact = {
  me: { answers: number; answers_30d: number; processes_described: number; colleagues_helped: number; tasks_resolved: number; validations: number;
        interview_done: boolean; score_30d: number; top5: boolean; joined: string };
  company: { people: number; contributors_30d: number; processes: number; validated: number; documents: number; interviews_done: number; interviews_assigned: number };
};
export type Badge = { icon: string; title: string; why: string };

export function badges(i: Impact["me"]): Badge[] {
  const b: Badge[] = [];
  if (i.answers >= 1) b.push({ icon: "🎙️", title: "Voice of the work", why: "You explained how your work really happens." });
  if (i.interview_done) b.push({ icon: "✅", title: "Interview complete", why: "Your full picture is in — thank you." });
  if (i.processes_described >= 3) b.push({ icon: "🗺️", title: "Process mapper", why: `You described ${i.processes_described} processes.` });
  if (i.colleagues_helped >= 1) b.push({ icon: "🤝", title: "Helpful colleague", why: `You answered ${i.colleagues_helped} question${i.colleagues_helped === 1 ? "" : "s"} from colleagues.` });
  if (i.tasks_resolved >= 3) b.push({ icon: "🛠️", title: "Problem solver", why: `You closed ${i.tasks_resolved} tasks.` });
  if (i.validations >= 1) b.push({ icon: "🔏", title: "Process guardian", why: "You validated how a process really runs." });
  if (i.top5) b.push({ icon: "🏆", title: "Top contributor this month", why: "Among the five people who moved the company forward most in 30 days." });
  return b;
}

/** Time-of-day greeting in India time. */
export function greeting(nowMs: number) {
  const h = new Date(nowMs + 5.5 * 3600e3).getUTCHours();
  return h < 5 ? "Hello" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "there";
