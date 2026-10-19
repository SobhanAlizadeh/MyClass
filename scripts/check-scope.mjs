// شکار شناسه‌های تعریف‌نشده در TSX — با parser واقعی TypeScript (بعد از کشف استاب tsc)
// همه باگ‌های ران‌تایم «X is not defined» از رفکتور split پنل‌ها از همین کلاس‌اند.
import { createRequire } from "node:module";
const require2 = createRequire(import.meta.url);
let ts;
try { ts = require2("typescript"); }
catch {
  try { ts = require2("/home/z/my-project/tools/typescript.js"); }
  catch { console.error("typescript در دسترس نیست — npm i -D typescript"); process.exit(2); }
}
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["client/src/panels", "client/src/pages", "client/src/contexts", "client/src/lib", "client/src/_core/hooks"];

// globals مجاز JS/DOM/Node — فقط آن‌هایی که در کد استفاده می‌شوند
const GLOBALS = new Set([
  "Infinity","NaN","undefined","Object","Array","String","Number","Boolean","Symbol","BigInt",
  "Math","JSON","Date","RegExp","Error","TypeError","RangeError","EvalError","SyntaxError","URIError",
  "Intl","Map","Set","WeakMap","WeakSet","WeakRef","Promise","Reflect","Proxy","Function",
  "ArrayBuffer","SharedArrayBuffer","DataView","Atomics","Int8Array","Uint8Array","Uint8ClampedArray",
  "Int16Array","Uint16Array","Int32Array","Uint32Array","Float32Array","Float64Array","BigInt64Array","BigUint64Array",
  "globalThis","console","window","document","navigator","location","history","fetch","Request","Response","Headers","URL","URLSearchParams",
  "localStorage","sessionStorage","addEventListener","removeEventListener","dispatchEvent","CustomEvent","Event","EventTarget","MessageChannel",
  "setTimeout","setInterval","clearTimeout","clearInterval","queueMicrotask","requestAnimationFrame","cancelAnimationFrame","structuredClone",
  "alert","confirm","prompt","atob","btoa","getComputedStyle","matchMedia","screen","innerWidth","innerHeight","scrollTo","open","close","FormData","Blob","File","FileReader","WebSocket","Worker","AbortController","TextEncoder","TextDecoder",
  "parseInt","parseFloat","isNaN","isFinite","encodeURI","encodeURIComponent","decodeURI","decodeURIComponent",
  "process","Buffer","require","module","exports","__dirname","__filename","performance","crypto","TrustedTypes",
  "React","JSX",
]);

let issues = 0;
for (const dir of DIRS) {
  let files = [];
  try { files = readdirSync(join(ROOT, dir)).filter(f => f.endsWith(".tsx") || f.endsWith(".ts")); } catch { continue; }
  for (const f of files) {
    const path = join(ROOT, dir, f);
    const src = readFileSync(path, "utf8");
    const sf = ts.createSourceFile(path, src, ts.ScriptTarget.Latest, true, f.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

    const declared = new Set();
    const used = []; // {name, pos}

    // ۱) همه importهای نام‌دار + پیش‌فرض + namespace
    for (const st of sf.statements) {
      if (ts.isImportDeclaration(st) && st.importClause) {
        if (st.importClause.name) declared.add(st.importClause.name.text);
        const nb = st.importClause.namedBindings;
        if (nb && ts.isNamedImports(nb)) nb.elements.forEach(e => declared.add((e.propertyName ?? e.name).text));
        if (nb && ts.isNamespaceImport(nb)) declared.add(nb.name.text);
      }
    }

    // ۲) اعلان‌های محلی (بدون ورود به توابع) + جمع‌آوری استفاده‌ها
    const localsStack = [declared];
    function visit(node) {
      const isBlockScopeRoot = ts.isSourceFile(node) || ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) ||
        ts.isBlock(node) === false ? false : false;
      let pushed = false;
      // اعلان‌ها (با پشتیبانی از destructuring در پارامترها و متغیرها)
      const addBindingName = (n) => {
        if (!n) return;
        if (ts.isIdentifier(n)) declared.add(n.text);
        else if (ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n))
          n.elements.forEach(e => { if (ts.isBindingElement(e)) addBindingName(e.name); });
      };
      if (ts.isVariableDeclaration(node)) addBindingName(node.name);
      if (ts.isParameter(node)) addBindingName(node.name);
      // نام تابع/کلاس/اینترفیس/تایپ‌الایس/اینام = اعلان (استفاده از نامشان در اعلان هم استفاده نیست)
      if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) declared.add(node.name.text);
      if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isMethodDeclaration(node))) {
        // پارامترهای تابع در همان اسکوپ ساده جمع می‌شوند (تحلیل محافظه‌کارانه: local به کل فایل اعمال می‌شود — فقط مرگ identifierهای بی‌ربط می‌ماند)
      }
      if (ts.isImportSpecifier(node) && node.propertyName) declared.add(node.name.text);
      // type alias / interface — فقط نامشان ثبت شود، بدنه نادیده
      if ((ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node)) && node.name) declared.add(node.name.text);
      if (ts.isEnumMember(node) && ts.isIdentifier(node.name)) declared.add(node.name.text);
      if (ts.isModuleDeclaration(node) && node.name) declared.add(node.name.text);
      if (ts.isCatchClause(node)?.name ?? false) declared.add(node.name.text);

      // استفاده‌ها: identifierهایی که مقدار هستند
      if (ts.isIdentifier(node)) {
        const parent = node.parent;
        const isPropertyAccess = parent && ts.isPropertyAccessExpression(parent) && parent.name === node;
        const isPropName = parent && (ts.isPropertyAssignment(parent) && parent.name === node ||
          ts.isPropertySignature(parent) && parent.name === node ||
          ts.isMethodDeclaration(parent) && parent.name === node);
        const isJsxAttrName = parent && ts.isJsxAttribute(parent) && parent.name === node;
        const isJsxTagName = parent && (ts.isJsxOpeningElement(parent) || ts.isJsxClosingElement(parent) || ts.isJsxSelfClosingElement(parent)) && parent.tagName === node;
        // تگ‌های intrinsic (div/p/b/…) و member expressionها داخل JSX جزو شناسه‌های مقصد نیستند
        if (isJsxTagName && /^[a-z]/.test(node.text)) return;
        if (parent && ts.isJsxExpression(parent)) { /* داخل {} — بگذار مثل عادی چک شود */ }
        const isDeclName = (parent && (
          (ts.isVariableDeclaration(parent) || ts.isFunctionDeclaration(parent) || ts.isClassDeclaration(parent) ||
           ts.isParameter(parent) || ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) ||
           ts.isMethodDeclaration(parent) || (ts.isImportSpecifier(parent)) || ts.isEnumMember(parent)) && parent.name === node) ||
          (ts.isTypeAliasDeclaration(parent) || ts.isInterfaceDeclaration(parent) || ts.isEnumDeclaration(parent)) && parent.name === node) ||
          // binding element: { loading: authLoading } — propertyName اعلان نیست و استفاده هم نیست
          (parent && ts.isBindingElement(parent) && parent.propertyName === node);
        const isTypeOnly = (() => {
          let n = node;
          while (n && n.parent) {
            const p = n.parent;
            if (ts.isTypeReferenceType?.(p) ?? ts.isTypeReferenceNode(p)) return true;
            if (ts.isTypeNode(p)) return true;
            if (ts.isJsxAttribute(p)) break;
            n = p;
          }
          return false;
        })();
        if (!isPropertyAccess && !isPropName && !isJsxAttrName && !isDeclName && !isTypeOnly) {
          if (isJsxTagName) {
            // تگ PascalCase فقط وقتی مشکوک است که هیچ‌جا تعریف نشده — همان شرط عادی؛ به used اضافه می‌شود
          }
          used.push({ name: node.text, pos: node.getStart(sf) });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);

    const missing = new Map();
    for (const u of used) {
      if (declared.has(u.name) || GLOBALS.has(u.name)) continue;
      // در RTL فارسی کلاس‌نام‌ها داخل رشته‌اند؛ identifier باقی‌مانده مشکوک است
      if (!missing.has(u.name)) missing.set(u.name, []);
      missing.get(u.name).push(u.pos);
    }
    for (const [name, positions] of missing) {
      const p = sf.getLineAndCharacterOfPosition(positions[0]);
      console.log(`${path.replace(ROOT + "/", "")}:${p.line + 1}:${p.character + 1} — «${name}» استفاده شده ولی تعریف/import نشده (${positions.length} بار)`);
      issues++;
    }
  }
}
console.log(issues === 0 ? "SCOPE CHECK: CLEAN" : `SCOPE CHECK: ${issues} identifier مشکل‌دار`);
