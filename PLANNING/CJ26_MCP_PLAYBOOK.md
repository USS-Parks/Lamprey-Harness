# Lamprey M6 MCP Resources and Hosted Auth Playbook

**Milestone:** M6 / MR-1–MR-5  
**Purpose:** Owner-observable acceptance for resource browsing and a real hosted MCP OAuth session  
**Automation status:** Structural and local automated gates run in the MR prompts. The two live lanes below remain `USER-VERIFICATION-NEEDED` until their receipts are recorded.  
**Safety:** Use disposable fixture data and a test hosted-provider account. Never paste access tokens into chat, the activity view, screenshots, or this document.

## A. Local fixture-server resource lane

### Prerequisites

1. Start a disposable local MCP fixture that uses stdio or Streamable HTTP and advertises the `resources` capability.
2. Give it at least:
   - two paginated concrete resources;
   - one URI template;
   - one plain-text resource containing literal HTML-like text;
   - one PNG or JPEG resource;
   - one SVG or generic binary resource;
   - list-change and resource-update notifications.
3. Add the connector in **Customize → Connectors**. For Streamable HTTP without auth, use `auth: "none"`.

### Procedure and receipt

| Step | Expected evidence | Result |
| --- | --- | --- |
| Connect | Connector reaches **Connected** without requiring tools capability. | `USER-VERIFICATION-NEEDED` |
| Inventory | **Resources** displays concrete resources and templates with server-local names and URIs. | `USER-VERIFICATION-NEEDED` |
| Pagination | **Load more** appends the second page once without losing the first page. | `USER-VERIFICATION-NEEDED` |
| Text preview | Literal HTML/script-shaped text is displayed as text and never executes. | `USER-VERIFICATION-NEEDED` |
| Raster preview | PNG/JPEG data renders in the contained preview. | `USER-VERIFICATION-NEEDED` |
| Binary preview | SVG and generic blobs show metadata only; neither is executed or embedded. | `USER-VERIFICATION-NEEDED` |
| External open | HTTP(S) resource shows Lamprey's confirmation before opening. Non-HTTP and credential-bearing URLs have no usable open path. | `USER-VERIFICATION-NEEDED` |
| Notification | Changing the fixture inventory refreshes an already-open inventory. Activity records only server id and change kind, not resource content. | `USER-VERIFICATION-NEEDED` |
| Cancellation | Stop the fixture during a list/read request. The UI exits loading and reports an actionable error. | `USER-VERIFICATION-NEEDED` |

Record fixture revision, OS, packaged/development build, and timestamp with the completed receipt. Do not record resource bodies if they contain private data.

## B. Hosted OAuth session lane

### Prerequisites

1. Use a disposable account on a hosted MCP provider that supports Streamable HTTP and OAuth 2.1.
2. Add a connector JSON object with `transport: "streamable-http"`, the provider's exact HTTPS MCP endpoint, and `auth: "oauth"`.
3. Keep the system browser available for the authorization redirect. Lamprey's loopback callback is `127.0.0.1` only.

### Procedure and receipt

| Step | Expected evidence | Result |
| --- | --- | --- |
| Initial state | Connector shows signed-out or authorization-required without exposing a credential. | `USER-VERIFICATION-NEEDED` |
| Reauthorize | **Reauthorize** names the exact authorization hostname before any browser navigation. Cancel once and verify no browser opens and no connector is authorized. | `USER-VERIFICATION-NEEDED` |
| Complete OAuth | Retry, approve in the provider, return through the loopback callback, and observe auth **connected** plus connector **Connected**. | `USER-VERIFICATION-NEEDED` |
| Resource use | Browse and preview one provider resource; verify its server provenance. | `USER-VERIFICATION-NEEDED` |
| Elicitation | If supported, trigger a URL-mode elicitation. Confirm Lamprey asks before opening it; exercise accept and decline/cancel paths. | `USER-VERIFICATION-NEEDED` |
| Expiry/reconnect | Expire or revoke the disposable session, reconnect, and observe expired/authorization-required with an actionable reauthorization path. | `USER-VERIFICATION-NEEDED` |
| Secret boundary | Inspect activity and exported diagnostics. They may contain server id, state, elicitation id/domain, and change kind; they must not contain token values, PKCE verifier, client secret, authorization URL, resource body, or blob. | `USER-VERIFICATION-NEEDED` |

## Acceptance rule

Automated tests and build/renderer smokes prove the wiring and local safety policy. They do not prove a third-party provider's authorization behavior. M6 may close as a local implementation milestone with this hosted-provider lane explicitly open, but no claim of live hosted-auth parity is permitted until the owner records a passing receipt here or in the DEVLOG.

---

Authored and reviewed by Basho Parks, copyright 2026
