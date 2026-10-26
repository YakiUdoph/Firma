# Privacy

**Effective date:** October 26, 2026

This notice describes the behavior of FIRMA at repository commit `7fadf8d1c6bc660a72bcc4ba9f134ed19b33abcd` plus the Phase 8A–8B privacy changes. It does not make claims about uninspected hosting or RPC-provider policies.

## Project identity and privacy contact

This notice is provided for FIRMA, the public project identity. FIRMA is a project name; this notice does not describe it as an incorporated company or registered legal entity.

Privacy questions may be sent to [justremotegigs@gmail.com](mailto:justremotegigs@gmail.com).

## Information users provide

### New asset verification

The browser sends a Portaldot native asset ID and a public 20-byte EVM account address to `POST /api/verify`. These are public-chain identifiers, but an address can still be associated with a person or activity.

### Independent report checking

When a user selects a JSON report and chooses **Check evidence**, the browser reads the file and sends the complete report text to `POST /api/check-report`. If supplied, the optional expected report commitment is sent with it.

Reports contain public account addresses, asset IDs, endpoint identifiers, timestamps, block numbers and hashes, runtime information, storage keys, RPC request/response evidence, and verdicts. Selecting a file does not upload it by itself; submitting the report form does.

## How FIRMA processes the information

The APIs validate the supplied data and use the server-configured Portaldot V3 endpoints. Public request bodies cannot select alternate RPC endpoints.

- The Substrate provider may see requested blocks, asset and account-related storage queries, runtime queries, connection timing, and the server's network address.
- The EVM provider may see block requests and `eth_call` parameters containing asset precompile and public account data, along with timing and the server's network address.
- The hosting provider may process ordinary HTTP information such as IP address, proxy headers, user agent, request path, request timing, response status, and function logs.

FIRMA does not use this information to connect a wallet, sign a message, or submit a transaction.

## Rate limiting and operational diagnostics

The APIs derive a bounded client key from `X-Forwarded-For` or `X-Real-IP`, when provided by the hosting platform. The key and recent request timestamps are held in warm-instance memory for rate limiting. Stale entries are removed during limiter pruning; the lifetime of the serverless instance is controlled by the host.

New-verification diagnostics contain a random request ID, bounded stage names, stage and total durations, stage outcomes, bounded failure categories, and aggregate `PASS`, `FAIL`, and `UNKNOWN` counts.

Unexpected report-check failures log a request ID and bounded error category. The implementation does not intentionally log uploaded report text or raw provider-supplied error messages.

## Application storage in the browser

The reviewed application does not use application cookies, analytics, advertising trackers, `localStorage`, or `sessionStorage`.

The browser keeps the latest result in page memory. It writes evidence to disk only when the user selects **Export evidence**, and it writes report JSON to the clipboard only when the user selects **Copy JSON**. Browser, device, extension, and operating-system behavior remains outside FIRMA's control.

## Database and retention

FIRMA has no application database and the functions do not intentionally persist verification requests or uploaded reports in application storage.

This does not mean there is zero logging. Hosting infrastructure and RPC providers may retain access, security, network, or operational logs. Their exact retention periods, processing locations, internal access rules, and deletion procedures have not been verified and remain unknown.

## Information users must not submit

Never enter or upload a private key, seed phrase, wallet backup, password, authentication token, RPC credential, unnecessary personal information, or a report that has been manually supplemented with secrets. FIRMA needs only public blockchain identifiers and evidence.

## Third-party policy limits

No incorporated legal entity, jurisdiction, retention guarantee, deletion guarantee, GDPR compliance, CCPA compliance, guaranteed anonymity, or zero-retention claim is stated or implied. If additional legal disclosures are required for a particular publication jurisdiction, they require separate owner or legal review.
