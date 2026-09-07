# Accessibility review record

Review date: 2026-09-06

Scope: authentication, coach registration, scoring, qualification review, and
the public state leaderboard, using the seeded Pages preview at a 390px mobile
viewport.

## Checks completed

- The global skip link targets the primary content container, which is present
  on every reviewed page.
- The primary navigation has an accessible landmark name and uses native links
  and buttons.
- Every visible control on the reviewed pages has an accessible name from a
  visible label, button text, link text, or explicit ARIA label. The scoring
  filter checkbox is explicitly named `Missing only`.
- Authentication, registration, scoring, and qualification feedback uses
  `role="alert"` for errors and `role="status"` for successful non-blocking
  updates.
- Focus indicators are visible with a 3px `#e05a00` outline and an offset from
  the focused control. The outline has a measured contrast ratio of 3.73:1 on
  white content and 4.57:1 on the primary navigation background.
- Native form controls, headings, table headers, and responsive table wrappers
  are used without custom keyboard widgets.
- At 390px, all eight primary routes had zero unnamed visible controls and no
  horizontal document overflow:

  - `/login`
  - `/program`
  - `/registration/contest-region-2/school-gamma`
  - `/scoring/contest-region-1`
  - `/qualifications/season-2026`
  - `/state/contest-state-2026`
  - `/reports/season/season-2026`
  - `/state/contest-state-2026/results`

- The public leaderboard was checked in both an empty-results state and a
  published-results state; the published view exposed only intended result
  fields and remained readable at mobile width.

## Release gate

The review is a manual primary-flow check, supplemented by `npm test`,
`npm run check`, and the Pages smoke script. Any future custom widget or major
layout change must repeat this review before release.
