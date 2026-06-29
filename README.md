# Siap

**A privacy-first application copilot powered by four parallel Chutes TEE
agents.**

Siap turns complex application packs into evidence-linked eligibility checks,
missing-document requests, and an ordered action plan. PDF extraction and OCR
happen in the browser. Extracted text is sent transiently to confidential
compute models and is never persisted by Siap.

Built for Chutes Hack Malaysia 2026.

## Why Siap

Applications for scholarships, grants, and institutional programmes often
combine long rulebooks, scattered evidence, and strict deadlines. Applicants
must determine what applies to them, prove every claim, and sequence the
remaining work correctly.

Siap compiles that process into an auditable workspace:

- requirement-by-requirement eligibility checks;
- exact source citations and confidence labels;
- conservative independent review;
- missing-document ownership and target dates;
- dependency-aware actions and editable completion state;
- persistent reports without persistent raw documents.

## Chutes integration

One analysis starts four independent, bounded structured-output TEE agents:

| Agent | Default model | Responsibility |
| --- | --- | --- |
| Requirement compiler | `zai-org/GLM-5.1-TEE` | Extract rules, deadlines, and citations |
| Eligibility mapper | `moonshotai/Kimi-K2.6-TEE` | Extract typed, cited applicant evidence |
| Independent reviewer | `google/gemma-4-31B-turbo-TEE` | Challenge unsupported or optimistic conclusions |
| Action planner | `Qwen/Qwen3-32B-TEE` | Challenge the deterministic completion plan |

The live Chutes catalogue is authoritative. Siap fails closed unless every
selected model advertises confidential compute and structured-output support.
Validated responses are reconciled deterministically. Typed numeric and
categorical facts are evaluated in code; semantic facts require grounded,
subject-matched supporting evidence. The independent reviewer is advisory, so
its availability cannot change the canonical report. Programme rules can never
serve as applicant evidence.

```text
Browser PDF/OCR
      |
      | transient extracted text
      v
Next.js bounded stage routes
      |
      +---- Requirement compiler ----+---- normalized candidates
      +---- Eligibility mapper ------+             |
      +---- Independent reviewer ----+             v
      +---- Action planner ----------+---- deterministic finalizer
                                                     |
                                                     v
                                                 Convex report
```

Each stage has an independent generation/attempt fence and shares a 90-second
browser deadline. Compiler and mapper start first; reviewer and planner join
after a 20-second head start. Non-thinking generation and stage-specific token
caps bound latency. If a required primary is still running after its measured
threshold, one distinct fallback hedges it; the first valid result wins and the
loser is cancelled.
Compiler and mapper results are required. If the reviewer misses the budget,
semantic claims remain marked for verification; if the planner misses it, Siap
uses its deterministic action-plan builder. A failed required stage can be
retried without rerunning successful agents. Recent content-free model-run
metadata ranks fallbacks by failure rate and p95 latency without silently
changing a role's assigned primary.

## Privacy model

- Raw files and OCR canvases remain in browser memory.
- Extracted text, prompts, and raw model responses are not stored in Convex.
- Chutes tokens use secure, HttpOnly, SameSite cookies.
- Convex stores only normalized conclusions, short citation excerpts, action
  state, profile data, and content-free model metadata.
- Every user-owned row is access-controlled using the authenticated Convex
  identity.
- Deleting an account cascades through its stored application data.

See [docs/BACKEND.md](docs/BACKEND.md) for the complete architecture, threat
boundaries, deployment order, and acceptance gates.

## Technology

- Next.js 16 and React 19
- Convex
- Chutes OAuth and confidential-compute inference
- Tesseract.js and `unpdf` for browser-side extraction
- Zod structured-output validation
- Vitest and Playwright

## Run locally

Prerequisites: Bun, a Convex project, and a Chutes account.

```powershell
bun install
Copy-Item .env.example .env.local
bun run generate:auth-key
```

Add the generated values to `.env.local` and the matching public JWKS values to
the Convex deployment. Register the OAuth application:

```powershell
bun run register:chutes
```

Then run Convex and Next.js in separate terminals:

```powershell
bun run convex:dev
```

```powershell
bun run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with Chutes,
choose **New analysis**, and select **Use fictional Siap demo pack**.

## Environment variables

Copy `.env.example` for the full documented list. The main groups are:

- public application and Convex deployment URLs;
- Chutes OAuth client credentials;
- the ES256 private JWK used by Next.js;
- the matching issuer, audience, and public JWKS configured in Convex;
- optional overrides for the four TEE models.

Never commit `.env.local`, OAuth secrets, access tokens, or Playwright storage
state.

## Verification

```powershell
bun run lint
bun run typecheck
bun run test
bun run build
bun run convex:codegen
bun run test:e2e
```

The paid authenticated browser test is intentionally gated:

```powershell
$env:RUN_CHUTES_SMOKE_TEST = "true"
$env:E2E_AUTH_STATE = "playwright/.auth/chutes.json"
bun run test:e2e
```

It verifies four live TEE agent runs across multiple models, persisted output,
export, actions, deletion, logout, and completion within 100 seconds.

## Deploy

1. Deploy or update the Convex functions.
2. Configure the matching JWT issuer, audience, and public JWKS in Convex.
3. Configure the variables from `.env.example` in Vercel.
4. Register
   `https://your-domain/api/auth/chutes/callback` with the Chutes OAuth app.
5. Deploy Vercel and run the authenticated flow against the production origin.

## License

Licensed under the [MIT License](LICENSE).
