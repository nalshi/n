---
version: 1
slug: "n-src-routes-authenticated-accounting-tsx-435ab3b4"
primary_target: "dashboard/shadcn-admin/src/routes/_authenticated/accounting.tsx"
related_targets: []
---

# Accounting workspace

## Scope
An Arabic RTL accounting workspace inside the existing Nalsh merchant dashboard. This is an extension of the established dashboard, not a replacement visual identity.

## Mode
Operate

## Audience and task
A merchant sets accounting policy, initializes the chart of accounts, creates fiscal years and periods, records balanced journal drafts, posts or reverses entries, and reviews the audit trail. The merchant remains responsible for confirming jurisdiction-specific policy.

## Constraints
Use real API data only; never invent balances or policy defaults. Keep existing store, product, inventory, order, and customer-link workflows intact. Posting is available only after policy confirmation and only in the functional currency. Tax workflows and automatic business-event posting are not implemented.

## Direction contract
THESIS: Make the accounting setup state and the next valid ledger task immediately legible; refuse a generic financial KPI dashboard that implies unimplemented reporting.

OWN-WORLD: Extend the merchant dashboard's current neutral surfaces, blue-gray tokens, IBM Plex Sans Arabic, RTL spacing, buttons, tables, and focus treatment. Do not introduce a second visual system.

STORY: The merchant first configures and explicitly confirms policy, then initializes accounts and periods, records a balanced draft, and posts it when the backend permits; every mutation has a visible result and errors retain a recovery path.

FIRST VIEWPORT: A clear page heading and one concise description lead into a policy/readiness strip. A compact, keyboard-operable section switcher sits above the selected task area. The first state prioritizes unfinished setup; configured merchants see their real periods and journal actions, not synthetic metrics.

FORM: One code-led extension of the established authenticated merchant dashboard, selected as the sole fit for this focused feature. No concept seed applies to a local extension of the existing product world; the route inherits existing components and tokens.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
