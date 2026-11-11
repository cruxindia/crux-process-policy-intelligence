"use client";
import { useEffect, useRef } from "react";
import { startInterview } from "./actions";

/** Starts the interview automatically the first time the respondent opens it. */
export function AutoStart({ companyId, assignmentId }: { companyId: string; assignmentId: string }) {
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    void startInterview(companyId, assignmentId);
  }, [companyId, assignmentId]);
  return <p className="muted">Preparing your questions…</p>;
}
