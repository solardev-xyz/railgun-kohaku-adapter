# Wider operation policy and retained custody — October 11, 2026

The independently installed reference host completed a fresh Alice/Bob/Charlie
synthetic lifecycle with a 0.03 ETH Shield and a configured 0.05 ETH direct
operation ceiling. These are synthetic values. Alice paid the complete net note
to Bob, the current-circuit SNARK-verifying POI service accepted the proof, Bob
found his output with his own account, and unrelated Charlie found no note.

A fresh Bob unshield under a ceiling of one smallest unit refused. A preparation
under the larger ceiling was then killed after durable custody, before any send.
With the lower ceiling, cold notes, the proof-present hold, unjournaled observation
and owned Valid POI remained readable. Cold submission refused with zero reviews
and zero broadcasts. Restoring the configured ceiling submitted exactly that
same hold without a derived-state rebuild. Finality, Bob's empty available-note
view and all three receipt/conservation checks passed. No extra transaction or
POI handoff was made.

The native cold refusal exposes `recovery-required / history`; it does not expose
the internal substage. Focused warm/cold unit tests identify `operation-policy`,
and removing either policy guard makes its mutation control fail. The native
sequence adds the no-review/no-broadcast check and the positive same-hold
submission after policy restoration. These are complementary claims.

## Installation and provenance

The packed fixture and clean installation J have identical membership and
runtime bytes; the recorded difference is README only. J's independently
acquired locked dependencies and actual offline cold account reopen have their
[own record](../reference-installation-2026-10-11/README.md). The native fixture
uses the existing pinned Electron and physical dependencies, not a second fresh
acquisition. Its only installed source transform is the recorded synthetic POI
list contract. Compatibility byte controls restore their originals and verify
access after each control. INDEX.json identifies the tar and executed tools.

## Development failures preserved

Two early attempts stopped at Shield: the historical synthetic balance and its
Shield decoder were both fixed to the old small fixture value. The fixture now
accepts explicit positive bounded balance/Shield options for this variant;
production defaults and real protocol checks were unchanged. A real-engine
fixture regression covers the wider Shield and cold chain reconstruction.
The next run passed 43 steps, then the test expected the wrong spelling of the
fresh low-policy refusal code. The assertion was corrected and this full journey
reran from fresh random custody. Those failed fixtures are preserved; none is
reported as a passing run.

This is real owner/engine/prover execution with a SNARK-verifying synthetic POI
service. The chain, roots, list and network remain synthetic; it does not execute
the EVM or qualify wider live amounts, mainnet, relay transport or another native
platform. The completed default-amount live journey remains separate.
