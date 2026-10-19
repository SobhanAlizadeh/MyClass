// چک سیستماتیک: آیا همه آیکون‌های lucide استفاده‌شده در JSX واقعاً import شده‌اند؟
// (بعد از رفکتور split_panels جاافتادن import ها بی‌صدا کرش ران‌تایم می‌دهد)
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dirs = ["client/src/panels", "client/src/pages"];
let bad = 0;
for (const dir of dirs) {
  for (const f of readdirSync(dir).filter(x => x.endsWith(".tsx"))) {
    const p = join(dir, f);
    const src = readFileSync(p, "utf8");
    // همه importهای نام‌دار از lucide-react
    const imported = new Set();
    for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/g))
      m[1].split(",").forEach(x => { const n = x.trim().split(/\s+as\s+/)[0]; if (n) imported.add(n); });
    // تگ‌های JSX به شکل <PascalCase — generic تایپ (مثل useState<Kind>) حذف می‌شود
    const used = new Set();
    for (const m of src.matchAll(/(?<![A-Za-z0-9_$])<([A-Z][A-Za-z0-9]*)[\s/>]/g)) used.add(m[1]);
    // غیر-lucide ها (کامپوننت‌های داخلی/کتابخانه‌ای) را فیلتر کن: هر تگ PascalCase که import نشده و در همین فایل تعریف نشده = مشکوک
    const defined = new Set([...src.matchAll(/(?:function|const|class)\s+([A-Z][A-Za-z0-9]*)/g)].map(m => m[1]));
    const otherImports = new Set();
    for (const m of src.matchAll(/import\s*(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))\s*from\s*["'][^"']+["']/g)) {
      if (m[1]) m[1].split(",").forEach(x => { const n = x.trim().split(/\s+as\s+/).pop(); if (n) otherImports.add(n); });
      if (m[2]) otherImports.add(m[2]);
      if (m[3]) otherImports.add(m[3]);
    }
    for (const tag of used) {
      if (imported.has(tag) || defined.has(tag) || otherImports.has(tag)) continue;
      // React built-ins که بدون import مجازند
      if (["Fragment", "Suspense", "StrictMode"].includes(tag)) continue;
      console.log(`MISSING in ${p}: <${tag} /> used but never imported/defined`);
      bad++;
    }
  }
}
console.log(bad === 0 ? "OK — همه آیکون‌ها import شده‌اند" : `${bad} مورد گم‌شده`);
process.exit(bad === 0 ? 0 : 1);
