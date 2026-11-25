# Administrator and lecturer manual

## Set up a workspace

Register an organization and choose a password of at least 12 characters. Each registration creates an independent organization. Configure email delivery to send verification and invitation links. In Settings, update your display name or organization name and invite lecturers by email. The platform administrator can grant organization administrator or lecturer access from Platform administration. Promote the first platform administrator from the trusted deployment console, as described in the deployment guide.

Enable a retention window appropriate to the organization. Identifiable photography requires the participant's explicit consent. Schools must obtain and verify any required guardian authorization before enabling the feature. Enable the guardian authorization requirement for a session involving minors. In the presenter gallery record the reference of the externally verified authorization. Uploads require both that reference and participant consent. Clear the reference to withdraw authorization and delete the participant’s photos. The participant can show an identification QR so a signed-in presenter opens the correct gallery assignment. Administrators can adjust image dimensions and quality. Certificate builder sets the issuing organization, signatory and optional custom title for completed sessions with certificates enabled.

## Prepare the activity

Use Create quiz or select one of the optional library templates. Enter a title and category. Each question has a prompt, format, optional attachment, points and time limit. A time limit of zero leaves a presenter-led question untimed. Markdown formatting and dollar-delimited mathematical notation render in live prompts. Add translated question wording in Multilingual wording. Use a Slide question for information-only content.

Enter an option per line. For a single-choice answer, enter the exact option as the key. For multiple-choice keys separate correct option labels with a vertical bar. For ordering, enter options in their correct order. Matching and drag-and-drop use separate Label and Matching target fields for each pair. Add at least two pairs with distinct labels. Saved JSON documents retain the label|target representation. Image hotspots use X,Y,radius percentages. Graded sessions disable choice effects. Numeric questions compare numeric values, and text answers use trimmed, case-insensitive exact matching.

Drag question buttons or use Move to reorder. Save quiz adds the draft to the library. Before its first save, the browser keeps the draft locally for the signed-in account. Saved quizzes use automatic versioned saves, and a concurrent editor receives a conflict message. Export quiz JSON to reuse question wording and settings. Shareable media references currently resolve within the same installation.

## Import and review

CSV and XLSX use the first row as column headers. Include prompt,type,options,key. Optional fields include seconds, points and explanation. Options in spreadsheet cells use a vertical bar. A minimal row is:

```csv
prompt,type,options,key,seconds,points
Which shape has three sides?,Single choice,Triangle|Square|Circle,Triangle,30,100
```

Word and text-based PDF documents use blocks like this:

```text
Q: Which shape has three sides?
A. Circle
B. Triangle
Answer: B
Explanation: A triangle has three sides.
```

Review imported prompts and keys in the studio. Scanned documents require text extraction before import. When AI is configured, submit an objective or source text in Generate a draft, review the returned questions, then save and launch.

## Run a session

Choose Launch session, select presenter-led or self-paced, configure answer release and participation, then create the session. The PIN, link and downloadable QR appear in the controls. Self-paced rooms also offer a link and QR for each question. A private phrase restricts joining. Set a future opening time for scheduled sessions.

Open the projector display in a separate window. Start the session, pause or resume, close answering, extend the timer, and advance questions from the control page. Manual release displays the authorized key and explanation. Show statistics shares aggregate option selections. Approve submitted audience questions before they appear on participants' screens. Participants can vote for approved questions.

The participant should bookmark My private results before leaving the device. The private report is read-only. Keep that link private. The join credential is stored separately on the device. Results and score-dependent displays follow the configured release policy. Use End session to finish. Participation is device-local unless the participant saves the private results link.

## Photographs and reports

Enable photography in session settings. Participants may join without consent. With consent, a participant can use a device camera or existing photo through the browser file picker. A presenter can select a consenting participant in the gallery and attach a question or moment label. Revoking consent removes that person's photos. Authorized presenters can export the gallery as a ZIP.

Open Session report for responses, points and elapsed time. Export CSV or Excel, or use Print / Save PDF. Compare sessions shows response rate, answer accuracy and mean elapsed time. Open the participant inspector in the presenter controls to leave private feedback. An enabled certificate appears when the participant completes all answerable questions.

