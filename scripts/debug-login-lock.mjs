import { connect } from "@tidbcloud/serverless";
import { readFileSync } from "node:fs";
const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(envText.split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const conn = connect({ url: env.DEV_DATABASE_URL ?? env.DATABASE_URL });
const u = await conn.execute("SELECT id, username, schoolId, platformRole, active, LEFT(passwordHash, 20) ph FROM users WHERE username LIKE 'q4%' OR username LIKE 'p4%' ORDER BY id DESC LIMIT 6");
console.log("users:", JSON.stringify((Array.isArray(u) ? u : u.rows), null, 1));
const la = await conn.execute("SELECT * FROM login_attempts ORDER BY id DESC LIMIT 6").catch(e => ({ err: String(e).slice(0, 80) }));
console.log("login_attempts:", JSON.stringify((Array.isArray(la) ? la : la.rows ?? la), null, 1));
