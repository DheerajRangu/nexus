# Integration verification

- Web production build and TypeScript check: passed.
- Python compilation: passed.
- Python suite: 47 passed on temporary SQLite; 47 passed on isolated PostgreSQL 15 UTF-8, including concurrent dispatch.
- ESLint correctness rules and Ruff syntax/control-flow checks: passed.
- Expo TypeScript check: passed.
- Flutter analyzer: no issues.
- Four isolated browser contexts: citizen intake and location confirmation, ALS dispatch, acceptance, shared GPS, pickup, hospital acceptance, corridor, real accident-aftermath video evidence, route/ETA update, capacity diversion, arrival/handover, citizen refresh recovery. No browser JavaScript errors.
- Printable camera report: three images loaded, zero broken images; example PDF saved in /tmp/aegis-connected-flow/accident-aftermath.pdf.

Machine-readable demo evidence: [connected-flow.json](evidence/connected-flow.json). Browser artifacts are generated locally in /tmp/aegis-connected-flow. Inputs are demo fleet/hospitals and geographic providers; footage is actual sample video. This is integration validation, not clinical or perception accuracy validation.

Native physical devices, background GPS, external Google Maps keys and physical signal controllers were not runtime-tested. Docker is not installed in the verification environment; Compose configuration is supplied but not claimed as executed. Historical Spring/Cloudflare/Express servers are retained source, outside the connected runtime tests.

Run from root: npm run test; npm run lint; npm run typecheck; npm run build. Native: npm --prefix mobile run typecheck; (cd driver-app && flutter analyze). See SETUP.md for optional isolated PostgreSQL/browser configuration.
