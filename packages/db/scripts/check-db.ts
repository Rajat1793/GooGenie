import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(fileURLToPath(import.meta.url));
// eslint-disable-next-line
const Db = require("better-sqlite3");
const db = new Db("./corsair.db");
// eslint-disable-next-line
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log("Tables in corsair.db:", JSON.stringify(tables, null, 2));
process.exit(0);
