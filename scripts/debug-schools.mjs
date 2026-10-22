import { connect } from "@tidbcloud/serverless";
import { readFileSync } from "node:fs";
const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(envText.split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const url = process.env.DATABASE_URL_OVERRIDE ?? env.DEV_DATABASE_URL ?? env.DATABASE_URL;
const conn = connect({ url });
const schools = await conn.execute("SELECT id, name, code, status FROM schools ORDER BY id DESC LIMIT 8");
console.log("schools:", JSON.stringify((Array.isArray(schools) ? schools : schools.rows), null, 1));
