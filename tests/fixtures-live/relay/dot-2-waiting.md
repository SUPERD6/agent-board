## api-gateway
<!-- auto session=7c9e2a4f agent=dot state=waiting updated=2026-10-17T08:15:23Z -->
### Public endpoint rate-limiting proposal ready
> Waiting for the per-key limit selection; implementation has not started.
> Context: Synthetic throwaway-project test only. No repositories or real files touched.
- [x] Propose per-key rate limiting on public endpoints, with HTTP 429 and Retry-After when exceeded.
- [?] Select the per-key request limit — 100 or 300 a minute?
- [ ] Implement the selected limit in the synthetic scenario.
<!-- /auto session=7c9e2a4f -->
