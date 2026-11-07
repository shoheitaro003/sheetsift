// Runs every code example from the blog posts. Run: node tests/article-examples.cjs
// Generated from the same source as the article, so the two never drift apart.
const assert = require("assert");
let n = 0;
const ok = (name, fn) => { Promise.resolve().then(fn).then(() => { n++; console.log("PASS " + name); }).catch((e) => { console.log("FAIL " + name + "  -> " + e.message); process.exitCode = 1; }); };

function findHeaderRow(rows, scan = 15) {
  let best = 0, bestCount = 0;
  for (let i = 0; i < Math.min(rows.length, scan); i++) {
    const cells = rows[i].map((c) => String(c ?? "").trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const labels = cells.every((c) => !/^[\d\s.,\-\/:$€£¥%]+$/.test(c) && !c.includes("@"));
    const unique = new Set(cells.map((c) => c.toLowerCase())).size === cells.length;
    if (labels && unique && cells.length > bestCount) {
      best = i;
      bestCount = cells.length;
    }
  }
  return best; // 0-based index of the header row
}

const TOTAL = /^(grand\s+)?(sub-?)?totals?\b|^(sum|summe|gesamt)\b|^(合計|小計|総計)/i;

function isTotalsRow(row) {
  const first = row.map((c) => String(c ?? "").trim()).find(Boolean) ?? "";
  return TOTAL.test(first);
}

function dateOrder(values) {
  let dayFirst = false, monthFirst = false;
  for (const v of values) {
    const m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(String(v).trim());
    if (!m) continue;
    if (+m[1] > 12) dayFirst = true;   // 31/01/2026
    if (+m[2] > 12) monthFirst = true; // 01/31/2026
  }
  if (dayFirst === monthFirst) return null; // no evidence, or contradictory: ask the user
  return dayFirst ? "dmy" : "mdy";
}

const usesDecimalComma = (values) =>
  values.some((v) => /^-?\d{1,3}(\.\d{3})*,\d{1,2}$/.test(String(v).trim()));

function parseAmount(raw, decimalComma) {
  let t = String(raw).trim().replace(/[\s ]/g, "").replace(/^[$€£¥]|[$€£¥円]$/g, "");
  t = decimalComma ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

async function readText(file) {
  const buf = await file.arrayBuffer();
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    // Not valid UTF-8. Pick the legacy encoding your users are most likely to have:
    // "windows-1252" for Western Europe and the Americas, "shift_jis" for Japan.
    return new TextDecoder("windows-1252").decode(buf);
  }
}

ok("header on row 3", () => assert.strictEqual(findHeaderRow([["Export (do not edit)"], [], ["Name", "Email", "Plan"], ["Yui", "yui@example.jp", "Pro"]]), 2));
ok("header on row 1", () => assert.strictEqual(findHeaderRow([["Name", "Email"], ["A", "a@example.com"]]), 0));
ok("totals rows", () => { assert(isTotalsRow(["Total", "", "227"])); assert(isTotalsRow(["", "Grand total", "9"])); assert(isTotalsRow(["合計", "", "1"])); assert(isTotalsRow(["Summe", "1"])); assert(!isTotalsRow(["Totally Fit Ltd", "x"])); });
ok("date order", () => { assert.strictEqual(dateOrder(["04/05/2026", "31/01/2026"]), "dmy"); assert.strictEqual(dateOrder(["04/05/2026", "01/31/2026"]), "mdy"); assert.strictEqual(dateOrder(["04/05/2026"]), null); });
ok("amounts", () => { assert.strictEqual(parseAmount("1.234,50", true), 1234.5); assert.strictEqual(parseAmount("1,234.50", false), 1234.5); assert.strictEqual(parseAmount("49,00", usesDecimalComma(["49,00", "129"])), 49); assert.strictEqual(parseAmount("€ 99,90", true), 99.9); assert.strictEqual(parseAmount("abc", false), null); });
const file = (bytes) => ({ arrayBuffer: async () => Uint8Array.from(bytes).buffer });
ok("utf-8 text", async () => assert.strictEqual(await readText(file([...Buffer.from("Café")])), "Café"));
ok("utf-16 with BOM", async () => assert.strictEqual(await readText(file([0xff, 0xfe, ...Buffer.from("Hi", "utf16le")])), "Hi"));
ok("windows-1252 fallback", async () => assert.strictEqual(await readText(file([0x43, 0x61, 0x66, 0xe9])), "Café"));
ok("shift_jis decoder exists", () => assert.strictEqual(new TextDecoder("shift_jis").decode(Uint8Array.from([0x93, 0xfa, 0x96, 0x7b])), "日本"));

// --- blog/parse-european-number-formats-javascript ---
ok("eu: the problem is real", () => { assert.strictEqual(parseFloat("1.234,56"), 1.234); assert(Number.isNaN(Number("1.234,56"))); assert(Number.isNaN(Number("1,234.56"))); assert.strictEqual(parseFloat("1,234.56"), 1); assert.strictEqual(typeof Intl.NumberFormat.prototype.parse, "undefined"); });
function splitSign(raw) {
  let t = String(raw ?? "").trim()
    .replace(/[\s\u00a0\u202f'’]/g, "")                // spaces, no-break spaces, apostrophes
    .replace(/^[A-Z]{3}(?=[-+\u2212(\d.,])/i, "")      // EUR 1.234,56
    .replace(/([\d.,)\-\u2212])[A-Z]{3}$/i, "$1")     // 1.234,56 EUR
    .replace(/[$€£¥₹]|円$/g, "");
  let negative = false;
  if (/^\(.+\)$/.test(t)) { negative = true; t = t.slice(1, -1); }   // (1,234.56)
  if (/^[-\u2212]/.test(t)) { negative = !negative; t = t.slice(1); } // -1.234,56 and U+2212
  else if (/[-\u2212]$/.test(t)) { negative = !negative; t = t.slice(0, -1); } // 1.234,56-
  else if (t.startsWith("+")) t = t.slice(1);
  return /^[\d.,]*\d[\d.,]*$/.test(t) ? { negative, body: t } : null;
}

const GROUPS = {
  ".": /^\d{1,3}(\.\d{3})+$|^\d{1,2}(\.\d{2})*\.\d{3}$/,
  ",": /^\d{1,3}(,\d{3})+$|^\d{1,2}(,\d{2})*,\d{3}$/, // also 12,34,567 (India)
};

function toNumber({ negative, body }, decimal) {
  const group = decimal === "," ? "." : ",";
  const [int, frac, extra] = body.split(decimal);
  if (extra !== undefined) return null;                    // 1,2,3 with "," as decimal
  if (frac !== undefined && frac.includes(group)) return null; // 1,23.4 with "," as decimal
  if (int.includes(group) && !GROUPS[group].test(int)) return null; // 1.23 with "," as decimal
  const n = Number(int.split(group).join("") + (frac !== undefined ? "." + frac : ""));
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

function localeSeparators(locale) {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.891);
  const find = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return { group: find("group"), decimal: find("decimal") };
}

function parseLocaleNumber(raw, locale) {
  const s = splitSign(raw);
  return s ? toNumber(s, localeSeparators(locale).decimal) : null;
}

function decimalVote(body) {
  const dot = body.lastIndexOf("."), comma = body.lastIndexOf(",");
  if (dot >= 0 && comma >= 0) return dot > comma ? "." : ",";  // 1.234,56 or 1,234.56
  const sep = dot >= 0 ? "." : comma >= 0 ? "," : null;
  if (!sep) return null;                                      // 1234: no evidence
  const other = sep === "." ? "," : ".";
  if (body.indexOf(sep) !== body.lastIndexOf(sep)) return other; // 1.234.567: grouping
  const [int, frac] = body.split(sep);
  if (frac.length !== 3 || int === "" || int === "0") return sep; // 12,5 / 0,125 / ,5
  return null;                                                // 1,234 or 1.234: could be either
}

function detectDecimalSeparator(values) {
  const votes = new Set();
  for (const v of values) {
    const s = splitSign(v);
    const vote = s && decimalVote(s.body);
    if (vote) votes.add(vote);
  }
  return votes.size === 1 ? [...votes][0] : null; // none, or contradictory: ask the user
}

function parseNumberColumn(values, chosenLocale) {
  const decimal = detectDecimalSeparator(values)
    ?? (chosenLocale ? localeSeparators(chosenLocale).decimal : null);
  if (!decimal) return { decimal: null, numbers: null }; // show the column and ask
  const numbers = values.map((v) => {
    const s = splitSign(v);
    return s ? toNumber(s, decimal) : null; // null: empty or not a number, flag the cell
  });
  return { decimal, numbers };
}

ok("eu: splitSign", () => {
  assert.deepStrictEqual(splitSign("1.234,56"), { negative: false, body: "1.234,56" });
  assert.deepStrictEqual(splitSign("-1.234,56 €"), { negative: true, body: "1.234,56" });
  assert.deepStrictEqual(splitSign("1.234,56-"), { negative: true, body: "1.234,56" });
  assert.deepStrictEqual(splitSign("(1,234.56)"), { negative: true, body: "1,234.56" });
  assert.deepStrictEqual(splitSign("−1 234,56"), { negative: true, body: "1234,56" });
  assert.deepStrictEqual(splitSign("EUR 1.234,56"), { negative: false, body: "1.234,56" });
  assert.deepStrictEqual(splitSign("1’234.50 CHF"), { negative: false, body: "1234.50" });
  assert.deepStrictEqual(splitSign("-€1,234.56"), { negative: true, body: "1,234.56" });
  assert.deepStrictEqual(splitSign("+12"), { negative: false, body: "12" });
  assert.deepStrictEqual(splitSign("1 234,56 €"), { negative: false, body: "1234,56" });
  assert.strictEqual(splitSign(""), null); assert.strictEqual(splitSign("n/a"), null); assert.strictEqual(splitSign("12abc34"), null); assert.strictEqual(splitSign("1.234,56EUR").body, "1.234,56"); assert.strictEqual(splitSign("EURO"), null); assert.strictEqual(splitSign(null), null);
});
ok("eu: toNumber", () => {
  const n = (b, d, neg = false) => toNumber({ negative: neg, body: b }, d);
  assert.strictEqual(n("1.234,56", ","), 1234.56); assert.strictEqual(n("1,234.56", "."), 1234.56);
  assert.strictEqual(n("1.234.567", ","), 1234567); assert.strictEqual(n("12,34,567.89", "."), 1234567.89);
  assert.strictEqual(n(",5", ","), 0.5); assert.strictEqual(n("1234,56", ",", true), -1234.56);
  assert.strictEqual(n("1,2,3", ","), null); assert.strictEqual(n("1,23.4", ","), null); assert.strictEqual(n("1.23", ","), null); assert.strictEqual(n("1.2345", ","), null);
});
ok("eu: locale separators (ICU)", () => {
  assert.deepStrictEqual(localeSeparators("de-DE"), { group: ".", decimal: "," });
  assert.deepStrictEqual(localeSeparators("en-US"), { group: ",", decimal: "." });
  assert.deepStrictEqual(localeSeparators("fr-FR"), { group: " ", decimal: "," });
  const ch = localeSeparators("de-CH"); assert.strictEqual(ch.decimal, "."); assert.match(ch.group, /^['’]$/);
  for (const l of ["de-DE", "fr-FR", "de-CH", "en-IN", "it-IT", "es-ES", "nl-NL", "pt-BR", "en-US", "en-GB", "ja-JP"]) assert.strictEqual(parseLocaleNumber(new Intl.NumberFormat(l).format(-1234567.891), l), -1234567.891, l);
  assert.strictEqual(parseLocaleNumber("1.234,56", "de-DE"), 1234.56); assert.strictEqual(parseLocaleNumber("1.234,56", "en-US"), null);
});
ok("eu: detect decimal separator", () => {
  assert.strictEqual(detectDecimalSeparator(["1.234,56", "99"]), ",");
  assert.strictEqual(detectDecimalSeparator(["1,234.56", "99"]), ".");
  assert.strictEqual(detectDecimalSeparator(["12,5", "1.234"]), ",");
  assert.strictEqual(detectDecimalSeparator(["1.234.567"]), ",");
  assert.strictEqual(detectDecimalSeparator(["0,125"]), ",");
  assert.strictEqual(detectDecimalSeparator(["1,234", "5,678"]), null);
  assert.strictEqual(detectDecimalSeparator(["1.234,56", "1,234.56"]), null);
  assert.strictEqual(detectDecimalSeparator(["12", "", "n/a"]), null);
});
ok("eu: parse a column", () => {
  assert.deepStrictEqual(parseNumberColumn(["1.234,56", "-99,90 €", "1.000-", "", "n/a"]), { decimal: ",", numbers: [1234.56, -99.9, -1000, null, null] });
  assert.deepStrictEqual(parseNumberColumn(["1,234", "5,678"]), { decimal: null, numbers: null });
  assert.deepStrictEqual(parseNumberColumn(["1,234", "5,678"], "de-DE"), { decimal: ",", numbers: [1.234, 5.678] });
});

const XLSX = require(process.env.XLSX_MODULE || "xlsx");

async function readWorkbook(file) {
  // dateNF must be set here: setting it only in sheet_to_json gives "4/3/26".
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true, dateNF: "yyyy-mm-dd" });
  const hasData = (name) =>
    XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" })
      .some((row) => row.join("").trim());
  const name = wb.SheetNames.find(hasData) ?? wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[name], {
    header: 1, raw: false, defval: "", dateNF: "yyyy-mm-dd",
  });
}
ok("excel: skips empty first sheet and returns ISO dates", async () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "Cover");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Name", "Joined"], ["A", new Date(Date.UTC(2026, 3, 3))]]), "Data");
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const rows = await readWorkbook({ arrayBuffer: async () => bytes });
  assert.deepStrictEqual(rows[0], ["Name", "Joined"]);
  assert.match(String(rows[1][1]), /^2026-04-0[23]$/);
});
