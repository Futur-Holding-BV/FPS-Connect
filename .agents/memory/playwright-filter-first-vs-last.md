---
name: Playwright div-filter locator ordering (.first() vs .last())
description: When scoping a card/container via page.locator("div").filter(...), .first() finds the outer wrapper (all descendants), .last() finds the innermost matching div (may miss sibling content).
---

When multiple nested `div`s all satisfy the same `.filter({ hasText, has })` chain (e.g. a card with a name column, an actions button, and a badge row, where several ancestor divs all wrap all three), Playwright orders matches in DOM/document order: an ancestor's opening tag precedes its descendant's, so `.first()` resolves to the **outermost** matching div and `.last()` to the **innermost**.

**Why:** A test that does `.last()` to "get the specific card, not some outer wrapper" often accidentally picks a deeply-nested div that happens to contain the clickable element (e.g. an Acties/actions button) but does NOT contain a sibling element rendered elsewhere in the same card (e.g. a status badge in a different flex row). The interactive step (click a button) then passes, but a later assertion scoped to that same locator (e.g. checking a badge appeared) fails — even though the badge is genuinely present in the page, just outside the chosen div's subtree. The accessibility snapshot (`error-context.md`) will show the expected text present on the page, which is the tell that this is a locator-scoping bug, not a product bug.

**How to apply:** When scoping to a card/row via chained `div` filters, prefer `.first()` (broadest ancestor still satisfying the filters — typically the Card root or an even higher container) so that all sibling content within the card is included in the locator's subtree. Only reach for `.last()` if you specifically need the deepest/most specific match and have verified the content you'll assert on lives inside it. Where feasible, a `data-testid` on the card root is more robust than either.
