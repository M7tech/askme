# HTTP and WebSocket API

GET /api/openapi.json returns a machine-readable OpenAPI 3.0 route inventory, authentication schemes and core request schemas.

All endpoints below are relative to /api unless explicitly marked. JSON is the default request and response format. Errors contain an error string. Typical statuses are 400 for invalid input, 401 for sign-in, 403 for insufficient access, 404 for unavailable resources, 409 for conflicts and 429 for throttling. Send the exact PUBLIC_ORIGIN as Origin on state-changing requests. Browser calls use the same origin. Responses carrying application data disable caching.

## Accounts and settings

| Method and path | Authentication | Purpose |
| --- | --- | --- |
| POST /register | Public | name, organization, email and password. Creates an organization and issues a login cookie. |
| POST /login, /logout | Public or cookie | Sign in with email/password or expire the current session. |
| GET /me | Optional cookie | Account profile and role, or null. |
| POST /recover | Public | Request an email reset using email. |
| POST /redeem | Link token | Redeem kind, token and new password for reset, or kind=verify and token. |
| PATCH /profile | Cookie | Update display name. |
| DELETE /profile | Cookie and current password | Delete account. The last organization member also removes the organization. |
| GET, PATCH /org | Organization administrator | List members or change organization name. |
| POST /org/member | Organization administrator | Invite a lecturer with name and email. |
| PATCH /org/member/{id} | Administrator | Assign lecturer or admin role. |
| GET, PATCH /admin | Super administrator | Platform usage, accounts, audit or settings update. |
| GET /branding | Public | Operator name, registration setting and operator notices. |
| GET, PUT /certificate | Cookie / administrator for writes | Organization certificate title, issuer and signatory. |

## Authoring

GET /quizzes lists the current organization's library metadata. POST /quizzes creates a quiz. GET /quizzes/{id} returns the document and version. PUT requires the last-read version, and returns HTTP 409 on a concurrent edit. DELETE removes the source quiz. Existing room snapshots survive a source deletion.

Example creation body:

```json
{"title":"Geometry","category":"Mathematics","questions":[{"type":"Single choice","prompt":"Which shape has three sides?","options":["Square","Triangle","Circle"],"key":"Triangle","explanation":"A triangle has three sides.","seconds":30,"points":100}]}
```

GET responses use document for the question list. Writes use questions. POST /import accepts a multipart file field containing CSV or XLSX. POST /import/document accepts structured DOCX or text-based PDF. Each returns question drafts for review. POST /assets accepts a multipart file field and returns an asset ID and MIME type. GET /assets/{id} serves that shareable instructional media. GET /ai reports whether a provider is configured. POST /ai accepts topic and returns an editable quiz draft.

## Sessions

POST /rooms accepts the quiz ID and room configuration. Example:

```json
{"quiz":"quiz-uuid","mode":"live","release":"manual","anonymous":false,"max":500,"late":true,"photography":false,"selfie":false,"advance":"manual","autoSeconds":30,"autoBreak":5,"rank":false,"graded":true}
```

The response contains pin. GET /rooms lists sessions accessible to the lecturer. Use /rooms/{pin} as the prefix below.

| Method and suffix | Access | Purpose |
| --- | --- | --- |
| GET /info | Public | Join form requirements and title. |
| POST /join | Public, plus passcode for private rooms | Supply name, optional team and consent. Returns token for participation and resultToken for read-only results. |
| GET /state?q=0&lang=en | Public display or participant | Current safe question representation, phase, deadline, counts and released fields. q selects a self-paced question. |
| GET /host | Presenter | Snapshot, people, counts, moderation and settings. |
| POST /control | Presenter | Send action start, next, previous, pause, resume, extend, close, reveal, stats, end, feedback, approve, approve-answer or remove. |
| POST /answer | Participant | Send integer q and value. Multiple choice, ordering, matching and hotspot answers use arrays. A repeated identical response is idempotent. Rooms with repeat enabled require a client-generated requestId. The server archives each attempt and uses the most recent accepted response for grading. |
| POST /discuss | Participant | Send body for moderation, or vote containing an approved message ID. |
| GET /results | Read-only results token | Released per-question results and permitted score, certificate and feedback. |
| GET /standings | Public or private-room member | Released competition progress and team totals when rankings are enabled. |
| GET /qr/png or /qr/svg | Public | Download the join QR. Optional q selects a self-paced question. |
| POST /consent | Participant | Set consent and optional publicPhoto separately. Withdrawal removes images. |
| POST /photos | Presenter or participant | Multipart image, moment and presenter-assigned person. Consent is verified before persistence. |
| GET /photos | Presenter or participant | List authorized photos. |
| GET, DELETE /photos/{id} | Presenter or owner | Read or remove an authorized photo. Add thumb=1 to retrieve a thumbnail. |
| GET /results/photos/{id} | Results token | Read a thumbnail belonging to the result-link owner. |
| GET /photo-archive | Presenter | ZIP of authorized session photos. |
| GET /report | Presenter | Table with headings and rows. format=csv or format=xlsx downloads a file. |

Send the participation credential in X-Participant and the separate results credential in X-Results. Cookie authentication protects lecturer routes. A public presentation link for a private room requires the presenter's signed-in browser.

GET /analytics returns session comparison records for the presenter's permitted scope. GET /health (outside /api) confirms database connectivity.

## WebSocket transport

Connect to /live/{six-digit-pin} on the same origin. The server emits the text refresh after room changes. It never sends a question key or a participant token through this channel. Fetch the appropriate HTTP state, host, or standings view on connection and notification. Retry disconnected sockets and periodically recover a snapshot. The latest database state is authoritative. Participant submissions use authenticated HTTP requests and a unique participant/question constraint.

