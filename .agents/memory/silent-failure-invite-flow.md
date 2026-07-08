---
name: Silent-return failure in invite/notification flows
description: Why a mail-send helper returning false (instead of throwing) let a user be marked "uitgenodigd" with no email ever sent.
---

A helper (`stuurUitnodigingsmail`) returned `Promise<boolean>` and silently
returned `false` when the mail service wasn't configured. Its callers wrapped
the call in `try/catch` (to handle thrown errors) but never checked the
boolean return value, so a `false` result fell through exactly like success:
the DB was updated to `uitnodigingStatus: "uitgenodigd"` and the route
responded 200 OK, even though no email was ever sent. The user was left
"half created" with no way to log in and no visible error anywhere.

**Why:** any async operation whose failure is reported via return value
(instead of throwing) is invisible to a caller that only has a `try/catch`.
This is easy to introduce when a function is written to "fail soft" for one
caller and then reused by a caller that assumes exceptions are the only
failure signal.

**How to apply:** for any critical/one-shot side effect (sending an
invite/notification email, charging a payment, writing an audit record) that
gates a subsequent state transition, make failure exceptions, not boolean/null
returns — or explicitly check the return value at every call site. When
reviewing a "user got no notification" or "record marked done but action
didn't happen" bug, grep for `Promise<boolean>` / `Promise<T | null>` style
signatures on the suspect side-effect function first.
