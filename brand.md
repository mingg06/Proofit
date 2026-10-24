# PROOFIT console design

Initial implementation direction, selected for this console; no prior user-supplied brand guide was present.

- A quiet, editorial operations console with a dark forest sidebar, warm neutral surfaces and one green action accent.
- System sans-serif for controls, Georgia for page-level headings, monospace for record identifiers. No external font or tracking requests.
- Semantic green, amber and red always accompany explicit text labels. Decisions, operation states, provenance and observed effects remain separate.
- Responsive layouts, visible keyboard focus, native dialog focus management and reduced-motion support. Dark-mode tokens follow the operating-system preference.
- CSS design tokens live in apps/console/src/styles.css. Copy describes stored facts and exact supported actions. No invented counts, model traces or provider observations.
