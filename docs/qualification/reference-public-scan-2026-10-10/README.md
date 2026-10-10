# Reference host: public Sepolia scan transport screen

The independent reference host's public screen passed on October 10, 2026:
367 windows, 679 RPC requests, all HTTP 200 and no transport failure. The largest
window had 616 logs, 841,166 bytes of log JSON and 304 distinct event blocks.
Every planned window was within the source's three size bounds. Re-acquiring the
densest window and all 304 event headers took 76.367 seconds with a refilling
eight-worker pool. That is **not** the production event-header schedule: the
owner waits for each batch of eight to finish. The original timing does not
establish that the owner would meet its 180-second acquisition limit. The slowest
inventory log request took 7.828 seconds.

The screen used the actual example context registry, managed Arti guardian,
remote-DNS SOCKS and TLS transport with no direct fallback. It started a fresh
dedicated Arti 2.6.0 process pinned by binary hash, using the explicit public
Sentio Sepolia endpoint. It created no wallet or account and made no proof,
owned-status, signing or transaction request. The preserved result includes the
exact public endpoint, finalized anchor, per-window counts and per-request timing.
That result, window inventory and executed tool snapshot are retained locally,
not published. The [index](INDEX.json) records their digests and source identities
for later verification; it is not a independently replayable evidence archive.

See [the tool's invocation and bounds](../../../tools/conformance/REFERENCE-PUBLIC-SCREEN.md).
The index distinguishes the executed diagnostic tool from its subsequent
failure-path hardening; the application transport bytes are identical. The final
tool's initial 20 unit tests covered size limits, malformed/mismatched responses, worker
drainage, empty results, input restrictions and aggregate deadlines. A rerun of
the entire live inventory was not used to qualify those diagnostic-only changes.
The later tool uses sorted batches with a barrier and has 23 tests, including a
delayed-first-header case that forbids dispatching the ninth header prematurely.

This is a point-in-time public transport observation, not a complete account scan.
It checks log sizes and limited header consistency, not the full production
normalizer, projection, Merkle tree or event completeness. Only the densest
observed window received a full header acquisition; density does not prove that
it was the slowest window. Provider correctness remains `unverified-rpc`.

There is no claim of circuit isolation, private address unlinkability, TXID or
POI service availability, live Alice-to-Bob success, other platforms, or mainnet.
The account and service acceptance gates remain separate. No historical Freedom
profile or network helper was opened or imported.
