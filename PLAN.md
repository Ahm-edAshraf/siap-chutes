  # Siap Complete Backend Plan

  ## Summary

  Build a production-deployable Vercel + Convex backend using:

  - Sign in with Chutes OAuth and user-funded inference.
  - Short-lived Siap JWTs for authenticated Convex access.
  - Four-agent Chutes workflow using verified TEE models.
  - Browser-local PDF/image extraction; raw files never uploaded or retained.
  - Persistent structured reports, citations, profiles, and actions until user deletion.
  - Bun exclusively.

  ## Implementation

  ### 1. Agent handoff and project foundation

  - Preserve existing AGENTS.md rules and add permanent instructions:
      - Use bun/bunx, never npm/npx.
      - Read docs/BACKEND.md before backend changes.
      - Read current bundled Next.js 16 docs and Convex guidelines before coding.
      - Never expose Chutes tokens, prompts, extracted document text, or secrets.
      - No mock data or localStorage for application state.
      - Raw documents must remain browser-local.
      - Require lint, tests, build, real Chutes smoke test, and browser verification.

  - Create docs/BACKEND.md containing this architecture, privacy guarantees, schemas, endpoints, environment setup, and acceptance criteria.
  - Install current compatible versions with Bun: jose, zod, unpdf, tesseract.js, local English/Malay OCR data, vitest, convex-test, and required test runtime packages.
  - Add .env.example containing names and explanations only.

  ### 2. Authentication and authorization

  Implement the official Sign in with Chutes authorization-code flow with PKCE (https://chutes.ai/docs/sign-in-with-chutes/overview):

  - Routes:
      - GET /api/auth/chutes/login
      - GET /api/auth/chutes/callback
      - GET /api/auth/chutes/session
      - POST /api/auth/chutes/logout
      - GET /api/auth/convex-token

  - Request only openid profile chutes:invoke.
  - Keep Chutes access and refresh tokens exclusively in HttpOnly, Secure, SameSite=Lax cookies.
  - Validate OAuth state, PKCE verifier, callback origin, token expiry, and user info.
  - Refresh expiring access tokens and revoke them best-effort on logout.
  - Register the OAuth application using the user’s Chutes API key once; never store that API key in the deployed application.
  - Mint five-minute ES256 Siap JWTs with sub, iss, aud, iat, exp, kid, and role.
      - Browser receives role=user.
      - Analysis routes internally receive role=analysis_service.

  - Configure Convex through its custom JWT provider (https://docs.convex.dev/auth/advanced/custom-jwt), using a data-URI JWKS so local Convex development does not depend on localhost
    being publicly reachable.

  - Wrap the application with ConvexProviderWithAuth.
  - Add Next.js 16 proxy.ts for optimistic /app/* redirects; every Convex function still performs authoritative authorization.
  - Replace mock sidebar identity/reset controls with the authenticated Chutes user, sign-out, report deletion, and “delete all my data”.

  ### 3. Convex data model and interfaces

  Create normalized, indexed tables:

  - users, profiles, applications
  - analysisStages, analysisEvents, modelRuns
  - requirements, requirementEvidence
  - missingDocuments
  - actionItems, actionDependencies
  - inventoryDocuments

  Rules:

  - Ownership always comes from ctx.auth.getUserIdentity().
  - Child tables replace unbounded embedded arrays.
  - All functions have argument and return validators.
  - All ownership/status queries use indexes.
  - Analysis-service mutations require role=analysis_service.
  - Cascade deletion removes every child record.
  - Store only structured results and citation excerpts capped at 240 characters—never complete extracted text, prompts, raw model responses, or Chutes tokens.

  Public Convex operations:

  - users.current, users.sync
  - profiles.get, profiles.upsert, profiles.deleteAllData
  - applications.create, list, get, getProgress, remove, retry
  - actions.setCompleted
  - inventory.list, upsert, remove

  Application states:

  draft → reading_requirements → checking_eligibility → challenging_assumptions → building_plan → complete | failed

  Requirement states:

  confirmed | needs_verification | incomplete | not_met

  Application outcomes:

  analysing | action_required | ready_to_submit | likely_ineligible | failed

  ### 4. Privacy-first document processing

  - Accept one application-pack PDF and up to five optional supporting PDF/JPG/PNG files.
  - Limits: 10 MB each, 50 pages combined, 240,000 extracted characters.
  - Extract text in the browser with page boundaries.
  - Run OCR locally for images and text-sparse pages using self-hosted English/Malay Tesseract worker, WASM, and language assets.
  - Keep files and extracted text only in an in-memory provider shared between /app/new and /app/analysing.
  - Never place document text in localStorage, sessionStorage, IndexedDB, Convex, analytics, or logs.
  - After completion/cancellation, release files, OCR workers, canvases, and extracted text.
  - If the page reloads mid-analysis, require the user to reselect the source files.
  - Replace the fake PIDM file with a valid, clearly fictional Siap Demo Scholarship Pack 2026.pdf. Running the sample must execute the real backend.

  ### 5. Chutes bureaucracy-compiler pipeline

  Expose an authenticated, origin-checked route:

  POST /api/analyses/[id]/ensemble

  Agents are idempotent and run concurrently. Each independently analyses the
  same browser-supplied evidence package; validated outputs are reconciled and
  persisted in dependency order:

  1. Requirement compiler
      - Extract programme metadata, deadline, requirements, mandatory documents, citations, and machine-readable conditions.

  2. Eligibility evidence mapper
      - Match profile/supporting evidence against each rule.

  3. Independent red-team reviewer
      - Use a second TEE model to challenge unsupported assumptions, citation errors, and false confirmations.

  4. Action planner
      - Produce missing documents, owners, urgency, dependency-aware actions, and contextual email drafts.

  Model defaults:

  - Requirement compiler: google/gemma-4-31B-turbo-TEE
  - Eligibility mapper: Qwen/Qwen3.6-27B-TEE
  - Reviewer: deepseek-ai/DeepSeek-V3.2-TEE
  - Action planner: MiniMaxAI/MiniMax-M2.5-TEE

  Before inference, query the live model catalogue and require confidential_compute: true. Fail closed if no approved TEE model is available. Persist the actual model, TEE status,
  duration, token usage, prompt version, and outcome—but no content. This follows Chutes’ documented confidential-compute privacy model (https://chutes.ai/privacy).

  Reliability and grounding:

  - Treat uploaded text as untrusted evidence, never instructions.
  - Validate every model response with Zod.
  - Allow one schema-repair request before failing the stage.
  - Retry network/429/5xx failures twice with bounded exponential backoff.
  - Refresh once on Chutes 401.
  - Verify every quoted citation against normalized cited-page text.
  - Unsupported citations force needs_verification; they can never produce confirmed.
  - Deterministic tools evaluate age-at-date, numeric thresholds, citizenship, study level, document presence, deadline state, and action dependency cycles.
  - A definite mandatory-rule violation produces not_met, not merely “missing”.
  - Calculate scores server-side:
      - 80% weighted evidence readiness.
      - 20% completed action readiness.
      - LLMs never assign the displayed score.

  ### 6. Frontend integration and privacy disclosure

  - Replace all mockData imports and simulated delays with Convex queries/mutations and real stage execution.
  - Subscribe /app/analysing to realtime stages/events.
  - Redirect using the created Convex application ID.
  - Make reports, dashboard, inventory, action completion, exports, retries, and deletions persistent.
  - Generate report export from current server data.
  - Preserve existing English/Bahasa Malaysia UI.
  - Update the privacy page to state precisely:
      - Raw files remain on the device.
      - OCR/extraction happens locally.
      - Extracted text passes transiently through Siap’s server to Chutes TEE inference over HTTPS.
      - This implementation is confidential-compute protected but does not claim browser-to-enclave E2E encryption.
      - Convex stores profile data, structured conclusions, short citations, action state, and model-run metadata until deletion.
      - No prompts or file contents are retained or logged.
      - Chutes inference is billed to the signed-in user.

  ## Environment and deployment

  Vercel variables:

  - NEXT_PUBLIC_APP_URL
  - CHUTES_OAUTH_CLIENT_SECRET
  - CHUTES_OAUTH_SCOPES
  - CHUTES_IDP_BASE_URL
  - AUTH_JWT_PRIVATE_JWK
  - AUTH_JWT_ISSUER
  - AUTH_JWT_AUDIENCE
  - AUTH_JWT_KID
  - CHUTES_PRIMARY_MODEL
  - CHUTES_REVIEW_MODEL

  Convex variables:

  - AUTH_JWT_ISSUER
  - AUTH_JWT_AUDIENCE
  - AUTH_JWKS_DATA_URI

  Register localhost and production OAuth callback URLs. Deploy Convex first, then Vercel, then verify callback/session/JWT/inference behavior on the production domain.

  ## Test and acceptance plan

  - Unit tests: scoring, condition evaluation, age calculations, citation matching, JSON repair, deadline handling, DAG validation, size limits, and prompt-injection isolation.
  - Convex tests: authentication, cross-user isolation, service-role enforcement, indexes, state transitions, idempotency, action updates, and cascade deletion.
  - Route tests: OAuth state/PKCE, refresh, logout, JWT claims, invalid origin, Chutes 401/429/5xx/timeouts, malformed model output, and TEE fail-closed behavior.
  - Browser tests: real PDF extraction, local OCR, new analysis, live progress, completed report, retry, action completion, export, logout, and deletion.
  - Gated real-Chutes smoke test verifies OAuth invocation, selected model’s live TEE flag, valid structured output, and persisted model metadata.
  - Final commands: bun run lint, bun run test, bun run build, Convex type generation/deployment, and production browser smoke test.
  - Acceptance requires zero mock analysis paths, zero console errors, no secrets/raw text in browser storage or Convex, and a complete real demo from sign-in through report deletion.

  ## Assumptions

  - Vercel and Convex Cloud are the production targets.
  - Sign in with Chutes is mandatory; there is no team API-key inference fallback.
  - Optional supporting documents are supported through browser-local extraction/OCR.
  - Structured reports persist until explicit user deletion.
  - English and Bahasa Malaysia documents are the supported hackathon languages.
