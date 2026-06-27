# Siap

Siap is a privacy-first bureaucracy compiler for Malaysian applications. It
extracts documents in the browser, runs a four-stage Chutes confidential-compute
workflow, and persists only structured conclusions and action state in Convex.

## Local setup

1. Install dependencies with `bun install`.
2. Copy `.env.example` to `.env.local`.
3. Generate the ES256 auth values with `bun run generate:auth-key`.
4. Add the listed Convex variables in the Convex dashboard.
5. Register the Chutes OAuth application with `bun run register:chutes`.
6. Start Convex with `bun run convex:dev`.
7. Start Next.js with `bun run dev`.

See `docs/BACKEND.md` for architecture, privacy invariants, deployment order,
and acceptance gates.

## Verification

```text
bun run lint
bun run typecheck
bun run test
bun run build
bun run test:e2e
bun run convex:codegen
bun run convex:deploy
```

The real, paid Chutes flow is explicitly gated by
`RUN_CHUTES_SMOKE_TEST=true`.
