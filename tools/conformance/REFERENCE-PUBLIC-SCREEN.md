# Reference transport: public scan screen

Before funding a fresh reference-wallet demonstration, test the intended RPC
through the example's own managed Arti and SOCKS/TLS transport. This tool opens
no wallet, account, vault, journal or existing profile. It creates and preserves
a new temporary directory for its own Arti state and public results.

Write a local configuration file with exactly these fields:

```json
{
  "binary": "/absolute/path/to/authenticated/arti",
  "sha256": "REPLACE_WITH_AUTHENTICATED_BINARY_SHA256",
  "rpcUrl": "https://REPLACE_WITH_REVIEWED_SEPOLIA_RPC"
}
```

Then, using the documented Node development installation:

```sh
node tools/conformance/reference-public-screen.cjs /absolute/path/to/screen.json
```

To measure one public window again without repeating the whole inventory, append
its starting block, for example `9080000`. This produces `coverage:
"selected-window"`, not a full-inventory result. The end is the next application
schedule boundary, capped at finalized.

The tool prints its temporary directory immediately. `windows.jsonl` records
each completed window; `report.json` records the final result, including failures,
timings, closed transport errors, response byte counts and source hashes. No
response bodies or request parameters are retained. Window numbers and deployment
RPC URLs are public diagnostics, not owned-note queries. Do not put credentials
in the URL; credentials, query strings and fragments are refused. SIGINT/SIGTERM
cancels and drains the transport and its owned proxy before writing the result.

The screen makes only `eth_chainId`, `eth_getBlockByNumber` and address-only
`eth_getLogs` calls for the pinned Sepolia Railgun proxy. It checks:

- the chain and finalized anchor;
- every window from genesis to that anchor, using the example's 100k/20k schedule;
- each window's 4,096-log, 4 MiB and 512-distinct-block bounds, plus address,
  range, removal flag and block-hash consistency;
- a fresh acquisition of the densest observed window: canonical boundary headers,
  logs, and **all** event headers in sorted batches of eight, within three minutes.
  Each batch drains before the next starts, matching the production event-header
  schedule. The earlier refilling-pool observation is explicitly historical.

The entire tool is bounded to one hour (including bootstrap), 500 windows and
1,100 RPC requests. Requests use the application's 30-second timeout and its
method-specific connection timeout. There are no retries, provider rotation,
redirects or direct fallback. A failure stops the screen and is retained. Start
a separate, explicitly chosen screen to measure another observation; never
describe a later pass as erasing an earlier failure.

A pass is a point-in-time public transport and scan-size observation. The log
checks are a deliberately limited screen, not the production normalizer or
projector. It does not prove that an RPC returned every event, qualify every
window's acquisition time, validate a Merkle tree, exercise TXID/indexer/POI
services, establish Tor circuit isolation, or authorize any disclosure or send.
The densest window is selected by distinct event blocks; another window may be
slower. Public RPC trust remains `unverified-rpc`. The real account scan and the
separate live Alice-to-Bob journey still must pass their own checks.
