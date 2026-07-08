---
name: runTest infra-failure diagnosis
description: How to tell whether a broken runTest (Playwright agent) is a tool-infra problem this session vs. an app bug, and what to do instead.
---

## Symptom

`runTest` fails every attempt with "Maximum testing iterations (10) reached", even for a single trivial step (e.g. "navigate to /login"), with zero server-side evidence (no matching request in workflow logs) that the browser ever reached the app.

## How to confirm it's tool-infra, not the app

Register (or re-register) the `e2e-*` validation commands via `setValidationCommand` — they run their own Playwright session directly (not through the `runTest` subagent harness). If those launch real Chromium and execute real assertions (even if some fail on unrelated pre-existing issues), Playwright itself is healthy in the environment; the failure is isolated to the `runTest` tool/agent harness this session, not a systemic or app-level blocker.

## What to do when this happens

Don't keep retrying `runTest` — it will not self-recover mid-session. Fall back to API-level verification: log in via curl with a cookie jar (reuse the same session-auth the UI uses, e.g. TOTP via `otplib` for a one-off login), then drive the same business-logic flow directly against the routes. This substantively verifies backend correctness and route wiring, but does not exercise frontend rendering/JS — call that out explicitly when reporting results, and suggest a fresh-session retry of `runTest` if a true browser-driven pass is still required.

**Why:** burning many `runTest` iterations against a broken harness wastes the 10-iteration budget without producing signal; a quick Playwright-health check (via the `e2e-*` validations) distinguishes "tool is down" from "app is broken" in one step.
