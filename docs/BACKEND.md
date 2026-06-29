# Siap backend

## Architecture

Siap is a Next.js 16 application deployed to Vercel with Convex as its
persistent backend. Chutes OAuth authenticates each user and supplies the
user-funded access token used for inference. Next.js mints five-minute ES256
JWTs for Convex. Browser tokens carry `role=user`; the authenticated stage
route mints an internal token for the same subject with
`role=analysis_service`.

The browser extracts PDF text and performs OCR. A stage request sends extracted
text transiently over HTTPS to the Next.js route, which calls an approved
Chutes confidential-compute model. Neither Next.js nor Convex retains raw
files, complete extracted text, prompts, or raw model responses.

## Privacy invariants

- Raw PDF/image files, canvases, OCR workers, and extracted text exist only in
  browser memory and are released after completion, cancellation, or sign-out.
- No raw file or extracted text may enter localStorage, sessionStorage,
  IndexedDB, Convex, analytics, or logs.
- Chutes access/refresh tokens exist only in Secure, HttpOnly, SameSite=Lax
  cookies. Browser JavaScript never receives them.
- Convex stores profile fields, normalized conclusions, citation excerpts
  capped at 240 characters, action state, and content-free model-run metadata.
- Model selection fails closed unless the live catalogue reports
  `confidential_compute: true`.
- Uploaded content is delimited and treated as untrusted evidence, never as
  instructions.

## Data model

The normalized Convex schema contains:

- `users`, `profiles`, `applications`
- `analysisStages`, `analysisEvents`, `modelRuns`
- `mapperCandidates`, `reviewerCandidates`, `plannerCandidates`
- `requirements`, `requirementEvidence`, `missingDocuments`
- `actionItems`, `actionDependencies`, `inventoryDocuments`

Every owned row contains `userId`, every ownership/status query uses an index,
and every public function derives ownership from
`ctx.auth.getUserIdentity()`. Analysis result mutations require
`role=analysis_service`. Application and account deletion cascade through all
child tables.

Application states:

`draft -> reading_requirements -> checking_eligibility ->
challenging_assumptions -> building_plan -> complete | failed`

Requirement states:

`confirmed | needs_verification | incomplete | not_met`

Outcomes:

`analysing | action_required | ready_to_submit | likely_ineligible | failed`

## HTTP endpoints

- `GET /api/auth/chutes/login`
- `GET /api/auth/chutes/callback`
- `GET /api/auth/chutes/session`
- `POST /api/auth/chutes/logout`
- `GET /api/auth/convex-token`
- `POST /api/analyses/[id]/ensemble`
- `POST /api/analyses/[id]/stages/[stage]`

The browser starts four authenticated, origin-checked stage requests
while retaining extracted documents in memory. Compiler and mapper start first;
reviewer and planner join after a 20-second head start. Every route shares the
browser's 90-second deadline and has an 88-second server ceiling. Generation
uses non-thinking mode and role-specific output caps. A slow required stage
starts at most one distinct measured fallback after 35 seconds for the mapper
or 45 seconds for the compiler; the first valid result wins and the loser is
cancelled. Malformed structured output receives one bounded repair attempt.
The final request to `ensemble` contains document names only and
deterministically reconciles the persisted normalized candidates.

Compiler and mapper are required stages. Reviewer timeout leaves semantic facts
at their deterministically reconciled mapper state; planner timeout uses the
deterministic plan builder. Reviewer conclusions remain an advisory audit and
cannot make the canonical report depend on optional-stage availability.
Successful stages are never discarded because an optional stage failed.
Generation, stage-attempt, model-attempt, and applied-output fencing makes
requests idempotent and prevents late writes into a restarted or finalized
analysis. Failed required stages can be retried independently.

Content-free model-run metadata records success, failure code, fallback use,
duration, and token counts. Model fallbacks are ranked from recent failure rate
and p95 duration. The browser exposes each stage as queued, running, ready,
complete, or independently retryable. The complete analysis flow is bounded to
100 seconds, including deterministic finalization.

Default TEE models:

- Requirement compiler: `zai-org/GLM-5.1-TEE`
- Eligibility mapper: `moonshotai/Kimi-K2.6-TEE`
- Independent reviewer: `google/gemma-4-31B-turbo-TEE`
- Action planner: `Qwen/Qwen3-32B-TEE`
- Each role has its own measured fallback order. Recent reliability and p95
  latency rank fallbacks, while the configured role model remains the stable
  primary so one congested test window cannot silently reshuffle every role.

The live model catalogue is authoritative. A configured model is used only
when its current `confidential_compute` value is `true` and it advertises
`structured_outputs`; otherwise selection falls through the allowlist or
fails closed. Stage requests use strict JSON Schema response formatting.

## Document limits

- One application-pack PDF
- Up to five supporting PDF, JPG, or PNG files
- 10 MB per file
- 50 pages combined
- 240,000 extracted characters combined

English and Bahasa Malaysia OCR assets are self-hosted under
`public/tesseract`.

## Environment setup

Copy `.env.example` to `.env.local`. Run `bun run register:chutes` once with a
Chutes API key supplied through the masked interactive prompt; the key is sent
directly to Chutes and is never written to disk. Register both localhost and
production callback URLs.

Generate an ES256 key pair and store the private JWK only in Vercel as
`AUTH_JWT_PRIVATE_JWK`. Configure Convex with the matching issuer, audience, and
a data-URI JWKS containing only the public key:

- Vercel: `NEXT_PUBLIC_APP_URL`, `CHUTES_OAUTH_CLIENT_ID`,
  `CHUTES_OAUTH_CLIENT_SECRET`, `CHUTES_OAUTH_SCOPES`,
  `CHUTES_IDP_BASE_URL`, `AUTH_JWT_PRIVATE_JWK`, `AUTH_JWT_ISSUER`,
  `AUTH_JWT_AUDIENCE`, `AUTH_JWT_KID`, `CHUTES_PRIMARY_MODEL`,
  `CHUTES_REVIEW_MODEL`, and the generated Convex public variables.
- Convex: `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`, `AUTH_JWKS_DATA_URI`.

Deploy Convex before Vercel.

## Authoritative references

- [Sign in with Chutes](https://chutes.ai/docs/sign-in-with-chutes/overview)
- [Chutes Identity Provider API](https://chutes.ai/docs/api-reference/identity-provider)
- [Chutes confidential-compute privacy model](https://chutes.ai/privacy)
- [Convex custom JWT providers](https://docs.convex.dev/auth/advanced/custom-jwt)

## Acceptance gates

1. `bun run lint`
2. `bun run typecheck`
3. `bun run test`
4. `bun run build`
5. `bun run convex:codegen`
6. `bun run convex:deploy`
7. `RUN_CHUTES_SMOKE_TEST=true bun run smoke:chutes`
8. Production browser flow: sign-in, local extraction/OCR, four live stages,
   report, retry, action completion, export, logout, report deletion, and
   delete-all-data.

The gated authenticated Playwright flow is intentionally destructive: it
deletes its report, inventory fixture, profile, and account row, then revokes
the captured Chutes session. Capture a fresh `E2E_AUTH_STATE` before each run.
For local testing, create the ignored directory and capture the state through
an interactive login:

```powershell
New-Item -ItemType Directory -Force playwright/.auth
bunx playwright codegen --save-storage=playwright/.auth/chutes.json http://localhost:3000/app
$env:E2E_AUTH_STATE="playwright/.auth/chutes.json"
$env:RUN_CHUTES_SMOKE_TEST="true"
bun run smoke:chutes
bun run test:e2e
```

For the deployed smoke test, additionally set
`E2E_BASE_URL=https://your-production-origin` so Playwright targets the
deployment and does not start a local development server.

Acceptance also requires no mock analysis path, no console error, no
secret/raw text in browser storage or Convex, and a real end-to-end demo.
