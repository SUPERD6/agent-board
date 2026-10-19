# Tagged board adoption through the bundled worker

The 0.23.3 release loader excluded the manifest version's board fingerprints to
avoid embedding a bundle's own hash. After later source changes retained that
manifest version, the excluded fingerprint instead identified the already tagged
0.23.3 bundle. An installation without prior generated-file ownership could then
preserve a byte-exact published board as foreign instead of adopting it.

The reproduction uses the actual compiled `hooks/board-script.ts` worker through
`--legacy-connect-request`; it does not call the source installer or establish
success by searching for a fingerprint in the bundle.

## Fixture and safety boundary

`tests/legacy-connect.test.mjs` adds four `bundled tagged board adoption` cases:

| Starting file and ownership | Required outcome |
| --- | --- |
| Exact 0.23.3 tag, no ownership | Update to the current bundle and record ownership |
| Exact 0.23.2 tag, no ownership | Update to the current bundle and record ownership |
| Modified tagged board, no ownership | Preserve exact bytes, warn, remain unowned |
| Exact 0.23.3 with a trusted prior fingerprint seed | Update and retain ownership |

The fourth case tests the existing fingerprint migration path, not historical
release recognition. Every case starts with a fresh home and no native ledger,
authority or manifest. The first three supply no ownership seed at all.

Read-only `git show` loads tagged `BOARD_SCRIPT` bytes, with immutable tag commits
checked before use:

- `agent-board--v0.23.3`: `5610ce6a051ba772ee074ac50bdcbc22c6195f6f`
- `agent-board--v0.23.2`: `b0bb351462158b80ae29161c37054f4549901ac0`

Each board receives the exact `boardScriptFor` progress/language header. The worker
runs with an explicitly isolated home, environment, progress path and agent
directories. A preload blocks every child-process launcher inside that worker and
records any attempt. No real host is discovered or invoked; all hooks/configuration
are synthetic. Existing foreign hook text is checked after the transaction.

The tests require local Git and these release tags. They do not fetch, rewrite tags,
read credentials/history, start models or modify the real home or CODEX_HOME.

## Before-fix evidence

Baseline `04950f102ca8a4d644badbefb0c0bdea5e2dcf79`, Windows, Node **24.12.0**:

```text
node --test --test-name-pattern="bundled tagged board adoption" tests/legacy-connect.test.mjs
4 tests: 3 passed, 1 failed
```

Only the exact 0.23.3/no-ownership case failed: it returned `connectPreserved`
instead of recognizing the release. The older-release positive control, modified
foreign-file guard and seeded-ownership control passed. Original bundle SHA-256:
`3ddb610b07d2bb5dcfd3259ef25218bae98d295b1084a1f6463f66fb38aeeff8`.

The earlier standalone three-case reproduction also verified that the external
released table recognized both tag hashes, while the current bundled worker
preserved 0.23.3 and adopted 0.23.2. That bounded fixture's results and the full RED
test log are retained in the task workspace's
`work/release-adoption-fixture-N3IxZT/` directory.

## After-fix evidence

After the loader owner regenerated and froze the bundle, the same command on
Windows / Node **24.12.0** passed **4/4** in 1.727 seconds. Every actual worker
exited zero and passed the no-native-host-attempt assertion. Both exact tagged
boards updated to current output and became owned; the modified file remained
byte-for-byte preserved and unowned. The seeded ownership control also passed.

Frozen `hooks/board-script.ts` file SHA-256:
`a7f30ea9a65e5ae2176a950c106f842a4c4ac0d93209e29db0a2127b5af491d9`.
Decoded `BOARD_SCRIPT` SHA-256:
`73948885967bc213fe01689d43efcd3dd2b874fefa7b15a439072f85d9f3f1a1`.

The task workspace retains separate `red-tagged-regressions.log`,
`green-tagged-regressions.log` and `green-bundle-hashes.json` in
`work/release-adoption-fixture-N3IxZT/`; the GREEN run did not replace RED evidence.

## Build contexts

With Bun **1.4.2**, a separate disposable Git worktree at the exact 0.23.3 tag
received only the new build script. Build and `--check` both exited zero; the
decoded artifact retained its original SHA-256:
`12f22a68cb63036163765d2acd982e2e81a394c5a40d39c7576e6618918f7215`.

The same fixture then used an untagged synthetic version, `0.23.999`, with all six
released-file kinds. Changing only its dummy current board fingerprint from 64
zeros to 64 ones left the built artifact unchanged; `--check` passed with SHA-256
`25a8c152aa997c3b4d98304149cd39aa9eab09ca6ff1b44f6c6c5b66955eda65`.
This verifies that a mutable pre-tag table does not create a self-hash cycle.

Commands, input snapshots and four logs are retained privately at
`outputs/host-contracts/build-context-proof-oT6egR/results.json` in the acceptance
workspace. The fixture created no tag and invoked no native host or model.

The complete affected `board.test.mjs`, `connect-worker.test.mjs` and
`legacy-connect.test.mjs` suites passed **101/101**, zero failures or skips, on
Node **24.12.0** with concurrency 1 in 128.214 seconds. Pinned Bun
`build-released.ts --check` also exited zero with all local release tags present.

Node 22/Linux and the remaining suites still require final-head CI. Full SDK
`tsc -p .` is unrun because host-generated types are unavailable. These checks
establish no live-agent or model acceptance.
