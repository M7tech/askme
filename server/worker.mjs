import { preferences } from "./admin.mjs";
import { rows } from "./db.mjs";
const days = Number(process.env.RETENTION_DAYS || 90);
if (!Number.isInteger(days) || days < 1)
  throw Error("Set a positive RETENTION_DAYS.");
async function sweep() {
  const retention = (await preferences("platform")).retention || days;
  await rows("DELETE FROM credentials WHERE expires<$1", [Date.now()]);
  await rows("DELETE FROM rooms WHERE (config->>'expires')::bigint<$1", [
    Date.now() - retention * 86400000,
  ]);
  await rows("DELETE FROM photos WHERE created<$1", [
    Date.now() - retention * 86400000,
  ]);
}
await sweep();
setInterval(
  () => sweep().catch((error) => console.error(error.message)),
  3600000,
);
