# Repository data policy

This public repository may contain public school-directory information and
clearly fictional demonstration fixtures. Student records, historical results,
identity corrections, reconciliation reports, and tests tied to actual students
belong outside version control.

Keep private work under `.local/` or in a separate private repository. Source
workbooks and reports under `legacy/`, `State Math/`, and extracted historical
inputs under `scripts/data/2026-regionals/` are also ignored. Public tooling and
regression tests must use synthetic student identities and results.

Ignoring a path does not remove files already tracked or erase earlier commits.
Review staged changes before committing. If personal data reached a remote,
removing the current files must be followed by a separately coordinated history
cleanup; do not force-push a shared branch without coordination.
