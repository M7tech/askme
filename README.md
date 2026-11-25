# Chorusroom

Self-hosted classroom quizzes and audience participation. A lecturer can create a quiz, invite participants by PIN or QR, run it live or self-paced, control when answers become visible and share private individual results. Sessions, responses and photographs persist in a database. The release checklist records implemented features, acceptance tests and open requirements.

## Run locally

Use Node.js 24 and npm. Start in the project directory.

```sh
npm ci
npm start
```

Open **http://localhost:3000**. Create a workspace to become its organization administrator. The public format previews are clearly marked examples. Templates become database records only when saved. The development server uses embedded PostgreSQL through PGlite and stores its database in the user's home directory under `.chorusroom/data`. Set `DATA_DIR` to select a different private directory. Serve the application through Node. The repository root includes a deny rule for Apache because this checkout sits inside an XAMPP document root.

## System design

Browser modules and a shared stylesheet serve the presenter, participant, and projector screens. Express handles authenticated HTTP requests. The server calculates scores and determines which question data may leave the database. WebSockets carry a short change notification. Clients then read a fresh, authorized state snapshot. Redis relays the notifications across API instances. Reconnection and periodic refresh recover missed notifications.

PostgreSQL stores accounts, tenants, quizzes, room snapshots, responses, feedback, audience moderation and photos. Immutable question snapshots preserve reports when lecturers edit or delete their source quizzes. JSONB stores ordered question documents with type-specific settings. Foreign keys and transactional room locks protect participant capacity and response writes. Express and browser ES modules keep the deployment smaller than separate NestJS and Next.js runtimes. Local PGlite uses the same SQL schema as the deployment.

Photographs and thumbnails are stored in PostgreSQL so revocation, backup and retention cover them alongside participant records. Question media use shareable asset URLs. Only use the private gallery for identifiable participant photos. Private result links and participation credentials carry independent random tokens. URL fragments keep result credentials out of server access logs.

## Operator and lecturer guides

- [Coolify deployment, backup and restoration](docs/DEPLOYMENT.md)
- [Administrator and lecturer manual](docs/MANUAL.md)
- [HTTP and WebSocket API](docs/API.md)
- [Security review](docs/SECURITY.md)
- [Implementation checklist and known limitations](docs/CHECKLIST.md)
- [Measured benchmark and hardware](docs/benchmark.json)

## Verification

```sh
npm test
npm run e2e
npm run load
node tests/persistence.mjs
```

The Playwright suite launches its own server and temporary database on loopback port 3447. Windows uses installed Microsoft Edge. On Linux install Playwright Chromium first with `npx playwright install --with-deps chromium`. The load runner launches a separate loopback API on port 3458 and writes measurements to `docs/benchmark.json`. Set `AUDIENCE` to customize the number of simulated participants. Load data stays in an isolated temporary database.

The browser suite checks lecturer registration, template launch, live updates, disconnect/reload recovery, answer release, private links, organization isolation, image consent and compression, withdrawal, Q&A moderation, report exports, Arabic/Kurdish direction and mobile viewport widths. The persistence check restarts a separate API and reads the saved quiz and authenticated session from its reopened database. Four public screens are also scanned with axe-core for WCAG A/AA violations. Screenshots are saved under `docs/screenshots`.

