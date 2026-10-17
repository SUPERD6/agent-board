## api-gateway
<!-- block-start id=ac1ce73e agent=muse state=waiting updated=2026-10-17T08:10:03Z -->
### title: Rate limiting plan sketched for public endpoints; per-key limit choice pending
> Status: waiting — need your call on the per-key limit before any implementation
> Context: synthetic test for throwaway project api-gateway; no GitHub repositories or real files touched.
- [x] Sketch rate-limiting middleware for public endpoints: key on API key (fallback client IP), fixed-window counter, 429 + Retry-After + X-RateLimit-Remaining headers, health-check bypass, throttle logging
- [?] Confirm the per-key limit with the user — 100 or 300 a minute?
- [ ] Implement the middleware once the limit is chosen
<!-- block-end id=ac1ce73e -->
