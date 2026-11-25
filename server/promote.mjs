import { one } from "./db.mjs";
const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw Error("Pass the existing account email as an argument.");
const user = await one(
  "UPDATE users SET role='super' WHERE email=$1 RETURNING email",
  [email],
);
if (!user) throw Error("Account does not exist.");
console.log("Granted platform administration to " + user.email);
process.exit(0);
