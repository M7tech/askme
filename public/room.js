// The room: one mark per answer. Four shapes from star-and-cross tilework.
const star = Array.from({ length: 16 }, (_, i) => {
  const radius = i % 2 ? 8.6 : 11.4,
    angle = (Math.PI * i) / 8;
  return (
    (12 + radius * Math.sin(angle)).toFixed(2) +
    " " +
    (12 - radius * Math.cos(angle)).toFixed(2)
  );
}).join("L");
const shapes = [
  "M12 2a10 10 0 1 1 0 20a10 10 0 1 1 0-20Z",
  "M" + star + "Z",
  "M12 .8l4.4 4.4v2.4h2.4l4.4 4.4-4.4 4.4h-2.4v2.4L12 23.2l-4.4-4.4v-2.4H5.2L.8 12l4.4-4.4h2.4V5.2Z",
  "M3.5 22V11.5C3.5 6 8 3.4 12 1.2c4 2.2 8.500 4.800 8.500 10.300V22Z",
];
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** One answer shape as a standalone glyph. */
function mark(index, extra = "") {
  const n = index % 4;
  return `<svg class="mark mark-${n} ${extra}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${shapes[n]}"/></svg>`;
}

/** Seats on lecture-hall arcs, front row first. */
function seats(rows) {
  return rows.flatMap((count, row) => {
    const radius = 122 + row * 46,
      spread = 1.06;
    return Array.from({ length: count }, (_, i) => {
      const angle = count === 1 ? 0 : -spread + (2 * spread * i) / (count - 1);
      return {
        x: 320 + radius * Math.sin(angle),
        y: 404 - radius * Math.cos(angle),
      };
    });
  });
}
const hall = [9, 12, 15, 18, 21, 24];
const capacity = hall.reduce((a, b) => a + b, 0);

/** Static room with the first `filled` seats taken. */
function roomFigure(filled, extra = "") {
  return `<svg class="room ${extra}" viewBox="0 16 640 396" aria-hidden="true" focusable="false">${seats(
    hall,
  )
    .map((p, i) => {
      const taken = i < filled,
        n = (i * 7 + (i % 5) * 3) % 4;
      return `<path class="${taken ? "mark-" + n : "vacant"}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${taken ? 0.98 : 0.42}) translate(-12 -12)" d="${shapes[taken ? n : 0]}"/>`;
    })
    .join("")}<path class="lectern" d="M262 404h116"/></svg>`;
}

/** Answered / total as marks, falling back to a bar for large rooms. */
function tally(done, total, label) {
  if (!total) return "";
  if (total > 120)
    return `<progress value="${done}" max="${total}" aria-label="${label}"></progress>`;
  return `<div class="tally" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<i${i < done ? ' class="on"' : ""}></i>`).join("")}</div>`;
}

/** A quiz cover: one mark per question. */
function cover(title, count) {
  let seed = 7;
  for (const c of String(title)) seed = (seed * 31 + c.codePointAt(0)) >>> 0;
  const shown = Math.min(Number(count) || 0, 18);
  return `<div class="cover${shown <= 5 ? " roomy" : ""}" aria-hidden="true">${Array.from(
    { length: shown },
    (_, i) => mark((seed >>> ((i * 2) % 28)) + i),
  ).join("")}</div>`;
}

/**
 * The hero: a room mid-question. Choosing an answer seats the visitor, then
 * the whole room regroups into the distribution.
 */
function liveRoom(root, { options, key, counts, format, label }) {
  const svg = root.querySelector("svg"),
    points = seats(hall),
    mine = hall[0] + hall[1] + 7,
    paths = [];
  // Deterministic answer per seat that satisfies the final counts.
  const pool = counts.flatMap((n, i) => Array(n).fill(i));
  const answers = points.map((_, i) => pool[(i * 37) % pool.length]);
  const order = points
    .map((_, i) => i)
    .filter((i) => i !== mine)
    .sort((a, b) => ((a * 61) % 97) - ((b * 61) % 97));
  const ns = "http://www.w3.org/2000/svg";
  const layer = document.createElementNS(ns, "g");
  svg.append(layer);
  points.forEach((p) => {
    const g = document.createElementNS(ns, "g"),
      path = document.createElementNS(ns, "path");
    g.setAttribute("class", "seat");
    g.style.transform = `translate(${p.x}px, ${p.y}px)`;
    path.setAttribute("d", shapes[0]);
    path.setAttribute("class", "vacant");
    path.setAttribute("transform", "scale(.42) translate(-12 -12)");
    g.append(path);
    layer.append(g);
    paths.push(path);
  });
  const ring = document.createElementNS(ns, "circle");
  ring.setAttribute("class", "you");
  ring.setAttribute("r", "15");
  paths[mine].parentNode.append(ring);
  const columns = document.createElementNS(ns, "g");
  columns.setAttribute("class", "columns");
  svg.append(columns);
  const fill = (i, value) => {
    const p = paths[i];
    p.setAttribute("d", shapes[value]);
    p.setAttribute("class", "mark-" + value);
    p.setAttribute("transform", "scale(.98) translate(-12 -12)");
    if (!reduced())
      p.parentNode.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 220,
        easing: "ease-out",
      });
  };
  let timer,
    cursor = 0,
    picked = null;
  const arrive = (limit) => {
    if (reduced()) {
      while (cursor < limit) fill(order[cursor], answers[order[cursor++]]);
      return;
    }
    timer = setInterval(() => {
      if (!svg.isConnected || cursor >= limit) return clearInterval(timer);
      fill(order[cursor], answers[order[cursor++]]);
    }, 26);
  };
  arrive(Math.round(order.length * 0.72));
  const regroup = () => {
    const stacks = [[], [], [], []];
    points.forEach((_, i) => stacks[i === mine ? picked : answers[i]].push(i));
    columns.replaceChildren();
    stacks.forEach((stack, c) => {
      const cx = 98 + c * 148;
      // The visitor's mark leads its column so it stays easy to find.
      stack.sort((a, b) => (b === mine) - (a === mine));
      stack.forEach((seat, n) => {
        const g = paths[seat].parentNode;
        g.style.transitionDelay = reduced() ? "0s" : (seat % 23) * 9 + "ms";
        g.style.transform = `translate(${cx - 46 + (n % 5) * 23}px, ${356 - Math.floor(n / 5) * 25}px)`;
      });
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", cx);
      text.setAttribute("y", 400);
      text.textContent = format(stack.length);
      if (options[c] === key) text.setAttribute("class", "right");
      columns.append(text);
    });
  };
  const reset = () => {
    picked = null;
    points.forEach((p, i) => {
      const g = paths[i].parentNode;
      g.style.transform = `translate(${p.x}px, ${p.y}px)`;
    });
    paths[mine].setAttribute("d", shapes[0]);
    paths[mine].setAttribute("class", "vacant");
    paths[mine].setAttribute("transform", "scale(.42) translate(-12 -12)");
    root.classList.remove("grouped");
    columns.replaceChildren();
  };
  svg.setAttribute("aria-label", label);
  return {
    pick(value) {
      clearInterval(timer);
      picked = value;
      while (cursor < order.length)
        fill(order[cursor], answers[order[cursor++]]);
      fill(mine, value);
      root.classList.add("grouped");
      regroup();
    },
    reset,
  };
}
export { mark, roomFigure, tally, cover, liveRoom, capacity };
