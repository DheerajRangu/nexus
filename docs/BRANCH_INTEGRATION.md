# Branch integration

Working branch: `aegis-full-system-integration`. Based on `origin/main` / `origin/aegis-controlroom` (`5ccb3a8`). Each other feature branch had an unrelated root history, so merges explicitly allowed unrelated histories. Source branches and main are unchanged.

| Source branch | Merge | Result |
|---|---|---|
| aegis-initial-dispatch-module | 82cb7f0 | Java dispatch and Flutter sources retained; eligibility, backend-confirmed assignment, receipt/acknowledgement audit facts and telemetry rules ported to the shared Python service; Flutter bridge uses that service. |
| aegis-patient-tracking-v1 | 9dfb3fd | Citizen GPS/pin confirmation, EN/TE/HI, restricted tokens, map interpolation and SSE components retained; synthetic adapter replaced in active runtime. |
| aegis-road-intelligence | 7ca1eb2 | Live inference, evidence, reports and canvas retained; canvas embedded in command room, located events connected to routes. |
| aegis-controlroom | Base commit | Visual primitives and Expo retained; durable shared APIs replace independent dashboard state. |

Important add/add conflicts were README, .gitignore, .env.example, package.json/lock, Vite/PostCSS and root UI files. Original build manifests and documentation are in `docs/branch-reference`. Root now owns one npm workspace lock for the web bundle. Expo has its own native project lock; Flutter retains its native pub lock. Tailwind runs through Vite; old conflicting PostCSS plugins are archived. Scoped command, vision and citizen CSS lets the preserved interfaces coexist.

The existing SQLAlchemy/PostgreSQL-or-SQLite configuration is the active database. The control-room city-aggregate pattern is preserved with transactional outbox and token hashes. Java/PostGIS, Cloudflare D1 and Express adapters remain reference implementations, not additional live mission authorities. This is a semantic integration, not an assertion that the historical Java server or every original UI action runs unchanged.

See `BRANCH_ANALYSIS.md` for initial inventory and `ARCHITECTURE.md` for provider boundaries.
