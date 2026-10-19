## What and why

<!-- One complete change: what it does and why. -->

## Checks

- [ ] Applicable Node board, storage, local reporter and messaging/exchange tests
- [ ] Bundle/released files current, if generated output changed
- [ ] `claude plugin validate --strict .`
- [ ] `claude plugin test .`
- [ ] Applicable strict standalone typechecks; report if full `tsc -p .` SDK types are unavailable
- [ ] `bash tests/setup.check.sh` / `tests/setup.check.ps1`, if a setup script changed
- [ ] `docs/FORMAT.md` updated, if the file format changed (backward compatible)
- [ ] `CHANGELOG.md` entry naming the tests that cover the change
- [ ] Native/model evidence and CLI/App/IDE limits stated separately; no private data or board tokens attached
