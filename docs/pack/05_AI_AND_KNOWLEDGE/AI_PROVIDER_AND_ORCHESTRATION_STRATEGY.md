# AI Provider and Orchestration Strategy

## 1. Objective

Build an AI layer that is useful with local or free/low-cost services, replaceable when provider terms or quotas change, safe for confidential information and integrated with source-aware company knowledge.

## 2. Free-first principle

"Free-first" means prioritising local inference and free tiers where practical, not assuming unlimited, permanent, private or production-grade free service. Provider quotas, model availability, terms, retention and pricing can change. Check current provider documentation and legal terms before use.

## 3. Suggested deployment modes

### Mode A — Local development
- Ollama on a developer machine for experiments with synthetic/redacted data.
- Local PostgreSQL or isolated development database.
- No live confidential CRUX data by default.
- Keep model endpoint local/private; do not expose unauthenticated Ollama to the internet.

### Mode B — Small approved pilot
- Hosted application/database if operationally suitable.
- Local model in a controlled internal environment, or a hosted provider explicitly approved for the data category.
- Test model quality against real but minimised/redacted examples.
- Human validation of all knowledge and documents.

### Mode C — Scaled deployment
- Select models by quality, latency, reliability, data-processing terms and cost.
- Consider internal inference hosting only if hardware, administration and security are available.
- Introduce monitoring, rate limits, provider failover and model evaluation.

## 4. Provider adapter contract

Business modules must call an internal interface, never provider SDKs directly throughout the app.

Suggested contract:

```ts
type AIRequest = {
  task: string;
  promptVersion: string;
  systemInstructions: string;
  input: unknown;
  outputSchema: unknown;
  dataClassification: "public" | "internal" | "confidential" | "restricted";
  allowedProviders?: string[];
  maxOutputTokens?: number;
  correlationId: string;
};

type AIResult<T> = {
  ok: boolean;
  data?: T;
  provider?: string;
  model?: string;
  promptVersion: string;
  latencyMs?: number;
  usage?: { inputTokens?: number; outputTokens?: number };
  warnings: string[];
  errorCode?: string;
};

interface AIProvider {
  generate<T>(request: AIRequest): Promise<AIResult<T>>;
}
```

This is illustrative; Claude should adapt to the repository's language and validation framework.

## 5. Provider selection rules

- Map each task to an approved provider/model profile.
- Filter providers by data classification and current organisational approval.
- Prefer local for sensitive data when local model capability is adequate and the environment is secure.
- Use hosted free tiers only for permitted data and within current terms/quotas.
- Record provider, model, prompt version, timestamp, latency and usage metadata.
- Do not silently send data to another provider on failure; fallback must pass the same data policy.
- Allow users/admins to see when AI is unavailable and provide manual completion path.

## 6. Model role allocation

Start with as few models as possible. A single capable model may perform several task types through different prompts and schemas. Add model specialisation only when evaluation shows measurable benefit.

Logical capabilities:
1. Interview planner and adaptive question generator.
2. Structured extraction and answer normaliser.
3. Process structure and handoff analyst.
4. Department dependency and contradiction analyst.
5. Risk/control suggestion assistant.
6. Legal source research assistant (not legal decision-maker).
7. Controlled document drafter.
8. Completeness/red-team reviewer.
9. Change-impact analyst.

## 7. Orchestration workflow

1. Backend receives authenticated request.
2. Permission service determines accessible records.
3. Data classification policy filters permitted context/providers.
4. Orchestrator selects task and prompt version.
5. Retrieval service fetches only authorised, relevant source records.
6. AI provider receives minimum required context and strict output schema.
7. Output is parsed, validated and checked for source references.
8. Unsupported statements are marked as hypotheses or removed from factual output.
9. Result is stored as draft with provenance and AI metadata.
10. Human review workflow is started where required.
11. Audit and usage metrics are recorded.

## 8. Structured outputs

Require JSON/schema-constrained outputs for extraction and workflow actions. Example process extraction:

```json
{
  "process_name": "string",
  "purpose": "string|null",
  "trigger": "string|null",
  "steps": [
    {
      "sequence": 1,
      "activity": "string",
      "actor": "string|null",
      "system": "string|null",
      "input": "string|null",
      "output": "string|null",
      "decision": "string|null",
      "handoff_to": "string|null",
      "duration": "string|null",
      "source_answer_ids": ["uuid"],
      "is_inference": false,
      "confidence": 0
    }
  ],
  "missing_information": [],
  "assumptions": [],
  "contradictions": []
}
```

Validate IDs against actual authorised source records; a model must not invent UUIDs or source references.

## 9. Prompt governance

- Store prompts/templates by task and version.
- Record the prompt version for each run.
- Restrict who can publish prompt changes.
- Test prompts on a fixed evaluation dataset before deployment.
- Keep output schema versioned with prompt version.
- Compare model upgrades for hallucination, omission, bias and latency regressions.
- Never place provider credentials or internal system secrets in prompts.

## 10. AI safety and quality rules

- Retrieved files and employee text are untrusted input; embedded instructions must not override system rules.
- AI cannot change roles, permissions, approvals or database records directly.
- AI cannot declare an interview answer verified solely because it sounds confident.
- AI cannot decide disputed facts as authoritative truth.
- AI cannot issue final legal conclusions or guarantee legal compliance.
- AI cannot publish documents or close material approval gates.
- AI must identify uncertainty, conflicting evidence and missing information.
- AI outputs must be editable and attributable.
- The platform must allow manual workflows when model service is unavailable.

## 11. Evaluation before relying on AI

Create a synthetic test set with examples of:
- vague answers;
- contradictory department descriptions;
- missing process owner;
- incorrect assumptions;
- prompt injection inside uploaded content;
- outdated SOP versus current practice;
- exception path omitted from initial answer;
- ambiguous TAT or target definition;
- sensitive content that should not go to hosted provider;
- source citation mismatch.

Measure field extraction accuracy, unsupported-claim rate, source-link correctness, question usefulness, contradiction recall, false positive rate, output validity and reviewer edit rate. Human evaluation remains necessary.
