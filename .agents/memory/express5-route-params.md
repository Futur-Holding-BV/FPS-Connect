---
name: Express 5 route param widening with extra middleware
description: Why parseInt(req.params.id) breaks (TS2345 string | string[]) once you add a middleware before the handler, and the fix.
---

# Express 5 `:id` param widening when a middleware precedes the handler

In this repo (Express 5 + @types/express 5), a route like
`router.patch("/x/:id", async (req,res) => ...)` infers `req.params.id` as `string`.
But the moment you insert another handler before the inline one —
`router.patch("/x/:id", guard, async (req,res) => ...)` — TS overload resolution
widens the param type and `req.params.id` becomes `string | string[]`, so
`parseInt(req.params.id)` fails with TS2345 ("string | string[] not assignable to string").

**Fix:** access params defensively: `parseInt(String(req.params.id), 10)`.
Typing the guard's return as `RequestHandler` does NOT fix it on its own.

**Why:** the param widening is an artifact of Express 5's typed-router overloads when
multiple handlers are spread; it is not a real runtime problem (id is always a string).

**How to apply:** any route that has a guard/middleware before the handler AND reads a
path param — wrap the access in `String(...)` rather than fighting the overloads.
