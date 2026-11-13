"use client";
import { useFormStatus } from "react-dom";

/** Approve / Reject with immediate feedback while the decision is being recorded. */
export function DecisionButtons() {
  const { pending, data } = useFormStatus();
  const which = data?.get("decision");
  return (
    <div className="row">
      <button type="submit" name="decision" value="approved" disabled={pending}>{pending && which === "approved" ? "Recording…" : "Approve"}</button>
      <button type="submit" name="decision" value="rejected" className="secondary" disabled={pending}>{pending && which === "rejected" ? "Recording…" : "Reject"}</button>
    </div>
  );
}
