import sys; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from snippets import *
excel_cjs = EXCEL.replace('// npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz\nimport * as XLSX from "xlsx";\n', 'const XLSX = require(process.env.XLSX_MODULE || "xlsx");\n')
out = f'''// Runs every code example from blog/csv-importers-real-excel-files. Run: node tests/article-examples.cjs
// Generated from the same source as the article, so the two never drift apart.
const assert = require("assert");
let n = 0;
const ok = (name, fn) => {{ Promise.resolve().then(fn).then(() => {{ n++; console.log("PASS " + name); }}).catch((e) => {{ console.log("FAIL " + name + "  -> " + e.message); process.exitCode = 1; }}); }};

{HEADER}

{TOTALS}

{DATES}

{NUMBERS}

{ENCODING}

ok("header on row 3", () => assert.strictEqual(findHeaderRow([["Export (do not edit)"], [], ["Name", "Email", "Plan"], ["Yui", "yui@example.jp", "Pro"]]), 2));
ok("header on row 1", () => assert.strictEqual(findHeaderRow([["Name", "Email"], ["A", "a@example.com"]]), 0));
ok("totals rows", () => {{ assert(isTotalsRow(["Total", "", "227"])); assert(isTotalsRow(["", "Grand total", "9"])); assert(isTotalsRow(["合計", "", "1"])); assert(isTotalsRow(["Summe", "1"])); assert(!isTotalsRow(["Totally Fit Ltd", "x"])); }});
ok("date order", () => {{ assert.strictEqual(dateOrder(["04/05/2026", "31/01/2026"]), "dmy"); assert.strictEqual(dateOrder(["04/05/2026", "01/31/2026"]), "mdy"); assert.strictEqual(dateOrder(["04/05/2026"]), null); }});
ok("amounts", () => {{ assert.strictEqual(parseAmount("1.234,50", true), 1234.5); assert.strictEqual(parseAmount("1,234.50", false), 1234.5); assert.strictEqual(parseAmount("49,00", usesDecimalComma(["49,00", "129"])), 49); assert.strictEqual(parseAmount("€ 99,90", true), 99.9); assert.strictEqual(parseAmount("abc", false), null); }});
const file = (bytes) => ({{ arrayBuffer: async () => Uint8Array.from(bytes).buffer }});
ok("utf-8 text", async () => assert.strictEqual(await readText(file([...Buffer.from("Café")])), "Café"));
ok("utf-16 with BOM", async () => assert.strictEqual(await readText(file([0xff, 0xfe, ...Buffer.from("Hi", "utf16le")])), "Hi"));
ok("windows-1252 fallback", async () => assert.strictEqual(await readText(file([0x43, 0x61, 0x66, 0xe9])), "Café"));
ok("shift_jis decoder exists", () => assert.strictEqual(new TextDecoder("shift_jis").decode(Uint8Array.from([0x93, 0xfa, 0x96, 0x7b])), "日本"));
'''
if len(sys.argv) > 1:
    out += f'''
{excel_cjs}
ok("excel: skips empty first sheet and returns ISO dates", async () => {{
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "Cover");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Name", "Joined"], ["A", new Date(Date.UTC(2026, 3, 3))]]), "Data");
  const bytes = XLSX.write(wb, {{ type: "array", bookType: "xlsx" }});
  const rows = await readWorkbook({{ arrayBuffer: async () => bytes }});
  assert.deepStrictEqual(rows[0], ["Name", "Joined"]);
  assert.match(String(rows[1][1]), /^2026-04-0[23]$/);
}});
'''
open(sys.argv[1] if len(sys.argv) > 1 else "/dev/stdout", "w").write(out)
