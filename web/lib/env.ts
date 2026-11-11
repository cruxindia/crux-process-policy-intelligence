// Public values (shipped to every browser by design; data is protected by RLS, not by hiding these).
// Environment variables override them, e.g. to point a build at another Supabase project.
const DEFAULT_URL = "https://pahzxpileudulljgaciw.supabase.co";
const DEFAULT_PUBLISHABLE_KEY = "sb_publishable_L2ykSIC91lAxg1Verk-8yQ_rP9-p80F";

export function supabaseEnv() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_PUBLISHABLE_KEY,
  };
}
