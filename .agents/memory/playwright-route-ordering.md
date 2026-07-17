---
name: Playwright route ordering (last-wins)
description: page.route() last-registered handler wins when multiple patterns match — this is the OPPOSITE of what you might expect.
---

# Playwright route ordering: last-wins

## Rule
In Playwright, when multiple `page.route()` handlers are registered and more than one matches an incoming request URL, **the LAST registered handler wins** — not the first.

**Why:** This is Playwright's documented behavior: "If there are multiple routes registered that match the URL, the last registered route takes effect."

## How to apply
When you need to mock specific API calls alongside a broad catch-all:
- **WRONG:** register specific route first, catch-all second (catch-all overrides specific)
- **CORRECT:** register catch-all FIRST, specific routes LAST (specific overrides catch-all)
- **BEST:** use a single catch-all with explicit `if (url.includes("..."))` branches for special cases — no ordering ambiguity at all.

```typescript
// BEST: één catch-all, auth/me als eerste tak
await page.route(/\/api\/.*/, async (route) => {
  const url = route.request().url();
  if (url.includes("/auth/me")) {
    await route.fulfill({ status: 200, body: JSON.stringify(meData) });
    return;
  }
  // ... overige handlers ...
  await route.fulfill({ status: 200, body: "{}" });
});
```

## Context
Symptom that led to this discovery: React app showed "Geen toegang" (empty-role fallback) even though auth/me mock was "registered". The catch-all (registered after the specific auth/me route) was intercepting auth/me requests and returning `{}`. React Query parsed `{}` as the user → `gebruiker.rol = undefined` → `rolStr = ""` → `<GeenToegang />`.
