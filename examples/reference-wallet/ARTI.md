# Arti prerequisite

The runtime setup does not acquire Arti. This application starts its own proxy
from an absolute binary path and checks its exact SHA-256 before each launch.
Do not point it at a shared Tor Browser proxy or start a second proxy manually.

The reference public scan used Arti 2.6.0 on macOS arm64. The Tor Project's
[2.6.0 release announcement](https://blog.torproject.org/arti_2_6_0_released/)
identifies that release. Its [build guide](https://arti.torproject.org/guides/compiling-arti/)
describes building the binary from source with Rust/Cargo. For the same source
version, in a new directory outside the adapter checkout:

```sh
git clone --branch arti-v2.6.0 --single-branch https://gitlab.torproject.org/tpo/core/arti.git arti-reference-2.6.0
cd arti-reference-2.6.0
git rev-parse HEAD
# Observed release commit: a71097fdf7b141b56d1eb3709628ee38d232c9d1
cargo build --locked -p arti --release
./target/release/arti --version
shasum -a 256 target/release/arti
```

Review the release source and platform build prerequisites before execution.
Record the source commit, toolchain, build options and resulting binary digest.
Use the canonical absolute path to `target/release/arti` as `tor.binary` and its
computed digest as `tor.sha256`. The source build is outside the npm/runtime
setup evidence; the commands above are upstream-derived instructions, not a
claim that this repository reproduced its historical binary.

The observed reference binary digest is
`9d67b310f6d73848a83c5be54454ffc42565076cf46395782d7f7d80fc856d34`
([public scan record](../../docs/qualification/reference-public-scan-2026-10-10/INDEX.json)).
That is an observation of particular build bytes, not an upstream signature or
a universal hash for every 2.6.0 build. A local hash binds a reviewed binary to
configuration; hashing an untrusted download does not establish its provenance.

The historical version is not a recommendation to hold a production client on
an old release. Follow Tor's [support policy](https://arti.torproject.org/contributing/support-policy/)
when choosing an updated build, then recheck this host's configuration, startup,
state-lock and public scan behavior with the new binary. Keep its identity fixed
within a qualification run. No Linux/Windows native or circuit-isolation claim
is inherited from the macOS arm64 observation.
