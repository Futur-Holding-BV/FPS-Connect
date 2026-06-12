---
name: GPT-5 model params (chat completions)
description: GPT-5 family reasoning models need max_completion_tokens (not max_tokens) and a larger budget because reasoning tokens eat the budget.
---

# GPT-5 chat-completions parameters

When using `gpt-5*` models (e.g. `gpt-5-mini`) via `client.chat.completions.create`:

- Use `max_completion_tokens`, NOT `max_tokens`. The OpenAI API rejects `max_tokens` for gpt-5 reasoning models with a 400.
- The token budget is shared with internal **reasoning tokens**. A tiny budget (e.g. 400–600) can be entirely consumed by reasoning, returning empty content / `finish_reason: "length"`. Measured: a trivial JSON reply used ~192 reasoning tokens. Size budgets generously (a few thousand) for json_object outputs.
- `temperature` only supports the default (1) on gpt-5 reasoning models — do not pass a custom temperature.

**Why:** Switched the firevault AI services (gebouw-ai, document-ai, email-ai) from `gpt-4o-mini` to `gpt-5-mini`. The remaining `gpt-4o` vision calls still use `max_tokens` and are fine.

**How to apply:** Any time a `model:` is bumped to a gpt-5 family model, also rename `max_tokens` → `max_completion_tokens` and raise the value to leave room for reasoning. Verified working through the Replit OpenAI proxy (`AI_INTEGRATIONS_OPENAI_*`).
