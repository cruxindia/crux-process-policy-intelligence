/** Pool providers shown in the platform console (defaults; a key test lists the models really available). */
export const PROVIDERS: Record<string, { label: string; model: string; note: string }> = {
  gemini: { label: "Google Gemini", model: "gemini-flash-lite-latest", note: "Free tier may use content for training → public data only (unless a company accepts)." },
  groq: { label: "Groq", model: "llama-3.3-70b-versatile", note: "No retention by default; turn on Zero Data Retention in Groq → internal data allowed." },
  openrouter: { label: "OpenRouter (free models)", model: "meta-llama/llama-3.3-70b-instruct:free", note: "Free models may log/train → public data only." },
  cerebras: { label: "Cerebras", model: "llama3.1-8b", note: "Training use not confirmed → public data only." },
  mistral: { label: "Mistral", model: "mistral-small-latest", note: "Free plan may train unless opted out → public data only." },
  openai_compat: { label: "Other OpenAI-compatible endpoint", model: "", note: "Disabled for companies until you review the provider's data terms." },
};
