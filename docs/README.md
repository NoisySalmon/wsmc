# Documentation

## Using the app

- [State coordinator guide](user-guides/state-coordinator.md)
- [Regional coordinator guide](user-guides/regional-coordinator.md)
- [Coach guide](user-guides/coach.md)
- [Coordinator workflow](operations/coordinator-workflow.md)
- [Registration CSV contract](registration-csv.md)
- [In-person QR sign-in](operations/qr-sign-in.md)

## Development and operations

- [Script and CLI command index](operations/scripts.md)
- [Local development and demo scenarios](operations/local-development.md)
- [Showcase provenance and demo controls](operations/showcase-data.md)
- [D1 deployment, migrations, backup, and recovery](operations/d1-runbook.md)
- [Administrator bootstrap](operations/auth-bootstrap.md)
- [Repository data policy](operations/data-privacy.md)

## Product and architecture

Product rules and relationships are maintained in code:

- [Database schema](../src/lib/server/db/schema.ts)
- [Qualification rules](../src/lib/server/qualification/rules.ts)
- [Qualification cutoffs](../src/lib/qualification.ts)
- [Authorization](../src/lib/server/auth/capabilities.ts)

- [Persistent access model](architecture/persistent-access.md)
- [Historical foundation decision](adr/0001-v2-foundation.md)

Implementation plans and checkpoint logs have been retired; Git history keeps
those records. Current deployment state must be inspected using the runbook,
not inferred from historical documentation.
