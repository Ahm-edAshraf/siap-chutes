<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`bunx convex ai-files install`.

<!-- convex-ai-end -->

## Siap engineering rules

- Use Bun (`bun` and `bunx`) exclusively. Do not use npm, npx, pnpm, or yarn.
- Read `docs/BACKEND.md` before changing authentication, Convex, document
  processing, or analysis code.
- Read the relevant bundled Next.js 16 guide and
  `convex/_generated/ai/guidelines.md` before changing those systems.
- Never expose or log Chutes tokens, OAuth secrets, prompts, model responses,
  or extracted document text.
- Raw documents and extracted text remain browser-memory-only. Never persist
  them in browser storage, Convex, logs, or analytics.
- Application state belongs in Convex. Do not introduce mock analysis paths or
  localStorage/sessionStorage application persistence.
- Backend changes must finish with lint, tests, build, Convex type generation,
  a gated real-Chutes smoke test, and browser verification where credentials
  permit them.
