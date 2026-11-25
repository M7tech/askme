---
version: alpha
name: "AskShaubo"
description: "Live classroom quizzes drawn as a lecture hall: one mark for every answer, on a blue board."
colors:
  board: "#10406F"
  board-deep: "#0B3159"
  paper: "#FFFFFF"
  wash: "#F1F5FA"
  ink: "#0F1F33"
  muted: "#4A5A6D"
  line: "#D8E2ED"
  edge: "#76879B"
  rose: "#FF9FB2"
  sun: "#FFD24A"
  iris: "#AAB9FF"
  aqua: "#7FDFE4"
  focus: "#1B66D6"
  danger: "#AB1F3D"
  good: "#0B6072"
  warn: "#7A4B00"
typography:
  display:
    fontFamily: "Kufam, Vazirmatn, Segoe UI, Tahoma, sans-serif"
  text:
    fontFamily: "Lexend, Vazirmatn, Segoe UI, Tahoma, sans-serif"
rounded:
  control: "10px"
  tile: "14px"
  panel: "20px"
spacing:
  page-max: "80rem"
  gutter: "clamp(1rem, 4vw, 3rem)"
components:
  button: {}
  field: {}
  chip: {}
  answer: {}
  room: {}
  cover: {}
  dialog: {}
  notice: {}
---

# AskShaubo Design System

## Overview

### Creative North Star

A lecture hall seen from above. Every student is one mark in a seat, and the marks regroup when the question closes. "Make room for every answer" is meant literally.

### Product context and register

- **Audience and primary job:** lecturers run live or self-paced quizzes; students answer from phones; the class reads a projector.
- **Target market and evidence:** universities in Iraq and the Kurdistan Region. Evidence: the product ships English, Arabic and Sorani, and participant privacy copy in all three.
- **Locales:** `en` (LTR), `ar` and `ckb` (RTL). New copy needs all three rows in `public/translations-redesign.js`. Sorani and Arabic copy needs a native reviewer before release.
- **Usage scene:** phones under time pressure, a projector read from the back row, a laptop at the lectern.
- **Register:** home and account pages are brand; everything else is product.
- **Memorable signature:** the room (`public/room.js`). It only appears where it shows real counts: hero demo, lobby, projector, active session, quiz covers. The account page is the single decorative use.
- **Restraint:** white canvas, hairlines, few containers. Shadows only on overlays.
- **Anti-references:** violet SaaS dashboards, cards inside cards, uppercase eyebrows, accent-coloured headline words, text arrows, primary-colour quiz shows.
- **Token ownership:** `:root` in `public/style.css` is canonical. The values above mirror it; change both together. `public/mark.svg`, `manifest.json` and the `theme-color` metas repeat `board` and the dark paper.

## Colors

| Token                            | Light                  | Dark                  | Use                                    |
| -------------------------------- | ---------------------- | --------------------- | -------------------------------------- |
| `--board`                        | `#10406F`              | `#144A80`             | Hero, podium, score, projector, covers |
| `--paper`                        | `#FFFFFF`              | `#0A2747`             | Canvas and fields                      |
| `--wash`                         | `#F1F5FA`              | `#0F3159`             | Quiet grouping                         |
| `--ink` / `--muted`              | `#0F1F33` / `#4A5A6D`  | `#F2F6FB` / `#B9CBE0` | Text                                   |
| `--edge`                         | `#76879B`              | `#83A3C6`             | Control outlines (3:1 or better)       |
| `--action`                       | board                  | sun                   | Primary buttons and switches           |
| `--good` / `--danger` / `--warn` | teal / crimson / ochre | light tints           | State, always with text or an icon     |

Four answer colours, **rose, sun, iris, aqua**, belong to answers and to the marks that stand for them. They always carry `--on-chalk` ink text. `--sun` doubles as the primary action on a board and in the dark theme. The palette contains no green; success is teal. Dark mode is the board itself rather than black.

## Typography

- **Kufam** (600) for headings, prompts, PINs and figures. Latin and Kufic were drawn together, so headings keep one voice across scripts.
- **Lexend** for Latin interface text; it was designed for reading fluency.
- **Vazirmatn** for Arabic and Sorani interface text.

The families were chosen after checking glyph coverage. Readex Pro, Rubik and Alexandria lack Sorani letters (ڕ ڵ ۆ ێ ە) and must not be substituted. Kufam sets `ascent-override: 101%` and `descent-override: 29%` so capitals centre in controls. RTL headings drop negative tracking and use 1.4 line height. Sizes are rem, so the 80–150% reader control scales everything. Sentence case throughout.

## Layout

- Public pages: 80rem column, header and footer aligned to it; hero and steps run full bleed.
- Workspace: 15rem rail, 6.5rem below 1100px and in the studio, a five-item bottom bar with More below 760px.
- Studio: questions, canvas, settings; settings drop below the canvas under 1240px.
- Projector: no chrome. Once results exist, answers and distribution sit side by side so a revealed question fits one screen.
- Home on phones puts the PIN before the invitation to create, because phones belong to students.
- Use logical properties only. `--flip` mirrors transforms. User-written text uses `dir="auto"` and `translate="no"`.

## Elevation & Depth

Hierarchy comes from the board, the wash and 1px lines. Dialogs, the notice, the preferences popover and the opened mobile bar are the only shadowed surfaces.

## Shapes

Answer shapes are **dot, eight-point star, pointed cross and arch**, from the region's star-and-cross tilework. Shape, letter and colour always appear together, so colour is never the only signal. Controls 10px, tiles 14px, panels 20px, chips fully round.

## Components

### Foundational visual states

Every control has hover, pressed (scale 0.975), `:focus-visible` (3px focus; sun on boards), disabled and busy. Busy buttons keep their size and show a spinner. Slow routes show the sun bar at the top after 140ms.

### Buttons and actions

`primary`, `sun` (on boards), default outline, `quiet`, `danger` and `danger solid` (final confirmation only), with `small` and `wide` sizes. One primary per view. Destructive actions sit apart from the safe path.

### Navigation and data display

`pageHead`, `capped` lists (20 rows, then Show all; print shows all), `chip` for phases, `figures` for totals, and bounded scrolling tables with sticky headers. A quiz cover holds one mark per question.

### Forms and overlays

`field`, `area`, `select` and `check` in `shared.js` own labels and ids. Validation is inline: text under the field, `aria-invalid`, `aria-describedby`, focus on the first problem, translated. Never call `reportValidity`, `alert` or `confirm`. Passwords have Show/Hide; searches have a clear button. Irreversible actions go through `confirmAction`, which names the consequence and focuses Cancel.

The studio edits options as rows with the correct answer marked on the row. Enter adds a row; pasting a list fills rows; blanks are dropped on save. The stored format is unchanged.

### Iconography

Lucide, 24px grid, 1.75 stroke, inlined in `icons.js`. Directional icons mirror in RTL. Icon-only buttons need an accessible name.

### Motion

Feedback 120–200ms with `--ease`. Two authored moments: seats filling and regrouping in the hero, and the question arriving on participant screens. Runners on the leaderboard travel from their previous score. Everything collapses under `prefers-reduced-motion`. No animation library: the Content Security Policy allows only first-party scripts and forbids inline styles, so motion uses CSS, WAAPI and CSSOM.

### Content and data visualization

Plain verbs, and one name per action through its whole flow. Empty states say what will appear and offer the next step. Distributions use answer colours with counts and percentages as text.

## Do's and Don'ts

- **Do** show counts with marks before reaching for a chart.
- **Do** check every new screen in Sorani, dark, at 360px and at 150% text.
- **Don't** add inline `style` attributes, remote fonts or CDN scripts; the CSP blocks them.
- **Don't** use answer colours for decoration outside answers, format figures and covers.
- **Don't** add green; success is teal.

## Verification

`npm run e2e` runs `tests/browser/design.spec.mjs`: axe WCAG A/AA and overflow on 19 routes at 1440, 820 and 360px in light English and dark Sorani, 150% text, hero, validation, option rows, dialogs, draft preservation and phone navigation.
