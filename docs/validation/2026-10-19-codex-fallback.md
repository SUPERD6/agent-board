# Codex trust fallback implementation checkpoint

Base c5ee776. Only synthetic absolute mock control scripts were run; no real Codex/model/settings/trust mutations.

The native worker now probes exact three-event ownership/trust before acquiring the canonical lock, rechecks source bytes after installation, and retains/restores a managed instruction section until approved. A read-only status projects current approval without AGENTS writes. Existing nonempty override is effective; empty override is left alone. Marker edits preserve outside bytes and refuse malformed/multiple sections. Generated reporting commands use only a positively owned board. Existing reporter/board failures prevent fallback retirement even if definitions were approved.

The existing trust setter remains six-definition-only and was not called. PATH discovery accepts only absolute executable candidates; unsupported Windows shims remain unknown. Each read-only control request is bounded to one second in the worker, with no CODEX_HOME changes.

First focused batch:

ℹ tests 48
ℹ pass 47
ℹ fail 1
ℹ skipped 0
ℹ duration_ms 28930.6916

Its sole failure was the old status migration assertion comparing projected current readiness to stored metadata. The original exact migration assertion now checks the canonical record, with additional assertions for projected unknown approval.

Second focused batch:

ℹ tests 48
ℹ pass 45
ℹ fail 3
ℹ skipped 0
ℹ duration_ms 41844.5062

All three failures are a new fixture ReferenceError: a changed-definition scenario was placed before its config constant. The scenario was moved after positive approval; this correction has not been rerun at this checkpoint. Subsequent empty-override and owned-board retirement safeguards also need focused verification.

Strict standalone TS and strict plugin validation passed before these last safeguards; final bundle is regenerated. Full plugin/Node acceptance, affected old pane expectations, documentation review, and exact-head CI remain pending. No #102 completion claim.
