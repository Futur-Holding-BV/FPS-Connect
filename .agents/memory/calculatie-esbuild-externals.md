---
name: Calculatie esbuild externals & pnpm-link
description: @workspace/calculatie must be in api-server build.mjs externals and pnpm-installed in firevault & api-server before typecheck passes.
---

# @workspace/calculatie — esbuild externals & pnpm link

## Rule
`@workspace/calculatie` is a workspace package used by both the api-server and firevault.
- **build.mjs externals**: add `"@workspace/calculatie"` to the `external` array in `artifacts/api-server/build.mjs` so esbuild does not try to bundle it.
- **pnpm link**: run `pnpm install --filter @workspace/api-server` and `pnpm install --filter @workspace/firevault` after adding the dependency so the symlinks appear in their respective node_modules.

**Why:** esbuild cannot bundle workspace packages — it needs them as externals. Without the symlink, tsc cannot resolve the types either, blocking both the typecheck pre-push hook and the code reviewer.

**How to apply:** whenever `@workspace/calculatie` (or another new workspace lib) shows "Cannot find module" errors in firevault/api-server tsc or esbuild, run pnpm install for both packages and add the lib to build.mjs externals.
