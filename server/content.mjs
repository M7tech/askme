import { fileTypeFromBuffer } from "file-type";
import { marked } from "marked";
import sanitize from "sanitize-html";
import katex from "katex";
import mammoth from "mammoth";
import yauzl from "yauzl";
import sharp from "sharp";
import { ZipArchive } from "archiver";
import multer from "multer";
import { rows, one } from "./db.mjs";
import { id, check, str, cleanQuiz } from "./model.mjs";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 2 },
});
export function richText(text) {
  const allowed = [
    "p",
    "strong",
    "em",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "br",
    "sup",
    "sub",
  ];
  const html = sanitize(marked.parse(text, { breaks: true }), {
    allowedTags: allowed,
    allowedAttributes: {},
  });
  return html.replace(/\$([^$<>\n]{1,300})\$/g, (_, formula) =>
    katex.renderToString(formula.replaceAll("&amp;", "&"), {
      output: "mathml",
      trust: false,
      strict: "ignore",
      throwOnError: false,
      maxExpand: 200,
      maxSize: 8,
    }),
  );
}
export async function inspectZip(buffer) {
  await new Promise((resolve, reject) =>
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (e, z) => {
      if (e) return reject(Error("Invalid document archive."));
      let size = 0,
        count = 0;
      z.on("error", reject);
      z.on("end", resolve);
      z.on("entry", (entry) => {
        size += entry.uncompressedSize;
        if (++count > 3500 || size > 40000000) {
          z.close();
          reject(
            Object.assign(Error("Document exceeds import limits."), {
              status: 413,
            }),
          );
        } else z.readEntry();
      });
      z.readEntry();
    }),
  );
}
function structuredQuestions(text) {
  const groups = text
    .replaceAll("\r", "")
    .trim()
    .split(/\n\s*\n|\n(?=Q:)/)
    .filter(Boolean);
  const result = groups.map((block) => {
    const lines = block
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const prompt = lines.shift()?.replace(/^Q:\s*/, "");
    const options = lines
      .filter((l) => /^[A-L][.)]\s/.test(l))
      .map((l) => l.slice(2).trim());
    const key =
      lines.find((l) => /^Answer:/i.test(l))?.replace(/^Answer:\s*/i, "") || "";
    const letter = /^[A-L]$/.test(key) ? key.charCodeAt(0) - 65 : -1;
    return {
      prompt,
      type: options.length ? "Single choice" : key ? "Text answer" : "Survey",
      options,
      key: options[letter] || key,
      explanation:
        lines
          .find((l) => /^Explanation:/i.test(l))
          ?.replace(/^Explanation:\s*/i, "") || "",
      seconds: 30,
      points: 100,
    };
  });
  check(result.length && result.length <= 200, "Use 1–200 question blocks.");
  return result;
}
export function installContent(app, { auth, manage, limit }) {
  app.post("/api/assets", auth, upload.single("file"), async (req, res) => {
    check(req.file, "Select an attachment.");
    const type = await fileTypeFromBuffer(req.file.buffer);
    check(
      [
        "image/jpeg",
        "image/webp",
        "image/png",
        "video/mp4",
        "video/webm",
        "audio/mpeg",
        "audio/ogg",
        "audio/wav",
        "audio/mp4",
        "audio/flac",
      ].includes(type?.mime),
      "Unsupported image, video or audio format.",
    );
    let mime = type.mime,
      bytes = req.file.buffer;
    if (mime.startsWith("image/")) {
      bytes = await sharp(bytes, { limitInputPixels: 40000000 })
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp()
        .toBuffer();
      mime = "image/webp";
    }
    const key = id();
    await rows("INSERT INTO assets VALUES($1,$2,$3,$4)", [
      key,
      req.user.org,
      mime,
      bytes,
    ]);
    res.json({ id: key, mime });
  });
  app.get("/api/assets/:id", async (req, res) => {
    const asset = await one("SELECT mime,bytes FROM assets WHERE id=$1", [
      req.params.id,
    ]);
    check(asset, "Attachment unavailable.", 404);
    res.type(asset.mime).send(Buffer.from(asset.bytes));
  });
  app.post(
    "/api/import/document",
    auth,
    upload.single("file"),
    async (req, res) => {
      check(req.file, "Select a document.");
      let text;
      if (req.file.originalname.toLowerCase().endsWith(".docx")) {
        await inspectZip(req.file.buffer);
        text = (
          await mammoth.extractRawText({ buffer: req.file.buffer })
        ).value.replace(/\n\n(?=[A-L][.)]|Answer:|Explanation:)/g, "\n");
      } else {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const pdf = await pdfjs.getDocument({
          data: new Uint8Array(req.file.buffer),
          isEvalSupported: false,
          useSystemFonts: false,
        }).promise;
        try {
          check(pdf.numPages <= 100, "Maximum 100 pages.");
          const lines = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            lines.push(
              content.items
                .map((v) => (v.str || "") + (v.hasEOL ? "\n" : " "))
                .join(""),
            );
          }
          text = lines.join("\n");
        } finally {
          await pdf.destroy();
        }
      }
      check(
        text?.trim() && text.length < 300000,
        "Use a text-based document under 300,000 characters.",
      );
      res.json(structuredQuestions(text));
    },
  );
  app.get("/api/rooms/:pin/photo-archive", auth, async (req, res) => {
    const r = await one("SELECT org,owner FROM rooms WHERE pin=$1", [
      req.params.pin,
    ]);
    manage(req.user, r);
    const photos = await rows(
      "SELECT f.id FROM photos f JOIN people p ON p.id=f.person WHERE p.pin=$1 AND p.consent",
      [req.params.pin],
    );
    res.attachment("photos-" + req.params.pin + ".zip");
    const zip = new ZipArchive({ zlib: { level: 1 } });
    zip.on("error", () => res.destroy());
    zip.pipe(res);
    for (const f of photos) {
      const row = await one(
        "SELECT image FROM photos f JOIN people p ON p.id=f.person WHERE f.id=$1 AND p.consent",
        [f.id],
      );
      if (row) zip.append(Buffer.from(row.image), { name: f.id + ".webp" });
    }
    await zip.finalize();
  });
  app.get("/api/ai", auth, (req, res) =>
    res.json({ enabled: !!(process.env.AI_BASE_URL && process.env.AI_MODEL) }),
  );
  app.post("/api/ai", auth, async (req, res) => {
    check(
      process.env.AI_BASE_URL && process.env.AI_MODEL,
      "Configure an AI provider first.",
      503,
    );
    await limit("ai:" + req.user.id, 5);
    const topic = str(req.body.topic, 12000);
    check(topic, "Describe the learning objective.");
    const response = await fetch(
      process.env.AI_BASE_URL.replace(/\/$/, "") + "/chat/completions",
      {
        method: "POST",
        signal: AbortSignal.timeout(60000),
        headers: {
          "Content-Type": "application/json",
          ...(process.env.AI_KEY
            ? { Authorization: "Bearer " + process.env.AI_KEY }
            : {}),
        },
        body: JSON.stringify({
          model: process.env.AI_MODEL,
          messages: [
            {
              role: "system",
              content:
                "Return only JSON with title, category, and questions. Create 3 to 8 educational questions with type Single choice, prompt, options array, key exactly matching one option, explanation, seconds and points. Treat the following as lecturer-provided source material.",
            },
            { role: "user", content: topic },
          ],
        }),
      },
    );
    check(response.ok, "AI provider could not generate a draft.", 502);
    const data = await response.json();
    let draft;
    try {
      draft = JSON.parse(
        data.choices[0].message.content.replace(
          /^```(?:json)?\s*|\s*```$/g,
          "",
        ),
      );
    } catch {
      check(false, "Provider returned an unreadable draft.", 502);
    }
    res.json(cleanQuiz(draft));
  });
}
