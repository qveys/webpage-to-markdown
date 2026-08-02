# Security Policy

`webpage-to-markdown` is a Chrome Manifest V3 extension that reads page content and
writes Markdown files to disk. It runs with `<all_urls>` host access, so security
reports are taken seriously — thank you for taking the time to send one.

---

## 🛡️ Supported Versions

Only the latest published release is supported. Fixes land on `main` and ship in the
next release; there are no backports to earlier tags.

| Version               | Supported |
| --------------------- | :-------: |
| Latest release (`main`) |    ✅     |
| Any earlier tag       |    ❌     |

Before reporting, update to the latest version and confirm the issue still reproduces.

---

## 📮 Reporting a Vulnerability

**Do not open a public issue for a security problem.**

Preferred channel — [GitHub private vulnerability reporting](https://github.com/qveys/webpage-to-markdown/security/advisories/new).
It keeps the report private until an advisory is published.

Fallback — email **contact@quentinveys.be** with `[SECURITY] webpage-to-markdown` in
the subject.

### What to include

- Affected version (`manifest.json` → `version`) and Chrome version
- A description of the impact — what an attacker gains, not just what misbehaves
- Reproduction steps, ideally with a minimal hostile page (HTML snippet is enough)
- Any logs, stack traces, or screenshots
- Whether you intend to disclose publicly, and on what timeline

### What to expect

You will get a first substantive reply within **15 days** of your report. That reply
states whether the issue is confirmed, its assessed severity, and the expected timeline
for a fix.

This is a solo-maintained hobby project, not a funded product: the target above is
best-effort, and there is no bug bounty. If a deadline slips you will be told why.

---

## 🤝 Disclosure Policy

Coordinated disclosure. Please give up to **30 days** from acknowledgement before
disclosing publicly, so a fix can ship and users can update. A GitHub Security
Advisory is published alongside the fix, and reporters are credited by name or handle
unless they ask otherwise.

### Safe harbor

Research conducted in good faith under this policy — on your own browser profile and
your own test pages — will not be pursued. Do not test against other people's data,
do not run denial-of-service or automated scanning against third-party sites through
the crawler, and do not access or exfiltrate data that is not yours.

---

## 🎯 Scope

### In scope

- Code execution or privilege escalation from hostile page content reaching the
  service worker, side panel, popup, options page, or offscreen document
- Markdown or filename injection leading to path traversal or overwriting files
  outside the chosen download directory
- Leaking captured content, settings, or browsing history off the machine
- Bypasses of the extension pages' Content Security Policy
- Crawler behaviour that ignores its own URL-scheme, same-scope, or asset filters in a
  way that leaks credentials or reaches unintended hosts
- Insecure handling of `chrome.storage.local` data (settings, session state, crawl queue)

### Out of scope

- Vulnerabilities in Chrome itself — report those to the
  [Chrome VRP](https://bughunters.google.com/about/rules/chrome-friends)
- Findings that require an already-compromised browser profile, a malicious extension
  installed alongside this one, or physical device access
- Vulnerabilities in vendored third-party libraries — report upstream first
  ([Readability](https://github.com/mozilla/readability),
  [Turndown](https://github.com/mixmark-io/turndown),
  [turndown-plugin-gfm](https://github.com/mixmark-io/turndown-plugin-gfm)); see
  [`NOTICE`](NOTICE). Tell us too if the extension amplifies the impact.
- Dev-only npm dependencies (the `jest` chain) — they never reach shipped code
- The breadth of the requested permissions, absent a concrete exploit. The rationale
  for each one is documented in the [README](README.md#-permissions).
- Missing hardening with no demonstrated impact (e.g. "no Subresource Integrity"),
  reports produced solely by an automated scanner, and social-engineering scenarios

---

## 🔒 Security Model

Useful context when assessing a finding:

- **No backend, no telemetry.** The extension has no server. Captured content, settings,
  and history stay in `chrome.storage.local` and in the files you download.
- **One outbound request path.** Only the crawler performs network requests
  (`js/crawl-engine.js`), exclusively to the pages you asked it to crawl, with
  `credentials: "omit"` so cookies and auth headers are never attached.
- **Zero production dependencies.** Nothing is fetched from npm at runtime; the three
  third-party libraries are vendored, pinned, and modified only by upstream updates.
- **Strict CSP.** Extension pages run under `script-src 'self'; object-src 'self'` —
  no inline scripts, no remote code, no `eval`.
- **Untrusted page HTML is parsed off the main context** in the offscreen document
  (`js/offscreen.js`), which has no privileged extension APIs beyond messaging.
- **Supply chain.** GitHub Actions are pinned to commit SHAs, Dependabot watches the
  dev dependencies, and `npm audit --omit=dev --audit-level=high` gates every PR.
- **Static analysis.** CodeQL code scanning (default setup) runs on every pull request
  and on a weekly schedule.

---

## 🙏 Acknowledgements

Researchers who report valid issues are credited in the published advisory and in the
release notes for the fix.
