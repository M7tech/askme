# Delivery checklist

| Phase | Implemented | Remaining acceptance work |
| --- | --- | --- |
| 1. Architecture | Same-origin web application, PostgreSQL schema, Redis notifications, private database-backed photographs, UI design system | Normalized authoring records, enterprise-scale operational rehearsal |
| 2. Accounts | Password sign-in, SMTP verification/reset and invitations, secure cookies, organization permissions, super administrator, account deletion, audit events | External OAuth, MFA, full permission editor, real SMTP acceptance test |
| 3. Creation | Versioned quiz studio, local draft recovery, autosave for saved quizzes, undo/redo, reordering, duplication, template previews, organization question search, dedicated presentation library and studio, Markdown/math, media assets, structured document imports | Bulk library workflows, round-trip asset packaging |
| 4. Live delivery | Live and self-paced sessions, scheduled opening, PIN, private phrase, downloadable QR, per-question self-paced links, projector, WebSocket refresh and reconnection | Field testing behind Coolify TLS and participant-level registration fields |
| 5. Results | Server grading, release policies, private read-only report tokens, completion certificates, optional leaderboard and feedback | Long-session timer drift and release boundary coverage |
| 6. Photography | Consent, private uploads, lecturer assignment, self-upload and mobile capture through device picker, metadata removal, thumbnails, withdrawal with consent history, authorized ZIP archive, retention | School-specific procedure review and real-device camera testing |
| 7. Engagement | Choice effects, reduced motion, optional scoring bonuses, theme-based competition displays, team totals and answer streaks | Independent race game mechanics, sound library, full achievement/reward system, animation configuration parity |
| 8. Analytics | Session table, accuracy, mean elapsed time, response rate, session comparison, question accuracy by lecturer/session, CSV/XLSX and print/PDF through browser | Longitudinal trend charts and participant score distribution charts |
| 9. Language and access | English interface, Arabic and Kurdish Sorani participant join/question/results text, RTL, localized numbers, bilingual question wording, light/dark themes and keyboard controls | Full administrator/lecturer translations, translated server validation, native-language review and WCAG 2.2 AA audit |
| 10. Operations | Multi-stage Docker build, Compose, persistent PostgreSQL and Redis, worker, health checks, backup/restore scripts, browser and load-test tools | Docker/Coolify deployment and restore drill on a host with Docker, 1,000-user and sustained classroom tests |

## Additional scope

The optional AI provider produces editable draft questions from a lecturer's topic or pasted source text. Uploaded-document AI generation, translations, distractor-specific workflows and performance coaching remain open. Provider calls and email delivery need installation-specific credentials for end-to-end verification.

Word clouds and brainstorming sessions display approved responses when the presenter shares statistics. Public question moderation and upvoting are available through audience Q&A. Dedicated personality outcomes, heatmaps, a collaborative brainstorming canvas, offline authoring and queued participant submissions, and full media accessibility authoring remain open. Commercial release also requires the operator's terms, jurisdiction-specific privacy and minors procedures, and testing with representative assistive technologies.

