import QRCode from "qrcode";
import { inspectZip } from "./content.mjs";
import { preferences } from "./admin.mjs";
import multer from "multer";
import sharp from "sharp";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import { rows, one, transaction } from "./db.mjs";
import { check, str, id, hash } from "./model.mjs";
import { personFor } from "./rooms.mjs";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 5 },
});
export function installMedia(app, { auth, manage, notify, limit }) {
  async function access(req) {
    const r = await one("SELECT org,owner,config FROM rooms WHERE pin=$1", [
      req.params.pin,
    ]);
    check(r, "Room unavailable.", 404);
    const p = await personFor(req, req.params.pin);
    if (!p) manage(req.user || {}, r);
    return { p, r };
  }
  app.get("/api/rooms/:pin/identification", async (req, res) => {
    const p = await personFor(req, req.params.pin);
    check(p, "Participant access required.", 403);
    const base =
      process.env.PUBLIC_ORIGIN || req.protocol + "://" + req.get("host");
    res.type("image/png").send(
      await QRCode.toBuffer(base + "/#/host-gallery/" + p.pin + "/" + p.id, {
        width: 512,
      }),
    );
  });
  app.post("/api/rooms/:pin/consent", async (req, res) => {
    const p = await personFor(req, req.params.pin);
    check(p, "Participant access required.", 403);
    await transaction(async (c) => {
      const allowed = req.body.consent === true,
        publicAllowed = allowed && req.body.publicPhoto === true;
      await c.query(
        "UPDATE people SET consent=$1,public_photo=$2 WHERE id=$3",
        [allowed, publicAllowed, p.id],
      );
      await c.query("INSERT INTO consent_records VALUES($1,$2,$3,$4,$5)", [
        id(),
        p.id,
        allowed,
        publicAllowed,
        Date.now(),
      ]);
      if (!publicAllowed)
        await c.query("UPDATE photos SET published=false WHERE person=$1", [
          p.id,
        ]);
      if (!allowed) await c.query("DELETE FROM photos WHERE person=$1", [p.id]);
    });
    res.json({ ok: true });
  });
  app.post(
    "/api/rooms/:pin/photos",
    async (req, res, next) => {
      req.access = await access(req);
      await limit("upload:" + (req.access.p?.id || req.user.id), 15);
      next();
    },
    upload.single("image"),
    async (req, res) => {
      const { p, r } = req.access;
      const who = p?.id || str(req.body.person);
      check(
        r.config.photography && req.file,
        "Photography must be enabled and an image selected.",
      );
      const allowed = await one(
        "SELECT consent,guardian_reference FROM people WHERE id=$1 AND pin=$2",
        [who, req.params.pin],
      );
      check(allowed?.consent, "Participant consent is required.", 403);
      check(
        !r.config.guardian || allowed.guardian_reference,
        "A presenter must record verified guardian authorization first.",
        403,
      );
      const input = sharp(req.file.buffer, { limitInputPixels: 40000000 });
      const meta = await input.metadata();
      check(
        ["jpeg", "png", "webp"].includes(meta.format),
        "Choose a JPEG, PNG or WebP image.",
      );
      const settings = await preferences("platform");
      const dimension = settings.maxDimension || 1280,
        small = settings.thumbnail || 320;
      const image = await input
        .rotate()
        .resize({
          width: dimension,
          height: dimension,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: settings.quality || 80 })
        .toBuffer();
      const thumb = await sharp(image)
        .resize({
          width: small,
          height: small,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 76 })
        .toBuffer();
      const saved = await transaction(async (c) => {
        const {
          rows: [person],
        } = await c.query(
          "SELECT consent,guardian_reference FROM people WHERE id=$1 FOR UPDATE",
          [who],
        );
        check(
          !r.config.guardian || person?.guardian_reference,
          "Guardian authorization is required.",
          403,
        );
        check(person?.consent, "Consent has been withdrawn.", 403);
        return (
          await c.query(
            "INSERT INTO photos(id,person,moment,image,thumb,created) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
            [id(), who, str(req.body.moment), image, thumb, Date.now()],
          )
        ).rows[0];
      });
      check(saved, "Consent has been withdrawn.", 403);
      await notify(req.params.pin);
      res.json(saved);
    },
  );
  app.patch("/api/rooms/:pin/photos/:id/publish", auth, async (req, res) => {
    const room = await one("SELECT org,owner,config FROM rooms WHERE pin=$1", [
      req.params.pin,
    ]);
    manage(req.user, room);
    check(!room.config.secret, "Private rooms do not publish photos.");
    const row = await one(
      "UPDATE photos SET published=$1 FROM people p WHERE photos.person=p.id AND photos.id=$2 AND p.pin=$3 AND p.consent AND p.public_photo RETURNING photos.id",
      [req.body.published === true, req.params.id, req.params.pin],
    );
    check(row, "Separate public-display consent is required.", 403);
    await notify(req.params.pin);
    res.json(row);
  });
  app.get("/api/rooms/:pin/projected/:id", async (req, res) => {
    const f = await one(
      "SELECT f.thumb FROM photos f JOIN people p ON p.id=f.person JOIN rooms r ON r.pin=p.pin WHERE f.id=$1 AND r.pin=$2 AND f.published AND p.consent AND p.public_photo AND r.config->>'secret'='' AND (r.config->>'expires')::bigint>$3",
      [req.params.id, req.params.pin, Date.now()],
    );
    check(f, "Image unavailable.", 404);
    res.type("image/webp").send(Buffer.from(f.thumb));
  });
  app.get("/api/rooms/:pin/results/photos/:id", async (req, res) => {
    const row = await one(
      "SELECT f.thumb FROM photos f JOIN people p ON p.id=f.person JOIN result_links l ON l.person=p.id WHERE f.id=$1 AND p.pin=$2 AND p.consent AND l.token=$3",
      [req.params.id, req.params.pin, hash(req.get("x-results") || "")],
    );
    check(row, "Image unavailable.", 404);
    res.type("image/webp").send(Buffer.from(row.thumb));
  });
  app.get("/api/rooms/:pin/photos", async (req, res) => {
    const { p } = await access(req);
    res.json(
      await rows(
        "SELECT f.id,f.moment,p.name,p.public_photo,f.published FROM photos f JOIN people p ON f.person=p.id WHERE p.pin=$1 AND p.consent AND ($2::text IS NULL OR p.id=$2) ORDER BY f.created DESC",
        [req.params.pin, p?.id || null],
      ),
    );
  });
  app.get("/api/rooms/:pin/photos/:id", async (req, res) => {
    const { p } = await access(req);
    const f = await one(
      "SELECT " +
        (req.query.thumb ? "thumb" : "image") +
        " AS data FROM photos f JOIN people p ON f.person=p.id WHERE f.id=$1 AND p.pin=$2 AND p.consent AND ($3::text IS NULL OR p.id=$3)",
      [req.params.id, req.params.pin, p?.id || null],
    );
    check(f, "Image unavailable.", 404);
    res.type("image/webp").send(Buffer.from(f.data));
  });
  app.delete("/api/rooms/:pin/photos/:id", async (req, res) => {
    const { p } = await access(req);
    await rows(
      "DELETE FROM photos WHERE id=$1 AND person IN (SELECT id FROM people WHERE pin=$2 AND ($3::text IS NULL OR id=$3))",
      [req.params.id, req.params.pin, p?.id || null],
    );
    res.json({ ok: true });
  });
  app.post("/api/import", auth, upload.single("file"), async (req, res) => {
    check(req.file, "Select a file.");
    let records;
    if (req.file.originalname.toLowerCase().endsWith(".xlsx")) {
      await inspectZip(req.file.buffer);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(req.file.buffer);
      const sheet = book.worksheets[0];
      check(sheet && sheet.actualRowCount <= 201, "Use at most 200 questions.");
      records = sheet
        .getSheetValues()
        .slice(1)
        .map((r) => r.slice(1).map((v) => String(v ?? "")));
    } else
      records = parse(req.file.buffer, { bom: true, skip_empty_lines: true });
    const header = records.shift();
    check(
      header?.includes("prompt") &&
        header.includes("type") &&
        records.length <= 200,
      "Include prompt and type columns.",
    );
    res.json(
      records.map((row) => {
        const q = Object.fromEntries(header.map((k, i) => [k, row[i] || ""]));
        return { ...q, options: (q.options || "").split("|").filter(Boolean) };
      }),
    );
  });
}
