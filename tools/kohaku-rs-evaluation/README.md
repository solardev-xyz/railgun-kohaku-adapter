# Bounded Kohaku Rust evaluation

This is a native evaluation overlay for upstream `feat/kohaku-railgun` at
`da0b0b1f57f1351d5223a741583c0f3f46595531`. It seeds public dummy local state,
reopens a disk-backed checkpoint, checks separation of two accounts and injects
a UTXO sync outage. It uses no real profile, network service, funded key, proof
submission or transaction. The scratch database is deliberately retained.

It does **not** qualify note discovery, authentic chain data, encrypted storage,
fresh-process crashes, operation custody or broadcast recovery. The plain redb
backend is useful for this fixture, not a wallet credential-store recommendation.
The [backend assessment](../../docs/review/KOHAKU-RS-ASSESSMENT.md) separates
these checks from the unresolved adoption requirements.

Use a fresh disposable checkout. The installer refuses a different revision,
dirty tree, changed library file or an existing overlay. It copies only the
test module and adds its native-only declaration; no runtime API changes.

```sh
git clone --branch feat/kohaku-railgun https://github.com/ethereum/kohaku-rs.git kohaku-rs-evaluation
git -C kohaku-rs-evaluation checkout --detach da0b0b1f57f1351d5223a741583c0f3f46595531
node tools/kohaku-rs-evaluation/install-harness.cjs /absolute/kohaku-rs-evaluation
cd /absolute/kohaku-rs-evaluation/crates
cargo test --locked -p kohaku-railgun --lib host_boundary_tests
```

If the feature branch has been removed, clone the repository without `--branch`
and fetch `refs/pull/49/head` before checking out the pinned commit.

Tested on macOS arm64 with Rust 1.99 and the existing Cargo.lock. No dependency
changes are required. Dependency acquisition/build tooling can use the network;
the test itself supplies an unavailable syncer and a verifier that refuses all
root reads, so it cannot scan a service or spend anything.

The separate [upstream interoperability tests](https://github.com/ethereum/kohaku-rs/pull/56)
cover official-engine key/address/signature/TXID compatibility. The POI response
contribution supplies bounded loopback exchanges; no real node is contacted.
