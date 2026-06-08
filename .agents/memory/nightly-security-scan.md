---
name: Nightly security scan (report-only)
description: Why FPS Brandpreventie has a report-only nightly security scan instead of auto-applying updates, and how it is wired.
---

# Nightly security scan

`@workspace/scripts` exposes a `security-scan` script (`pnpm --filter @workspace/scripts run security-scan`) that runs `pnpm audit` + outdated-package listing and prints a Dutch report. It changes nothing.

## Decision: report-only, never auto-update
**Why:** unattended dependency upgrades regularly introduce breaking changes — this project already had `otplib` v13 break the esbuild bundle. Auto-applying updates nightly with nobody watching risks taking the live app down. The user explicitly chose the report-only option over auto-install.
**How to apply:** keep the scan read-only. Updates are reviewed and applied deliberately + tested. If asked to "auto-update", re-surface the breakage risk before doing it.

## Scheduling
Runs as a Replit **Scheduled Deployment** (coexists with the autoscale web deployment). The cron/timezone/timeout + build/run commands are set by the user in the Publishing tool → "Scheduled" (the agent cannot set the schedule programmatically). Run command: `pnpm --filter @workspace/scripts run security-scan`. Findings appear in the deployment logs.
