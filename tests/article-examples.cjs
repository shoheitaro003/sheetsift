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
  let t = String(raw).trim().replace(/[\s\u00a0]/g, "").replace(/^[$€£¥]|[$€£¥円]$/g, "");
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
const CURRENCY = "R\\$|[$€£¥₹₽₩円]|kr\\.?|zł|EUR|USD|GBP|CHF|JPY|SEK|NOK|DKK|PLN|CZK|BRL|INR|CAD|AUD";
const CURRENCY_START = new RegExp(`^(?:${CURRENCY})\\s*`, "i");
const CURRENCY_END = new RegExp(`\\s*(?:${CURRENCY})$`, "i");
const MINUS = /^[-\u2212]\s*|\s*[-\u2212]$/; // -5, 5- and the minus sign U+2212
const GROUP_SPACE = "[ \u00a0\u202f\u2009'’]"; // space, no-break spaces, thin space, apostrophes
const SPACED_GROUPS = new RegExp(`^[1-9]\\d{0,2}(${GROUP_SPACE})\\d{3}(?:\\1\\d{3})*(?:[.,]\\d+)?$`); // 1 234,56

function splitSign(raw) {
  let t = String(raw ?? "").replace(/[\u200e\u200f\u061c]/g, "").trim(); // direction marks (he-IL)
  let negative = false, signs = 0, currencies = 0;
  const stripCurrency = () => {
    for (const re of [CURRENCY_START, CURRENCY_END]) {
      const next = t.replace(re, "");
      if (next !== t) { currencies++; t = next; }
    }
  };
  stripCurrency();
  if (/^\(.+\)$/.test(t)) { negative = true; signs++; t = t.slice(1, -1).trim(); stripCurrency(); }
  if (MINUS.test(t)) { negative = true; signs++; t = t.replace(MINUS, ""); }
  else if (t.startsWith("+")) t = t.slice(1);
  stripCurrency();
  if (signs > 1 || currencies > 1) return null; // "(-5)" or "$5€" is a mistake, not a number
  if (/[\s'’]/.test(t)) {
    if (!SPACED_GROUPS.test(t)) return null;    // "10 20", "1\n234", "030 123", "2,5 Mio"
    t = t.replace(new RegExp(GROUP_SPACE, "g"), "");
  }
  return /^[\d.,]*\d[\d.,]*$/.test(t) ? { negative, body: t } : null;
}

const GROUPED = { ".": /^[1-9]\d{0,2}(\.\d{3})+$/, ",": /^[1-9]\d{0,2}(,\d{3})+$/ };
const INDIAN = /^[1-9]\d?(,\d{2})*,\d{3}$/; // 12,34,567: only accepted for Indian locales

function toNumber({ negative, body }, decimal, { indian = false } = {}) {
  const group = decimal === "," ? "." : ",";
  const [int, frac, extra] = body.split(decimal);
  if (extra !== undefined || frac === "") return null;         // "1,2,3" or "1,"
  if (frac !== undefined && frac.includes(group)) return null;  // "1,23.4"
  const grouped = GROUPED[group].test(int) || (indian && group === "," && INDIAN.test(int));
  if (int.includes(group) && !grouped) return null;             // "1.23" or "030.123"
  const digits = int.split(group).join("");
  if (/^0\d/.test(digits)) return null;                         // "01067": a code, not an amount
  const plain = digits + (frac !== undefined ? "." + frac : "");
  if (plain.replace(/\D/g, "").length > 15) return null;        // too long to be sure it is exact
  const n = Number(plain);
  if (!Number.isFinite(n)) return null;
  return negative && n !== 0 ? -n : n;
}

const separatorCache = new Map();

function localeSeparators(locale) {
  if (!separatorCache.has(locale)) {
    let info = null;
    try {
      const format = new Intl.NumberFormat(locale);
      const parts = format.formatToParts(1234567.891);
      const find = (type) => parts.find((p) => p.type === type)?.value ?? "";
      info = { group: find("group"), decimal: find("decimal"), indian: format.format(1234567) === "12,34,567" };
    } catch {
      info = null; // not a valid locale string
    }
    separatorCache.set(locale, info);
  }
  return separatorCache.get(locale);
}

function readNumber(raw, { decimal, indian = false }) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null; // already a number
  if (decimal !== "." && decimal !== ",") return null; // e.g. "٫" in ar-EG: not handled here
  const s = splitSign(raw);
  return s ? toNumber(s, decimal, { indian }) : null;
}

function parseLocaleNumber(raw, locale) {
  const separators = localeSeparators(locale);
  return separators ? readNumber(raw, separators) : null;
}

function decimalVote(body) {
  const dot = body.lastIndexOf("."), comma = body.lastIndexOf(",");
  let vote = null;
  if (dot >= 0 && comma >= 0) vote = dot > comma ? "." : ",";         // 1.234,56 or 1,234.56
  else if (dot >= 0 || comma >= 0) {
    const sep = dot >= 0 ? "." : ",", other = sep === "." ? "," : ".";
    const [int, frac] = body.split(sep);
    if (body.indexOf(sep) !== body.lastIndexOf(sep)) vote = other;      // 1.234.567: grouping
    else if (frac.length !== 3 || int === "" || int === "0") vote = sep; // 12,5 / 0,125 / ,5
    // else 1,234 or 1.234: could be either, no vote
  }
  // A vote only counts if the value is valid under it, so 07.11.2026 never votes.
  return vote && toNumber({ negative: false, body }, vote) !== null ? vote : null;
}

function columnVotes(values) {
  const votes = { ".": 0, ",": 0 };
  for (const v of values) {
    if (typeof v === "number") continue; // real numbers carry no format
    const s = splitSign(v);
    const vote = s && decimalVote(s.body);
    if (vote) votes[vote]++;
  }
  return votes;
}

function detectDecimalSeparator(values, minVotes = 2) {
  const votes = columnVotes(values);
  if (votes["."] && votes[","]) return null;  // contradictory: ask the user
  const sep = votes["."] ? "." : ",";
  return votes[sep] >= minVotes ? sep : null; // one value is not enough evidence
}

function parseNumberColumn(values, chosenLocale) {
  const ask = (reason) => ({ decimal: null, numbers: null, ask: reason });
  let separators;
  if (chosenLocale) {
    separators = localeSeparators(chosenLocale);
    if (!separators || !/^[.,]$/.test(separators.decimal)) return ask("locale not supported");
    const other = separators.decimal === "," ? "." : ",";
    if (columnVotes(values)[other] > 0) return ask("data disagrees with the chosen locale");
  } else {
    const decimal = detectDecimalSeparator(values);
    if (!decimal) return ask("no clear format");
    separators = { decimal, group: decimal === "," ? "." : "," };
  }
  // null in numbers: the cell is empty or not a number, so flag it in the preview
  return { decimal: separators.decimal, numbers: values.map((v) => readNumber(v, separators)), ask: null };
}

ok("eu: the problem is real", () => { assert.strictEqual(parseFloat("1.234,56"), 1.234); assert(Number.isNaN(Number("1.234,56"))); assert(Number.isNaN(Number("1,234.56"))); assert.strictEqual(parseFloat("1,234.56"), 1); assert.strictEqual(typeof Intl.NumberFormat.prototype.parse, "undefined"); assert.strictEqual(String(Number("12345678901234567891")), "12345678901234567000"); });
ok("eu: splitSign accepts real formats", () => {
  const b = (v) => { const s = splitSign(v); return s && (s.negative ? "-" : "") + s.body; };
  const cases = {
    "1.234,56": "1.234,56", "-1.234,56 €": "-1.234,56", "1.234,56-": "-1.234,56", "(1,234.56)": "-1,234.56",
    "(€1,234.56)": "-1,234.56", "\u22121 234,56": "-1234,56", "EUR 1.234,56": "1.234,56", "1.234,56EUR": "1.234,56",
    "1’234.50 CHF": "1234.50", "1'234'567.50": "1234567.50", "-€1,234.56": "-1,234.56", "€-1,234.56": "-1,234.56",
    "+€5": "5", "€+5": "5", "R$ 1.234,56": "1.234,56", "kr 1 234,56": "1234,56", "1.234,56 kr.": "1.234,56",
    "kr. 1.234,56": "1.234,56", "1 234,56 zł": "1234,56", "₩1,234": "1,234", "+12": "12",
    "1 234,56\u202f€": "1234,56", "1\u00a0234,56": "1234,56", "1\u202f234\u202f567,89": "1234567,89",
  };
  for (const [input, want] of Object.entries(cases)) assert.strictEqual(b(input), want, input);
});
ok("eu: splitSign rejects what it cannot prove", () => {
  for (const v of ["", null, "n/a", "12abc34", "ISO9001", "ABC123", "12 PCS", "2,5 Mio", "1,5 MRD", "100 TSD", "12k", "1,5E+03",
                   "1$234", "$1$2", "1€2", "$5€", "10 20", "2026 11", "1 23,4", "12'3", "1'000'00", "030 123 456", "0 500", "1 234'567",
                   "(-5)", "(\u22125)", "(5-)", "-5-", "EURO", "\u0661\u0662\u0663", "\uff11,234"])
    assert.strictEqual(splitSign(v), null, String(v));
});
ok("eu: toNumber", () => {
  const n = (b, d, opts) => toNumber({ negative: false, body: b }, d, opts);
  assert.strictEqual(n("1.234,56", ","), 1234.56); assert.strictEqual(n("1,234.56", "."), 1234.56);
  assert.strictEqual(n("1.234.567", ","), 1234567); assert.strictEqual(n(",5", ","), 0.5); assert.strictEqual(n("0,5", ","), 0.5);
  assert.strictEqual(toNumber({ negative: true, body: "1234,56" }, ","), -1234.56);
  assert.strictEqual(n("12,34,567.89", ".", { indian: true }), 1234567.89);
  assert.strictEqual(n("123456789012345", "."), 123456789012345);
  for (const [b, d] of [["1,2,3", ","], ["1,23.4", ","], ["1.23", ","], ["1.2345", ","], ["1,", ","], ["1.", "."], ["030.123.456", ","],
                        ["07.11.2026", ","], ["12,34,567.89", "."], ["1.23.456", ","], ["12.34.567", ","], ["1234567890123456", "."],
                        ["1.234.567.890.123.456.789", ","]])
    assert.strictEqual(n(b, d), null, b);
  assert.strictEqual(n("1.23.456", ",", { indian: true }), null); // Indian grouping only with commas
});
ok("eu: locale separators (ICU)", () => {
  assert.deepStrictEqual(localeSeparators("de-DE"), { group: ".", decimal: ",", indian: false });
  assert.deepStrictEqual(localeSeparators("en-US"), { group: ",", decimal: ".", indian: false });
  assert.deepStrictEqual(localeSeparators("fr-FR"), { group: "\u202f", decimal: ",", indian: false });
  assert.deepStrictEqual(localeSeparators("en-IN"), { group: ",", decimal: ".", indian: true });
  const ch = localeSeparators("de-CH"); assert.strictEqual(ch.decimal, "."); assert.match(ch.group, /^['’]$/);
  assert.strictEqual(localeSeparators("xx_YY"), null);
  const table = { "en-US": "1,234,567.89", "en-GB": "1,234,567.89", "ja-JP": "1,234,567.89", "de-DE": "1.234.567,89", "it-IT": "1.234.567,89",
                  "es-ES": "1.234.567,89", "nl-NL": "1.234.567,89", "pt-BR": "1.234.567,89", "fr-FR": "1\u202f234\u202f567,89", "en-IN": "12,34,567.89" };
  for (const [l, want] of Object.entries(table)) assert.strictEqual(new Intl.NumberFormat(l).format(1234567.89), want, l);
  assert.match(new Intl.NumberFormat("de-CH").format(1234567.89), /^1['’]234['’]567\.89$/);
  for (const l of ["es-ES", "it-IT", "pl-PL"]) assert.strictEqual(new Intl.NumberFormat(l).format(1234.56).replace(/\s/g, " "), "1234,56", l);
  for (const l of [...Object.keys(table), "de-CH", "de-AT", "pl-PL", "he-IL", "sv-SE"])
    assert.strictEqual(parseLocaleNumber(new Intl.NumberFormat(l).format(-1234567.891), l), -1234567.891, l);
});
ok("eu: parseLocaleNumber", () => {
  assert.strictEqual(parseLocaleNumber("1.234,56", "de-DE"), 1234.56);
  assert.strictEqual(parseLocaleNumber("1.234,56", "en-US"), null);
  assert.strictEqual(parseLocaleNumber(1.234, "de-DE"), 1.234);
  assert.strictEqual(parseLocaleNumber("1.234", "fr-FR"), 1234); assert.strictEqual(parseLocaleNumber(new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format(1234.5), "de-AT"), 1234.5); assert.strictEqual(parseLocaleNumber("1\n234", "en-US"), null); assert.strictEqual(parseLocaleNumber("1\t234", "en-US"), null); assert.strictEqual(parseLocaleNumber("01067", "de-DE"), null); assert.strictEqual(parseLocaleNumber("007", "en-US"), null); assert.ok(Object.is(parseLocaleNumber("-0", "en-US"), 0)); assert.ok(Object.is(parseLocaleNumber("(0)", "en-US"), 0)); assert.strictEqual(parseLocaleNumber("0,5", "de-DE"), 0.5); for (const l of ["de-AT", "fr-FR", "pl-PL"]) assert.strictEqual(parseLocaleNumber("1.234,56", l), 1234.56, l); for (const v of ["(€5)", "€(5)", "-€5"]) assert.strictEqual(parseLocaleNumber(v, "en-US"), -5, v);
  assert.strictEqual(parseLocaleNumber("1 234,5", "fr-FR"), 1234.5);
  assert.strictEqual(parseLocaleNumber("1.234", "ar-EG"), null);
  assert.strictEqual(parseLocaleNumber("1", "xx_YY"), null);
  assert.strictEqual(parseLocaleNumber("12,34,567", "en-IN"), 1234567);
  assert.strictEqual(parseLocaleNumber("1,23,456", "en-US"), null);
  assert.strictEqual(parseLocaleNumber("030 123 456", "de-DE"), null);
});
ok("eu: detect decimal separator", () => {
  assert.strictEqual(detectDecimalSeparator(["1.234,56", "99,90"]), ",");
  assert.strictEqual(detectDecimalSeparator(["1,234.56", "12.5", "99"]), ".");
  assert.strictEqual(detectDecimalSeparator(["12,5", "1.234.567"]), ",");
  assert.strictEqual(detectDecimalSeparator(["1.234,56", "99"]), null);
  assert.strictEqual(detectDecimalSeparator(["1,500", "2,500", "3,25"]), null);
  assert.strictEqual(detectDecimalSeparator(["1,234", "5,678"]), null);
  assert.strictEqual(detectDecimalSeparator(["1.234,56", "2,5", "1,234.56"]), null);
  assert.strictEqual(detectDecimalSeparator(["07.11.2026", "01.12.2026"]), null);
  assert.strictEqual(detectDecimalSeparator(["07.11", "08.11", "1.234"]), null); assert.strictEqual(detectDecimalSeparator(["7.11", "8.11"]), "."); assert.strictEqual(detectDecimalSeparator(["1.10", "1.2"]), "."); assert.strictEqual(detectDecimalSeparator(["10.100.200.100", "192.168.100.200"]), ","); // short dates, versions and IPs can vote
  assert.strictEqual(detectDecimalSeparator([1.5, 2.25, "3,5"]), null);
  assert.strictEqual(detectDecimalSeparator(["12", "", "n/a"]), null);
  assert.deepStrictEqual(columnVotes(["1.234,56", "-99,90 €", "1.000-"]), { ".": 0, ",": 2 });
});
ok("eu: parse a column", () => {
  assert.deepStrictEqual(parseNumberColumn(["1.234,56", "-99,90 €", "1.000-", "", "n/a"]), { decimal: ",", numbers: [1234.56, -99.9, -1000, null, null], ask: null });
  assert.deepStrictEqual(parseNumberColumn(["1,234", "5,678"]), { decimal: null, numbers: null, ask: "no clear format" });
  assert.deepStrictEqual(parseNumberColumn(["1,234", "5,678"], "de-DE"), { decimal: ",", numbers: [1.234, 5.678], ask: null });
  assert.deepStrictEqual(parseNumberColumn(["1,234", "5,678", "9.99"], "de-DE").ask, "data disagrees with the chosen locale");
  assert.deepStrictEqual(parseNumberColumn(["1.234", "2.500", "3,5"], "en-US").ask, "data disagrees with the chosen locale");
  assert.deepStrictEqual(parseNumberColumn(["1.234", "2.500", "12.000"], "en-US").numbers, [1.234, 2.5, 12]); // nothing in the data can tell
  assert.deepStrictEqual(parseNumberColumn(["1.234", "5.678"], "fr-FR").numbers, [1234, 5678]); assert.deepStrictEqual(parseNumberColumn(["1.234,56", "2.500,00", "99,90"], "de-AT").numbers, [1234.56, 2500, 99.9]);
  assert.deepStrictEqual(parseNumberColumn(["1,5", "2,5"], "ar-EG").ask, "locale not supported");
  assert.deepStrictEqual(parseNumberColumn(["1"], "xx_YY").ask, "locale not supported");
  assert.deepStrictEqual(parseNumberColumn(["1.234,56", "1.000-", "", "n/a"]).ask, "no clear format");
  assert.deepStrictEqual(parseNumberColumn(["-99,90 €", "1.000-", "", "n/a"]).ask, "no clear format");
  assert.strictEqual(parseLocaleNumber("2020-", "en-US"), -2020);
  assert.deepStrictEqual(parseNumberColumn([1.234, "2,5", "3,75"]), { decimal: ",", numbers: [1.234, 2.5, 3.75], ask: null });
});

// --- blog/detect-header-row-spreadsheet-javascript ---
const asText = (value) => String(value ?? "").trim();

const LOOKS_NUMBER = /^[-+(\u2212]?\s?([$€£¥]\s?)?\d[\d\s.,']*%?(\s?[$€£¥])?\)?$/;
const LOOKS_SCIENTIFIC = /^[-+]?\d+(\.\d+)?e[-+]?\d+$/i;
const LOOKS_DATE = /^\d{1,4}[\/.\-]\d{1,2}[\/.\-]\d{1,4}([ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?\s?(Z|[+-]\d{2}:?\d{2})?)?$/i;
const MONTH = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
const LOOKS_MONTH_DATE = new RegExp(
  `^(\\d{1,2}[ -]${MONTH}[ ,-]*\\d{2,4}|${MONTH} \\d{1,2}(st|nd|rd|th)?,? \\d{4})$`, "i");
const LOOKS_TIME = /^\d{1,2}:\d{2}(:\d{2})?\s?(am|pm)?$/i;
const LOOKS_BOOLEAN = /^(true|false)$/i; // not yes/no: "No" is a common column name
const LOOKS_EMAIL = /^\S+@\S+\.\S+$/;
// "No value" (and Excel errors such as #DIV/0!): neither data nor a name.
const PLACEHOLDER =
  /^(n\/?a|-+|\u2013|\u2014|\?|null|none|#(DIV\/0!|N\/A|REF!|NAME\?|VALUE!|NUM!|NULL!|SPILL!|CALC!))$/i;

const VALUE_PATTERNS = [LOOKS_NUMBER, LOOKS_SCIENTIFIC, LOOKS_DATE, LOOKS_MONTH_DATE,
                        LOOKS_TIME, LOOKS_BOOLEAN, LOOKS_EMAIL];

// "label" = could be a column name, "value" = data, "empty" = nothing
function cellKind(cell) {
  if (typeof cell === "number" || typeof cell === "boolean" || cell instanceof Date) return "value";
  const t = asText(cell);
  if (!t || PLACEHOLDER.test(t)) return "empty";
  return VALUE_PATTERNS.some((re) => re.test(t)) ? "value" : "label";
}

// The most common number of filled cells per row: data rows outnumber everything else.
function tableWidth(rows) {
  const counts = new Map();
  for (const row of rows) {
    const filled = row.filter((c) => cellKind(c) !== "empty").length;
    if (filled) counts.set(filled, (counts.get(filled) || 0) + 1);
  }
  let width = 0, seen = 0;
  for (const [w, n] of counts) {
    if (n > seen || (n === seen && w > width)) [width, seen] = [w, n];
  }
  return width;
}

// Kind of the first non-empty cell under rows[i][col], at most 3 rows down.
function kindBelow(rows, i, col) {
  for (let r = i + 1; r < Math.min(rows.length, i + 4); r++) {
    const kind = cellKind(rows[r][col]);
    if (kind !== "empty") return kind;
  }
  return "empty";
}

function scoreRow(rows, i, width) {
  const filled = rows[i]
    .map((cell, col) => ({ cell, col, kind: cellKind(cell) }))
    .filter((c) => c.kind !== "empty");
  if (!filled.length) return null;
  const labels = filled.filter((c) => c.kind === "label");
  const fill = Math.min(filled.length / width, 1);
  const labelShare = labels.length / filled.length;
  if (fill < 0.5 || labelShare < 0.75) return null; // titles, notes and data rows stop here
  const typedBelow = labels.filter((c) => kindBelow(rows, i, c.col) === "value");
  const contrast = typedBelow.length / labels.length;
  const names = labels.map((c) => asText(c.cell).toLowerCase());
  const duplicates = names.length - new Set(names).size;
  return { contrast, score: fill + labelShare + 2 * contrast - 0.25 * duplicates };
}

// Same text in the same columns -> same key (trailing empty cells ignored).
const rowKey = (row) =>
  row.map((c) => asText(c).toLowerCase()).join("\u0000").replace(/\u0000+$/, "");

function findHeader(input, { scan = 20 } = {}) {
  const rows = Array.from(input, (row) => row ?? []); // parsers can leave holes
  const width = tableWidth(rows.slice(0, 200));
  const candidates = [];
  for (let i = 0; i < Math.min(rows.length, scan); i++) {
    const scored = scoreRow(rows, i, width);
    if (scored) candidates.push({ row: i, ...scored });
  }
  const answer = (row, sure, why) => ({ row, sure, why });
  if (!candidates.length) return answer(null, false, "no row looks like column names");

  // Highest score wins; on a tie, the row nearer the top.
  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));
  // A copy of the header further down (after a page break) is not a rival.
  const key = rowKey(rows[best.row]);
  const rivals = candidates.filter((c) => rowKey(rows[c.row]) !== key).map((c) => c.score);

  if (best.contrast === 0)
    return answer(best.row, false, "no typed values under it, so the header cannot be confirmed");
  if (rivals.length && best.score - Math.max(...rivals) < 0.5)
    return answer(best.row, false, "another row is almost as likely");
  if (best.row > 0 && couldBeHeaderToo(rows[best.row - 1], rows[best.row]))
    return answer(best.row, false, "the row above may be part of the header");
  return answer(best.row, true, "column names above typed values");
}

// The row right above the winner is all labels and either has gaps
// ("Q1" and "Q2" above merged cells) or is as wide as the winner
// (a two-row header, or a text-only first data row under the real header).
function couldBeHeaderToo(above, best) {
  const kinds = above.map(cellKind);
  const labels = kinds.filter((k) => k === "label").length;
  if (labels < 2 || kinds.includes("value")) return false;
  const filled = kinds.flatMap((k, col) => (k === "empty" ? [] : [col]));
  const hasGap = filled[filled.length - 1] - filled[0] + 1 > filled.length;
  const bestWidth = best.filter((c) => cellKind(c) !== "empty").length;
  return hasGap || labels >= bestWidth;
}

// 0 -> "A", 27 -> "AB"
const columnLetter = (i) => (i >= 26 ? columnLetter(Math.floor(i / 26) - 1) : "") + String.fromCharCode(65 + (i % 26));

// Real names are kept first; duplicates and unnamed columns with data get a free name.
// ["Amount", "amount", "Amount (2)"] -> ["Amount", "amount (3)", "Amount (2)"]
function columnNames(header, hasData, firstCol = 0) {
  const used = new Set();
  const names = header.map((cell) => {
    const name = asText(cell);
    if (!name || used.has(name.toLowerCase())) return null;
    used.add(name.toLowerCase());
    return name;
  });
  const free = (base) => {
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})`;
    used.add(name.toLowerCase());
    return name;
  };
  header.forEach((cell, col) => {
    if (names[col]) return;
    if (asText(cell)) names[col] = free(asText(cell)); // a duplicate
    else if (hasData(col)) names[col] = free(`Column ${columnLetter(firstCol + col)}`);
  });
  return names; // null = blank column without data, dropped
}

// origin: where rows[0][0] sits in the sheet, 0-based ({ row: 0, col: 0 } for a CSV).
function toRecords(input, headerIndex, origin = { row: 0, col: 0 }) {
  if (headerIndex === null) return []; // findHeader found nothing: ask the user first
  const rows = Array.from(input, (row) => row ?? []);
  const headerKey = rowKey(rows[headerIndex]);
  const body = rows.slice(headerIndex + 1);
  const hasData = (col) => body.some((row) => cellKind(row[col]) !== "empty");
  const names = columnNames(rows[headerIndex], hasData, origin.col);
  const records = [];
  body.forEach((row, offset) => {
    if (row.every((c) => cellKind(c) === "empty")) return;
    if (rowKey(row) === headerKey) return; // header repeated after a page break
    // fromEntries defines own properties, so a column named "__proto__" is safe.
    const values = Object.fromEntries(
      names.flatMap((name, col) => (name ? [[name, row[col] ?? ""]] : [])));
    // The row number the user sees in Excel (1-based).
    records.push({ row: origin.row + headerIndex + offset + 2, values });
  });
  return records;
}

ok("hdr: the naive rules fail", () => {
  const kv = [["Report", "Monthly sales"], ["Owner", "Ken"], ["Date", "Amount", "Date", "Amount"], ["2026-01-01", "5", "2026-01-02", "6"]];
  assert.strictEqual(findHeaderRow(kv), 0); // widest unique text row: duplicate names knock out the real header
  assert.strictEqual(findHeader(kv).row, 2);
});
ok("hdr: cellKind", () => {
  for (const v of [49, 0, true, new Date(), "49", "-5", "(1,234.56)", "1.234,56 €", "€ 99,90", "12%", "\u22125", "1\u00a0234,56", "2026-11-08", "08/11/2026", "8.11.2026", "2026-11-08 09:30", "09:30", "yui@example.jp"])
    assert.strictEqual(cellKind(v), "value", String(v));
  for (const v of ["Name", "E-mail", "Q1 2026", "MRR ($)", "Prepared by:", "090-1234-5678", "ID-0042", "2026-Q1", "May I help", "1/2"])
    assert.strictEqual(cellKind(v), "label", v);
  for (const v of ["2026-11-08T10:00:00Z", "2026-11-08T10:00:00.123+09:00", "10:30 AM", "TRUE", "false", "Nov 8, 2026", "November 8th, 2026", "8-Nov-2026", "8 Nov 26", "1e5", "-2.5E-3", "+81 90 1234 5678", "1.2.3.4"])
    assert.strictEqual(cellKind(v), "value", v);
  for (const v of ["", "  ", null, undefined, "N/A", "n/a", "#N/A", "-", "—", "?", "null", "None"]) assert.strictEqual(cellKind(v), "empty", String(v));
});
ok("hdr: finds the header in real layouts", () => {
  const cases = [
    [[["Export (do not edit)"], [], ["Name", "Email", "Plan", "MRR"], ["Yui", "yui@example.jp", "Pro", "49"], ["Ken", "ken@example.com", "Free", "0"]], 2],
    [[["Name", "Email"], ["A", "a@example.com"], ["B", "b@example.com"]], 0],
    [[["Report", "Monthly sales"], ["Period", "2026-10"], ["Prepared by:", "Yui"], [], ["Product", "Units"], ["Tea", "12"], ["Rice", "40"], ["Miso", "7"]], 4],
    [[["Report", "Monthly sales"], ["Prepared by", "Yui"], [], ["Product", "Units", "Price", "Date"], ["Tea", "12", "4.50", "2026-10-01"], ["Rice", "40", "2.00", "2026-10-02"]], 3],
    [[["Report", "Q3"], ["Owner", "Ken"], ["Date", "Amount", "Date", "Amount"], ["2026-01-01", "5", "2026-01-02", "6"]], 2],
    [[["Sales"], ["Name", "Joined", "Amount"], ["Yui", new Date(), 49.5], ["Ken", new Date(), 0]], 1],
    [[["Title"], ["Name", "Email", "Phone", "Note"], ["Yui", "yui@example.jp", "", ""], ["Ken", "ken@example.com", "", ""], ["Ann", "ann@example.com", "", "x"]], 1],
    [[["Email"], ["a@example.com"], ["b@example.com"]], 0],
    [[["Name", "Amount"], ["Yui", "5"], ["Ken", "7"], ["Name", "Amount"], ["Ann", "3"]], 0],
  ];
  for (const [rows, want] of cases) assert.deepStrictEqual(findHeader(rows), { row: want, sure: true, why: "column names above typed values" }, JSON.stringify(rows[want]));
});
ok("hdr: says when it is not sure", () => {
  const why = (rows) => { const f = findHeader(rows); assert.strictEqual(f.sure, false); return [f.row, f.why]; };
  assert.deepStrictEqual(why([["Name", "City"], ["Yui", "Osaka"], ["Ken", "Kyoto"]]), [0, "no typed values under it, so the header cannot be confirmed"]);
  assert.deepStrictEqual(why([["Name", "Amount"], ["Yui", "5"], ["Ken", "7"], [], ["Product", "Units"], ["Tea", "3"]]), [0, "another row is almost as likely"]);
  assert.deepStrictEqual(why([["", "Q1", "", "Q2", ""], ["Name", "Revenue", "Cost", "Revenue", "Cost"], ["Tea", "100", "40", "120", "50"]]), [1, "the row above may be part of the header"]);
  assert.deepStrictEqual(why([["Customer", "", "Contact", ""], ["Name", "Plan", "Email", "Phone"], ["Yui", "Pro", "yui@example.jp", "090-1234-5678"]]), [1, "the row above may be part of the header"]);
  assert.deepStrictEqual(why([["Owner", "", "Ken"], ["Name", "Email", "MRR"], ["Yui", "yui@example.jp", "49"]]), [1, "the row above may be part of the header"]); // a false alarm: asks, never guesses
  for (const rows of [[], [[], [], []], [["Yui", "yui@example.jp", "49"], ["Ken", "ken@example.com", "0"]], [["Region", "2024", "2025"], ["North", "1200", "1350"], ["South", "900", "1010"]], [[1, 2], [3, 4]]])
    assert.deepStrictEqual(findHeader(rows), { row: null, sure: false, why: "no row looks like column names" }, JSON.stringify(rows));
});
ok("hdr: claims in the text", () => {
  assert.strictEqual(findHeader([["Region", "Product", "Channel", "2026"], ["North", "Tea", "Web", "1200"], ["South", "Rice", "Shop", "900"]]).row, 0); // one numeric header
  assert.deepStrictEqual(findHeader([["Title"], ["Name", "MRR"], ["Yui", ""], ["Ken", "49"]]), { row: 1, sure: true, why: "column names above typed values" }); // blank first value
  const csv = "Monthly sales\n\nName,MRR\nYui,49\nKen,0".split("\n").map((line) => line.split(","));
  assert.strictEqual(findHeader(csv).row, 2);
  const shortFile = [["Note 1"], ["Note 2"], ["Note 3"], ["Note 4"], ["Note 5"], ["Name", "MRR"], ["Yui", 49], ["Ken", 0]];
  assert.strictEqual(findHeader(shortFile).row, 5); // notes outnumber data rows: contrast still wins
});
ok("hdr: review findings", () => {
  assert.deepStrictEqual(findHeader([["Name", "Amount"], ["a", "N/A"], ["b", "-"], ["c", 3]]).row, 0);
  for (const rows of [[["Name", "Email"], ["Ann", "Ann at acme"], ["Bob", "b@x.co"]], [["Name", "Email"], ["Ann", "Ann at acme"], ["Bob", "b@x.co"], ["Cy", "c@x.co"]]])
    assert.deepStrictEqual(findHeader(rows), { row: 1, sure: false, why: "the row above may be part of the header" }); // a bad first value: flagged, not trusted
  assert.deepStrictEqual(findHeader([["Name", "Joined"], ["Yui", "2026-11-08T10:00:00Z"], ["Ken", "Nov 8, 2026"]]).sure, true);
  assert.deepStrictEqual(findHeader([["Export"], ["Name", "Phone", "Plan", "MRR"], ["Yui", "090-1234-5678", "Pro", 49], ["Ken", "+81 90 1234 5678", "Free", 0]]), { row: 1, sure: false, why: "another row is almost as likely" }); // mostly text columns: right row, flagged
  const holes = [["A", "B"], , ["1", "2"], undefined, ["3", "4"]];
  assert.strictEqual(findHeader(holes).row, 0);
  assert.deepStrictEqual(toRecords(holes, 0).map((r) => r.row), [3, 5]);
  assert.deepStrictEqual(findHeader([["Name", "Amount"], ["x", 1, 2, 3, 4], ["y", 5, 6, 7, 8]]).row, null); // narrower header: listed as a limit
  assert.deepStrictEqual(toRecords([["A", "Column C", ""], [1, 2, 3]], 0)[0].values, { A: 1, "Column C": 2, "Column C (2)": 3 });
  for (const v of ["#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#N/A"]) assert.strictEqual(cellKind(v), "empty", v);
  for (const v of ["No", "yes", "#ID", "#1", "Jan 2026"]) assert.strictEqual(cellKind(v), "label", v);
  assert.deepStrictEqual(findHeader([["No", "Name", "Date"], [1, "Yui", "2026-01-01"], [2, "Ken", "2026-01-02"]]).row, 0);
  assert.deepStrictEqual(findHeader([["#ID", "Name"], [1, "Yui"], [2, "Ken"]]).row, 0);
  assert.deepStrictEqual(toRecords([["Yui"]], null), []);
  for (const v of ["#NUM!", "#NULL!", "#SPILL!", "#CALC!"]) assert.strictEqual(cellKind(v), "empty", v);
  for (const v of ["5 kg", "USD 5"]) assert.strictEqual(cellKind(v), "label", v); // listed as a limit
  assert.deepStrictEqual(findHeader([["Report", "Sales"], ["Owner", "Ken"], ["Name", "Amount"], ["Yui", 5], ["Ken", 7]]), { row: 2, sure: false, why: "the row above may be part of the header" });
  assert.deepStrictEqual(findHeader([["Item", "Weight", "Price"], ["", "kg", "USD"], ["Tea", 5, 4.5], ["Rice", 2, 3]]).row, 1); // units row: flagged, listed as a limit
  assert.strictEqual(findHeader([["Item", "Weight", "Price"], ["", "kg", "USD"], ["Tea", 5, 4.5], ["Rice", 2, 3]]).sure, false);
  assert.deepStrictEqual(findHeader([["Name", "Email"]]), { row: 0, sure: false, why: "no typed values under it, so the header cannot be confirmed" });
  const proto = toRecords([["__proto__", "b"], ["x", 2]], 0)[0].values;
  assert.strictEqual(Object.getPrototypeOf(proto), Object.prototype);
  assert.deepStrictEqual(Object.keys(proto), ["__proto__", "b"]); assert.strictEqual(proto["__proto__"], "x");
});
ok("hdr: scan limit", () => {
  const rows = [...Array.from({ length: 25 }, () => []), ["Name", "Amount"], ["Yui", 5], ["Ken", 7]];
  assert.strictEqual(findHeader(rows).row, null);
  assert.strictEqual(findHeader(rows, { scan: 30 }).row, 25);
});
ok("hdr: columnNames", () => {
  const none = () => false, all = () => true;
  assert.deepStrictEqual(columnNames(["Amount", "amount", " Amount ", "", "Amount (2)"], none), ["Amount", "amount (3)", "Amount (4)", null, "Amount (2)"]);
  assert.deepStrictEqual(columnNames(["Amount", "amount", "Amount (2)"], none), ["Amount", "amount (3)", "Amount (2)"]);
  assert.deepStrictEqual(columnNames(["A", "", "Column B"], all), ["A", "Column B (2)", "Column B"]);
  assert.deepStrictEqual(columnNames(["A", ""], all, 1), ["A", "Column C"]);
  assert.deepStrictEqual([0, 25, 26, 27, 701, 702].map(columnLetter), ["A", "Z", "AA", "AB", "ZZ", "AAA"]);
});
ok("hdr: toRecords", () => {
  const rows = [["Report"], [], ["Name", "Amount", "", "Amount"], ["Yui", 5, "", 6], [], ["Name", "Amount", "", "Amount"], ["Ken", 7, "x", 8], ["Ann"]];
  assert.deepStrictEqual(toRecords(rows, 2), [
    { row: 4, values: { Name: "Yui", Amount: 5, "Column C": "", "Amount (2)": 6 } },
    { row: 7, values: { Name: "Ken", Amount: 7, "Column C": "x", "Amount (2)": 8 } },
    { row: 8, values: { Name: "Ann", Amount: "", "Column C": "", "Amount (2)": "" } },
  ]);
  assert.deepStrictEqual(toRecords([["Name", ""], ["Yui", ""]], 0), [{ row: 2, values: { Name: "Yui" } }]);
  assert.deepStrictEqual(toRecords([["Name"], ["Yui"]], 0, { row: 4, col: 0 })[0].row, 6);
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


async function readTable(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1, defval: "", blankrows: true, raw: true,
  });
  // rows[0][0] is the top-left cell of the sheet's stored range, which may not be A1.
  const origin = XLSX.utils.decode_range(sheet["!ref"] ?? "A1").s; // { r, c }, 0-based
  const found = findHeader(rows);
  if (found.row === null) return { ...found, headerRow: null, records: [] };
  return {
    ...found,
    headerRow: origin.r + found.row + 1,
    records: toRecords(rows, found.row, { row: origin.r, col: origin.c }),
  };
}
ok("hdr: readTable with SheetJS", async () => {
  const sheet = XLSX.utils.aoa_to_sheet([["Export (do not edit)"], [], ["Name", "Joined", "MRR"], ["Yui", new Date(Date.UTC(2026, 3, 3)), 49], ["Ken", new Date(Date.UTC(2026, 3, 4)), 0]], { origin: "B3", cellDates: true });
  sheet["!ref"] = "B3:D7"; // as saved by tools that only record the used range
  sheet["D6"].z = "#,##0.00 \"€\"";
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, sheet, "Data");
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const raw = XLSX.utils.sheet_to_json(XLSX.read(bytes).Sheets.Data, { header: 1, defval: "", blankrows: true });
  assert.deepStrictEqual(raw[2], ["Name", "Joined", "MRR"]); // index 2, although the header is on row 5
  const t = await readTable({ arrayBuffer: async () => bytes });
  assert.strictEqual(t.sure, true); assert.strictEqual(t.headerRow, 5);
  assert.deepStrictEqual(t.records.map((r) => r.row), [6, 7]);
  assert.deepStrictEqual(Object.keys(t.records[0].values), ["Name", "Joined", "MRR"]);
  assert.strictEqual(t.records[0].values.MRR, 49);
  assert.ok(t.records[0].values.Joined instanceof Date);
  const plain = XLSX.utils.sheet_to_json(XLSX.utils.aoa_to_sheet([["Date", "Amount", "Date", "Amount"], ["a", 1, "b", 2]]));
  assert.deepStrictEqual(Object.keys(plain[0]), ["Date", "Amount", "Date_1", "Amount_1"]);
  const repeated = XLSX.utils.sheet_to_json(XLSX.utils.aoa_to_sheet([["Name", "MRR"], ["Yui", 49], ["Name", "MRR"], ["Ken", 0]]));
  assert.deepStrictEqual(repeated[1], { Name: "Name", MRR: "MRR" }); // the default keeps a repeated header as data
  const none = await readTable({ arrayBuffer: async () => XLSX.write((() => { const w = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([[1, 2], [3, 4]]), "S"); return w; })(), { type: "array", bookType: "xlsx" }) });
  assert.deepStrictEqual([none.row, none.headerRow, none.records], [null, null, []]);
});
ok("excel: skips empty first sheet and returns ISO dates", async () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "Cover");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Name", "Joined"], ["A", new Date(Date.UTC(2026, 3, 3))]]), "Data");
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const rows = await readWorkbook({ arrayBuffer: async () => bytes });
  assert.deepStrictEqual(rows[0], ["Name", "Joined"]);
  assert.match(String(rows[1][1]), /^2026-04-0[23]$/);
});

// --- blog/read-excel-dates-javascript-sheetjs ---
// What a cell's number format says about its value:
// "date", "datetime", "time", "duration" or null (an ordinary number).
function dateFormatKind(format) {
  if (typeof format !== "string") return null;
  let code = format
    .replace(/"[^"]*"/g, "")      // quoted text, as in "Due "yyyy-mm-dd
    .replace(/\\./g, "")          // escaped characters, as in yyyy\-mm\-dd
    .replace(/[_*]./g, "")        // padding and fill characters
    .split(";")[0];               // the section used for positive numbers
  if (/\[(h+|m+|s+)\]/i.test(code)) return "duration"; // [h]:mm counts hours past 24
  code = code.replace(/\[[^\]]*\]/g, "").replace(/AM\/PM|A\/P/gi, ""); // [$-409], [Red], AM/PM
  if (/general/i.test(code)) return null;
  const hasTime = /[hs]/i.test(code);
  const hasDate = /[yd]/i.test(code) || (/m/i.test(code) && !hasTime); // "mmm" alone is a month
  if (hasDate) return hasTime ? "datetime" : "date";
  return hasTime ? "time" : null;
}

const DAY_MS = 86400000;
const DAY_ZERO_1900 = Date.UTC(1899, 11, 31); // serial 1 is 1900-01-01
const DAY_ZERO_1904 = Date.UTC(1904, 0, 1);   // serial 0 is 1904-01-01

// Excel serial number -> ISO 8601 text, with no time zone involved.
// Returns { value } or { error } so a caller can show why a cell was rejected.
function serialToISO(serial, kind, date1904 = false) {
  if (typeof serial !== "number" || !Number.isFinite(serial) || serial < 0)
    return { error: "not a valid Excel date number" };
  // Times: round to the nearest second. Fractions of a day are rarely exact in binary,
  // so 2026-01-05 14:30 is 52199.99... seconds into the day, not 52200.
  // Dates: drop the time part, after snapping to the millisecond so that a formula
  // result of 46027.99999999999 counts as the next day (as SheetJS's formatter does).
  const seconds = Math.round(serial * 86400);
  let day = kind === "date" ? Math.floor(Math.round(serial * DAY_MS) / DAY_MS) : Math.floor(seconds / 86400);
  const timeOfDay = seconds % 86400;
  const time = [Math.floor(timeOfDay / 3600), Math.floor(timeOfDay / 60) % 60, timeOfDay % 60]
    .map((n) => String(n).padStart(2, "0")).join(":");

  if (kind === "time") return { value: time };
  if (kind === "duration") return { value: seconds }; // elapsed seconds, not a date
  if (kind !== "date" && kind !== "datetime") return { error: "not a date format" };

  if (!date1904) {
    if (day === 0) return { error: "day 0 of the 1900 system (shown as 1900-01-00)" };
    if (day === 60) return { error: "1900-02-29 does not exist (Excel's 1900 leap-year bug)" };
    if (day > 60) day -= 1; // every serial after the fake 29 February is one day ahead
  }
  const ms = (date1904 ? DAY_ZERO_1904 : DAY_ZERO_1900) + day * DAY_MS;
  if (ms > Date.UTC(9999, 11, 31)) return { error: "after 9999-12-31" };
  const date = new Date(ms).toISOString().slice(0, 10); // safe: ms is UTC midnight
  return { value: kind === "date" ? date : `${date}T${time}` };
}


async function readSheetCells(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), {
    cellNF: true, // keep each cell's number format in cell.z
    raw: true,    // CSV and other text files: keep "03/04/2026" as text, do not guess
  });             // no cellDates: dates stay serial numbers, so no time zone applies
  const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet["!ref"]) return []; // an empty sheet
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const rows = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const address = XLSX.utils.encode_cell({ r, c });
      row.push(readCell(sheet[address], date1904, address));
    }
    rows.push(row);
  }
  return rows;
}

function readCell(cell, date1904, address) {
  if (!cell || cell.t === "z") return { value: null };
  if (cell.t === "e") return { value: null, problem: `${address}: Excel error ${cell.w ?? ""}`.trim() };
  if (cell.t !== "n") return { value: cell.v }; // text and TRUE/FALSE as stored
  const kind = dateFormatKind(cell.z);
  if (!kind) return { value: cell.v };          // an ordinary number
  const result = serialToISO(cell.v, kind, date1904);
  return result.error
    ? { value: null, kind, problem: `${address}: ${result.error}` }
    : { value: result.value, kind };
}

const { execFileSync } = require("child_process");
const XLSX_PATH = require.resolve(process.env.XLSX_MODULE || "xlsx");
// Runs a snippet exactly as printed, in a fresh Node process with the given time zone,
// and returns the value of every line that ends in a comment such as `x; // 4`.
function runSnippet(tz, setup, snippet) {
  const body = snippet.split("\n").map((line) => {
    const m = /^([^/ ].*?);\s*\/\/ /.exec(line);
    return m && !/^(const|let) /.test(m[1]) ? `out.push(${m[1]});` : line;
  }).join("\n");
  const code = `const XLSX = require(${JSON.stringify(XLSX_PATH)}); const out = [];\n${setup}\n${body}\nprocess.stdout.write(JSON.stringify(out));`;
  return JSON.parse(execFileSync(process.execPath, ["-e", code], { env: { ...process.env, TZ: tz } }).toString());
}
const XD_JOINED_SETUP = `const bytes = XLSX.write({ SheetNames: ["Sheet1"], Sheets: { Sheet1: { "!ref": "A1:A3",
  A1: { t: "s", v: "Joined" }, A2: { t: "n", v: 46027, z: "yyyy-mm-dd" }, A3: { t: "n", v: 60, z: "m/d/yy" } } } }, { type: "buffer", bookType: "xlsx" });`;

ok("xd: the one-line formula depends on the time zone", () => {
  const snippet = "// The usual one-liner: 25569 is the serial number of 1970-01-01.\nconst toDate = (serial) => new Date((serial - 25569) * 86400000);\n\ntoDate(46027).toISOString();               // \"2026-01-05T00:00:00.000Z\"\ntoDate(46027).getDate();                   // 4 in Los Angeles, 5 in Tokyo\ntoDate(46027).toLocaleDateString(\"en-US\"); // \"1/4/2026\" in Los Angeles\ntoDate(59).toISOString().slice(0, 10);     // \"1900-02-27\", but Excel shows 2/28/1900";
  assert.deepStrictEqual(runSnippet("America/Los_Angeles", "", snippet), ["2026-01-05T00:00:00.000Z", 4, "1/4/2026", "1900-02-27"]);
  assert.deepStrictEqual(runSnippet("Asia/Tokyo", "", snippet), ["2026-01-05T00:00:00.000Z", 5, "1/5/2026", "1900-02-27"]);
  assert.strictEqual(XLSX.SSF.format("m/d/yyyy", 59), "2/28/1900");
  assert.strictEqual(XLSX.SSF.format("m/d/yyyy", 60), "2/29/1900");
});
ok("xd: cellDates gives UTC dates in cells but local dates from sheet_to_json", () => {
  const snippet = "// Joined.xlsx: A1 \"Joined\", A2 = 2026-01-05, A3 = serial 60, all formatted as dates\nconst workbook = XLSX.read(bytes, { cellDates: true });\nconst sheet = workbook.Sheets[workbook.SheetNames[0]];\n\nsheet.A2.v.toISOString(); // \"2026-01-05T00:00:00.000Z\" on every machine\nconst rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });\nrows[1][0].toISOString(); // \"2026-01-04T15:00:00.000Z\" in Tokyo: local midnight\nrows[2][0];               // 60: the cell for 29 February 1900 is still a number";
  assert.deepStrictEqual(runSnippet("Asia/Tokyo", XD_JOINED_SETUP, snippet), ["2026-01-05T00:00:00.000Z", "2026-01-04T15:00:00.000Z", 60]);
  assert.deepStrictEqual(runSnippet("America/Los_Angeles", XD_JOINED_SETUP, snippet), ["2026-01-05T00:00:00.000Z", "2026-01-05T08:00:00.000Z", 60]);
  assert.deepStrictEqual(runSnippet("UTC", XD_JOINED_SETUP, snippet), ["2026-01-05T00:00:00.000Z", "2026-01-05T00:00:00.000Z", 60]);
  const wb1904 = XLSX.write({ SheetNames: ["S"], Sheets: { S: { "!ref": "A1", A1: { t: "n", v: 44565, z: "m/d/yy" } } }, Workbook: { WBProps: { date1904: true } } }, { type: "buffer", bookType: "xlsx" });
  assert.strictEqual(XLSX.read(wb1904, { cellDates: true }).Sheets.S.A1.v.toISOString(), "2026-01-05T00:00:00.000Z"); // handles 1904
  assert.strictEqual(XLSX.read(wb1904).Sheets.S.A1.v, 44565); // numbers by default
});
ok("xd: the smallest fix for sheet_to_json", () => {
  const snippet = "const workbook = XLSX.read(bytes, { cellDates: true });\nconst sheet = workbook.Sheets[workbook.SheetNames[0]];\nconst rows = XLSX.utils.sheet_to_json(sheet, { header: 1, UTC: true });\n\nrows[1][0].toISOString().slice(0, 10); // \"2026-01-05\" in every time zone\nrows[1][0].getUTCDate();               // 5 (getDate() would still give 4 in Los Angeles)";
  for (const tz of ["America/Los_Angeles", "Asia/Tokyo", "UTC"]) assert.deepStrictEqual(runSnippet(tz, XD_JOINED_SETUP, snippet), ["2026-01-05", 5], tz);
  const left = runSnippet("America/Los_Angeles", XD_JOINED_SETUP, snippet + "\nrows[2][0]; // 60\nrows[1][0].getDate(); // 4");
  assert.deepStrictEqual(left, ["2026-01-05", 5, 60, 4]);
  const timeOnly = runSnippet("UTC", `const bytes = XLSX.write({ SheetNames: ["S"], Sheets: { S: { "!ref": "A1", A1: { t: "n", v: 0.75, z: "hh:mm" } } } }, { type: "buffer", bookType: "xlsx" });
    const t = XLSX.utils.sheet_to_json(XLSX.read(bytes, { cellDates: true }).Sheets.S, { header: 1, UTC: true })[0][0];`, "t.toISOString(); // x");
  assert.deepStrictEqual(timeOnly, ["1899-12-31T18:00:00.000Z"]); // a time becomes a date in December 1899
});
ok("xd: ISO strings back to Date", () => {
  assert.deepStrictEqual(runSnippet("America/Los_Angeles", "", 'new Date("2026-01-05").toISOString(); // a\nnew Date("2026-01-05T13:30:00").toISOString(); // b'),
    ["2026-01-05T00:00:00.000Z", "2026-01-05T21:30:00.000Z"]);
});
ok("xd: no Date cells without cellDates, raw CSV is all text", () => {
  const ws = { "!ref": "A1:A2", A1: { t: "d", v: new Date(Date.UTC(2026, 0, 5)) }, A2: { t: "d", v: new Date(Date.UTC(2026, 0, 5, 13, 30)), z: "yyyy-mm-dd hh:mm" } };
  for (const opts of [{}, { cellDates: true }]) {
    const back = XLSX.read(XLSX.write({ SheetNames: ["S"], Sheets: { S: ws } }, { type: "buffer", bookType: "xlsx", ...opts }), { cellNF: true }).Sheets.S;
    assert.deepStrictEqual([back.A1.t, back.A1.v, back.A2.t, back.A2.v], ["n", 46027, "n", 46027.5625]);
  }
  const csv = XLSX.read("a\n12.5\n2026-01-05", { type: "string", raw: true }).Sheets.Sheet1;
  assert.deepStrictEqual([csv.A2.v, csv.A3.v], ["12.5", "2026-01-05"]);
  assert.deepStrictEqual(XLSX.SSF.parse_date_code(60), { D: 60, T: 0, u: 0, y: 1900, m: 2, d: 29, H: 0, M: 0, S: 0, q: 3 }); // no warning
  assert.strictEqual(XLSX.SSF.parse_date_code(44565, { date1904: true }).y, 2026);
});
ok("xd: SheetJS reads CSV dates month first unless raw is set", () => {
  const snippet = "const csv = \"Joined\\n03/04/2026\\n31/12/2026\\n\";\n\nconst guessed = XLSX.read(csv, { type: \"string\" }).Sheets.Sheet1;\nguessed.A2.v; // 46085, the serial number of 2026-03-04 (read month first)\nguessed.A3.v; // \"31/12/2026\", left as text in the same column\n\nconst kept = XLSX.read(csv, { type: \"string\", raw: true }).Sheets.Sheet1;\nkept.A2.v;    // \"03/04/2026\", text you can check with the rest of the column";
  for (const tz of ["UTC", "Asia/Tokyo"]) assert.deepStrictEqual(runSnippet(tz, "", snippet), [46085, "31/12/2026", "03/04/2026"]);
  assert.strictEqual(serialToISO(46085, "date").value, "2026-03-04");
});
ok("xd: dateFormatKind", () => {
  const cases = {
    "yyyy-mm-dd": "date", "m/d/yy": "date", "dd/mm/yyyy;@": "date", "[$-409]mmmm d, yyyy": "date", "mmm-yy": "date",
    "mmmm": "date", "d-mmm": "date", "yyyy\\-mm\\-dd": "date", '"Due "yyyy-mm-dd': "date", 'yyyy"年"m"月"d"日"': "date",
    "yyyy-mm-dd hh:mm": "datetime", "dd.mm.yyyy hh:mm:ss": "datetime", "m/d/yy h:mm AM/PM": "datetime",
    "hh:mm": "time", "mm:ss": "time", "h:mm AM/PM": "time", "[h]:mm:ss": "duration", "[mm]:ss": "duration",
    "0.00": null, "General": null, "#,##0": null, "[Red]0.00": null, "0%": null, "0.00E+00": null, "@": null,
    '"h"0': null, '0.00" days"': null, '#,##0.00 "€"': null, "[$€-407] #,##0.00": null, "_(* #,##0_)": null,
    "0;[Red]-0": null, "": null,
  };
  for (const [format, want] of Object.entries(cases)) {
    assert.strictEqual(dateFormatKind(format), want, format);
    assert.strictEqual(XLSX.SSF.is_date(format), want !== null, "SheetJS agrees: " + format);
  }
  for (const v of [undefined, null, 14]) assert.strictEqual(dateFormatKind(v), null);
});
ok("xd: serialToISO edge cases", () => {
  const v = (...a) => serialToISO(...a).value, e = (...a) => serialToISO(...a).error;
  assert.strictEqual(v(46027, "date"), "2026-01-05");
  assert.strictEqual(v(46027.5625, "datetime"), "2026-01-05T13:30:00");
  assert.strictEqual(v(46027.5625, "date"), "2026-01-05");
  assert.strictEqual(v(0.604166666666667, "time"), "14:30:00");
  assert.strictEqual(v(0.75, "time"), "18:00:00");
  assert.strictEqual(v(46027.75, "time"), "18:00:00");
  assert.strictEqual(v(1.25, "duration"), 108000);
  const t1430 = 46027 + 870 / 1440; // 2026-01-05 14:30
  assert.strictEqual(Math.floor((t1430 % 1) * 86400), 52199); // cutting off the decimals gives 14:29:59
  assert.strictEqual(v(t1430, "datetime"), "2026-01-05T14:30:00");
  let cut = 0;
  for (let minute = 0; minute < 1440; minute++) {
    const serial = 46027 + minute / 1440;
    if (Math.floor((serial % 1) * 86400) !== minute * 60) cut++;
    assert.strictEqual(v(serial, "time"), `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00`);
  }
  assert.strictEqual(cut, 704);
  assert.strictEqual(XLSX.SSF.format("yyyy-mm-dd", 0), "1900-01-00");
  assert.strictEqual(new Date((1 - 25569) * 86400000).toISOString().slice(0, 10), "1899-12-31"); // the one-liner, serial 1
  assert.strictEqual(v(46027 + 86399.6 / 86400, "datetime"), "2026-01-06T00:00:00"); // rounds into the next day
  assert.strictEqual(v(46027 + 86399.6 / 86400, "date"), "2026-01-05");
  assert.strictEqual(v(46027.9999999, "date"), "2026-01-05");
  for (const near of [46027.99999999999, 46027.9999999999, 46027.999999999, 46027.99999999, 46028.000000001])
    assert.strictEqual(v(near, "date"), XLSX.SSF.format("yyyy-mm-dd", near), String(near));
  assert.strictEqual(v(46027.99999999999, "date"), "2026-01-06");
  assert.strictEqual(v(46027.9999999, "datetime"), "2026-01-06T00:00:00");
  assert.strictEqual(XLSX.SSF.format("yyyy-mm-dd", 46027.9999999), "2026-01-05");
  assert.strictEqual(XLSX.SSF.format("yyyy-mm-dd hh:mm:ss", 46027.9999999), "2026-01-06 00:00:00");
  assert.match(e(0.5, "datetime"), /day 0/);
  assert.strictEqual(v(1, "date"), "1900-01-01");
  assert.strictEqual(v(59, "date"), "1900-02-28");
  assert.match(e(60, "date"), /1900-02-29 does not exist/);
  assert.match(e(60.5, "datetime"), /1900-02-29/);
  assert.strictEqual(v(61, "date"), "1900-03-01");
  assert.match(e(0, "date"), /day 0/);
  assert.strictEqual(v(2958465, "date"), "9999-12-31");
  assert.match(e(2958466, "date"), /after 9999-12-31/);
  assert.strictEqual(v(44565, "date", true), "2026-01-05");
  assert.strictEqual(v(46027, "date") , v(46027 - 1462, "date", true)); // 1,462 days apart
  assert.strictEqual(v(0, "date", true), "1904-01-01");
  assert.strictEqual(v(60, "date", true), "1904-03-01"); // no fake day in the 1904 system
  assert.match(e(2957004, "date", true), /after 9999-12-31/);
  for (const bad of [-1, NaN, Infinity, "46027", null, undefined]) assert.match(e(bad, "date"), /not a valid Excel date number/, String(bad));
  assert.match(e(46027, null), /not a date format/);
});
ok("xd: serialToISO agrees with the SheetJS formatter", () => {
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 20000; i++) {
    const serial = 61 + random() * 60000;
    assert.strictEqual(serialToISO(serial, "date").value, XLSX.SSF.format("yyyy-mm-dd", serial), String(serial));
    assert.strictEqual(serialToISO(serial, "datetime").value, XLSX.SSF.format("yyyy-mm-dd hh:mm:ss", serial).replace(" ", "T"), String(serial));
    assert.strictEqual(serialToISO(serial, "time").value, XLSX.SSF.format("hh:mm:ss", serial), String(serial));
    assert.strictEqual(serialToISO(serial, "date", true).value, XLSX.SSF.format("yyyy-mm-dd", serial, { date1904: true }), "1904 " + serial);
  }
  for (let serial = 1; serial < 60; serial++) assert.strictEqual(serialToISO(serial, "date").value, XLSX.SSF.format("yyyy-mm-dd", serial));
});
const xdFile = (wb) => ({ arrayBuffer: async () => XLSX.write(wb, { type: "array", bookType: "xlsx" }) });
ok("xd: readSheetCells on a workbook", async () => {
  const n = (v, z) => ({ t: "n", v, z });
  const sheet = { "!ref": "B2:C11",
    B2: { t: "s", v: "What" }, C2: { t: "s", v: "Value" },
    B3: { t: "s", v: "dd/mm/yyyy" }, C3: n(46027, "dd/mm/yyyy"),
    B4: { t: "s", v: "date-time" }, C4: n(46027.5625, "dd/mm/yyyy hh:mm"),
    B5: { t: "s", v: "time" }, C5: n(0.75, "h:mm AM/PM"),
    B6: { t: "s", v: "duration" }, C6: n(1.25, "[h]:mm"),
    B7: { t: "s", v: "amount" }, C7: n(12.5, "#,##0.00"),
    B8: { t: "s", v: "fake day" }, C8: n(60, "m/d/yy"),
    B9: { t: "s", v: "text" }, C9: { t: "s", v: "05.01.2026" },
    B10: { t: "s", v: "flag" }, C10: { t: "b", v: true },
    B11: { t: "s", v: "error" }, C11: { t: "e", v: 0x2a, w: "#N/A" } };
  const rows = await readSheetCells(xdFile({ SheetNames: ["S"], Sheets: { S: sheet } }));
  assert.strictEqual(rows.length, 10);
  assert.deepStrictEqual(rows.map((r) => r[1]), [
    { value: "Value" },
    { value: "2026-01-05", kind: "date" },
    { value: "2026-01-05T13:30:00", kind: "datetime" },
    { value: "18:00:00", kind: "time" },
    { value: 108000, kind: "duration" },
    { value: 12.5 },
    { value: null, kind: "date", problem: "C8: 1900-02-29 does not exist (Excel's 1900 leap-year bug)" },
    { value: "05.01.2026" },
    { value: true },
    { value: null, problem: "C11: Excel error #N/A" },
  ]);
});
ok("xd: readSheetCells handles the 1904 system, built-in formats, CSV and every time zone", async () => {
  const one = (cell, props) => xdFile({ SheetNames: ["S"], Sheets: { S: { "!ref": "A1", A1: cell } }, Workbook: props });
  assert.deepStrictEqual((await readSheetCells(one({ t: "n", v: 44565, z: "m/d/yy" }, { WBProps: { date1904: true } })))[0][0], { value: "2026-01-05", kind: "date" });
  assert.deepStrictEqual((await readSheetCells(one({ t: "n", v: 44565, z: "m/d/yy" })))[0][0], { value: "2022-01-04", kind: "date" }); // same number, 1900 system
  const typed = XLSX.utils.aoa_to_sheet([[new Date(Date.UTC(2026, 0, 5))]]); // stored with built-in format 14
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, typed, "S");
  const back = XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" }), { cellNF: true }).Sheets.S.A1;
  assert.strictEqual(back.z, "m/d/yy");
  assert.strictEqual(XLSX.read(XLSX.write(wb, { type: "array", bookType: "xlsx" })).Sheets.S.A1.z, undefined); // without cellNF there is no format code
  const csv = { arrayBuffer: async () => new TextEncoder().encode("Joined\n03/04/2026\n2026-03-04\n").buffer };
  assert.deepStrictEqual((await readSheetCells(csv)).map((r) => r[0].value), ["Joined", "03/04/2026", "2026-03-04"]);
  const empty = { "!ref": "A1:B1", A1: { t: "s", v: "x" } };
  assert.deepStrictEqual(await readSheetCells(xdFile({ SheetNames: ["S"], Sheets: { S: empty } })), [[{ value: "x" }, { value: null }]]);
  assert.deepStrictEqual(await readSheetCells(xdFile({ SheetNames: ["S"], Sheets: { S: {} } })), []);
  const code = `${dateFormatKind}\n${serialToISO}\nconst DAY_MS = 86400000, DAY_ZERO_1900 = Date.UTC(1899, 11, 31), DAY_ZERO_1904 = Date.UTC(1904, 0, 1);
    out.push(serialToISO(46027.5625, "datetime").value, serialToISO(46027, "date").value);`;
  for (const tz of ["America/Los_Angeles", "Asia/Tokyo", "Pacific/Kiritimati"])
    assert.deepStrictEqual(runSnippet(tz, "", code), ["2026-01-05T13:30:00", "2026-01-05"], tz);
});

// --- blog/decode-shift-jis-windows-1252-utf-16-csv-javascript ---
const BOMS = [ // byte order marks; UTF-32 before UTF-16, because FF FE starts both
  { bytes: [0xef, 0xbb, 0xbf], encoding: "utf-8" },
  { bytes: [0xff, 0xfe, 0x00, 0x00], encoding: null }, // UTF-32LE: TextDecoder cannot read it
  { bytes: [0x00, 0x00, 0xfe, 0xff], encoding: null }, // UTF-32BE
  { bytes: [0xff, 0xfe], encoding: "utf-16le" },
  { bytes: [0xfe, 0xff], encoding: "utf-16be" },
];

function sniffBom(bytes) {
  return BOMS.find((bom) => bom.bytes.every((b, i) => bytes[i] === b)) ?? null;
}

// UTF-16 without a BOM: commas, digits and line breaks are 2 bytes with one zero,
// so zeros pile up on one side of each byte pair ("," is 2C 00 in UTF-16LE).
function guessUtf16(bytes) {
  const end = Math.min(bytes.length, 4096) & ~1; // whole 2-byte units only
  let evenZeros = 0, oddZeros = 0;
  for (let i = 0; i < end; i += 2) {
    if (bytes[i] === 0) evenZeros++;
    if (bytes[i + 1] === 0) oddZeros++;
  }
  const units = end / 2;
  const enough = Math.max(units / 10, 4); // a stray zero byte in a short file is not UTF-16
  if (oddZeros >= enough && evenZeros < oddZeros / 4) return "utf-16le";
  if (evenZeros >= enough && oddZeros < evenZeros / 4) return "utf-16be";
  return null;
}

function decodeStrict(bytes, encoding) {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    return null; // the bytes are not valid in this encoding
  }
}

// How many bytes a UTF-8 character starting with this byte has (0: not a valid first byte).
function utf8SequenceLength(b) {
  if (b < 0x80) return 1;
  if (b >= 0xc2 && b <= 0xdf) return 2;
  if (b >= 0xe0 && b <= 0xef) return 3;
  if (b >= 0xf0 && b <= 0xf4) return 4;
  return 0;
}

// After these first bytes the second byte has a narrower range: no overlong forms,
// no surrogates (ED A0-BF), nothing above U+10FFFF (F4 90-BF).
const SECOND_BYTE = { 0xe0: [0xa0, 0xbf], 0xed: [0x80, 0x9f], 0xf0: [0x90, 0xbf], 0xf4: [0x80, 0x8f] };

// Share of non-ASCII bytes that form valid UTF-8 sequences, and where the first bad byte is.
// Close to 1: a UTF-8 file with a few broken bytes. Close to 0: another encoding.
function utf8Damage(bytes) {
  let valid = 0, invalid = 0, firstInvalid = -1;
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    if (b < 0x80) { i++; continue; }
    const length = utf8SequenceLength(b);
    const [low, high] = SECOND_BYTE[b] ?? [0x80, 0xbf];
    let ok = length > 0 && bytes[i + 1] >= low && bytes[i + 1] <= high;
    for (let k = 2; ok && k < length; k++) ok = (bytes[i + k] & 0xc0) === 0x80; // 10xxxxxx
    if (ok) { valid += length; i += length; continue; }
    if (firstInvalid < 0) firstInvalid = i;
    invalid++;
    i++;
  }
  return { share: valid / (valid + invalid || 1), firstInvalid };
}

// An upload limit or a broken copy can cut a file in the middle of a character.
// Returns where that incomplete last character starts, or -1.
function cutCharacterAtEnd(bytes) {
  for (let back = 1; back <= 3 && back <= bytes.length; back++) {
    const b = bytes[bytes.length - back];
    if ((b & 0xc0) === 0x80) continue; // 10xxxxxx: a continuation byte, keep looking for the first byte
    const length = utf8SequenceLength(b);
    return length > back ? bytes.length - back : -1;
  }
  return -1;
}

function lineAt(bytes, offset) { // counts LF, CRLF and CR-only line breaks
  let line = 1;
  for (let i = 0; i < offset; i++) if (bytes[i] === 0x0a || (bytes[i] === 0x0d && bytes[i + 1] !== 0x0a)) line++;
  return line;
}

// Symbols that wrongly decoded Japanese produces often and real Western text almost never uses.
const RARE_SYMBOLS = /[\u0192\u02c6\u02dc\u2020\u2021\u2030\u00a4\u00a6\u00a8\u00af\u00b8\u2039\u203a]/;

function charClass(c) {
  if (c === undefined || c < "\u0080") return /[0-9]/.test(c ?? "") ? "digit" : "ascii";
  if (/[\p{Cc}\p{Co}\p{Cn}\uFFFD]/u.test(c) || RARE_SYMBOLS.test(c)) return "junk"; // controls, private use, unassigned
  if (/[\u3000-\u30ff\uff01-\uff60]/.test(c)) return "kana"; // kana, plus the CJK and full-width punctuation used with it
  if (/\p{Script=Han}/u.test(c)) return "han";
  if (/[\uff61-\uff9f]/.test(c)) return "halfKana";
  if (/\p{L}/u.test(c)) return "letter";
  if (/[\p{Pi}\p{Pf}]/u.test(c)) return "quote"; // “ ” ‘ ’ « »
  return "symbol";
}

// Does a non-ASCII character of this class look real next to these neighbours?
function fitsBetween(cls, sides, hasKana) {
  const latin = (s) => s === "ascii" || s === "digit" || s === "letter" || s === "quote";
  switch (cls) {
    case "kana": return true;
    case "han": return hasKana || sides.some((s) => s === "han" || s === "kana" || s === "digit"); // 東京, 100円
    case "halfKana": return sides.includes("halfKana");
    case "letter": // Müller, l’été
    case "quote": return sides.every(latin);
    case "symbol": return sides.every((s) => s === "ascii" || s === "digit"); // 1.234,50 €
    default: return false; // junk
  }
}

// From 0 to 1: the share of non-ASCII characters that sit where real text puts them.
function plausibility(text) {
  const classes = Array.from(text.slice(0, 100000)).map(charClass); // a sample is enough
  const hasKana = classes.includes("kana");
  let nonAscii = 0, good = 0;
  classes.forEach((cls, i) => {
    if (cls === "ascii" || cls === "digit") return;
    nonAscii++;
    const sides = [classes[i - 1] ?? "ascii", classes[i + 1] ?? "ascii"];
    if (fitsBetween(cls, sides, hasKana)) good++;
  });
  return nonAscii === 0 ? 1 : good / nonAscii;
}

// legacy: the encodings your users' older software writes, most likely first.
function decodeCsv(bytes, legacy = ["windows-1252"]) {
  const result = (encoding, text, sure, reason, options = []) => ({ encoding, text, sure, reason, options });
  const refuse = (reason) => result(null, null, false, reason);

  const startsWith = (...signature) => signature.every((b, i) => bytes[i] === b);
  if (startsWith(0x50, 0x4b, 0x03, 0x04)) return refuse("this is a ZIP file, probably an .xlsx renamed to .csv");
  if (startsWith(0xd0, 0xcf, 0x11, 0xe0)) return refuse("this is an old .xls file renamed to .csv");
  const bom = sniffBom(bytes);
  if (bom && !bom.encoding) return refuse("UTF-32 file: save it as UTF-8 and try again");
  const unicode = bom ? bom.encoding : guessUtf16(bytes);
  if (unicode) {
    const text = decodeStrict(bytes, unicode); // also removes the BOM
    if (text === null) return refuse(`looks like ${unicode} but is not valid ${unicode}`);
    return result(unicode, text, true, bom ? "byte order mark" : "UTF-16 zero-byte pattern");
  }
  if (bytes.includes(0)) return refuse("contains zero bytes: a binary file, or UTF-16 without a byte order mark");

  const utf8 = decodeStrict(bytes, "utf-8");
  if (utf8 !== null) return result("utf-8", utf8, true, "valid UTF-8");

  const options = legacy
    .map((encoding) => ({ encoding, text: decodeStrict(bytes, encoding) }))
    .filter((option) => option.text !== null)
    .map((option) => ({ ...option, score: plausibility(option.text) }))
    .sort((a, b) => b.score - a.score);
  const scores = options.map(({ encoding, score }) => ({ encoding, score })); // for an encoding picker
  const flagUtf8 = (reason) => result("utf-8", new TextDecoder().decode(bytes), false, reason, scores);

  const cut = cutCharacterAtEnd(bytes);
  const before = cut > 0 ? bytes.subarray(0, cut) : null;
  if (before && before.some((b) => b >= 0x80) && decodeStrict(before, "utf-8") !== null)
    return flagUtf8(`UTF-8 cut off in the middle of a character at the end (line ${lineAt(bytes, cut)})`);
  const damage = utf8Damage(bytes);
  if (damage.share >= 0.9) return flagUtf8(`UTF-8 with invalid bytes, first on line ${lineAt(bytes, damage.firstInvalid)}`);

  if (options.length === 0) return refuse(`not valid UTF-8 or ${legacy.join(", ")}`);
  const [best, next] = options;
  if (best.score < 0.9)
    return result(best.encoding, best.text, false, `no encoding gives clean text (best guess: ${best.encoding})`, scores);
  if (next && best.score - next.score < 0.3)
    return result(best.encoding, best.text, false, `${best.encoding} and ${next.encoding} both give clean text`, scores);
  return result(best.encoding, best.text, true, `not UTF-8, clean as ${best.encoding}`, scores);
}

// Runs a snippet as printed and checks every line that ends in a comment holding a
// JSON string (the expected value) or "throws ErrorName".
async function checkCommentedLines(snippet) {
  const checks = [];
  const body = snippet.split("\n").map((line) => {
    const m = /^([^/ ].*?);\s*\/\/ (.+)$/.exec(line);
    if (!m || /^(const|let) /.test(m[1])) return line;
    const want = m[2];
    checks.push(want);
    if (want.startsWith("throws ")) return `try { ${m[1]}; out.push("no error"); } catch (e) { out.push("throws " + e.name); }`;
    return `out.push(await (${m[1]}));`;
  }).join("\n");
  const AsyncFunction = (async () => {}).constructor;
  const out = [];
  await new AsyncFunction("out", body)(out);
  assert.strictEqual(out.length, checks.length);
  checks.forEach((want, i) => assert.strictEqual(out[i], want.startsWith("throws ") ? want : JSON.parse(want), want));
  return checks.length;
}
const hex = (h) => Uint8Array.from(Buffer.from(h.replace(/\s/g, ""), "hex"));
const DEC_SAMPLES_TEXT = {"latin": "Name,City,Amount\nMüller GmbH,Köln,\"1.234,50 €\"\nCafé Crème,Paris,“12,00”\nJosé Peña,São Paulo,–5\nÅsa Ørsted,Århus,99\nà la carte,Zürich,1\n", "latinEnd": "Name\nJosé", "japanese": "氏名,住所,金額\n山田太郎,東京都千代田区一丁目,1200\n株式会社テスト,福岡県,￥300\n", "kanjiOnly": "東京都,大阪府\n", "halfKana": "ﾌﾘｶﾞﾅ,金額\nｶﾌﾞｼｷｶﾞｲｼｬ ﾔﾏﾀﾞ,500\n", "eucjp": "氏名,住所\n山田太郎,東京都です\n", "cyrillic": "Имя,Город\nИван,Москва\n", "yen": "Item,Price\nPen,100円\nBook,1200円\n", "kanjiDate": "Date,Qty\n2024年1月5日,3\n", "quotes": "Note\nl’été, José’s café, “Zoë”, „Grüße“, Škoda, Œuvre\n", "ellipsis": "Note\nCafé…\n", "macRoman": "Name,City\nMüller,Köln\n"};
const DEC_SAMPLES_HEX = {"latin:cp1252": "4e616d652c436974792c416d6f756e740a4dfc6c6c657220476d62482c4bf66c6e2c22312e3233342c35302080220a436166e9204372e86d652c50617269732c9331322c3030940a4a6f73e9205065f1612c53e36f205061756c6f2c96350ac5736120d872737465642cc5726875732c39390ae0206c612063617274652c5afc726963682c310a", "latinEnd:cp1252": "4e616d650a4a6f73e9", "japanese:cp932": "8e8196bc2c8f5a8f8a2c8be08a7a0a8e52936391be98592c938c8b9e937390e791e393638be688ea929a96da2c313230300a8a948eae89ef8ed08365835883672c959f89aa8ca72c818f3330300a", "kanjiOnly:cp932": "938c8b9e93732c91e58de3957b0a", "halfKana:cp932": "ccd8b6dec52c8be08a7a0ab6ccdebcb7b6deb2bcac20d4cfc0de2c3530300a", "eucjp:euc_jp": "bbe1ccbe2cbdbbbdea0abbb3c5c4c2c0cfba2cc5ecb5fec5d4a4c7a4b90a", "cyrillic:cp1251": "c8ecff2cc3eef0eee40ac8e2e0ed2ccceef1eae2e00a", "yen:cp932": "4974656d2c50726963650a50656e2c313030897e0a426f6f6b2c31323030897e0a", "kanjiDate:cp932": "446174652c5174790a32303234944e318c8e3593fa2c330a", "quotes:cp1252": "4e6f74650a6c92e974e92c204a6f73e9927320636166e92c20935a6feb942c20844772fcdf65932c208a6b6f64612c208c757672650a", "ellipsis:cp1252": "4e6f74650a436166e9850a", "macRoman:mac_roman": "4e616d652c436974790a4d9f6c6c65722c4b9a6c6e0a"};

ok("dec: the problem lines print what the comments say", async () => assert.strictEqual(await checkCommentedLines("const cafe = new Uint8Array([0x43, 0x61, 0x66, 0xe9]); // \"Caf\u00e9\" saved as Windows-1252\nawait new Blob([cafe]).text();                 // \"Caf\\uFFFD\"\nnew TextDecoder().decode(cafe);                // \"Caf\\uFFFD\"\nnew TextDecoder(\"windows-1252\").decode(cafe);  // \"Caf\u00e9\"\n\nconst nihon = new Uint8Array([0x93, 0xfa, 0x96, 0x7b]); // \"\u65e5\u672c\" saved as Shift_JIS\nnew TextDecoder(\"shift_jis\").decode(nihon);    // \"\u65e5\u672c\"\nnew TextDecoder(\"windows-1252\").decode(nihon); // \"\u201c\u00fa\u2013{\""), 5));
ok("dec: the trap lines print what the comments say", async () => assert.strictEqual(await checkCommentedLines("// 1. Several labels give the same decoder.\nnew TextDecoder(\"latin1\").encoding;      // \"windows-1252\"\nnew TextDecoder(\"iso-8859-1\").encoding;  // \"windows-1252\"\nnew TextDecoder(\"ascii\").encoding;       // \"windows-1252\"\nnew TextDecoder(\"sjis\").encoding;        // \"shift_jis\"\nnew TextDecoder(\"windows-31j\").encoding; // \"shift_jis\"\nnew TextDecoder(\"utf-16\").encoding;      // \"utf-16le\"\nnew TextDecoder(\"utf-32\");               // throws RangeError\n\n// 2. A byte order mark only helps if you picked the right decoder already.\n// \"Hi\" in UTF-16LE, with a BOM:\nconst hi = new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]);\nnew TextDecoder(\"utf-16le\").decode(hi);  // \"Hi\"\nnew TextDecoder(\"utf-8\").decode(hi);     // \"\\uFFFD\\uFFFDH\\u0000i\\u0000\"\n\n// 3. Windows-1252 accepts every byte, so \"no error\" proves nothing.\nconst strict1252 = new TextDecoder(\"windows-1252\", { fatal: true });\nstrict1252.decode(new Uint8Array([0x81, 0x8d])); // \"\\u0081\\u008d\"\n\n// 4. Chunks decoded separately break characters that cross a chunk boundary.\nconst tokyo = new TextEncoder().encode(\"\u6771\u4eac\"); // 6 bytes, 3 per character\nconst decoder = new TextDecoder();\ndecoder.decode(tokyo.slice(0, 4)) + decoder.decode(tokyo.slice(4)); // \"\u6771\\uFFFD\\uFFFD\\uFFFD\"\ndecoder.decode(tokyo.slice(0, 4), { stream: true }) + decoder.decode(tokyo.slice(4)); // \"\u6771\u4eac\""), 12));
ok("dec: windows-1252 maps every byte, so it never fails", () => {
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  const text = decodeStrict(all, "windows-1252");
  assert.strictEqual(Array.from(text).length, 256);
  assert.strictEqual(text[0x80], "€");
  for (const b of [0x81, 0x8d, 0x8f, 0x90, 0x9d]) assert.strictEqual(text.charCodeAt(b), b); // C1 controls
});
ok("dec: BOMs and UTF-16 without a BOM", () => {
  const u16le = (s) => Uint8Array.from(Buffer.from(s, "utf16le"));
  const u16be = (s) => Uint8Array.from(Buffer.from(s, "utf16le").swap16());
  const withBom = (bom, b) => Uint8Array.from([...bom, ...b]);
  const csv = "Name\tCity\nYui\t東京\nAnna\tKöln\n";
  for (const [bytes, enc, reason] of [
    [withBom([0xef, 0xbb, 0xbf], new TextEncoder().encode(csv)), "utf-8", "byte order mark"],
    [withBom([0xff, 0xfe], u16le(csv)), "utf-16le", "byte order mark"],
    [withBom([0xfe, 0xff], u16be(csv)), "utf-16be", "byte order mark"],
    [u16le(csv), "utf-16le", "UTF-16 zero-byte pattern"],
    [u16be(csv), "utf-16be", "UTF-16 zero-byte pattern"],
    [u16le("番地,住所\r\n一丁目,東京都千代田区\r\n"), "utf-16le", "UTF-16 zero-byte pattern"], // 一 is 00 4E: a zero on the other side
  ]) {
    const r = decodeCsv(bytes);
    assert.strictEqual(r.encoding, enc, enc + " " + reason);
    assert.strictEqual(r.reason, reason);
    assert.strictEqual(r.sure, true);
    assert(!r.text.startsWith("\ufeff"), "BOM removed");
  }
  assert.deepStrictEqual(decodeCsv(withBom([0xff, 0xfe, 0, 0], [0x41, 0, 0, 0])), { encoding: null, text: null, sure: false, reason: "UTF-32 file: save it as UTF-8 and try again", options: [] });
  assert.strictEqual(decodeCsv(withBom([0, 0, 0xfe, 0xff], [0, 0, 0, 0x41])).reason, "UTF-32 file: save it as UTF-8 and try again");
  assert.strictEqual(decodeCsv(withBom([0xff, 0xfe], [0x00, 0xd8, 0x41, 0x00])).reason, "looks like utf-16le but is not valid utf-16le"); // lone surrogate
  assert.strictEqual(decodeCsv(withBom([0xef, 0xbb, 0xbf], [0x43, 0xe9])).reason, "looks like utf-8 but is not valid utf-8");
  assert.strictEqual(guessUtf16(new TextEncoder().encode("Name,City\nYui,Tokyo\n")), null);
  assert.strictEqual(guessUtf16(new Uint8Array([])), null);
});
ok("dec: refuses files that are not text", () => {
  assert.strictEqual(decodeCsv(hex("504b0304 14000600 08000000 2100")).reason, "this is a ZIP file, probably an .xlsx renamed to .csv");
  assert.strictEqual(decodeCsv(hex("d0cf11e0 a1b11ae1 0000 0000")).reason, "this is an old .xls file renamed to .csv");
  assert.strictEqual(decodeCsv(hex("61 00 62 2c 63 0a")).reason, "contains zero bytes: a binary file, or UTF-16 without a byte order mark"); // too short to be UTF-16
  assert.strictEqual(decodeCsv(new TextEncoder().encode("Name,City\nYui,Tokyo\u0000\nAnna,Berlin\n")).reason, "contains zero bytes: a binary file, or UTF-16 without a byte order mark");
});
ok("dec: UTF-8 and plain ASCII are read as UTF-8", () => {
  assert.deepStrictEqual(decodeCsv(new TextEncoder().encode("Name,City\nYui,東京\n"), ["shift_jis"]), { encoding: "utf-8", text: "Name,City\nYui,東京\n", sure: true, reason: "valid UTF-8", options: [] });
  assert.strictEqual(decodeCsv(new TextEncoder().encode("a,b\n1,2\n")).encoding, "utf-8");
  assert.strictEqual(decodeCsv(new Uint8Array([])).text, "");
});
ok("dec: damaged UTF-8 is flagged with the line, not re-read as a legacy encoding", () => {
  const bytes = Uint8Array.from([...new TextEncoder().encode("名前,都市\n山田,東京\n"), ...hex("4361 66e9 2c50 6172 6973 0a"), ...new TextEncoder().encode("佐藤,大阪\n")]);
  const r = decodeCsv(bytes, ["windows-1252", "shift_jis"]);
  assert.deepStrictEqual([r.encoding, r.sure, r.reason], ["utf-8", false, "UTF-8 with invalid bytes, first on line 3"]);
  assert(r.text.includes("Caf\uFFFD,Paris") && r.text.includes("佐藤,大阪"));
  assert.deepStrictEqual(utf8Damage(hex("43 61 66 e9")), { share: 0, firstInvalid: 3 });
  assert.deepStrictEqual(utf8Damage(new TextEncoder().encode("abc")), { share: 0, firstInvalid: -1 });
  assert.strictEqual(utf8Damage(hex("e6 9d b1 41")).share, 1);
  assert.strictEqual(utf8Damage(hex("e6 9d 41")).share, 0); // truncated sequence
  assert.deepStrictEqual(utf8Damage(hex("e6 9d b1 0a ed a0 80 0a")), { share: 0.5, firstInvalid: 4 }); // a surrogate
  assert.strictEqual(utf8Damage(hex("e0 80 80")).firstInvalid, 0); // overlong
  assert.strictEqual(utf8Damage(hex("f4 90 80 80")).firstInvalid, 0); // above U+10FFFF
  assert.strictEqual(utf8Damage(hex("f0 9f 98 80")).share, 1);
  assert.strictEqual(lineAt(hex("41 0a 42 0a 43"), 4), 3);
  assert.strictEqual(lineAt(hex("41 0d 0a 42 0d 0a 43"), 6), 3); // CRLF
  assert.strictEqual(lineAt(hex("41 0d 42 0d 43"), 4), 3); // CR only (old Mac files)
});
ok("dec: damaged UTF-8 still lists the legacy candidates for a picker", () => {
  const bytes = Uint8Array.from([...new TextEncoder().encode("名前,都市\n山田,東京\n"), ...hex("4361 66e9 2c50 6172 6973 0a"), ...new TextEncoder().encode("佐藤,大阪\n")]);
  assert.deepStrictEqual(decodeCsv(bytes, ["windows-1252", "shift_jis"]).options.map((o) => o.encoding), ["windows-1252"]); // not valid Shift_JIS
});
ok("dec: UTF-8 cut off in the middle of a character at the end", () => {
  const whole = new TextEncoder().encode("名前,都市\n山田,東京\n佐藤,大阪");
  for (const drop of [1, 2]) {
    const r = decodeCsv(whole.subarray(0, whole.length - drop), ["windows-1252", "shift_jis"]);
    assert.deepStrictEqual([r.encoding, r.sure, r.reason], ["utf-8", false, "UTF-8 cut off in the middle of a character at the end (line 3)"]);
    assert(r.text.startsWith("名前,都市\n山田,東京\n佐藤,大") && r.text.endsWith("\uFFFD"));
  }
  assert.strictEqual(cutCharacterAtEnd(whole), -1);
  assert.strictEqual(cutCharacterAtEnd(new Uint8Array([])), -1);
  assert.strictEqual(cutCharacterAtEnd(hex("41 f0 9f 98")), 1);
  // A Windows-1252 file ending in é (E9) is not mistaken for cut-off UTF-8: the rest is plain ASCII.
  assert.deepStrictEqual([decodeCsv(hex("43 61 66 e9")).encoding, decodeCsv(hex("43 61 66 e9")).sure], ["windows-1252", true]);
});
ok("dec: UTF-16 without a BOM and without ASCII is refused, not misread", () => {
  const r = decodeCsv(Uint8Array.from(Buffer.from("東京都千代田区\n大阪府大阪市\n", "utf16le")), ["windows-1252", "shift_jis"]);
  assert.strictEqual(r.reason, "contains zero bytes: a binary file, or UTF-16 without a byte order mark");
});
ok("dec: Node's Blob.text() ignores a UTF-16 byte order mark", async () => {
  assert.strictEqual(await new Blob([new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00])]).text(), "\uFFFD\uFFFDH\u0000i\u0000");
});
ok("dec: scores in the not-sure rows of the table", () => {
  const rows = [
    ["kanjiDate:cp932", ["windows-1252", "shift_jis"], [["windows-1252", 1], ["shift_jis", 1]]],
    ["japanese:cp932", ["windows-1252"], [["windows-1252", 0.23]]],
    ["japanese:cp932", ["shift_jis", "gb18030"], [["shift_jis", 1], ["gb18030", 1]]],
    ["cyrillic:cp1251", ["windows-1252", "windows-1251"], [["windows-1252", 1], ["windows-1251", 1]]],
    ["ellipsis:cp1252", ["windows-1252", "shift_jis"], [["windows-1252", 0], ["shift_jis", 0]]],
  ];
  for (const [k, legacy, want] of rows)
    assert.deepStrictEqual(decodeCsv(hex(DEC_SAMPLES_HEX[k]), legacy).options.map((o) => [o.encoding, Math.round(o.score * 100) / 100]), want, k);
});
ok("dec: a real per-mille sign or dagger in Windows-1252 is a false alarm", () => {
  for (const hexText of ["4e616d652c526174650a4b6f63682c35890a", "4e616d652c4e6f74650a536d6974682c8631393930"]) { // "Koch,5‰", "Smith,†1990"
    const r = decodeCsv(hex(hexText), ["windows-1252", "shift_jis"]);
    assert.deepStrictEqual([r.encoding, r.sure], ["windows-1252", false], r.reason);
  }
});
ok("dec: utf8SequenceLength", () => {
  assert.deepStrictEqual([0x41, 0x80, 0xc1, 0xc2, 0xdf, 0xe0, 0xef, 0xf0, 0xf4, 0xf5, 0xff].map(utf8SequenceLength), [1, 0, 0, 2, 2, 3, 3, 4, 4, 0, 0]);
});
ok("dec: decodeAs can switch back to damaged UTF-8", async () => {
  const bytes = Uint8Array.from([...new TextEncoder().encode("名前,都市\n山田,東京\n"), ...hex("4361 66e9 2c50 6172 6973 0a"), ...new TextEncoder().encode("佐藤,大阪\n")]);
  const AsyncFunction = (async () => {}).constructor;
  const got = await new AsyncFunction("file", "decodeCsv", "decodeStrict", "async function readCsvText(file, legacy) {\n  const bytes = new Uint8Array(await file.arrayBuffer());\n  const decoded = decodeCsv(bytes, legacy);\n  // When decoded.sure is false, show a preview and let the user pick another encoding.\n  // decodeAs returns null if the bytes are not valid in the chosen encoding; switching\n  // back to the first result always works, even for damaged UTF-8.\n  const decodeAs = (encoding) => (encoding === decoded.encoding ? decoded.text : decodeStrict(bytes, encoding));\n  return { ...decoded, decodeAs };\n}\n\nconst { encoding, text, sure, reason, options, decodeAs } = await readCsvText(file, [\"windows-1252\", \"shift_jis\"]);" + "\nreturn { encoding, text, back: decodeAs('utf-8'), other: decodeAs('windows-1252') };")(new Blob([bytes]), decodeCsv, decodeStrict);
  assert.strictEqual(got.encoding, "utf-8");
  assert.strictEqual(got.back, got.text);
  assert(got.other.includes("Café,Paris"));
});
ok("dec: sample counts quoted in step 3", () => {
  const valid = (keys, e) => keys.filter((k) => decodeStrict(hex(DEC_SAMPLES_HEX[k]), e) !== null).length;
  const western = ["latin:cp1252", "latinEnd:cp1252", "quotes:cp1252", "ellipsis:cp1252"];
  const sjis = ["japanese:cp932", "kanjiOnly:cp932", "halfKana:cp932", "yen:cp932", "kanjiDate:cp932"];
  assert.strictEqual(valid(western, "shift_jis"), 1); // 3 of 4 Windows-1252 samples are not valid Shift_JIS
  assert.strictEqual(valid(sjis, "euc-jp"), 1); // 4 of 5 Shift_JIS samples are not valid EUC-JP
  assert.strictEqual(valid(sjis, "gb18030"), 4); // 4 of 5 Shift_JIS samples are valid GB18030
});
const DEC_TABLE = [
  // sample, saved as, candidates, expected encoding, expected sure
  ["latin", "cp1252", ["windows-1252"], "windows-1252", true],
  ["latin", "cp1252", ["windows-1252", "shift_jis"], "windows-1252", true],
  ["latin", "cp1252", ["shift_jis"], null, false],
  ["latinEnd", "cp1252", ["shift_jis", "windows-1252"], "windows-1252", true],
  ["japanese", "cp932", ["windows-1252", "shift_jis"], "shift_jis", true],
  ["japanese", "cp932", ["shift_jis", "euc-jp"], "shift_jis", true],
  ["japanese", "cp932", ["windows-1252"], "windows-1252", false],
  ["kanjiOnly", "cp932", ["windows-1252", "shift_jis"], "shift_jis", true],
  ["halfKana", "cp932", ["windows-1252", "shift_jis"], "shift_jis", true],
  ["eucjp", "euc_jp", ["shift_jis", "euc-jp"], "euc-jp", true],
  ["japanese", "cp932", ["shift_jis", "gb18030"], "shift_jis", false],
  ["cyrillic", "cp1251", ["windows-1252", "windows-1251"], "windows-1252", false],
  ["cyrillic", "cp1251", ["windows-1252"], "windows-1252", true], // wrong, and sure: list every encoding your users have
  ["yen", "cp932", ["windows-1252", "shift_jis"], "shift_jis", true],
  ["kanjiDate", "cp932", ["windows-1252", "shift_jis"], "windows-1252", false],
  ["quotes", "cp1252", ["windows-1252", "shift_jis"], "windows-1252", true],
  ["ellipsis", "cp1252", ["windows-1252", "shift_jis"], "windows-1252", false], // a false alarm: … right after é
  ["macRoman", "mac_roman", ["windows-1252", "shift_jis"], "windows-1252", true], // wrong: list "macintosh" if your users have it
  ["macRoman", "mac_roman", ["macintosh", "windows-1252"], "macintosh", false],
];
ok("dec: decision table", () => {
  for (const [sample, savedAs, legacy, encoding, sure] of DEC_TABLE) {
    const r = decodeCsv(hex(DEC_SAMPLES_HEX[sample + ":" + savedAs]), legacy);
    assert.deepStrictEqual([r.encoding, r.sure], [encoding, sure], `${sample} as ${savedAs} with ${legacy}: ${r.reason}`);
    if (sure && sample !== "cyrillic" && sample !== "macRoman") assert.strictEqual(r.text, DEC_SAMPLES_TEXT[sample]);
  }
});
ok("dec: numbers quoted in the post", () => {
  const bytes = (k) => hex(DEC_SAMPLES_HEX[k]);
  const score = (k, e) => Math.round(plausibility(decodeStrict(bytes(k), e)) * 100) / 100;
  assert.strictEqual(score("japanese:cp932", "shift_jis"), 1);
  assert.strictEqual(score("japanese:cp932", "windows-1252"), 0.23);
  assert.strictEqual(score("japanese:cp932", "gb18030"), 1);
  const japanese = ["japanese:cp932", "kanjiOnly:cp932", "halfKana:cp932", "eucjp:euc_jp"].map((k) => utf8Damage(bytes(k)).share);
  assert.strictEqual(Math.min(...japanese), 0);
  assert.strictEqual(Math.round(Math.max(...japanese) * 100) / 100, 0.31);
  for (const k of ["latin:cp1252", "latinEnd:cp1252"]) {
    assert.strictEqual(utf8Damage(bytes(k)).share, 0);
    assert.strictEqual(decodeStrict(bytes(k), "shift_jis"), null);
  }
  for (const k of ["japanese:cp932", "kanjiOnly:cp932", "halfKana:cp932"]) assert.strictEqual(decodeStrict(bytes(k), "euc-jp"), null);
  assert.deepStrictEqual(["japanese:cp932", "kanjiOnly:cp932", "halfKana:cp932", "eucjp:euc_jp"].map((k) => decodeStrict(bytes(k), "gb18030") !== null), [true, true, false, true]);
  for (const k of Object.keys(DEC_SAMPLES_HEX)) assert.strictEqual(decodeStrict(bytes(k), "utf-8"), null, k);
  const ascii = Uint8Array.from([9, 10, 13, ...Array.from({ length: 95 }, (_, i) => i + 32)]); // tab, line breaks, printable ASCII
  for (const e of ["utf-8", "windows-1252", "shift_jis", "euc-jp", "gb18030", "windows-1251"])
    assert.strictEqual(decodeStrict(ascii, e), String.fromCharCode(...ascii), e);
  const high = decodeStrict(Uint8Array.from({ length: 128 }, (_, i) => i + 128), "windows-1252");
  assert.strictEqual(Array.from(high).filter((c) => /\p{Cc}/u.test(c)).length, 5); // five invisible control characters
});
ok("dec: plausibility scores", () => {
  assert.strictEqual(plausibility("Müller, Köln, São Paulo, Ørsted, à la carte, “12,00”, 1.234,50 €, –5"), 1);
  assert.strictEqual(plausibility("plain ASCII"), 1);
  assert.strictEqual(plausibility("山田太郎,東京都"), 1);
  assert.strictEqual(plausibility("ｶﾌﾞｼｷｶﾞｲｼｬ"), 1);
  assert.strictEqual(Math.round(plausibility("“ú–{") * 100) / 100, 0.33); // 日本 read as Windows-1252
  assert.strictEqual(plausibility("Caf\uFFFD"), 0);
  assert.strictEqual(plausibility("a\u0081b"), 0);
  assert.strictEqual(plausibility("S翳 Paulo"), 0); // a lone kanji between Latin letters
  assert.strictEqual(plausibility("\uFFFD".repeat(100001) + "é".repeat(10)), 0); // only the first 100,000 characters count
});
ok("dec: readCsvText on a file", async () => {
  const snippet = "async function readCsvText(file, legacy) {\n  const bytes = new Uint8Array(await file.arrayBuffer());\n  const decoded = decodeCsv(bytes, legacy);\n  // When decoded.sure is false, show a preview and let the user pick another encoding.\n  // decodeAs returns null if the bytes are not valid in the chosen encoding; switching\n  // back to the first result always works, even for damaged UTF-8.\n  const decodeAs = (encoding) => (encoding === decoded.encoding ? decoded.text : decodeStrict(bytes, encoding));\n  return { ...decoded, decodeAs };\n}\n\nconst { encoding, text, sure, reason, options, decodeAs } = await readCsvText(file, [\"windows-1252\", \"shift_jis\"]);";
  const file = new Blob([hex(DEC_SAMPLES_HEX["japanese:cp932"])]);
  const AsyncFunction = (async () => {}).constructor;
  const got = await new AsyncFunction("file", "decodeCsv", "decodeStrict", snippet + "\nreturn { encoding, text, sure, reason, options, other: decodeAs('windows-1252'), invalid: decodeAs('euc-jp') };")(file, decodeCsv, decodeStrict);
  assert.deepStrictEqual([got.encoding, got.sure, got.text], ["shift_jis", true, DEC_SAMPLES_TEXT.japanese]);
  assert.strictEqual(got.invalid, null);
  assert.deepStrictEqual(got.options.map((o) => o.encoding), ["shift_jis", "windows-1252"]);
  assert(got.other.startsWith("\u017d\u0081\u2013\u00bc")); // the same bytes as Windows-1252
});

// --- blog/map-spreadsheet-columns-to-fields-javascript ---
{
function normalizeHeader(text) {
  return String(text ?? "")
    // Ｅｍａｉｌ -> Email, ﾒｰﾙ -> メール, no-break space -> space
    .normalize("NFKC")
    // zero-width spaces and byte order marks
    .replace(/\p{Cf}/gu, "")
    // signupDate -> signup Date
    .replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")
    .toLowerCase()
    // é -> e, but the mark in Japanese ド stays
    .normalize("NFD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .normalize("NFC")
    // punctuation, underscores and runs of spaces -> one space
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Plurals count as the same word. "address" is left alone.
function stem(word) {
  if (/(ss|x|ch|sh)es$/.test(word)) return word.slice(0, -2); // addresses
  if (word.length > 3 && /[^s]s$/.test(word)) return word.slice(0, -1); // plans
  return word;
}
const words = (text) => normalizeHeader(text).split(" ").filter(Boolean).map(stem);
const headerKey = (text) => words(text).join(" ");

// True when b is a with one letter changed, added or removed,
// or with two neighbouring letters swapped.
function oneEditApart(a, b) {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (a[i] === b[i]) i++; // length of the common start
  if (a.length === b.length) {
    return a.slice(i + 1) === b.slice(i + 1) ||
      (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  }
  const [longer, shorter] = a.length > b.length ? [a, b] : [b, a];
  return longer.slice(i + 1) === shorter.slice(i);
}

function compareNames(header, name) {
  const h = words(header), n = words(name);
  if (!h.length || !n.length) return null;
  const hJoined = h.join(""), nJoined = n.join("");
  if (hJoined === nJoined) return { score: 1, why: `same as "${name}"` };
  const contained = n.every((w) => h.includes(w));
  if (contained && h.length === n.length) {
    return { score: 0.95, why: `same words as "${name}"` };
  }
  if (contained) {
    return { score: 0.5 + 0.4 * (n.length / h.length), why: `contains "${name}"` };
  }
  const longEnough = Math.min(hJoined.length, nJoined.length) >= 5;
  if (longEnough && oneEditApart(hJoined, nJoined)) {
    return { score: 0.6, why: `spelled like "${name}"` };
  }
  return null;
}

const looksLikeEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
const looksLikeNumber = (v) =>
  typeof v === "number" || /^[-+(]?[$€£¥]?\s?\d[\d.,\s']*\)?$/.test(String(v).trim());

const FIELDS = [
  { key: "name", label: "Full name", required: true,
    aliases: ["name", "customer name", "contact name", "氏名", "名前"] },
  { key: "email", label: "Email", required: true,
    looksLike: looksLikeEmail, findByValues: true,
    aliases: ["email address", "mail", "e-mail address", "email adresse",
              "メールアドレス", "メール"] },
  { key: "company", label: "Company",
    aliases: ["company name", "organization", "organisation", "会社名"] },
  { key: "phone", label: "Phone",
    aliases: ["phone number", "telephone", "tel", "mobile", "電話番号"] },
  { key: "mrr", label: "MRR", looksLike: looksLikeNumber,
    aliases: ["monthly revenue", "monthly recurring revenue"] },
];

const MIN_SCORE = 0.6;   // weaker name matches are ignored
const SURE_SCORE = 0.95; // weaker name matches need values to confirm them
const CLOSE = 0.1;       // a rival this close makes the choice a guess

// 0 -> "A", 27 -> "AB"
function columnLetter(i) {
  const prefix = i >= 26 ? columnLetter(Math.floor(i / 26) - 1) : "";
  return prefix + String.fromCharCode(65 + (i % 26));
}

// How many sample values pass the field's check (null: nothing to check).
function valueShare(field, values = []) {
  const filled = values.filter((v) => v != null && String(v).trim() !== "");
  if (!field.looksLike || !filled.length) return null;
  const pass = filled.filter(field.looksLike).length;
  const text = `${pass} of ${filled.length} values look like ${field.label}`;
  return { pass, of: filled.length, text };
}

function bestNameMatch(header, field, remembered) {
  const key = headerKey(header);
  if (key && remembered[key] === field.key) {
    return { score: 1, why: "chosen by a user before" };
  }
  let best = null;
  for (const name of [field.key, field.label, ...(field.aliases ?? [])]) {
    const m = compareNames(header, name);
    if (m && (!best || m.score > best.score)) best = m;
  }
  return best;
}

function mapColumns(headers, fields, { samples = [], remembered = {} } = {}) {
  // Columns that matched a field but were not used: column -> { key, why, second }.
  // second: a better column already fills that field.
  const notUsed = new Map();
  const note = (column, key, why, second = false) => {
    if (!notUsed.has(column)) notUsed.set(column, { key, why, second });
  };

  // 1. Pairs whose names match and whose values do not contradict them.
  const pairs = [];
  fields.forEach((field, f) => headers.forEach((header, column) => {
    const best = bestNameMatch(header, field, remembered);
    if (!best || best.score < MIN_SCORE) return;
    const share = valueShare(field, samples[column]);
    if (share && share.pass / share.of < 0.5) {
      return note(column, field.key, `matched by name, but only ${share.text}`);
    }
    const confirmed = share && share.pass / share.of >= 0.9;
    const doubt = share && !confirmed && `only ${share.text}`;
    pairs.push({ f, column, ...best, confirmed, doubt });
  }));

  // 2. Best pairs first; each field and each column is used once.
  pairs.sort((a, b) => b.score - a.score || a.column - b.column || a.f - b.f);
  const byField = Object.fromEntries(fields.map((field) => [field.key, null]));
  const usedBy = new Map(); // column -> field key
  for (const p of pairs) {
    const field = fields[p.f], taken = byField[field.key];
    if (usedBy.has(p.column)) continue;
    if (taken) {
      const where = columnLetter(taken.column);
      const why = `also matches ${field.label}, which column ${where} already fills`;
      note(p.column, field.key, why, true);
      continue;
    }
    // A rival scores almost as well and could still be used: another free column
    // for this field, or another empty field for this column.
    const rival = pairs.find((q) => q !== p && q.score >= p.score - CLOSE && (
      (q.f === p.f && !usedBy.has(q.column)) ||
      (q.column === p.column && !byField[fields[q.f].key])));
    const doubts = [];
    if (p.score < SURE_SCORE && !p.confirmed) doubts.push("weak name match");
    const rivalColumn = rival && columnLetter(rival.column);
    if (rival?.f === p.f) doubts.push(`column ${rivalColumn} matches too`);
    else if (rival) doubts.push(`could also be ${fields[rival.f].label}`);
    if (p.doubt) doubts.push(p.doubt);
    const header = headers[p.column], sure = !doubts.length;
    byField[field.key] = { column: p.column, header, why: p.why, sure, doubts };
    usedBy.set(p.column, field.key);
  }

  // 3. Fields still empty: the one unused column whose values look right (9 in 10).
  for (const field of fields) {
    if (byField[field.key] || !field.findByValues) continue;
    const fits = headers.map((_, column) => column).filter((column) => {
      const share = !usedBy.has(column) && valueShare(field, samples[column]);
      return share && share.pass / share.of >= 0.9;
    });
    if (fits.length !== 1) {
      const why = `values look like ${field.label}, but so do other columns`;
      fits.forEach((column) => note(column, field.key, why));
      continue;
    }
    const [column] = fits, header = headers[column];
    const why = `values look like ${field.label}`;
    const doubts = ["matched by its values, not its name"];
    byField[field.key] = { column, header, why, sure: false, doubts };
    usedBy.set(column, field.key);
  }

  const unmatched = headers
    .map((header, column) => ({ column, header }))
    .filter(({ column }) => !usedBy.has(column))
    .map((c) => ({ ...c, why: notUsed.get(c.column)?.why ??
      (normalizeHeader(c.header) ? "no field has this name" : "empty header") }));
  const missing = fields.filter((f) => f.required && !byField[f.key])
    .map((f) => f.key);
  // A person should look when a field stayed empty although a column's name
  // matched it, or when a second column matches a filled field (Email, Email 2).
  const needsLook = unmatched.some(({ column }) => {
    const n = notUsed.get(column);
    return n && (n.second || !byField[n.key]);
  });
  const allSure = Object.values(byField).every((m) => !m || m.sure);
  const sure = !missing.length && !needsLook && allSure;
  return { byField, unmatched, missing, sure };
}

// After the user confirms the mapping screen, store their choices
// (in your database or in localStorage).
function rememberMapping(remembered, headers, byField) {
  for (const [key, match] of Object.entries(byField)) {
    const header = match && headerKey(headers[match.column]);
    if (header) remembered[header] = key; // blank headers are not remembered
  }
  return remembered;
}

// rows: arrays of cells from your CSV or Excel parser.
// headerRow: the index of the header row.
function suggestMapping(rows, headerRow, remembered = {}) {
  const headers = rows[headerRow] ?? [];
  // 50 data rows are enough to check the values.
  const firstRows = rows.slice(headerRow + 1, headerRow + 51);
  const samples = headers.map((_, column) => firstRows.map((row) => row?.[column]));
  return mapColumns(headers, FIELDS, { samples, remembered });
}

// Rows whose mapped cells are all blank are skipped.
function applyMapping(rows, headerRow, byField) {
  const used = Object.entries(byField).filter(([, match]) => match);
  const cell = (row, match) => row?.[match.column] ?? "";
  const toRecord = (row) =>
    Object.fromEntries(used.map(([key, match]) => [key, cell(row, match)]));
  return rows.slice(headerRow + 1)
    .filter((row) => used.some(([, match]) => String(cell(row, match)).trim() !== ""))
    .map(toRecord);
}

// Short form of a result: field -> header ("?" when not sure), plus unmatched headers, missing fields and sure.
const summary = (r) => ({
  mapped: Object.fromEntries(Object.entries(r.byField).filter(([, m]) => m).map(([k, m]) => [k, String(m.header) + (m.sure ? "" : "?")])),
  unmatched: r.unmatched.map((u) => String(u.header)),
  missing: r.missing,
  sure: r.sure,
});
const run = (headers, samples) => summary(mapColumns(headers, FIELDS, { samples }));

ok("map: the problem lines print what the comments say", async () => assert.strictEqual(await checkCommentedLines("const EMAIL_NAMES = [\"email\", \"e-mail\", \"email address\", \"mail\"];\nconst exactMatch = (header) => EMAIL_NAMES.includes(header.trim().toLowerCase());\nexactMatch(\"E-mail\");             // true\nexactMatch(\"E-Mail-Adresse\");     // false\nexactMatch(\"Email\\u00A0address\");  // false\nexactMatch(\"\uff25\uff4d\uff41\uff49\uff4c\");         // false\n\nconst looseMatch = (header) => header.toLowerCase().includes(\"mail\");\nlooseMatch(\"Mailing address\");    // true\nlooseMatch(\"Email opt-in\");       // true"), 6));
ok("map: normalizeHeader", () => {
  const cases = {
    "E-mail": "e mail", "  E-Mail  ": "e mail", "\uFF25\uFF4D\uFF41\uFF49\uFF4C": "email", "\uFF25\uFF0D\uFF4D\uFF41\uFF49\uFF4C": "e mail",
    "\uFEFFName": "name", "Email\u200B": "email", "Sign\u00A0up date": "sign up date", "signupDate": "signup date",
    "sign_up_date": "sign up date", "SIGNUP DATE": "signup date", "MRR ($)": "mrr", "Téléphone": "telephone",
    "E-Mail-Adresse": "e mail adresse", "Order #": "order", "\uFF92\uFF70\uFF99\uFF71\uFF84\uFF9E\uFF9A\uFF7D": "メールアドレス",
    "\uFF71\uFF84\uFF9E\uFF9A\uFF7D": "アドレス", "電話番号": "電話番号", "\uFF25メール": "eメール",
  };
  for (const [input, want] of Object.entries(cases)) assert.strictEqual(normalizeHeader(input), want, JSON.stringify(input));
  assert.strictEqual(normalizeHeader(null), "");
  assert.strictEqual(normalizeHeader(undefined), "");
  assert.strictEqual(normalizeHeader(2024), "2024");
  assert.strictEqual(normalizeHeader(" - "), "");
  assert.deepStrictEqual(words("Plans"), ["plan"]);
  assert.deepStrictEqual(words("Email Addresses"), ["email", "address"]);
  assert.deepStrictEqual(words("Address"), ["address"]);
  assert.deepStrictEqual(words("Bus"), ["bus"]);
  assert.deepStrictEqual(words("Boxes Sales"), ["box", "sale"]);
  assert.strictEqual("\uFEFF Email\u00A0".trim(), "Email"); // trim() already removes these at the ends
  assert.strictEqual(headerKey("Customer_Names"), "customer name");
});
ok("map: oneEditApart", () => {
  for (const [a, b] of [["emial", "email"], ["compnay", "company"], ["emails", "email"], ["phne", "phone"], ["email", "emaik"], ["xemail", "email"]])
    assert(oneEditApart(a, b) && oneEditApart(b, a), a + "/" + b);
  for (const [a, b] of [["email", "email"], ["email", "mail ad"], ["email", "eamil x"], ["phone", "phoen1"], ["mrr", "a"], ["", "ab"], ["abcd", "badc"]])
    assert(!oneEditApart(a, b) && !oneEditApart(b, a), a + "/" + b);
  assert(oneEditApart("", "a"));
});
ok("map: compareNames scores", () => {
  const score = (h, n) => compareNames(h, n)?.score ?? null;
  assert.strictEqual(score("E-mail", "email"), 1);
  assert.strictEqual(score("E-Mail-Adresse", "email adresse"), 1);
  assert.strictEqual(score("Address email", "email address"), 0.95);
  assert.strictEqual(score("Primary email", "email"), 0.7);
  assert.strictEqual(Math.round(score("Signup date (UTC)", "signup date") * 1000), 767);
  assert.strictEqual(Math.round(score("Email opt-in", "email") * 1000), 633);
  assert.strictEqual(score("Emial", "email"), 0.6);
  assert.strictEqual(score("ARR", "mrr"), null);       // too short for the spelling rule
  assert.strictEqual(score("Mail", "main"), null);
  assert.strictEqual(score("Mailing address", "mail"), null);
  assert.strictEqual(score("Mailing address", "email address"), null);
  assert.strictEqual(score("", "email"), null);
  assert.strictEqual(score("顧客メールアドレス", "メールアドレス"), null); // no spaces between Japanese words
  assert.strictEqual(compareNames("Mail", "mail").why, 'same as "mail"');
});
ok("map: decision table", () => {
  const table = [[["Name", "E-mail", "Company", "MRR"], null, {"mapped": {"name": "Name", "email": "E-mail", "company": "Company", "mrr": "MRR"}, "unmatched": [], "missing": [], "sure": true}], [["Customer name", "Email address", "Organisation", "Monthly revenue"], null, {"mapped": {"name": "Customer name", "email": "Email address", "company": "Organisation", "mrr": "Monthly revenue"}, "unmatched": [], "missing": [], "sure": true}], [["Ｎａｍｅ", "﻿E-Mail-Adresse", "Téléphone"], null, {"mapped": {"name": "Ｎａｍｅ", "email": "﻿E-Mail-Adresse", "phone": "Téléphone"}, "unmatched": [], "missing": [], "sure": true}], [["名前", "ﾒｰﾙｱﾄﾞﾚｽ", "電話番号"], null, {"mapped": {"name": "名前", "email": "ﾒｰﾙｱﾄﾞﾚｽ", "phone": "電話番号"}, "unmatched": [], "missing": [], "sure": true}], [["Name", "Primary email", "Phone number (mobile)"], null, {"mapped": {"name": "Name", "email": "Primary email?", "phone": "Phone number (mobile)?"}, "unmatched": [], "missing": [], "sure": false}], [["Name", "Primary email"], [["Yui"], ["yui@example.jp"]], {"mapped": {"name": "Name", "email": "Primary email"}, "unmatched": [], "missing": [], "sure": true}], [["File name", "Email verified"], null, {"mapped": {"name": "File name?", "email": "Email verified?"}, "unmatched": [], "missing": [], "sure": false}], [["Name", "Name", "Email"], null, {"mapped": {"name": "Name?", "email": "Email"}, "unmatched": ["Name"], "missing": [], "sure": false}], [["Name", "Email", "Work email"], null, {"mapped": {"name": "Name", "email": "Email"}, "unmatched": ["Work email"], "missing": [], "sure": false}], [["Name", "Email", "E-mail"], null, {"mapped": {"name": "Name", "email": "Email?"}, "unmatched": ["E-mail"], "missing": [], "sure": false}], [["First name", "Last name", "Email"], null, {"mapped": {"name": "First name?", "email": "Email"}, "unmatched": ["Last name"], "missing": [], "sure": false}], [["Company name", "Email"], null, {"mapped": {"email": "Email", "company": "Company name"}, "unmatched": [], "missing": ["name"], "sure": false}], [["Name", "Emial", "ARR"], null, {"mapped": {"name": "Name", "email": "Emial?"}, "unmatched": ["ARR"], "missing": [], "sure": false}], [["Name", "Mailing address"], null, {"mapped": {"name": "Name"}, "unmatched": ["Mailing address"], "missing": ["email"], "sure": false}], [["Name", "Email opt-in"], null, {"mapped": {"name": "Name", "email": "Email opt-in?"}, "unmatched": [], "missing": [], "sure": false}], [["Name", "Email opt-in"], [["Yui"], ["yes"]], {"mapped": {"name": "Name"}, "unmatched": ["Email opt-in"], "missing": ["email"], "sure": false}], [["Name", "Email", "Email opt-in"], [["Yui"], ["yui@example.jp"], ["yes"]], {"mapped": {"name": "Name", "email": "Email"}, "unmatched": ["Email opt-in"], "missing": [], "sure": true}], [["Name", "Contact"], [["Yui"], ["yui@example.jp"]], {"mapped": {"name": "Name", "email": "Contact?"}, "unmatched": [], "missing": [], "sure": false}], [["Name", "Contact", "Backup contact"], [["Yui"], ["yui@example.jp"], ["ken@example.com"]], {"mapped": {"name": "Name"}, "unmatched": ["Contact", "Backup contact"], "missing": ["email"], "sure": false}], [["Name", "Email", "MRR"], [["Yui"], ["yui@example.jp"], ["n/a", "free"]], {"mapped": {"name": "Name", "email": "Email"}, "unmatched": ["MRR"], "missing": [], "sure": false}], [["Name", "顧客メールアドレス"], null, {"mapped": {"name": "Name"}, "unmatched": ["顧客メールアドレス"], "missing": ["email"], "sure": false}], [[2024, null, "Email"], null, {"mapped": {"email": "Email"}, "unmatched": ["2024", "null"], "missing": ["name"], "sure": false}]];
  for (const [headers, samples, want] of table) assert.deepStrictEqual(run(headers, samples ?? undefined), want, JSON.stringify(headers));
});
ok("map: reasons for unused columns", () => {
  const why = (headers, samples) => mapColumns(headers, FIELDS, { samples }).unmatched.map((u) => u.why);
  assert.deepStrictEqual(why(["Name", "Email", "E-mail"]), ["also matches Email, which column B already fills"]);
  assert.deepStrictEqual(why(["Name", "Email opt-in"], [[], ["yes", "no"]]), ["matched by name, but only 0 of 2 values look like Email"]);
  assert.deepStrictEqual(why(["Name", "Contact", "Backup contact"], [[], ["a@b.co"], ["c@d.co"]]),
    ["values look like Email, but so do other columns", "values look like Email, but so do other columns"]);
  assert.deepStrictEqual(why(["Name", "Email", "", "ARR"]), ["empty header", "no field has this name"]);
  assert.deepStrictEqual(mapColumns(["Name", "Email", "E-mail"], FIELDS).byField.email.doubts, ["column C matches too"]);
  assert.deepStrictEqual(mapColumns(["First name", "Last name", "Email"], FIELDS).byField.name.doubts, ["weak name match", "column B matches too"]);
  assert.deepStrictEqual(mapColumns(["Emial"], FIELDS).byField.email.doubts, ["weak name match"]);
  assert.deepStrictEqual(mapColumns(["Contact"], FIELDS, { samples: [["a@b.co"]] }).byField.email.doubts, ["matched by its values, not its name"]);
});
ok("map: value thresholds (9 in 10 passes, 5 in 10 is used but flagged, fewer is rejected)", () => {
  const emails = (good) => Array.from({ length: 10 }, (_, i) => (i < good ? `u${i}@example.com` : "n/a"));
  const email = (good) => mapColumns(["Name", "Email"], FIELDS, { samples: [[], emails(good)] }).byField.email;
  assert.strictEqual(email(10).sure, true);
  assert.strictEqual(email(9).sure, true);
  assert.deepStrictEqual(email(8).doubts, ["only 8 of 10 values look like Email"]);
  assert.deepStrictEqual(email(5).doubts, ["only 5 of 10 values look like Email"]);
  assert.strictEqual(email(4), null);
  // Blank cells do not count; a column with only blanks is not checked at all.
  assert.strictEqual(mapColumns(["Name", "Email"], FIELDS, { samples: [[], ["", null, undefined, "  "]] }).byField.email.sure, true);
  // Matching by values alone needs 9 in 10 too.
  assert.strictEqual(mapColumns(["Contact"], FIELDS, { samples: [emails(9)] }).byField.email.header, "Contact");
  assert.strictEqual(mapColumns(["Contact"], FIELDS, { samples: [emails(8)] }).byField.email, null);
  // Numbers typed in Excel count as numbers.
  assert.strictEqual(mapColumns(["MRR"], FIELDS, { samples: [[49, "1,234.50", "€ 99", "(12)"]] }).byField.mrr.sure, true);
});
ok("map: remembered choices", () => {
  const headers = ["Kunde", "Kontakt"];
  const first = mapColumns(headers, FIELDS);
  assert.deepStrictEqual(summary(first), { mapped: {}, unmatched: ["Kunde", "Kontakt"], missing: ["name", "email"], sure: false });
  // The user picks the fields on the mapping screen; your code builds the same shape as byField.
  const confirmed = { name: { column: 0 }, email: { column: 1 }, company: null };
  const remembered = rememberMapping({}, headers, confirmed);
  assert.deepStrictEqual(remembered, { kunde: "name", kontakt: "email" });
  assert.deepStrictEqual(summary(mapColumns([" KUNDE ", "Kontakt", "Firma"], FIELDS, { remembered })),
    { mapped: { name: " KUNDE ", email: "Kontakt" }, unmatched: ["Firma"], missing: [], sure: true });
  // A remembered choice is still rejected when the values contradict it.
  assert.strictEqual(mapColumns(["Kontakt", "Name"], FIELDS, { remembered, samples: [["030 1234"], []] }).byField.email, null);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(remembered)), remembered); // plain JSON, safe for localStorage
});
ok("map: blank headers are never remembered", () => {
  const remembered = rememberMapping({}, ["Name", "", " - "], { name: { column: 0 }, email: { column: 1 }, phone: { column: 2 } });
  assert.deepStrictEqual(remembered, { name: "name" });
  const r = mapColumns(["Name", ""], FIELDS, { remembered: { "": "email" } });
  assert.strictEqual(r.byField.email, null);
});
ok("map: no two names of different fields collide after normalizing", () => {
  const owner = new Map();
  for (const f of FIELDS) for (const n of [f.key, f.label, ...f.aliases]) {
    const k = headerKey(n);
    assert(!owner.has(k) || owner.get(k) === f.key, n);
    owner.set(k, f.key);
  }
});
ok("map: a one-word alias like name also matches longer headers", () => {
  const withoutCompany = FIELDS.filter((f) => f.key !== "company");
  const m = mapColumns(["Company name", "Email"], withoutCompany).byField.name;
  assert.deepStrictEqual([m.header, m.sure, m.why, m.doubts], ["Company name", false, 'contains "name"', ["weak name match"]]);
  // Values can confirm a partial name.
  assert.strictEqual(mapColumns(["Emial"], FIELDS, { samples: [["a@b.co"]] }).byField.email.sure, true);
});
ok("map: suggestMapping and applyMapping", () => {
  const rows = [
    ["Customer export"], [],
    ["\uFEFFCustomer name", "E-Mail", "Plan", "Monthly revenue"],
    ["Yui Tanaka", "yui@example.jp", "Pro", "49"],
    ["Ken Mori", "ken@example.com"],
    undefined,
  ];
  const result = suggestMapping(rows, 2);
  assert.deepStrictEqual(summary(result), { mapped: { name: "\uFEFFCustomer name", email: "E-Mail", mrr: "Monthly revenue" }, unmatched: ["Plan"], missing: [], sure: true });
  assert.deepStrictEqual(applyMapping(rows, 2, result.byField), [
    { name: "Yui Tanaka", email: "yui@example.jp", mrr: "49" },
    { name: "Ken Mori", email: "ken@example.com", mrr: "" },
  ]);
  assert.deepStrictEqual(applyMapping([["Email", "Plan"], [" ", "Pro"], [], undefined], 0, { email: { column: 0 } }), []);
  assert.deepStrictEqual(summary(suggestMapping([], 0)), { mapped: {}, unmatched: [], missing: ["name", "email"], sure: false });
  // Only the first 50 data rows are checked.
  const many = [["Name", "Email"], ...Array.from({ length: 50 }, () => ["a", "a@b.co"]), ...Array.from({ length: 100 }, () => ["b", "x"])];
  assert.strictEqual(suggestMapping(many, 0).byField.email.sure, true);
});
ok("map: no invisible characters in the snippets", () => {
  for (const s of ["function normalizeHeader(text) {\n  return String(text ?? \"\")\n    // \uff25\uff4d\uff41\uff49\uff4c -> Email, \uff92\uff70\uff99 -> \u30e1\u30fc\u30eb, no-break space -> space\n    .normalize(\"NFKC\")\n    // zero-width spaces and byte order marks\n    .replace(/\\p{Cf}/gu, \"\")\n    // signupDate -> signup Date\n    .replace(/(\\p{Ll})(\\p{Lu})/gu, \"$1 $2\")\n    .toLowerCase()\n    // \u00e9 -> e, but the mark in Japanese \u30c9 stays\n    .normalize(\"NFD\")\n    .replace(/(\\p{Script=Latin})\\p{M}+/gu, \"$1\")\n    .normalize(\"NFC\")\n    // punctuation, underscores and runs of spaces -> one space\n    .replace(/[^\\p{L}\\p{N}]+/gu, \" \")\n    .trim();\n}\n\n// Plurals count as the same word. \"address\" is left alone.\nfunction stem(word) {\n  if (/(ss|x|ch|sh)es$/.test(word)) return word.slice(0, -2); // addresses\n  if (word.length > 3 && /[^s]s$/.test(word)) return word.slice(0, -1); // plans\n  return word;\n}\nconst words = (text) => normalizeHeader(text).split(\" \").filter(Boolean).map(stem);\nconst headerKey = (text) => words(text).join(\" \");", "// True when b is a with one letter changed, added or removed,\n// or with two neighbouring letters swapped.\nfunction oneEditApart(a, b) {\n  if (a === b || Math.abs(a.length - b.length) > 1) return false;\n  let i = 0;\n  while (a[i] === b[i]) i++; // length of the common start\n  if (a.length === b.length) {\n    return a.slice(i + 1) === b.slice(i + 1) ||\n      (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));\n  }\n  const [longer, shorter] = a.length > b.length ? [a, b] : [b, a];\n  return longer.slice(i + 1) === shorter.slice(i);\n}\n\nfunction compareNames(header, name) {\n  const h = words(header), n = words(name);\n  if (!h.length || !n.length) return null;\n  const hJoined = h.join(\"\"), nJoined = n.join(\"\");\n  if (hJoined === nJoined) return { score: 1, why: `same as \"${name}\"` };\n  const contained = n.every((w) => h.includes(w));\n  if (contained && h.length === n.length) {\n    return { score: 0.95, why: `same words as \"${name}\"` };\n  }\n  if (contained) {\n    return { score: 0.5 + 0.4 * (n.length / h.length), why: `contains \"${name}\"` };\n  }\n  const longEnough = Math.min(hJoined.length, nJoined.length) >= 5;\n  if (longEnough && oneEditApart(hJoined, nJoined)) {\n    return { score: 0.6, why: `spelled like \"${name}\"` };\n  }\n  return null;\n}", "const looksLikeEmail = (v) => /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(String(v).trim());\nconst looksLikeNumber = (v) =>\n  typeof v === \"number\" || /^[-+(]?[$\u20ac\u00a3\u00a5]?\\s?\\d[\\d.,\\s']*\\)?$/.test(String(v).trim());\n\nconst FIELDS = [\n  { key: \"name\", label: \"Full name\", required: true,\n    aliases: [\"name\", \"customer name\", \"contact name\", \"\u6c0f\u540d\", \"\u540d\u524d\"] },\n  { key: \"email\", label: \"Email\", required: true,\n    looksLike: looksLikeEmail, findByValues: true,\n    aliases: [\"email address\", \"mail\", \"e-mail address\", \"email adresse\",\n              \"\u30e1\u30fc\u30eb\u30a2\u30c9\u30ec\u30b9\", \"\u30e1\u30fc\u30eb\"] },\n  { key: \"company\", label: \"Company\",\n    aliases: [\"company name\", \"organization\", \"organisation\", \"\u4f1a\u793e\u540d\"] },\n  { key: \"phone\", label: \"Phone\",\n    aliases: [\"phone number\", \"telephone\", \"tel\", \"mobile\", \"\u96fb\u8a71\u756a\u53f7\"] },\n  { key: \"mrr\", label: \"MRR\", looksLike: looksLikeNumber,\n    aliases: [\"monthly revenue\", \"monthly recurring revenue\"] },\n];", "const MIN_SCORE = 0.6;   // weaker name matches are ignored\nconst SURE_SCORE = 0.95; // weaker name matches need values to confirm them\nconst CLOSE = 0.1;       // a rival this close makes the choice a guess\n\n// 0 -> \"A\", 27 -> \"AB\"\nfunction columnLetter(i) {\n  const prefix = i >= 26 ? columnLetter(Math.floor(i / 26) - 1) : \"\";\n  return prefix + String.fromCharCode(65 + (i % 26));\n}\n\n// How many sample values pass the field's check (null: nothing to check).\nfunction valueShare(field, values = []) {\n  const filled = values.filter((v) => v != null && String(v).trim() !== \"\");\n  if (!field.looksLike || !filled.length) return null;\n  const pass = filled.filter(field.looksLike).length;\n  const text = `${pass} of ${filled.length} values look like ${field.label}`;\n  return { pass, of: filled.length, text };\n}\n\nfunction bestNameMatch(header, field, remembered) {\n  const key = headerKey(header);\n  if (key && remembered[key] === field.key) {\n    return { score: 1, why: \"chosen by a user before\" };\n  }\n  let best = null;\n  for (const name of [field.key, field.label, ...(field.aliases ?? [])]) {\n    const m = compareNames(header, name);\n    if (m && (!best || m.score > best.score)) best = m;\n  }\n  return best;\n}\n\nfunction mapColumns(headers, fields, { samples = [], remembered = {} } = {}) {\n  // Columns that matched a field but were not used: column -> { key, why, second }.\n  // second: a better column already fills that field.\n  const notUsed = new Map();\n  const note = (column, key, why, second = false) => {\n    if (!notUsed.has(column)) notUsed.set(column, { key, why, second });\n  };\n\n  // 1. Pairs whose names match and whose values do not contradict them.\n  const pairs = [];\n  fields.forEach((field, f) => headers.forEach((header, column) => {\n    const best = bestNameMatch(header, field, remembered);\n    if (!best || best.score < MIN_SCORE) return;\n    const share = valueShare(field, samples[column]);\n    if (share && share.pass / share.of < 0.5) {\n      return note(column, field.key, `matched by name, but only ${share.text}`);\n    }\n    const confirmed = share && share.pass / share.of >= 0.9;\n    const doubt = share && !confirmed && `only ${share.text}`;\n    pairs.push({ f, column, ...best, confirmed, doubt });\n  }));\n\n  // 2. Best pairs first; each field and each column is used once.\n  pairs.sort((a, b) => b.score - a.score || a.column - b.column || a.f - b.f);\n  const byField = Object.fromEntries(fields.map((field) => [field.key, null]));\n  const usedBy = new Map(); // column -> field key\n  for (const p of pairs) {\n    const field = fields[p.f], taken = byField[field.key];\n    if (usedBy.has(p.column)) continue;\n    if (taken) {\n      const where = columnLetter(taken.column);\n      const why = `also matches ${field.label}, which column ${where} already fills`;\n      note(p.column, field.key, why, true);\n      continue;\n    }\n    // A rival scores almost as well and could still be used: another free column\n    // for this field, or another empty field for this column.\n    const rival = pairs.find((q) => q !== p && q.score >= p.score - CLOSE && (\n      (q.f === p.f && !usedBy.has(q.column)) ||\n      (q.column === p.column && !byField[fields[q.f].key])));\n    const doubts = [];\n    if (p.score < SURE_SCORE && !p.confirmed) doubts.push(\"weak name match\");\n    const rivalColumn = rival && columnLetter(rival.column);\n    if (rival?.f === p.f) doubts.push(`column ${rivalColumn} matches too`);\n    else if (rival) doubts.push(`could also be ${fields[rival.f].label}`);\n    if (p.doubt) doubts.push(p.doubt);\n    const header = headers[p.column], sure = !doubts.length;\n    byField[field.key] = { column: p.column, header, why: p.why, sure, doubts };\n    usedBy.set(p.column, field.key);\n  }\n\n  // 3. Fields still empty: the one unused column whose values look right (9 in 10).\n  for (const field of fields) {\n    if (byField[field.key] || !field.findByValues) continue;\n    const fits = headers.map((_, column) => column).filter((column) => {\n      const share = !usedBy.has(column) && valueShare(field, samples[column]);\n      return share && share.pass / share.of >= 0.9;\n    });\n    if (fits.length !== 1) {\n      const why = `values look like ${field.label}, but so do other columns`;\n      fits.forEach((column) => note(column, field.key, why));\n      continue;\n    }\n    const [column] = fits, header = headers[column];\n    const why = `values look like ${field.label}`;\n    const doubts = [\"matched by its values, not its name\"];\n    byField[field.key] = { column, header, why, sure: false, doubts };\n    usedBy.set(column, field.key);\n  }\n\n  const unmatched = headers\n    .map((header, column) => ({ column, header }))\n    .filter(({ column }) => !usedBy.has(column))\n    .map((c) => ({ ...c, why: notUsed.get(c.column)?.why ??\n      (normalizeHeader(c.header) ? \"no field has this name\" : \"empty header\") }));\n  const missing = fields.filter((f) => f.required && !byField[f.key])\n    .map((f) => f.key);\n  // A person should look when a field stayed empty although a column's name\n  // matched it, or when a second column matches a filled field (Email, Email 2).\n  const needsLook = unmatched.some(({ column }) => {\n    const n = notUsed.get(column);\n    return n && (n.second || !byField[n.key]);\n  });\n  const allSure = Object.values(byField).every((m) => !m || m.sure);\n  const sure = !missing.length && !needsLook && allSure;\n  return { byField, unmatched, missing, sure };\n}", "// After the user confirms the mapping screen, store their choices\n// (in your database or in localStorage).\nfunction rememberMapping(remembered, headers, byField) {\n  for (const [key, match] of Object.entries(byField)) {\n    const header = match && headerKey(headers[match.column]);\n    if (header) remembered[header] = key; // blank headers are not remembered\n  }\n  return remembered;\n}", "// rows: arrays of cells from your CSV or Excel parser.\n// headerRow: the index of the header row.\nfunction suggestMapping(rows, headerRow, remembered = {}) {\n  const headers = rows[headerRow] ?? [];\n  // 50 data rows are enough to check the values.\n  const firstRows = rows.slice(headerRow + 1, headerRow + 51);\n  const samples = headers.map((_, column) => firstRows.map((row) => row?.[column]));\n  return mapColumns(headers, FIELDS, { samples, remembered });\n}\n\n// Rows whose mapped cells are all blank are skipped.\nfunction applyMapping(rows, headerRow, byField) {\n  const used = Object.entries(byField).filter(([, match]) => match);\n  const cell = (row, match) => row?.[match.column] ?? \"\";\n  const toRecord = (row) =>\n    Object.fromEntries(used.map(([key, match]) => [key, cell(row, match)]));\n  return rows.slice(headerRow + 1)\n    .filter((row) => used.some(([, match]) => String(cell(row, match)).trim() !== \"\"))\n    .map(toRecord);\n}", "const EMAIL_NAMES = [\"email\", \"e-mail\", \"email address\", \"mail\"];\nconst exactMatch = (header) => EMAIL_NAMES.includes(header.trim().toLowerCase());\nexactMatch(\"E-mail\");             // true\nexactMatch(\"E-Mail-Adresse\");     // false\nexactMatch(\"Email\\u00A0address\");  // false\nexactMatch(\"\uff25\uff4d\uff41\uff49\uff4c\");         // false\n\nconst looseMatch = (header) => header.toLowerCase().includes(\"mail\");\nlooseMatch(\"Mailing address\");    // true\nlooseMatch(\"Email opt-in\");       // true"]) assert(!/[\u00A0\u200B-\u200F\u2028\u2029\uFEFF]/.test(s));
});
}

// --- blog/find-invisible-characters-csv-excel-javascript ---
{
// Control (Cc), format (Cf) and separator (Z) characters, plus three blank
// characters that Unicode files as letters or symbols. The plain space is a
// separator too, so the code below always lets " " through.
const HIDDEN = /^[\p{Cc}\p{Cf}\p{Z}\u2800\u3164\uFFA0]$/u;

const NAMES = {
  "\t": "tab",
  "\n": "line feed",
  "\r": "carriage return",
  "\u00A0": "no-break space",
  "\u00AD": "soft hyphen",
  "\u200B": "zero width space",
  "\u200C": "zero width non-joiner",
  "\u200D": "zero width joiner",
  "\u200E": "left-to-right mark",
  "\u200F": "right-to-left mark",
  "\u2028": "line separator",
  "\u202F": "narrow no-break space",
  "\u2060": "word joiner",
  "\u2800": "braille pattern blank",
  "\u3000": "ideographic space",
  "\u3164": "hangul filler",
  "\uFEFF": "byte order mark",
  "\uFFA0": "halfwidth hangul filler",
};

const codeOf = (ch) =>
  "U+" + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
const nameOf = (ch) => NAMES[ch] ?? (/\p{Zs}/u.test(ch) ? "space" : "invisible character");
const isHidden = (ch) => ch !== " " && HIDDEN.test(ch);

// For logs and previews: "ana@example.com<U+200B>"
const showHidden = (text) =>
  [...String(text ?? "")].map((ch) => (isHidden(ch) ? `<${codeOf(ch)}>` : ch)).join("");

// Invisible on purpose: the non-joiner and joiner (U+200C, U+200D), the
// left-to-right and right-to-left marks (U+200E, U+200F), and the tag
// characters that some flag emoji are built from. Keep them in text.
const KEEP_IN_TEXT = /^[\u200C-\u200F\u{E0020}-\u{E007F}]$/u;

function cleanCell(value, kind) {
  if (kind !== "id" && kind !== "text") {
    throw new TypeError(`kind must be "id" or "text", got ${kind}`);
  }
  const chars = [...String(value ?? "")]; // one entry per code point
  const changes = [];
  let out = "";
  for (let position = 0; position < chars.length; position++) {
    const ch = chars[position];
    if (!isHidden(ch)) {
      out += ch;
      continue;
    }
    if (ch === "\r" && chars[position + 1] === "\n") continue; // Windows line end
    let to = ""; // drop it, unless a rule below says otherwise
    if (/[\n\r\v\f\u0085\u2028\u2029]/.test(ch)) to = "\n";
    else if (ch === "\t" || /\p{Zs}/u.test(ch)) to = " ";
    else if (kind === "text" && KEEP_IN_TEXT.test(ch)) to = ch;
    if (to !== ch) changes.push({ position, code: codeOf(ch), name: nameOf(ch), to });
    out += to;
  }
  out = out.trim();
  let error = null;
  if (kind === "id") {
    if (/\s/.test(out)) error = "contains a space or line break";
    if (!out && changes.length) error = "contains only invisible characters";
    // NFKC turns full-width letters and digits into ASCII: "ＡＢ１２" -> "AB12".
    const normalized = out.normalize("NFKC").trim();
    if (normalized !== out) {
      changes.push({ position: null, code: "NFKC", name: "NFKC normalization", to: normalized });
      out = normalized;
      if (!error && /\s/.test(out)) error = "contains a character that NFKC turns into a space";
    }
  }
  return { value: out, changes, error };
}

const COLUMN_KINDS = { email: "id", sku: "id", name: "text", note: "text" };

function describe(change) {
  if (change.code === "NFKC") return `normalized to "${change.to}" (NFKC)`;
  // Positions are counted from 1 for people; cleanCell counts from 0.
  const what = `${change.name} (${change.code}) at position ${change.position + 1}`;
  if (change.to === "") return `removed ${what}`;
  return `${what} became ${change.to === " " ? "a space" : "a line break"}`;
}

// rows: objects keyed by column. firstRowNumber: the file row of rows[0]
// (2 when row 1 holds the headers), so messages match what the user sees.
function cleanRows(rows, firstRowNumber = 2) {
  const clean = [], notes = [], errors = [];
  const firstRowOfEmail = new Map();
  rows.forEach((row, i) => {
    const rowNumber = firstRowNumber + i;
    const out = { ...row }; // columns not in COLUMN_KINDS are kept as they are
    for (const [column, kind] of Object.entries(COLUMN_KINDS)) {
      const { value, changes, error } = cleanCell(row[column], kind);
      out[column] = value;
      for (const c of changes) notes.push(`Row ${rowNumber}, ${column}: ${describe(c)}`);
      if (error) errors.push(`Row ${rowNumber}, ${column}: ${error}`);
    }
    // Compare emails only after cleaning; add .toLowerCase() if your app ignores case.
    const seen = firstRowOfEmail.get(out.email);
    if (out.email && seen) errors.push(`Row ${rowNumber}, email: same as row ${seen}`);
    else if (out.email) firstRowOfEmail.set(out.email, rowNumber);
    clean.push(out);
  });
  return { clean, notes, errors };
}

const runLines = (src) => new Function(src.split("\n").filter((l) => /^\S.*;\s*\/\/ /.test(l)).map((l) => "")[0] ?? "");
ok("inv: the problem lines print what the comments say", () => {
  const src = "const typed = \"ana@example.com\";\nconst imported = \"ana@example.com\\u200B\"; // a zero width space at the end\n\ntyped === imported;                // false\nimported.length;                   // 16\nimported.trim() === typed;         // false: trim() keeps U+200B\n\"\\u00A0ana@example.com\".trim() === typed; // true: trim() removes U+00A0";
  const lines = src.split("\n");
  const setup = lines.filter((l) => l.startsWith("const ")).join("\n");
  let checked = 0;
  for (const line of lines) {
    const m = /^(.*?);\s*\/\/ (true|false|\d+)\b/.exec(line);
    if (!m || line.startsWith("const ")) continue;
    const got = new Function(setup + "\nreturn (" + m[1] + ");")();
    assert.strictEqual(String(got), m[2], line);
    checked++;
  }
  assert.strictEqual(checked, 4);
});
ok("inv: HIDDEN finds the named characters and nothing visible", () => {
  for (const ch of Object.keys(NAMES)) assert(isHidden(ch), codeOf(ch));
  for (const ch of ["\u0007", "\u202E", "\u2029", "\u2066", "᠎", "\u0085"]) assert(isHidden(ch), codeOf(ch));
  for (const ch of [" ", "a", "é", "\u0301", "\uFE0F", "\u{1F600}", "あ", "\u0430", "-", "‐"]) assert(!isHidden(ch), codeOf(ch));
  assert.strictEqual(codeOf("\u{1F600}"), "U+1F600");
  assert.strictEqual(nameOf("\u202E"), "invisible character");
  assert.strictEqual(nameOf("\u2003"), "space");
  assert.strictEqual(showHidden("ana@example.com\u200B"), "ana@example.com<U+200B>");
  assert.strictEqual(showHidden("a b\u00A0c"), "a b<U+00A0>c");
  assert.strictEqual(showHidden(null), "");
});
const cc = (value, kind) => { const r = cleanCell(value, kind); return [r.value, r.changes.map((c) => `${c.position}:${c.code}>${JSON.stringify(c.to)}`), r.error]; };
ok("inv: cleanCell ids", () => {
  const E = "contains a space or line break";
  assert.deepStrictEqual(cc("ana@example.com\u200B", "id"), ["ana@example.com", ['15:U+200B>""'], null]);
  assert.deepStrictEqual(cc("\uFEFFana@example.com", "id"), ["ana@example.com", ['0:U+FEFF>""'], null]);
  assert.deepStrictEqual(cc("\u00A0ana@example.com ", "id"), ["ana@example.com", ['0:U+00A0>" "'], null]);
  assert.deepStrictEqual(cc("ana\u00A0@example.com", "id"), ["ana @example.com", ['3:U+00A0>" "'], E]);
  assert.deepStrictEqual(cc("AB\n12", "id"), ["AB\n12", [], E]);
  assert.deepStrictEqual(cc("AB\u202812", "id"), ["AB\n12", ['2:U+2028>"\\n"'], E]);
  assert.deepStrictEqual(cc("AB 125", "id"), ["AB 125", [], E]);
  assert.deepStrictEqual(cc("exam\u00ADple.com", "id"), ["example.com", ['4:U+00AD>""'], null]);
  assert.deepStrictEqual(cc("\uFF21\uFF22\uFF0D\uFF11\uFF12\uFF13", "id"), ["AB-123", ['null:NFKC>"AB-123"'], null]);
  assert.deepStrictEqual(cc("AB\u00B4", "id"), ["AB \u0301", ['null:NFKC>"AB \u0301"'], "contains a character that NFKC turns into a space"]);
  assert.deepStrictEqual(cc("\u3164abc\u2800\uFFA0", "id"), ["abc", ['0:U+3164>""', '4:U+2800>""', '5:U+FFA0>""'], null]);
  assert.deepStrictEqual(cc("\u0661\u0662", "id"), ["\u0661\u0662", [], null]); // NFKC keeps Arabic-Indic digits
  assert.deepStrictEqual(cc("AB‐123", "id"), ["AB‐123", [], null]); // NFKC keeps U+2010
  assert.deepStrictEqual(cc("①", "id"), ["1", ['null:NFKC>"1"'], null]);
  assert.deepStrictEqual(cc("\u200D\u200E\u2060x\u0007", "id"), ["x", ['0:U+200D>""', '1:U+200E>""', '2:U+2060>""', '4:U+0007>""'], null]);
  assert.deepStrictEqual(cc("\u{1F600}\u200B", "id"), ["\u{1F600}", ['1:U+200B>""'], null]); // positions count code points
  assert.deepStrictEqual(cc("\u3000\t", "id"), ["", ['0:U+3000>" "', '1:U+0009>" "'], "contains only invisible characters"]);
  assert.deepStrictEqual(cc("\u200B", "id"), ["", ['0:U+200B>""'], "contains only invisible characters"]);
  assert.deepStrictEqual(cc("   ", "id"), ["", [], null]);
  assert.deepStrictEqual(cc(null, "id"), ["", [], null]);
  assert.deepStrictEqual(cc(undefined, "id"), ["", [], null]);
  assert.deepStrictEqual(cc(12345, "id"), ["12345", [], null]);
});
ok("inv: cleanCell text", () => {
  const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
  assert.deepStrictEqual(cc("Ana\u00A0Lima", "text"), ["Ana Lima", ['3:U+00A0>" "'], null]);
  assert.deepStrictEqual(cc(family, "text"), [family, [], null]);
  const scotland = "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}";
  assert.deepStrictEqual(cc(scotland, "text"), [scotland, [], null]);
  assert.strictEqual([...new Intl.Segmenter().segment(scotland)].length, 1);
  assert.deepStrictEqual(cleanCell(scotland, "id").value, "\u{1F3F4}");
  assert.deepStrictEqual(cc("שלום\u200F 123", "text"), ["שלום\u200F 123", [], null]);
  assert.deepStrictEqual(cc("Line 1\r\nLine 2", "text"), ["Line 1\nLine 2", [], null]);
  assert.deepStrictEqual(cc("Line 1\rLine 2", "text"), ["Line 1\nLine 2", ['6:U+000D>"\\n"'], null]);
  assert.deepStrictEqual(cc("a\tb", "text"), ["a b", ['1:U+0009>" "'], null]);
  assert.deepStrictEqual(cc("  \u3000Yui\u3000 ", "text"), ["Yui", ['2:U+3000>" "', '6:U+3000>" "'], null]);
  assert.deepStrictEqual(cc("x\u0007y\u202Ez", "text"), ["xyz", ['1:U+0007>""', '3:U+202E>""'], null]);
  assert.deepStrictEqual(cc("Ａ① x² ﬁ", "text"), ["Ａ① x² ﬁ", [], null]); // text is not normalized
  assert.deepStrictEqual(cc("Ana  Lima", "text"), ["Ana  Lima", [], null]);
  assert.deepStrictEqual(cc("", "text"), ["", [], null]);
  assert.deepStrictEqual(cc("a\u2028b\u2029c\u0085d", "text"), ["a\nb\nc\nd", ['1:U+2028>"\\n"', '3:U+2029>"\\n"', '5:U+0085>"\\n"'], null]);
  assert.deepStrictEqual(cc("a\vb\fc", "text"), ["a\nb\nc", ['1:U+000B>"\\n"', '3:U+000C>"\\n"'], null]);
  for (const ch of ["\t", "\n", "\r", "\v", "\f", "\u0085", "\u0007"]) assert(/\p{Cc}/u.test(ch));
  for (const ch of ["\u00AD", "\u200B", "\u200C", "\u200D", "\u200E", "\u200F", "\u2060", "\uFEFF", "\u202E", "\u{E0067}"]) assert(/\p{Cf}/u.test(ch));
  for (const ch of ["\u00A0", "\u202F", "\u3000"]) assert(/\p{Zs}/u.test(ch));
  assert(/\p{Zl}/u.test("\u2028") && /\p{Zp}/u.test("\u2029") && /\p{So}/u.test("\u2800") && /\p{Lo}/u.test("\u3164\uFFA0".slice(0, 1)) && /\p{Lo}/u.test("\uFFA0") && /\p{Mn}/u.test("\uFE0F\u0301".slice(0, 1)) && /\p{Mn}/u.test("\u0301"));
  assert.throws(() => cleanCell("x", "email"), /kind must be "id" or "text", got email/);
  assert.throws(() => cleanCell("x"), TypeError);
});
ok("inv: \\s matches exactly what trim() removes, U+0000 to U+FFFF", () => {
  for (let c = 0; c <= 0xFFFF; c++) {
    const ch = String.fromCharCode(c);
    assert.strictEqual(/\s/.test(ch), (ch + "a" + ch).trim() === "a", codeOf(ch));
  }
});
ok("inv: direction controls are removed from text", () => {
  for (const c of [0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069]) {
    assert.strictEqual(cleanCell("a" + String.fromCharCode(c) + "b", "text").value, "ab");
  }
});
ok("inv: what the post says about joiners and NFKC", () => {
  const seg = new Intl.Segmenter();
  const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}";
  assert.strictEqual([...seg.segment(family)].length, 1);
  assert.strictEqual([...seg.segment(cleanCell(family, "id").value)].length, 3);
  assert.strictEqual("ＡＢ－１２３".normalize("NFKC"), "AB-123");
  assert.strictEqual("①".normalize("NFKC"), "1");
  assert.strictEqual("x²".normalize("NFKC"), "x2");
  assert.strictEqual("ﬁ".normalize("NFKC"), "fi");
  assert.strictEqual("‐".normalize("NFKC"), "‐");
  assert.strictEqual("\u0430" === "a", false);
  assert.strictEqual(cleanCell("\u0430na@example.com", "id").value, "\u0430na@example.com");
  assert.strictEqual(cleanCell("\uFE0F", "text").value, "\uFE0F");
  assert.notStrictEqual(cleanCell("e\u0301", "text").value, "é");
  assert.strictEqual(cleanCell("e\u0301", "text").value.normalize("NFC"), "é");
});
ok("inv: what passes through an ID, and the ASCII check from the post", () => {
  for (const v of ["a\uFE0Fb", "a\uE000b", "a\uD800b"]) {
    const r = cleanCell(v, "id");
    assert.deepStrictEqual([r.value, r.changes, r.error], [v, [], null]);
    assert(!/^[\x21-\x7E]+$/.test(r.value));
  }
  assert(/^[\x21-\x7E]+$/.test(cleanCell("\uFF21\uFF22\uFF0D\uFF11\uFF12\uFF13\u200B", "id").value));
  const end = cleanCell("ab\u00A0", "text");
  assert.deepStrictEqual([end.value, end.changes.map((c) => c.to)], ["ab", [" "]]);
});
ok("inv: the table in the post matches the code", () => {
  const html = require("fs").readFileSync(require("path").join(__dirname, "..", "content", "posts", "find-invisible-characters-csv-excel-javascript.html"), "utf8");
  const rows = [...html.matchAll(/<tr><td>U\+([0-9A-F]{4}) [^<]*<\/td><td>(yes|no)<\/td><td>(yes|no)<\/td><td>(\w+)<\/td><td>([\w ]+)<\/td><td>([\w ]+)<\/td><\/tr>/g)];
  assert.strictEqual(rows.length, 12);
  const effect = (ch, kind) => {
    const r = cleanCell("x" + ch + "x", kind);
    if (r.value === "xx") return "removed";
    if (r.value === "x x") return "space";
    if (r.value === "x\nx") return "line break";
    if (r.value === "x" + ch + "x") return "kept";
    return "?";
  };
  for (const [, hex, trims, ws, nfkc, id, text] of rows) {
    const ch = String.fromCodePoint(parseInt(hex, 16));
    assert.strictEqual(("a" + ch).trim() === "a" && (ch + "a").trim() === "a" ? "yes" : "no", trims, hex);
    assert.strictEqual(/\s/.test(ch) ? "yes" : "no", ws, hex);
    const n = ch.normalize("NFKC");
    assert.strictEqual(n === ch ? "unchanged" : n === " " ? "space" : "?", nfkc, hex);
    assert.strictEqual(effect(ch, "id"), id, hex);
    assert.strictEqual(effect(ch, "text"), text, hex);
  }
});
ok("inv: cleanRows example", () => {
  const got = new Function("cleanRows", "const { clean, notes, errors } = cleanRows([\n  { email: \"ana@example.com\", sku: \"\uff21\uff22\uff0d\uff11\uff12\uff13\", name: \"Ana Lima\", note: \"\" },\n  { email: \"ana@example.com\\u200B\", sku: \"AB-124\", name: \"Ana\\u00A0Lima\", note: \"Call\\r\\nafter 5\" },\n  { email: \"ken@example.com\", sku: \"AB 125\", name: \"Ken\", note: \"\" },\n]);\nclean[0].sku; // \"AB-123\"\nclean[1].note; // \"Call\\nafter 5\"\nnotes;\n// [\"Row 2, sku: normalized to \\\"AB-123\\\" (NFKC)\",\n//  \"Row 3, email: removed zero width space (U+200B) at position 16\",\n//  \"Row 3, name: no-break space (U+00A0) at position 4 became a space\"]\nerrors;\n// [\"Row 3, email: same as row 2\",\n//  \"Row 4, sku: contains a space or line break\"]" + "\nreturn { clean, notes, errors };")(cleanRows);
  const src = "const { clean, notes, errors } = cleanRows([\n  { email: \"ana@example.com\", sku: \"\uff21\uff22\uff0d\uff11\uff12\uff13\", name: \"Ana Lima\", note: \"\" },\n  { email: \"ana@example.com\\u200B\", sku: \"AB-124\", name: \"Ana\\u00A0Lima\", note: \"Call\\r\\nafter 5\" },\n  { email: \"ken@example.com\", sku: \"AB 125\", name: \"Ken\", note: \"\" },\n]);\nclean[0].sku; // \"AB-123\"\nclean[1].note; // \"Call\\nafter 5\"\nnotes;\n// [\"Row 2, sku: normalized to \\\"AB-123\\\" (NFKC)\",\n//  \"Row 3, email: removed zero width space (U+200B) at position 16\",\n//  \"Row 3, name: no-break space (U+00A0) at position 4 became a space\"]\nerrors;\n// [\"Row 3, email: same as row 2\",\n//  \"Row 4, sku: contains a space or line break\"]";
  assert.strictEqual(got.clean[0].sku, "AB-123");
  assert.strictEqual(got.clean[1].note, "Call\nafter 5");
  assert.deepStrictEqual(got.notes, ["Row 2, sku: normalized to \"AB-123\" (NFKC)", "Row 3, email: removed zero width space (U+200B) at position 16", "Row 3, name: no-break space (U+00A0) at position 4 became a space"]);
  assert.deepStrictEqual(got.errors, ["Row 3, email: same as row 2", "Row 4, sku: contains a space or line break"]);
  // The comments in the post show the same values.
  for (const s of [...got.notes, ...got.errors, "AB-123"]) assert(src.includes(JSON.stringify(s)), s);
  assert(src.includes('// "Call\\nafter 5"'));
  assert.deepStrictEqual(got.clean.map((r) => r.email), ["ana@example.com", "ana@example.com", "ken@example.com"]);
});
ok("inv: cleanRows edge cases", () => {
  const r = cleanRows([{ email: "", sku: "A" }, { email: "", sku: "B" }, {}, { email: "x@y.z\u200B" }, { email: "x@y.z" }], 10);
  assert.deepStrictEqual(r.errors, ["Row 14, email: same as row 13"]);
  assert.deepStrictEqual(r.notes, ["Row 13, email: removed zero width space (U+200B) at position 6"]);
  assert.deepStrictEqual(r.clean[2], { email: "", sku: "", name: "", note: "" });
  assert.deepStrictEqual(cleanRows([{ email: "a@b.c", plan: " Pro\u200B" }]).clean[0], { email: "a@b.c", plan: " Pro\u200B", sku: "", name: "", note: "" });
  assert.deepStrictEqual(cleanRows([]), { clean: [], notes: [], errors: [] });
  assert.strictEqual(describe({ position: 0, code: "U+2028", name: "line separator", to: "\n" }), "line separator (U+2028) at position 1 became a line break");
  // An ID with an internal break is reported as an error and as a note.
  const b = cleanRows([{ email: "a\u2028b@c.d" }]);
  assert.deepStrictEqual([b.notes.length, b.errors], [1, ["Row 2, email: contains a space or line break"]]);
});
ok("inv: SheetJS keeps hidden characters in .xlsx and CSV values", () => {
  const X = require(process.env.XLSX_MODULE || "xlsx");
  const values = ["ana@example.com\u200B", "Ana\u00A0Lima"];
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([["email", "name"], values]), "S");
  const back = X.read(X.write(wb, { type: "buffer", bookType: "xlsx" }), { type: "buffer" });
  assert.deepStrictEqual(X.utils.sheet_to_json(back.Sheets.S, { header: 1 })[1], values);
  const csv = X.read("email,name\n" + values.join(",") + "\n", { type: "string" });
  assert.deepStrictEqual(X.utils.sheet_to_json(csv.Sheets[csv.SheetNames[0]], { header: 1, raw: false })[1], values);
});
ok("inv: no invisible characters in the snippets", () => {
  for (const s of ["const typed = \"ana@example.com\";\nconst imported = \"ana@example.com\\u200B\"; // a zero width space at the end\n\ntyped === imported;                // false\nimported.length;                   // 16\nimported.trim() === typed;         // false: trim() keeps U+200B\n\"\\u00A0ana@example.com\".trim() === typed; // true: trim() removes U+00A0", "// Control (Cc), format (Cf) and separator (Z) characters, plus three blank\n// characters that Unicode files as letters or symbols. The plain space is a\n// separator too, so the code below always lets \" \" through.\nconst HIDDEN = /^[\\p{Cc}\\p{Cf}\\p{Z}\\u2800\\u3164\\uFFA0]$/u;\n\nconst NAMES = {\n  \"\\t\": \"tab\",\n  \"\\n\": \"line feed\",\n  \"\\r\": \"carriage return\",\n  \"\\u00A0\": \"no-break space\",\n  \"\\u00AD\": \"soft hyphen\",\n  \"\\u200B\": \"zero width space\",\n  \"\\u200C\": \"zero width non-joiner\",\n  \"\\u200D\": \"zero width joiner\",\n  \"\\u200E\": \"left-to-right mark\",\n  \"\\u200F\": \"right-to-left mark\",\n  \"\\u2028\": \"line separator\",\n  \"\\u202F\": \"narrow no-break space\",\n  \"\\u2060\": \"word joiner\",\n  \"\\u2800\": \"braille pattern blank\",\n  \"\\u3000\": \"ideographic space\",\n  \"\\u3164\": \"hangul filler\",\n  \"\\uFEFF\": \"byte order mark\",\n  \"\\uFFA0\": \"halfwidth hangul filler\",\n};\n\nconst codeOf = (ch) =>\n  \"U+\" + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, \"0\");\nconst nameOf = (ch) => NAMES[ch] ?? (/\\p{Zs}/u.test(ch) ? \"space\" : \"invisible character\");\nconst isHidden = (ch) => ch !== \" \" && HIDDEN.test(ch);\n\n// For logs and previews: \"ana@example.com<U+200B>\"\nconst showHidden = (text) =>\n  [...String(text ?? \"\")].map((ch) => (isHidden(ch) ? `<${codeOf(ch)}>` : ch)).join(\"\");", "// Invisible on purpose: the non-joiner and joiner (U+200C, U+200D), the\n// left-to-right and right-to-left marks (U+200E, U+200F), and the tag\n// characters that some flag emoji are built from. Keep them in text.\nconst KEEP_IN_TEXT = /^[\\u200C-\\u200F\\u{E0020}-\\u{E007F}]$/u;\n\nfunction cleanCell(value, kind) {\n  if (kind !== \"id\" && kind !== \"text\") {\n    throw new TypeError(`kind must be \"id\" or \"text\", got ${kind}`);\n  }\n  const chars = [...String(value ?? \"\")]; // one entry per code point\n  const changes = [];\n  let out = \"\";\n  for (let position = 0; position < chars.length; position++) {\n    const ch = chars[position];\n    if (!isHidden(ch)) {\n      out += ch;\n      continue;\n    }\n    if (ch === \"\\r\" && chars[position + 1] === \"\\n\") continue; // Windows line end\n    let to = \"\"; // drop it, unless a rule below says otherwise\n    if (/[\\n\\r\\v\\f\\u0085\\u2028\\u2029]/.test(ch)) to = \"\\n\";\n    else if (ch === \"\\t\" || /\\p{Zs}/u.test(ch)) to = \" \";\n    else if (kind === \"text\" && KEEP_IN_TEXT.test(ch)) to = ch;\n    if (to !== ch) changes.push({ position, code: codeOf(ch), name: nameOf(ch), to });\n    out += to;\n  }\n  out = out.trim();\n  let error = null;\n  if (kind === \"id\") {\n    if (/\\s/.test(out)) error = \"contains a space or line break\";\n    if (!out && changes.length) error = \"contains only invisible characters\";\n    // NFKC turns full-width letters and digits into ASCII: \"\uff21\uff22\uff11\uff12\" -> \"AB12\".\n    const normalized = out.normalize(\"NFKC\").trim();\n    if (normalized !== out) {\n      changes.push({ position: null, code: \"NFKC\", name: \"NFKC normalization\", to: normalized });\n      out = normalized;\n      if (!error && /\\s/.test(out)) error = \"contains a character that NFKC turns into a space\";\n    }\n  }\n  return { value: out, changes, error };\n}", "const COLUMN_KINDS = { email: \"id\", sku: \"id\", name: \"text\", note: \"text\" };\n\nfunction describe(change) {\n  if (change.code === \"NFKC\") return `normalized to \"${change.to}\" (NFKC)`;\n  // Positions are counted from 1 for people; cleanCell counts from 0.\n  const what = `${change.name} (${change.code}) at position ${change.position + 1}`;\n  if (change.to === \"\") return `removed ${what}`;\n  return `${what} became ${change.to === \" \" ? \"a space\" : \"a line break\"}`;\n}\n\n// rows: objects keyed by column. firstRowNumber: the file row of rows[0]\n// (2 when row 1 holds the headers), so messages match what the user sees.\nfunction cleanRows(rows, firstRowNumber = 2) {\n  const clean = [], notes = [], errors = [];\n  const firstRowOfEmail = new Map();\n  rows.forEach((row, i) => {\n    const rowNumber = firstRowNumber + i;\n    const out = { ...row }; // columns not in COLUMN_KINDS are kept as they are\n    for (const [column, kind] of Object.entries(COLUMN_KINDS)) {\n      const { value, changes, error } = cleanCell(row[column], kind);\n      out[column] = value;\n      for (const c of changes) notes.push(`Row ${rowNumber}, ${column}: ${describe(c)}`);\n      if (error) errors.push(`Row ${rowNumber}, ${column}: ${error}`);\n    }\n    // Compare emails only after cleaning; add .toLowerCase() if your app ignores case.\n    const seen = firstRowOfEmail.get(out.email);\n    if (out.email && seen) errors.push(`Row ${rowNumber}, email: same as row ${seen}`);\n    else if (out.email) firstRowOfEmail.set(out.email, rowNumber);\n    clean.push(out);\n  });\n  return { clean, notes, errors };\n}", "const { clean, notes, errors } = cleanRows([\n  { email: \"ana@example.com\", sku: \"\uff21\uff22\uff0d\uff11\uff12\uff13\", name: \"Ana Lima\", note: \"\" },\n  { email: \"ana@example.com\\u200B\", sku: \"AB-124\", name: \"Ana\\u00A0Lima\", note: \"Call\\r\\nafter 5\" },\n  { email: \"ken@example.com\", sku: \"AB 125\", name: \"Ken\", note: \"\" },\n]);\nclean[0].sku; // \"AB-123\"\nclean[1].note; // \"Call\\nafter 5\"\nnotes;\n// [\"Row 2, sku: normalized to \\\"AB-123\\\" (NFKC)\",\n//  \"Row 3, email: removed zero width space (U+200B) at position 16\",\n//  \"Row 3, name: no-break space (U+00A0) at position 4 became a space\"]\nerrors;\n// [\"Row 3, email: same as row 2\",\n//  \"Row 4, sku: contains a space or line break\"]"]) assert(!/[\u00A0\u00AD\u200B-\u200F\u2028\u2029\u202F\u2060\u3000\uFEFF]/.test(s));
});
}

// --- blog/find-placeholder-values-csv-excel-javascript ---
{
const XLSX = require(process.env.XLSX_MODULE || "xlsx");
// Text that stands for "no value", compared in lower case, with spaces,
// opening and closing brackets and trailing dots or question marks removed,
// so "(None)", "[blank]", "N/A." and "TBD?" match.
const PLACEHOLDERS = new Set([
  "n/a", "n.a", "na", "none", "null", "nil", "nan", "undefined", "unknown",
  "notapplicable", "notavailable", "notprovided", "tbd", "tba", "tbc", "blank", "empty", "missing",
]);

// A cell made only of punctuation: "-", "- -", "?", "...", "/", "#", "—".
const ONLY_PUNCTUATION = /^\p{P}+$/u;

// Formula errors, as a CSV export writes them: "#N/A", "#REF!", "#DIV/0!".
// The second part catches any "#WORD!" or "#WORD?" so newer error names are found too.
// Case-insensitive, so a hand-typed "#n/a" is caught.
const FORMULA_ERROR = /^#(N\/A|GETTING_DATA|[A-Z][A-Z0-9\/_]*[!?])$/i;

// Returns "value", "blank", "placeholder" or "formula error".
// allowed: values that look like placeholders but are real in this column,
// compared exactly after trim(), for example ["NA"] in a country column.
function cellStatus(value, allowed = []) {
  if (value === null || value === undefined) return "blank";
  const text = String(value).trim();
  if (text === "") return "blank";
  if (allowed.includes(text)) return "value";
  if (FORMULA_ERROR.test(text)) return "formula error";
  const squeezed = text.toLowerCase().replace(/\s+/g, "");
  if (ONLY_PUNCTUATION.test(squeezed)) return "placeholder";
  const key = squeezed.replace(/^[(\[<]+|[)\]>.?]+$/g, "");
  if (PLACEHOLDERS.has(key)) return "placeholder";
  return "value";
}


// columns: { field: { required, allowed } }. records: objects from your parser,
// each with the spreadsheet row number in rowNumber.
// Import rows only when no problem has level "error".
function checkRecords(records, columns) {
  const rows = [];
  const problems = [];
  const skipped = [];
  for (const record of records) {
    const statuses = Object.keys(columns).map((field) =>
      [field, cellStatus(record[field], columns[field].allowed)]);
    // A row with nothing in it is padding, not a record with missing values.
    if (statuses.every(([, status]) => status === "blank")) { skipped.push(record.rowNumber); continue; }

    const out = { rowNumber: record.rowNumber };
    for (const [field, status] of statuses) {
      const value = record[field];
      if (status === "value") { out[field] = value; continue; }
      out[field] = null;
      const problem = { row: record.rowNumber, field, value: value ?? "", status };
      if (status === "formula error" || columns[field].required) problems.push({ ...problem, level: "error" });
      else if (status === "placeholder") problems.push({ ...problem, level: "note" });
    }
    rows.push(out);
  }
  if (rows.length === 0) problems.push({ row: null, field: null, value: "", status: "no data rows", level: "error" });
  return { rows, problems, skipped };
}

function describe(problem) {
  if (problem.status === "no data rows") return "The file has no data rows.";
  const where = `Row ${problem.row}, ${problem.field}: `;
  const shown = JSON.stringify(String(problem.value));
  if (problem.status === "formula error") return where + `${shown} is a formula error in the file. Fix it there and export again.`;
  if (problem.level === "note") return where + `${shown} was read as empty.`;
  if (problem.status === "blank") return where + "is empty, but this column is required.";
  return where + `${shown} is a placeholder, but this column is required.`;
}



// Records from the first sheet, with Excel error cells kept as their text ("#REF!")
// and the spreadsheet row number in rowNumber. headers: { "Header text": "field" }.
function readRecords(bytes, headers) {
  // raw: true keeps CSV text as text, so "0123" is not turned into the number 123.
  const workbook = XLSX.read(bytes, { raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet || !sheet["!ref"]) return [];
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const cellText = (r, c) => {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    if (!cell) return "";
    if (cell.t === "e") return cell.w ?? "#ERROR!"; // w holds the error text, such as "#REF!"
    return cell.v;
  };
  // The first row holds the headers.
  const fieldOf = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const header = String(cellText(range.s.r, c)).trim();
    if (Object.hasOwn(headers, header)) fieldOf[c] = headers[header]; // not "constructor" etc.
  }
  const records = [];
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const record = { rowNumber: r + 1 };
    for (let c = range.s.c; c <= range.e.c; c++) if (fieldOf[c]) record[fieldOf[c]] = cellText(r, c);
    records.push(record);
  }
  return records;
}


ok("ph: the problem lines print what the comments say", () => {
  const lines = "const row = { email: \"N/A\", name: \"   \", company: \"-\" };\nBoolean(row.email);       // true\nrow.name.length > 0;      // true\nrow.company !== \"\";       // true\n".split("\n");
  const setup = lines.filter((l) => l.startsWith("const ")).join("\n");
  let checked = 0;
  for (const line of lines) {
    const m = /^(.*?);\s*\/\/ (true|false)$/.exec(line);
    if (!m || line.startsWith("const ")) continue;
    assert.strictEqual(String(new Function(setup + "\nreturn (" + m[1] + ");")()), m[2], line);
    checked++;
  }
  assert.strictEqual(checked, 3);
});
ok("ph: every row of the status table in the post", () => {
  const table = [[["\"\"", "\"   \"", "null", "undefined"], "blank"], [["N/A", "n.a.", "NA", "None", "NULL"], "placeholder"], [["TBD", "unknown", "(blank)", "missing"], "placeholder"], [["(None)", "[blank]", "N/A.", "Not applicable"], "placeholder"], [["-", "- -", "?", "...", "#"], "placeholder"], [["#N/A", "#REF!", "#DIV/0!", "#SPILL!"], "formula error"], [["#Hello!"], "formula error"], [["0", "false", "-5"], "value"], [["Nina", "none of the above", "NAB"], "value"], [["$", "~", "#123", "C#"], "value"]];
  for (const [inputs, want] of table) for (const input of inputs) {
    const value = input === "null" ? null : input === "undefined" ? undefined : input.replace(/^"|"$/g, "");
    assert.strictEqual(cellStatus(value), want, JSON.stringify(input));
  }
});
ok("ph: cellStatus finds placeholders and leaves real values alone", () => {
  const placeholders = ["N/A", "n/a", " N / A ", "n.a.", "NA", "na", "None", "NULL", "nil", "NaN", "undefined", "Unknown",
    "TBD", "tba", "TBC", "(blank)", "(None)", "[blank]", "<null>", "N/A.", "None.", "N/A?", "TBD?", "Not applicable", "not available", "Not provided", "- -", ". . .", "#", "%", "@", "&", "-", "--", "\u2013", "\u2014", "?", "???", "...", ".", "/", "*", "_"];
  for (const v of placeholders) assert.strictEqual(cellStatus(v), "placeholder", JSON.stringify(v));
  assert.strictEqual(cellStatus(NaN), "placeholder");
  for (const v of ["", "   ", "\t", "\u00a0", "\u3000", null, undefined]) assert.strictEqual(cellStatus(v), "blank", JSON.stringify(v));
  const values = ["Nina", "NAB", "Anna", "none of the above", "Null Island Ltd", "0", 0, false, "false", "-5", "$", "+", "€",
    "#1", "#123", "#hashtag", "C#", "n/a/b", "N/A2", "~", "|", "x", "(Nina)", "Nan Li", "2026-11-19", new Date(Date.UTC(2026, 0, 5))];
  for (const v of values) assert.strictEqual(cellStatus(v), "value", JSON.stringify(v));
});
ok("ph: formula errors, including names not in the list", () => {
  for (const v of ["#N/A", "#n/a", "#REF!", "#DIV/0!", "#VALUE!", "#NAME?", "#NUM!", "#NULL!", "#GETTING_DATA", "#SPILL!", "#CALC!", " #REF! "])
    assert.strictEqual(cellStatus(v), "formula error", v);
  // The post says a hashtag that ends in "!" is reported as a formula error too.
  assert.strictEqual(cellStatus("#Hello!"), "formula error");
  assert.strictEqual(cellStatus("#help?"), "formula error");
  assert.strictEqual(cellStatus("*"), "placeholder");
  for (const v of ["#", "#!", "#1!", "#N/A N/A", "#REF! (see note)"]) assert.notStrictEqual(cellStatus(v), "formula error", v);
});
ok("ph: allowed values are exact and per column", () => {
  assert.strictEqual(cellStatus("NA", ["NA"]), "value");
  assert.strictEqual(cellStatus(" NA ", ["NA"]), "value");
  assert.strictEqual(checkRecords([{ rowNumber: 2, country: " NA " }], { country: { allowed: ["NA"] } }).rows[0].country, " NA ");
  assert.strictEqual(cellStatus("na", ["NA"]), "placeholder");
  assert.strictEqual(cellStatus("NA"), "placeholder");
  assert.strictEqual(cellStatus("", ["NA"]), "blank");
  assert.strictEqual(cellStatus("#N/A", ["NA"]), "formula error");
  assert.strictEqual(new Intl.DisplayNames("en", { type: "region" }).of("NA"), "Namibia");
});
ok("ph: known limits stated in the post", () => {
  // A zero width space is not trimmed and is not punctuation: clean invisible characters first.
  assert.strictEqual(cellStatus("\u200b"), "value");
  // Sentinel values are not placeholders.
  for (const v of ["0", "999", "1900-01-01", "x"]) assert.strictEqual(cellStatus(v), "value", v);
});
ok("ph: the example gives the output in its comments", () => {
  const src = "const columns = {\n  email:   { required: true },\n  country: { required: true, allowed: [\"NA\"] }, // \"NA\" is Namibia\n  phone:   {},\n};\nconst { rows, problems, skipped } = checkRecords([\n  { rowNumber: 2, email: \"ana@example.com\", country: \"NA\",  phone: \"n/a\" },\n  { rowNumber: 3, email: \"N/A\",             country: \"DE\",  phone: \"\" },\n  { rowNumber: 4, email: \"bo@example.com\",  country: \"  \",  phone: \"#REF!\" },\n  { rowNumber: 5, email: \"\",                country: \"\",    phone: \"\" },\n], columns);\n\nproblems.map(describe);\n// [ 'Row 2, phone: \"n/a\" was read as empty.',\n//   'Row 3, email: \"N/A\" is a placeholder, but this column is required.',\n//   'Row 4, country: is empty, but this column is required.',\n//   'Row 4, phone: \"#REF!\" is a formula error in the file. Fix it there and export again.' ]\nskipped;       // [5]  (row numbers of empty rows)\nrows[0].phone; // null\n";
  const got = new Function("checkRecords", "describe", src + "\nreturn { rows, problems, skipped, messages: problems.map(describe) };")(checkRecords, describe);
  assert.deepStrictEqual(got.messages, [
    'Row 2, phone: "n/a" was read as empty.',
    'Row 3, email: "N/A" is a placeholder, but this column is required.',
    'Row 4, country: is empty, but this column is required.',
    'Row 4, phone: "#REF!" is a formula error in the file. Fix it there and export again.',
  ]);
  const comment = src.slice(src.indexOf("// [")).split("\n").filter((l) => l.startsWith("//")).join("\n");
  for (const m of got.messages) assert(comment.includes(m), m);
  assert.deepStrictEqual(got.skipped, [5]);
  assert.strictEqual(got.rows.length, 3);
  assert.strictEqual(got.rows[0].phone, null);
  assert.strictEqual(got.rows[0].country, "NA");
  assert.deepStrictEqual(got.rows.map((r) => r.rowNumber), [2, 3, 4]);
  assert(/skipped;\s+\/\/ \[5\] /.test(src) && /rows\[0\]\.phone; \/\/ null/.test(src));
});
ok("ph: checkRecords edge cases", () => {
  const cols = { email: { required: true }, note: {} };
  // Header only, or only empty rows: one error, nothing to import.
  for (const records of [[], [{ rowNumber: 2, email: "", note: "  " }]]) {
    const r = checkRecords(records, cols);
    assert.deepStrictEqual(r.rows, []);
    assert.deepStrictEqual(r.problems.map(describe), ["The file has no data rows."]);
  }
  // A missing field counts as blank; a formula error in an optional column is still an error.
  const r = checkRecords([{ rowNumber: 7, note: "#VALUE!" }, { rowNumber: 8, email: "a@b.co", note: "-" }], cols);
  assert.deepStrictEqual(r.problems.map((p) => [p.row, p.field, p.status, p.level]),
    [[7, "email", "blank", "error"], [7, "note", "formula error", "error"], [8, "note", "placeholder", "note"]]);
  assert.strictEqual(describe(r.problems[0]), "Row 7, email: is empty, but this column is required.");
  // A row of placeholders is not skipped: someone typed them.
  const dashes = checkRecords([{ rowNumber: 3, email: "-", note: "-" }], cols);
  assert.deepStrictEqual(dashes.skipped, []);
  assert.deepStrictEqual(dashes.problems.map((p) => p.level), ["error", "note"]);
  // Real values are passed through unchanged (not trimmed, not converted).
  const kept = checkRecords([{ rowNumber: 2, email: " a@b.co ", note: 0 }], cols);
  assert.deepStrictEqual(kept.rows, [{ rowNumber: 2, email: " a@b.co ", note: 0 }]);
});
const phBook = (rows, errors = {}) => {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  for (const [address, code] of Object.entries(errors)) sheet[address] = { t: "e", v: code };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Contacts");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
};
ok("ph: SheetJS 0.20.3: sheet_to_json turns Excel error cells into empty cells", () => {
  assert.strictEqual(XLSX.version, "0.20.3");
  const bytes = phBook([["Email", "Phone"], ["ana@example.com", ""], ["bo@example.com", ""]], { B2: 0x17, B3: 0x2a });
  const sheet = XLSX.read(bytes).Sheets.Contacts;
  assert.deepStrictEqual([sheet.B2.t, sheet.B2.w, sheet.B3.w], ["e", "#REF!", "#N/A"]);
  assert.deepStrictEqual(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }).slice(1).map((r) => r[1]), ["", ""]);
  assert.deepStrictEqual(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }).slice(1).map((r) => r[1]), ["", ""]);
  assert.deepStrictEqual(XLSX.utils.sheet_to_json(sheet, { defval: null }).map((r) => r.Phone), [null, null]);
  // ...while sheet_to_csv writes the error text.
  assert.strictEqual(XLSX.utils.sheet_to_csv(sheet).split("\n")[1], "ana@example.com,#REF!");
});
ok("ph: SheetJS 0.20.3: every error code it writes reads back as text the check finds", () => {
  const codes = [0x00, 0x07, 0x0f, 0x17, 0x1d, 0x24, 0x2a, 0x2b];
  const errors = Object.fromEntries(codes.map((code, i) => ["B" + (i + 2), code]));
  const rows = [["Email", "Phone"], ...codes.map((_, i) => ["u" + i + "@example.com", ""])];
  const records = readRecords(phBook(rows, errors), { Email: "email", Phone: "phone" });
  assert.deepStrictEqual(records.map((r) => r.phone), ["#NULL!", "#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#NUM!", "#N/A", "#GETTING_DATA"]);
  for (const r of records) assert.strictEqual(cellStatus(r.phone), "formula error", r.phone);
});
ok("ph: readRecords keeps row numbers, values and empty rows", () => {
  const bytes = phBook([["Email", "Country", "Ignored"], ["ana@example.com", "NA", "x"], [], ["N/A", "DE", ""], ["", 0, ""]]);
  const records = readRecords(bytes, { Email: "email", Country: "country" });
  assert.deepStrictEqual(records, [
    { rowNumber: 2, email: "ana@example.com", country: "NA" },
    { rowNumber: 3, email: "", country: "" },
    { rowNumber: 4, email: "N/A", country: "DE" },
    { rowNumber: 5, email: "", country: 0 },
  ]);
  const { problems, skipped } = checkRecords(records, { email: { required: true }, country: { required: true, allowed: ["NA"] } });
  assert.deepStrictEqual(skipped, [3]);
  assert.deepStrictEqual(problems.map((p) => [p.row, p.field, p.status]), [[4, "email", "placeholder"], [5, "email", "blank"]]);
  // An empty workbook sheet gives no records.
  const empty = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(empty, XLSX.utils.aoa_to_sheet([]), "S");
  assert.deepStrictEqual(readRecords(XLSX.write(empty, { type: "buffer", bookType: "xlsx" }), { Email: "email" }), []);
});
ok("ph: SheetJS 0.20.3: CSV error text, with and without raw: true", () => {
  const csv = 'Email,Phone\nana@example.com,#N/A\nN/A,""\n"  ",-\n';
  const records = readRecords(Buffer.from(csv), { Email: "email", Phone: "phone" });
  assert.deepStrictEqual(records.map((r) => [r.email, r.phone]), [["ana@example.com", "#N/A"], ["N/A", ""], ["  ", "-"]]);
  // Without raw: true, SheetJS reads the text #N/A in a CSV as an error cell, and sheet_to_json drops it.
  const parsed = XLSX.read(Buffer.from(csv)).Sheets.Sheet1;
  assert.deepStrictEqual([parsed.B2.t, parsed.B2.w], ["e", "#N/A"]);
  assert.strictEqual(XLSX.utils.sheet_to_json(parsed, { defval: "" })[0].Phone, "");
  // With raw: true it stays a string.
  assert.strictEqual(XLSX.read(Buffer.from(csv), { raw: true }).Sheets.Sheet1.B2.t, "s");
  assert.deepStrictEqual(records.map((r) => cellStatus(r.phone)), ["formula error", "blank", "placeholder"]);
});
ok("ph: SheetJS 0.20.3: sheet_to_json gives every error cell the defval, like an empty cell", () => {
  const codes = [0x00, 0x07, 0x0f, 0x17, 0x1d, 0x24, 0x2a, 0x2b];
  const errors = Object.fromEntries(codes.map((code, i) => ["B" + (i + 2), code]));
  const rows = [["Email", "Phone"], ...codes.map((_, i) => ["u" + i + "@example.com", ""])];
  const sheet = XLSX.read(phBook(rows, errors)).Sheets.Contacts;
  for (const raw of [true, false]) {
    // #NULL! (code 0) comes back as null even with defval: "".
    const withEmpty = codes.map((code) => (code === 0 ? null : ""));
    assert.deepStrictEqual(XLSX.utils.sheet_to_json(sheet, { defval: "", raw }).map((r) => r.Phone), withEmpty);
    assert.deepStrictEqual(XLSX.utils.sheet_to_json(sheet, { defval: null, raw }).map((r) => r.Phone), codes.map(() => null));
    assert.deepStrictEqual(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw }).slice(1).map((r) => r[1]), withEmpty);
  }
});
ok("ph: readRecords ignores headers that are Object.prototype names", () => {
  const records = readRecords(phBook([["Email", "constructor", "toString"], ["a@b.co", "x", "y"]]), { Email: "email" });
  assert.deepStrictEqual(records, [{ rowNumber: 2, email: "a@b.co" }]);
});
ok("ph: SheetJS 0.20.3: raw: true keeps CSV text; without it values are converted", () => {
  const csv = Buffer.from("Phone,Active\n0123,TRUE\n");
  const plain = XLSX.read(csv).Sheets.Sheet1;
  assert.deepStrictEqual([plain.A2.v, plain.B2.v], [123, true]);
  const records = readRecords(csv, { Phone: "phone", Active: "active" });
  assert.deepStrictEqual(records, [{ rowNumber: 2, phone: "0123", active: "TRUE" }]);
});
ok("ph: snippets have no invisible characters", () => {
  for (const s of ["const row = { email: \"N/A\", name: \"   \", company: \"-\" };\nBoolean(row.email);       // true\nrow.name.length > 0;      // true\nrow.company !== \"\";       // true\n", "// Text that stands for \"no value\", compared in lower case, with spaces,\n// opening and closing brackets and trailing dots or question marks removed,\n// so \"(None)\", \"[blank]\", \"N/A.\" and \"TBD?\" match.\nconst PLACEHOLDERS = new Set([\n  \"n/a\", \"n.a\", \"na\", \"none\", \"null\", \"nil\", \"nan\", \"undefined\", \"unknown\",\n  \"notapplicable\", \"notavailable\", \"notprovided\", \"tbd\", \"tba\", \"tbc\", \"blank\", \"empty\", \"missing\",\n]);\n\n// A cell made only of punctuation: \"-\", \"- -\", \"?\", \"...\", \"/\", \"#\", \"\u2014\".\nconst ONLY_PUNCTUATION = /^\\p{P}+$/u;\n\n// Formula errors, as a CSV export writes them: \"#N/A\", \"#REF!\", \"#DIV/0!\".\n// The second part catches any \"#WORD!\" or \"#WORD?\" so newer error names are found too.\n// Case-insensitive, so a hand-typed \"#n/a\" is caught.\nconst FORMULA_ERROR = /^#(N\\/A|GETTING_DATA|[A-Z][A-Z0-9\\/_]*[!?])$/i;\n\n// Returns \"value\", \"blank\", \"placeholder\" or \"formula error\".\n// allowed: values that look like placeholders but are real in this column,\n// compared exactly after trim(), for example [\"NA\"] in a country column.\nfunction cellStatus(value, allowed = []) {\n  if (value === null || value === undefined) return \"blank\";\n  const text = String(value).trim();\n  if (text === \"\") return \"blank\";\n  if (allowed.includes(text)) return \"value\";\n  if (FORMULA_ERROR.test(text)) return \"formula error\";\n  const squeezed = text.toLowerCase().replace(/\\s+/g, \"\");\n  if (ONLY_PUNCTUATION.test(squeezed)) return \"placeholder\";\n  const key = squeezed.replace(/^[(\\[<]+|[)\\]>.?]+$/g, \"\");\n  if (PLACEHOLDERS.has(key)) return \"placeholder\";\n  return \"value\";\n}\n", "// columns: { field: { required, allowed } }. records: objects from your parser,\n// each with the spreadsheet row number in rowNumber.\n// Import rows only when no problem has level \"error\".\nfunction checkRecords(records, columns) {\n  const rows = [];\n  const problems = [];\n  const skipped = [];\n  for (const record of records) {\n    const statuses = Object.keys(columns).map((field) =>\n      [field, cellStatus(record[field], columns[field].allowed)]);\n    // A row with nothing in it is padding, not a record with missing values.\n    if (statuses.every(([, status]) => status === \"blank\")) { skipped.push(record.rowNumber); continue; }\n\n    const out = { rowNumber: record.rowNumber };\n    for (const [field, status] of statuses) {\n      const value = record[field];\n      if (status === \"value\") { out[field] = value; continue; }\n      out[field] = null;\n      const problem = { row: record.rowNumber, field, value: value ?? \"\", status };\n      if (status === \"formula error\" || columns[field].required) problems.push({ ...problem, level: \"error\" });\n      else if (status === \"placeholder\") problems.push({ ...problem, level: \"note\" });\n    }\n    rows.push(out);\n  }\n  if (rows.length === 0) problems.push({ row: null, field: null, value: \"\", status: \"no data rows\", level: \"error\" });\n  return { rows, problems, skipped };\n}\n\nfunction describe(problem) {\n  if (problem.status === \"no data rows\") return \"The file has no data rows.\";\n  const where = `Row ${problem.row}, ${problem.field}: `;\n  const shown = JSON.stringify(String(problem.value));\n  if (problem.status === \"formula error\") return where + `${shown} is a formula error in the file. Fix it there and export again.`;\n  if (problem.level === \"note\") return where + `${shown} was read as empty.`;\n  if (problem.status === \"blank\") return where + \"is empty, but this column is required.\";\n  return where + `${shown} is a placeholder, but this column is required.`;\n}\n", "const columns = {\n  email:   { required: true },\n  country: { required: true, allowed: [\"NA\"] }, // \"NA\" is Namibia\n  phone:   {},\n};\nconst { rows, problems, skipped } = checkRecords([\n  { rowNumber: 2, email: \"ana@example.com\", country: \"NA\",  phone: \"n/a\" },\n  { rowNumber: 3, email: \"N/A\",             country: \"DE\",  phone: \"\" },\n  { rowNumber: 4, email: \"bo@example.com\",  country: \"  \",  phone: \"#REF!\" },\n  { rowNumber: 5, email: \"\",                country: \"\",    phone: \"\" },\n], columns);\n\nproblems.map(describe);\n// [ 'Row 2, phone: \"n/a\" was read as empty.',\n//   'Row 3, email: \"N/A\" is a placeholder, but this column is required.',\n//   'Row 4, country: is empty, but this column is required.',\n//   'Row 4, phone: \"#REF!\" is a formula error in the file. Fix it there and export again.' ]\nskipped;       // [5]  (row numbers of empty rows)\nrows[0].phone; // null\n", "// npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz\nimport * as XLSX from \"xlsx\";\n\n// Records from the first sheet, with Excel error cells kept as their text (\"#REF!\")\n// and the spreadsheet row number in rowNumber. headers: { \"Header text\": \"field\" }.\nfunction readRecords(bytes, headers) {\n  // raw: true keeps CSV text as text, so \"0123\" is not turned into the number 123.\n  const workbook = XLSX.read(bytes, { raw: true });\n  const sheet = workbook.Sheets[workbook.SheetNames[0]];\n  if (!sheet || !sheet[\"!ref\"]) return [];\n  const range = XLSX.utils.decode_range(sheet[\"!ref\"]);\n  const cellText = (r, c) => {\n    const cell = sheet[XLSX.utils.encode_cell({ r, c })];\n    if (!cell) return \"\";\n    if (cell.t === \"e\") return cell.w ?? \"#ERROR!\"; // w holds the error text, such as \"#REF!\"\n    return cell.v;\n  };\n  // The first row holds the headers.\n  const fieldOf = [];\n  for (let c = range.s.c; c <= range.e.c; c++) {\n    const header = String(cellText(range.s.r, c)).trim();\n    if (Object.hasOwn(headers, header)) fieldOf[c] = headers[header]; // not \"constructor\" etc.\n  }\n  const records = [];\n  for (let r = range.s.r + 1; r <= range.e.r; r++) {\n    const record = { rowNumber: r + 1 };\n    for (let c = range.s.c; c <= range.e.c; c++) if (fieldOf[c]) record[fieldOf[c]] = cellText(r, c);\n    records.push(record);\n  }\n  return records;\n}\n"]) assert(!/[\u00A0\u00AD\u200B-\u200F\u2028\u2029\u202F\u2060\u3000\uFEFF]/.test(s));
});
}

// --- blog/merged-cells-excel-sheetjs ---
{
const XLSX = require(process.env.XLSX_MODULE || "xlsx");
const fs = require("fs");
const path = require("path");

// rows: arrays of cells from the first sheet. merges: the sheet's merged ranges.
// Both count from 0 at the top-left cell of the sheet's stored range (origin).
function readSheet(bytes) {
  const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  const starts = (a, b) => data[0] === a && data[1] === b;
  // .xlsx files are zip archives (they start with "PK"); .xls files start with D0 CF.
  // Anything else is text. Decode it yourself: without a byte order mark (BOM),
  // SheetJS does not assume UTF-8, and "München" would arrive as "MÃ¼nchen".
  // FF FE and FE FF are UTF-16 BOMs, as in Excel's "Unicode Text" export.
  const binary = starts(0x50, 0x4b) || starts(0xd0, 0xcf);
  const encoding = starts(0xff, 0xfe) ? "utf-16le" : starts(0xfe, 0xff) ? "utf-16be" : "utf-8";
  let workbook;
  if (binary) workbook = XLSX.read(data, { raw: true });
  else {
    // fatal: true throws a TypeError on bytes that are not valid in this encoding.
    const text = new TextDecoder(encoding, { fatal: true }).decode(data);
    // UTF-16 without a BOM is valid UTF-8 full of zero bytes: refuse it too.
    if (text.includes("\0")) throw new TypeError("zero bytes: UTF-16 without a BOM, or not a text file");
    workbook = XLSX.read(text, { type: "string", raw: true });
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet || !sheet["!ref"]) return { rows: [], merges: [], origin: { r: 0, c: 0 } };
  const origin = XLSX.utils.decode_range(sheet["!ref"]).s;
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1, defval: "", blankrows: true, raw: true });
  const merges = (sheet["!merges"] ?? []).map((m) => ({
    address: XLSX.utils.encode_range(m), // "C1:D1", for messages
    top: m.s.r - origin.r, bottom: m.e.r - origin.r,
    left: m.s.c - origin.c, right: m.e.c - origin.c,
  }));
  return { rows, merges, origin };
}

const isEmpty = (value) => String(value ?? "").trim() === "";
const isLabel = (value) => typeof value === "string" && value.trim() !== "";
const covers = (m, r, c) => r >= m.top && r <= m.bottom && c >= m.left && c <= m.right;
// What the user sees in a cell: a cell under a merge shows the merge's value.
const shown = (rows, merges, r, c) => {
  const m = merges.find((range) => covers(range, r, c));
  return m ? rows[m.top]?.[m.left] : rows[r]?.[c];
};

// A row can be part of the header only if it has labels and no numbers, dates or booleans.
const labelRow = (row = []) => row.some(isLabel) && row.every((v) => isEmpty(v) || isLabel(v));

// How many rows the header has, starting at row `top`. A label merged down ("Region"
// over two rows) covers the rows below it. A label merged across ("Q1" over two
// columns) names a group, so the row below belongs to the header if it has a label
// under every column of the group. maxDepth keeps a stray merge from eating the data.
function headerDepth(rows, merges, top, maxDepth = 3) {
  let bottom = top;
  for (let changed = true; changed; ) {
    changed = false;
    for (const m of merges) {
      if (m.top < top || m.top > bottom) continue;
      // last: the lowest row this merge pulls into the header.
      let last = m.bottom;
      const below = [];
      for (let c = m.left; c <= m.right; c++) below.push(shown(rows, merges, m.bottom + 1, c));
      if (m.right > m.left && below.every(isLabel)) last = m.bottom + 1;
      if (last <= bottom || last >= top + maxDepth) continue;
      if (!rows.slice(bottom + 1, last + 1).every((row) => labelRow(row))) continue;
      bottom = last;
      changed = true;
    }
  }
  return bottom - top + 1;
}

// One name per column: "Q1" above "Revenue" becomes "Q1 Revenue".
// A merged cell gives its value to every column it covers, once per column.
function headerNames(rows, merges, top, depth) {
  const width = Math.max(0, ...rows.slice(top, top + depth).map((row) => row.length));
  const names = [];
  for (let c = 0; c < width; c++) {
    const parts = [];
    let previous = null;
    for (let r = top; r < top + depth; r++) {
      const m = merges.find((range) => covers(range, r, c)) ?? null;
      if (m && m === previous) continue; // a label merged down counts once
      previous = m;
      const value = m ? rows[m.top]?.[m.left] : rows[r]?.[c];
      if (!isEmpty(value)) parts.push(String(value).trim());
    }
    names.push(parts.join(" "));
  }
  return names;
}

// Copies each merged value down its column; reports the merges it will not fill.
// Changes rows in place. firstData: index of the first row under the header.
// width: number of named columns in the table.
function fillMerges(rows, merges, firstData, width, origin) {
  const notes = [];
  const problems = [];
  const titleRows = new Set();
  const address = (r1, c1, r2, c2) => XLSX.utils.encode_range({
    s: { r: origin.r + r1, c: origin.c + c1 }, e: { r: origin.r + r2, c: origin.c + c2 } });
  for (const m of merges) {
    if (m.bottom < firstData) continue; // inside the header: headerNames used it
    if (m.top >= rows.length) continue;  // below the last row: nothing to read
    if (m.left >= width) continue;       // right of the last named column: not in the table
    if (m.top < firstData) {
      // A header label merged down into blank rows only ("Region" over A1:A3, row 3
      // empty) is harmless: blank rows are skipped. Anything else is reported.
      const into = rows.slice(firstData, m.bottom + 1);
      if (!into.every((row) => row.every(isEmpty))) {
        problems.push({ range: m.address, reason: "runs from the header into the data" });
      }
      continue;
    }
    const value = rows[m.top]?.[m.left] ?? "";
    const last = Math.min(m.bottom, rows.length - 1);
    // A merged range shows only its first cell's value. A value stored under it is
    // hidden from the user, so it is reported and not imported.
    for (let r = m.top; r <= last; r++) {
      for (let c = m.left; c <= m.right; c++) {
        if ((r === m.top && c === m.left) || isEmpty(rows[r][c])) continue;
        problems.push({ range: m.address, reason: `hides ${JSON.stringify(rows[r][c])} in ${address(r, c, r, c)}` });
        rows[r][c] = "";
      }
    }
    const height = m.bottom - m.top + 1;
    const span = m.right - m.left + 1;
    const first = address(m.top, m.left, m.top, m.left);
    if (span === 1 && isLabel(value)) {
      // One column, several rows, with text: a group label such as a region. Fill it down,
      // except into rows that are empty in the file: those are skipped later.
      const filled = [];
      for (let r = m.top + 1; r <= last; r++) {
        if (rows[r].every(isEmpty)) continue;
        rows[r][m.left] = value;
        filled.push(address(r, m.left, r, m.left));
      }
      if (filled.length > 0) {
        notes.push({ range: m.address, reason: `${JSON.stringify(value)} copied into ${filled.join(", ")}` });
      }
    } else if (span === 1) {
      // A number, date or boolean merged down: copying 100 into two invoice lines
      // would double it. Empty merges need nothing.
      if (!isEmpty(value) && last > m.top) {
        problems.push({ range: m.address, reason: `covers ${height} rows; its value ${JSON.stringify(value)} is read into ${first} only` });
      }
    } else if (m.left <= 0 && m.right >= width - 1) {
      // One cell across the whole table: a title or a note, not a record.
      for (let r = m.top; r <= last; r++) titleRows.add(r);
      const row = origin.r + m.top + 1;
      const where = last > m.top ? `rows ${row}-${origin.r + last + 1}` : `row ${row}`;
      // Text is a title or a footnote. A number across the table (a total?) is reported.
      const list = isLabel(value) || isEmpty(value) ? notes : problems;
      list.push({ range: m.address, reason: `${where} skipped: ${JSON.stringify(value)} spans the table` });
    } else if (!isEmpty(value)) {
      // Across columns: the value belongs to one of them, and only the user knows which.
      // An empty merge (kept for layout) needs nothing.
      const size = height > 1 ? `${height} rows and ${span} columns` : `${span} columns`;
      problems.push({ range: m.address, reason: `covers ${size}; its value is read into ${first} only` });
    }
  }
  return { notes, problems, titleRows };
}

// Was a lower header row really the first record? Two signs, both reported:
// a value under a header cell that is not merged ("Ana" under "Name"), or a first
// data row with text in the same columns as the lower header row.
function checkLowerHeaderRows(rows, merges, headerTop, firstData, width, origin) {
  const problems = [];
  const next = rows.slice(firstData).find((row) => !row.every(isEmpty)) ?? [];
  for (let r = headerTop + 1; r < firstData; r++) {
    const row = origin.r + r + 1;
    const used = rows[r].flatMap((value, c) => (isEmpty(value) ? [] : [c]));
    // Is column c under a header merge that starts above row r? ("Q1" over C1:D1)
    const underMerge = (c) =>
      merges.some((m) => m.top >= headerTop && m.top < r && c >= m.left && c <= m.right);
    const loose = used.filter((c) => !underMerge(c));
    for (const c of loose) {
      const cell = XLSX.utils.encode_cell({ r: origin.r + r, c: origin.c + c });
      problems.push({ range: cell, reason: `${JSON.stringify(rows[r][c])} is under a header cell that is not merged; row ${row} may be data` });
    }
    if (loose.length === 0 && used.length > 0 && used.every((c) => isLabel(next[c]))) {
      const range = XLSX.utils.encode_range({
        s: { r: origin.r + r, c: origin.c }, e: { r: origin.r + r, c: origin.c + width - 1 } });
      problems.push({ range, reason: `row ${row} was read as a header row, but the first data row has text in the same columns; check whether row ${row} is data` });
    }
  }
  return problems;
}

// A repeated name gets a number ("Amount (2)"), so its values are not overwritten.
// "Email" and "EMAIL" count as the same name. Changes columns in place.
function renameRepeats(columns, cellOf) {
  const problems = [];
  const taken = new Set(columns.map((name) => name.toLowerCase()));
  const seen = new Set();
  columns.forEach((name, c) => {
    if (name === "") return;
    if (seen.has(name.toLowerCase())) {
      let n = 2;
      while (taken.has(`${name} (${n})`.toLowerCase())) n++;
      columns[c] = `${name} (${n})`;
      taken.add(columns[c].toLowerCase());
      problems.push({ range: cellOf(c), reason: `repeats the column name ${JSON.stringify(name)}; read as ${JSON.stringify(columns[c])}` });
    }
    seen.add(columns[c].toLowerCase());
  });
  return problems;
}

// headerTop: index into rows, counted from the first row of the stored range
// (0, or what your header detection found). Its Excel row is origin.r + headerTop + 1.
function readMergedTable(bytes, headerTop = 0) {
  const { rows, merges, origin } = readSheet(bytes);
  const cellOf = (c) => XLSX.utils.encode_cell({ r: origin.r + headerTop, c: origin.c + c });
  if (rows.length <= headerTop) {
    const problems = [{ range: null, reason: "the sheet has no header row" }];
    return { columns: [], records: [], notes: [], problems };
  }
  // 1. Name the columns.
  const depth = headerDepth(rows, merges, headerTop);
  const columns = headerNames(rows, merges, headerTop, depth);
  const firstData = headerTop + depth;
  // The table ends at the last named column; a stray cell further right does not widen it.
  const width = columns.findLastIndex((name) => name !== "") + 1;
  if (width === 0) {
    const reason = `row ${origin.r + headerTop + 1} has no column names; if the header is lower, pass its index as headerTop`;
    return { columns: [], records: [], notes: [], problems: [{ range: cellOf(0), reason }] };
  }
  // 2. Fill or flag the merges in the data.
  const { notes, problems, titleRows } = fillMerges(rows, merges, firstData, width, origin);
  // 3. Check the header.
  if (depth > 1) {
    const range = XLSX.utils.encode_range({
      s: { r: origin.r + headerTop, c: origin.c }, e: { r: origin.r + firstData - 1, c: origin.c + width - 1 } });
    notes.unshift({ range, reason: `${depth} header rows combined into one name per column` });
    problems.push(...checkLowerHeaderRows(rows, merges, headerTop, firstData, width, origin));
  }
  // Data rows: below the header, not a title, not empty (checked after fillMerges,
  // which clears hidden values).
  const isData = (r) => r >= firstData && !titleRows.has(r) && !rows[r].every(isEmpty);
  columns.forEach((name, c) => {
    if (name === "" && rows.some((row, r) => isData(r) && !isEmpty(row[c]))) {
      problems.push({ range: cellOf(c), reason: "has data but no column name" });
    }
  });
  problems.push(...renameRepeats(columns, cellOf));

  // 4. Build one record per data row.
  const records = [];
  rows.forEach((row, r) => {
    if (!isData(r)) return;
    // fromEntries defines own properties, so a column named "__proto__" is safe.
    const values = Object.fromEntries(
      columns.flatMap((name, c) => (name ? [[name, row[c] ?? ""]] : [])));
    records.push({ row: origin.r + r + 1, values }); // the row number the user sees in Excel
  });
  return { columns, records, notes, problems };
}

// A CSV keeps no merges: "North" merged over three rows arrives as "North", "", "".
// Fill a column only after the user says it is grouped this way, and after
// title and footnote rows are removed: in a CSV they arrive as records.
function fillDown(records, column) {
  let last = "";
  for (const record of records) {
    if (isEmpty(record.values[column])) record.values[column] = last;
    else last = record.values[column];
  }
  return records;
}

// tests/fixtures/sales-merged.xlsx was written by openpyxl 3.1.5 (tools/make_merged_fixture.py).
const salesBytes = fs.readFileSync(path.join(__dirname, "fixtures", "sales-merged.xlsx"));
const mgBook = (rows, merges, origin) => {
  const sheet = XLSX.utils.aoa_to_sheet(rows, origin ? { origin } : undefined);
  // Store the range from the origin, as Excel does for a sheet whose first cell is not A1.
  if (origin) sheet["!ref"] = XLSX.utils.encode_range({ s: XLSX.utils.decode_cell(origin), e: XLSX.utils.decode_range(sheet["!ref"]).e });
  sheet["!merges"] = merges.map((a) => XLSX.utils.decode_range(a));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "S");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
};
const text = (list) => list.map((p) => `${p.range}: ${p.reason}`);

ok("mg: SheetJS 0.20.3: the problem lines give what the comments say", () => {
  assert.strictEqual(XLSX.version, "0.20.3");
  const workbook = XLSX.read(salesBytes);
  const src = "// Sales.xlsx, six merges: \"Region\" over A1:A2, \"Rep\" over B1:B2, \"Q1\" over C1:D1,\n// \"Q2\" over E1:F1, \"North\" over A3:A4, \"Note: figures in EUR\" over A6:F6.\nconst sheet = workbook.Sheets[workbook.SheetNames[0]];\nconst records = XLSX.utils.sheet_to_json(sheet, { defval: \"\" });\nObject.keys(records[0]); // [ 'Region', 'Rep', 'Q1', '__EMPTY', 'Q2', '__EMPTY_1' ]\nrecords[0].Q1;           // 'Revenue'  (the second header row, read as data)\nrecords[2].Region;       // ''         (Bo's row: \"North\" is only in A3)\nsheet[\"!merges\"].length; // 6\n";
  const lines = src.split("\n").filter((l) => l && !l.startsWith("//"));
  const setup = lines.filter((l) => l.startsWith("const ")).join("\n");
  let checked = 0;
  for (const line of lines.filter((l) => !l.startsWith("const "))) {
    const m = /^(.*?);\s*\/\/ (.*?)(\s{2,}\(.*\))?$/.exec(line);
    const got = new Function("XLSX", "workbook", setup + "\nreturn (" + m[1] + ");")(XLSX, workbook);
    const want = m[2].trim();
    const shown = typeof got === "string" ? "'" + got + "'" : Array.isArray(got) ? "[ " + got.map((k) => "'" + k + "'").join(", ") + " ]" : String(got);
    assert.strictEqual(shown, want, line);
    checked++;
  }
  assert.strictEqual(checked, 4);
  // Only the top-left cell of each merge holds a value in the file.
  const sheet = workbook.Sheets.Sales;
  for (const a of ["A2", "B2", "D1", "F1", "A4", "B6", "F6"]) assert.strictEqual(sheet[a], undefined, a);
});
ok("mg: SheetJS 0.20.3: the example gives the output in its comments", async () => {
  const file = { arrayBuffer: async () => salesBytes };
  const src = "let table;\ntry {\n  table = readMergedTable(await file.arrayBuffer());\n} catch (error) {\n  // A text file that is not UTF-8 or UTF-16 throws a TypeError in readSheet,\n  // and SheetJS throws for a damaged .xlsx. Either way, ask for another export.\n  const reason = \"the file could not be read; save it as .xlsx or CSV UTF-8\";\n  table = { columns: [], records: [], notes: [], problems: [{ range: null, reason }] };\n}\nconst { columns, records, notes, problems } = table;\n\ncolumns;\n// [ 'Region', 'Rep', 'Q1 Revenue', 'Q1 Cost', 'Q2 Revenue', 'Q2 Cost' ]\nrecords[1];\n// { row: 4,\n//   values: { Region: 'North', Rep: 'Bo', 'Q1 Revenue': 90, 'Q1 Cost': 30,\n//             'Q2 Revenue': 95, 'Q2 Cost': 35 } }\nnotes.map((n) => `${n.range}: ${n.reason}`);\n// [ 'A1:F2: 2 header rows combined into one name per column',\n//   'A3:A4: \"North\" copied into A4',\n//   'A6:F6: row 6 skipped: \"Note: figures in EUR\" spans the table' ]\nproblems; // []\n";
  const body = src.slice(0, src.indexOf("\n\ncolumns;"));
  const got = await new Function("readMergedTable", "file", "return (async () => {" + body + "\nreturn { columns, records, notes, problems }; })();")(readMergedTable, file);
  assert.deepStrictEqual(got.columns, ["Region", "Rep", "Q1 Revenue", "Q1 Cost", "Q2 Revenue", "Q2 Cost"]);
  assert.deepStrictEqual(got.records[1], { row: 4, values: { Region: "North", Rep: "Bo", "Q1 Revenue": 90, "Q1 Cost": 30, "Q2 Revenue": 95, "Q2 Cost": 35 } });
  assert.deepStrictEqual(got.records.map((r) => [r.row, r.values.Region]), [[3, "North"], [4, "North"], [5, "South"]]);
  const notes = text(got.notes);
  assert.deepStrictEqual(notes, [
    "A1:F2: 2 header rows combined into one name per column",
    'A3:A4: "North" copied into A4',
    'A6:F6: row 6 skipped: "Note: figures in EUR" spans the table',
  ]);
  for (const n of notes) assert(src.includes("'" + n + "'"), n);
  assert.deepStrictEqual(got.problems, []);
  assert(src.includes("problems; // []"));
});
ok("mg: SheetJS 0.20.3: a file SheetJS writes reads the same way", () => {
  const bytes = mgBook([["Region", "Rep", "Q1", "", "Q2", ""], ["", "", "Revenue", "Cost", "Revenue", "Cost"],
    ["North", "Ana", 100, 40, 120, 50], ["", "Bo", 90, 30, 95, 35], ["South", "Cy", 70, 20, 80, 25], ["Note", "", "", "", "", ""]],
    ["A1:A2", "B1:B2", "C1:D1", "E1:F1", "A3:A4", "A6:F6"]);
  const fromSheetJS = readMergedTable(bytes);
  const fromOpenpyxl = readMergedTable(salesBytes);
  assert.deepStrictEqual(fromSheetJS.columns, fromOpenpyxl.columns);
  assert.deepStrictEqual(fromSheetJS.records, fromOpenpyxl.records);
});
ok("mg: headerDepth", () => {
  const d = (rows, merges) => headerDepth(rows, readSheet(mgBook(rows, merges)).merges, 0);
  assert.strictEqual(d([["Name", "Email"], ["Ana", "a@b.co"]], []), 1);
  // A group label over sub-labels: two rows.
  assert.strictEqual(d([["Name", "Q1", ""], ["", "Revenue", "Cost"], ["Ana", 1, 2]], ["B1:C1"]), 2);
  // A label merged down: two rows, even with no group label.
  assert.strictEqual(d([["Name", "Email"], ["", "Work"], ["Ana", "a@b.co"]], ["A1:A2"]), 2);
  // A merged header over data with numbers: the data row is not swallowed.
  assert.strictEqual(d([["Name", "Amount", ""], ["Ana", 1, 2]], ["B1:C1"]), 1);
  // Sub-labels missing under part of the group: not a header row.
  assert.strictEqual(d([["Name", "Q1", ""], ["", "Revenue", ""], ["Ana", "x", "y"]], ["B1:C1"]), 1);
  // Three levels: 2026 over Q1 and Q2, each over Revenue and Cost.
  assert.strictEqual(d([["Rep", "2026", "", "", ""], ["", "Q1", "", "Q2", ""], ["", "Rev", "Cost", "Rev", "Cost"], ["Ana", 1, 2, 3, 4]],
    ["A1:A3", "B1:E1", "B2:C2", "D2:E2"]), 3);
  // Nested groups with no label merged down: the cells under Q1 and Q2 count as labels.
  assert.strictEqual(d([["Rep", "2026", "", "", ""], ["", "Q1", "", "Q2", ""], ["", "Rev", "Cost", "Rev", "Cost"], ["Ana", 1, 2, 3, 4]],
    ["B1:E1", "B2:C2", "D2:E2"]), 3);
  // Years typed as numbers are not labels (a limit stated in the post).
  assert.strictEqual(d([["Name", "Revenue", ""], ["", 2025, 2026], ["Ana", 1, 2]], ["B1:C1"]), 1);
  // maxDepth: a label merged down over more rows than that is not a header.
  assert.strictEqual(d([["Name", "Note"], ["", "a"], ["", "b"], ["", "c"], ["", "d"]], ["A1:A5"]), 1);
  assert.strictEqual(d([["Name", "Note"], ["", "a"], ["", "b"], ["", "c"]], ["A1:A3"]), 3);
  // The post's limits and table rows: a header merged over text-only data is read as two rows;
  // a label merged down over five rows is reported.
  const a = readMergedTable(mgBook([["Name", "Address", ""], ["Ana", "Main St", "Paris"], ["Bo", "High St", "Leeds"]], ["B1:C1"]));
  assert.deepStrictEqual(a.columns, ["Name Ana", "Address Main St", "Address Paris"]);
  assert.strictEqual(text(a.notes)[0], "A1:C2: 2 header rows combined into one name per column");
  const five = readMergedTable(mgBook([["Name", "Note"], ["", "a"], ["", "b"], ["", "c"], ["", "d"]], ["A1:A5"]));
  assert.deepStrictEqual(text(five.problems), ["A1:A5: runs from the header into the data"]);
  // Dates in an .xlsx file arrive as serial numbers.
  const dated = readMergedTable(mgBook([["Joined"], [new Date(Date.UTC(2026, 0, 5))]], []));
  assert.strictEqual(typeof dated.records[0].values.Joined, "number");
  const t = readMergedTable(mgBook([["Rep", "2026", "", "", ""], ["", "Q1", "", "Q2", ""], ["", "Rev", "Cost", "Rev", "Cost"], ["Ana", 1, 2, 3, 4]],
    ["A1:A3", "B1:E1", "B2:C2", "D2:E2"]));
  assert.deepStrictEqual(t.columns, ["Rep", "2026 Q1 Rev", "2026 Q1 Cost", "2026 Q2 Rev", "2026 Q2 Cost"]);
  assert.deepStrictEqual(t.records, [{ row: 4, values: { Rep: "Ana", "2026 Q1 Rev": 1, "2026 Q1 Cost": 2, "2026 Q2 Rev": 3, "2026 Q2 Cost": 4 } }]);
});
ok("mg: a header merged over data columns is reported, not guessed", () => {
  const t = readMergedTable(mgBook([["Name", "Amount", ""], ["Ana", 1, 2]], ["B1:C1"]));
  assert.deepStrictEqual(t.columns, ["Name", "Amount", "Amount (2)"]);
  assert.deepStrictEqual(text(t.problems), ['C1: repeats the column name "Amount"; read as "Amount (2)"']);
  // Both values reach the records: the second column does not overwrite the first.
  assert.deepStrictEqual(t.records[0].values, { Name: "Ana", Amount: 1, "Amount (2)": 2 });
  // The new name skips names already in the header.
  const taken = readMergedTable(mgBook([["Amount", "amount", "Amount (2)"], [1, 2, 3]], []));
  assert.deepStrictEqual(taken.columns, ["Amount", "amount (3)", "Amount (2)"]);
  assert.deepStrictEqual(Object.values(taken.records[0].values), [1, 2, 3]);
  // A label merged down into a row with numbers runs from the header into the data.
  const v = readMergedTable(mgBook([["Name", "Score"], ["", 5], ["Bo", 6]], ["A1:A2"]));
  assert.deepStrictEqual(v.columns, ["Name", "Score"]);
  assert.deepStrictEqual(v.records.map((r) => r.row), [2, 3]);
  assert.deepStrictEqual(text(v.problems), ["A1:A2: runs from the header into the data"]);
});
ok("mg: merges in the data", () => {
  const rows = [["Region", "Rep", "Amount", "Note"],
    ["North", "Ana", 1, "see C"], ["", "Bo", 2, ""], ["", "Cy", 3, "x"],   // A2:A4 down; D2 over C? no: D2:D2
    ["South", "Di", 4, "long note"], ["", "", 5, ""],                       // A5:B6 block, D5 alone
    ["Europe", "", "", ""],                                                 // A7:D7 title
    ["West", "Ed", 6, "wide"], ["", "Fay", 7, ""]];                         // C8:D8 across, A8:A10 past the end
  const bytes = mgBook(rows, ["A2:A4", "A5:B6", "A7:D7", "C8:D8", "A8:A10"]);
  const t = readMergedTable(bytes);
  assert.deepStrictEqual(t.records.map((r) => [r.row, r.values.Region, r.values.Rep]),
    [[2, "North", "Ana"], [3, "North", "Bo"], [4, "North", "Cy"], [5, "South", ""], [6, "", ""], [8, "West", "Ed"], [9, "West", "Fay"]]);
  assert.deepStrictEqual(t.records[5].values, { Region: "West", Rep: "Ed", Amount: 6, Note: "" });
  assert.deepStrictEqual(text(t.notes), [
    'A2:A4: "North" copied into A3, A4',
    'A7:D7: row 7 skipped: "Europe" spans the table',
    'A8:A10: "West" copied into A9',
  ]);
  assert.deepStrictEqual(text(t.problems), [
    'A5:B6: hides "Di" in B5',
    "A5:B6: covers 2 rows and 2 columns; its value is read into A5 only",
    'C8:D8: hides "wide" in D8',
    "C8:D8: covers 2 columns; its value is read into C8 only",
  ]);
});
ok("mg: a value hidden under a merge is reported", () => {
  // Excel shows only the top-left value; a file written by a program can still hold others.
  const t = readMergedTable(mgBook([["Region", "Rep"], ["North", "Ana"], ["South", "Bo"]], ["A2:A3"]));
  assert.deepStrictEqual(t.records.map((r) => r.values.Region), ["North", "North"]);
  assert.deepStrictEqual(text(t.problems), ['A2:A3: hides "South" in A3']);
  // Under a merge across columns, a hidden value is reported and not imported.
  const h = readMergedTable(mgBook([["Name", "Amount", "Note"], ["Ana", "long note", 5]], ["B2:C2"]));
  assert.deepStrictEqual(text(h.problems), ['B2:C2: hides 5 in C2', "B2:C2: covers 2 columns; its value is read into B2 only"]);
  assert.deepStrictEqual(h.records[0].values, { Name: "Ana", Amount: "long note", Note: "" });
  // A stray cell to the right of the table does not stop a title row from being skipped.
  const stray = readMergedTable(mgBook([["Name", "Rep", "", ""], ["Ana", "x", "", ""], ["Note", "", "", "?"]], ["A3:B3"]));
  assert.deepStrictEqual(text(stray.notes), ['A3:B3: row 3 skipped: "Note" spans the table']);
  assert.deepStrictEqual(text(stray.problems), []);
  // A group label over a sub-label and an empty cell: one header row, and a repeated name.
  const q = readMergedTable(mgBook([["Name", "Q1", ""], ["", "Revenue", ""], ["Ana", "x", "y"]], ["B1:C1"]));
  assert.deepStrictEqual([q.columns, text(q.problems)], [["Name", "Q1", "Q1 (2)"], ['C1: repeats the column name "Q1"; read as "Q1 (2)"']]);
  // A row that is empty in the file is not turned into a record by filling down.
  const gap = readMergedTable(mgBook([["Region", "Rep"], ["North", "Ana"], ["", ""], ["", "Bo"]], ["A2:A4"]));
  assert.deepStrictEqual(gap.records.map((r) => [r.row, r.values.Region, r.values.Rep]), [[2, "North", "Ana"], [4, "North", "Bo"]]);
  assert.deepStrictEqual(text(gap.notes), ['A2:A4: "North" copied into A4']);
  // A footnote merged over two rows across the table skips both rows.
  const foot = readMergedTable(mgBook([["Name", "Rep"], ["Ana", "x"], ["Note", ""], ["", ""]], ["A3:B4"]));
  assert.deepStrictEqual([foot.records.length, text(foot.notes), foot.problems], [1, ['A3:B4: rows 3-4 skipped: "Note" spans the table'], []]);
  // With a stray column, the header note covers the named columns only.
  const wide = readMergedTable(mgBook([["Name", "Q1", "", "", ""], ["", "Rev", "Cost", "", ""], ["Ana", 1, 2, "", "?"]], ["A1:A2", "B1:C1"]));
  assert.strictEqual(text(wide.notes)[0], "A1:C2: 2 header rows combined into one name per column");
  assert.deepStrictEqual(text(wide.problems), ["E1: has data but no column name"]);
  // An empty merged cell fills nothing and adds no note.
  const e = readMergedTable(mgBook([["Region", "Rep"], ["", "Ana"], ["", "Bo"]], ["A2:A3"]));
  assert.deepStrictEqual([e.notes, e.problems], [[], []]);
  assert.deepStrictEqual(e.records.map((r) => r.values.Region), ["", ""]);
});
ok("mg: a sheet that does not start at A1 keeps Excel addresses and row numbers", () => {
  const bytes = mgBook([["Region", "Rep"], ["North", "Ana"], ["", "Bo"], ["Total", ""]], ["B4:B5", "B6:C6"], "B3");
  const { origin, merges } = readSheet(bytes);
  assert.deepStrictEqual([origin, merges[0]], [{ r: 2, c: 1 }, { address: "B4:B5", top: 1, bottom: 2, left: 0, right: 0 }]);
  const t = readMergedTable(bytes);
  assert.deepStrictEqual(t.records, [{ row: 4, values: { Region: "North", Rep: "Ana" } }, { row: 5, values: { Region: "North", Rep: "Bo" } }]);
  assert.deepStrictEqual(text(t.notes), ['B4:B5: "North" copied into B5', 'B6:C6: row 6 skipped: "Total" spans the table']);
});
ok("mg: duplicate and empty column names", () => {
  const t = readMergedTable(mgBook([["Name", "name", "", "", "Email"], ["Ana", "x", "", "y", "a@b.co"]], []));
  assert.deepStrictEqual(text(t.problems), ["D1: has data but no column name", 'B1: repeats the column name "name"; read as "name (2)"']);
  assert.deepStrictEqual(Object.keys(t.records[0].values), ["Name", "name (2)", "Email"]);
  // A blank column without data is dropped quietly.
  assert.deepStrictEqual(readMergedTable(mgBook([["Name", "", "Email"], ["Ana", "", "a@b.co"]], [])).problems, []);
  // Object.prototype names are plain keys.
  const p = readMergedTable(mgBook([["__proto__", "constructor"], ["x", "y"]], []));
  assert.strictEqual(Object.getPrototypeOf(p.records[0].values), Object.prototype);
  assert.deepStrictEqual(Object.keys(p.records[0].values), ["__proto__", "constructor"]);
});
ok("mg: empty sheets and header-only sheets", () => {
  const empty = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(empty, XLSX.utils.aoa_to_sheet([]), "S");
  const t = readMergedTable(XLSX.write(empty, { type: "buffer", bookType: "xlsx" }));
  assert.deepStrictEqual(text(t.problems), ["null: the sheet has no header row"]);
  const h = readMergedTable(mgBook([["Name", "Email"]], []));
  assert.deepStrictEqual([h.columns, h.records, h.problems], [["Name", "Email"], [], []]);
  // Empty rows are not records.
  assert.deepStrictEqual(readMergedTable(mgBook([["Name"], [""], ["Ana"]], [])).records, [{ row: 3, values: { Name: "Ana" } }]);
  // headerTop: a title row above the header.
  const titled = readMergedTable(mgBook([["Sales export"], ["Region", "Rep"], ["North", "Ana"], ["", "Bo"]], ["A1:B1", "A3:A4"]), 1);
  assert.deepStrictEqual(titled.columns, ["Region", "Rep"]);
  assert.deepStrictEqual(titled.records.map((r) => [r.row, r.values.Region]), [[3, "North"], [4, "North"]]);
  // Limit stated in the post: a title merged down into the header becomes part of a name.
  const into = readMergedTable(mgBook([["Report", "x"], ["", "Rep"], ["North", "Ana"]], ["A1:A2"]), 1);
  assert.deepStrictEqual(into.columns, ["Report", "Rep"]);
});
ok("mg: SheetJS 0.20.3: a CSV has no merges; fillDown fills one column on request", () => {
  const csv = Buffer.from("Region,Rep\nNorth,Ana\n,Bo\nSouth,Cy\n,Di\n");
  assert.deepStrictEqual(readSheet(csv).merges, []);
  const t = readMergedTable(csv);
  assert.deepStrictEqual(t.records.map((r) => r.values.Region), ["North", "", "South", ""]);
  fillDown(t.records, "Region");
  assert.deepStrictEqual(t.records.map((r) => r.values.Region), ["North", "North", "South", "South"]);
  // An empty first cell stays empty; a missing column is filled with "".
  assert.deepStrictEqual(fillDown([{ values: { Region: "" } }, { values: { Region: "East" } }, { values: {} }], "Region").map((r) => r.values.Region), ["", "East", "East"]);
  // raw: true keeps CSV text as text: numbers arrive as strings.
  assert.strictEqual(readMergedTable(Buffer.from("Id\n0123\n")).records[0].values.Id, "0123");
  assert.strictEqual(readMergedTable(Buffer.from("Amount\n90\n")).records[0].values.Amount, "90");
  // fillDown does not know about skipped title rows: run it on the records of one section.
  const sections = [{ values: { Region: "North" } }, { values: { Region: "" } }];
  assert.deepStrictEqual(fillDown(sections, "Region").map((r) => r.values.Region), ["North", "North"]);
  // In a CSV, a footnote row arrives as a record, so remove it before fillDown.
  const foot = readMergedTable(Buffer.from("Region,Rep\nNorth,Ana\n,Bo\nNote: figures in EUR,\n"));
  assert.deepStrictEqual(foot.records.map((r) => r.values.Region), ["North", "", "Note: figures in EUR"]);
  assert.deepStrictEqual([foot.notes, foot.problems], [[], []]);
});
ok("mg: only text is filled down; numbers, dates and booleans merged down are reported", () => {
  // 100 merged over two invoice lines would be counted twice if it were copied.
  const n = readMergedTable(mgBook([["Invoice", "Line", "Total"], ["A-1", "Pens", 100], ["", "Ink", ""], ["", "Pads", ""]], ["A2:A4", "C2:C3"]));
  assert.deepStrictEqual(n.records.map((r) => r.values.Total), [100, "", ""]);
  assert.deepStrictEqual(n.records.map((r) => r.values.Invoice), ["A-1", "A-1", "A-1"]);
  assert.deepStrictEqual(text(n.notes), ['A2:A4: "A-1" copied into A3, A4']);
  assert.deepStrictEqual(text(n.problems), ["C2:C3: covers 2 rows; its value 100 is read into C2 only"]);
  // A date arrives as a serial number, so it is reported too; a boolean as well.
  const d = readMergedTable(mgBook([["Day", "Rep", "Ok"], [new Date(Date.UTC(2026, 0, 5)), "Ana", true], ["", "Bo", ""]], ["A2:A3", "C2:C3"]));
  assert.deepStrictEqual(d.records.map((r) => r.values.Day === ""), [false, true]);
  assert.deepStrictEqual(text(d.problems).map((p) => p.replace(/value [\d.]+/, "value N")),
    ["A2:A3: covers 2 rows; its value N is read into A2 only", "C2:C3: covers 2 rows; its value true is read into C2 only"]);
  // The text "100" is a label and is filled.
  const s = readMergedTable(mgBook([["Code", "Rep"], ["100", "Ana"], ["", "Bo"]], ["A2:A3"]));
  assert.deepStrictEqual(s.records.map((r) => r.values.Code), ["100", "100"]);
});
ok("mg: merges below the last row are ignored", () => {
  const t = readMergedTable(mgBook([["Name", "Rep"], ["Ana", "x"]], ["A5:B5", "A7:A8", "B9:B10"]));
  assert.deepStrictEqual([t.records.length, t.notes, t.problems], [1, [], []]);
});
ok("mg: SheetJS 0.20.3: text files are read as UTF-8, with or without a BOM", () => {
  const plain = Buffer.from("Name,City\nJosé,München\n", "utf8");
  // What SheetJS does on its own with a UTF-8 CSV that has no BOM:
  const guessed = XLSX.read(plain, { raw: true }).Sheets.Sheet1.B2.v;
  assert.strictEqual(guessed, "MÃ¼nchen");
  for (const bytes of [plain, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), plain]), new Uint8Array(plain).buffer]) {
    const t = readMergedTable(bytes);
    assert.deepStrictEqual(t.columns, ["Name", "City"]);
    assert.deepStrictEqual(t.records[0].values, { Name: "José", City: "München" });
  }
  // UTF-16 with a BOM (Excel's "Unicode Text" is tab-separated UTF-16LE), both byte orders.
  const tsv = "Name\tCity\nJosé\tMünchen\n";
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(tsv, "utf16le")]);
  const be = Buffer.from(le); be.swap16();
  for (const bytes of [le, be]) assert.deepStrictEqual(readMergedTable(bytes).records[0].values, { Name: "José", City: "München" });
  // A Windows-1252 file is not UTF-8: decode() throws instead of guessing.
  assert.throws(() => readMergedTable(Buffer.from([0x4e, 0x0a, 0x4a, 0x6f, 0x73, 0xe9, 0x0a])), TypeError);
  // .xls (binary) and .xlsx (zip) files are passed to SheetJS as bytes, also as an ArrayBuffer.
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["City"], ["München"]]), "S");
  for (const bookType of ["xls", "xlsx"]) {
    const bytes = XLSX.write(book, { type: "buffer", bookType });
    assert.strictEqual(readMergedTable(bytes).records[0].values.City, "München", bookType);
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
    assert.strictEqual(readMergedTable(ab).records[0].values.City, "München", bookType);
  }
});
ok("mg: a label merged down over a text-only row makes that row part of the header (a limit in the post)", () => {
  const t = readMergedTable(mgBook([["Name", "City"], ["", "Berlin"], ["Ana", "Paris"]], ["A1:A2"]));
  assert.deepStrictEqual(t.columns, ["Name", "City Berlin"]);
  assert.strictEqual(text(t.notes)[0], "A1:B2: 2 header rows combined into one name per column");
  assert.deepStrictEqual(text(t.problems), ['B2: "Berlin" is under a header cell that is not merged; row 2 may be data']);
  // A merged header over text-only data (a contact list): reported, not only noted.
  const c = readMergedTable(mgBook([["Name", "Contact", ""], ["Al", "a@x.co", "555"], ["Bo", "b@x.co", "556"]], ["B1:C1"]));
  assert.deepStrictEqual(c.columns, ["Name Al", "Contact a@x.co", "Contact 555"]);
  assert.deepStrictEqual(text(c.problems), ['A2: "Al" is under a header cell that is not merged; row 2 may be data']);
  const a = readMergedTable(mgBook([["Name", "Address", ""], ["Ana", "Main St", "Paris"]], ["B1:C1"]));
  assert.deepStrictEqual(text(a.problems), ['A2: "Ana" is under a header cell that is not merged; row 2 may be data']);
  // Every header cell merged, text-only data: the first data row looks like the header row.
  const all = readMergedTable(mgBook([["Customer", "", "Location", ""], ["Ana", "Smith", "Berlin", "DE"], ["Bo", "Li", "Paris", "FR"]], ["A1:B1", "C1:D1"]));
  assert.deepStrictEqual(text(all.problems), ["A2:D2: row 2 was read as a header row, but the first data row has text in the same columns; check whether row 2 is data"]);
  const id = readMergedTable(mgBook([["ID", "Customer", ""], ["", "First", "Last"], ["A-1", "Ana", "Smith"]], ["A1:A2", "B1:C1"]));
  assert.strictEqual(id.problems.length, 1);
  // Real two- and three-row headers raise no such problem.
  assert.deepStrictEqual(readMergedTable(salesBytes).problems, []);
  const three = readMergedTable(mgBook([["Rep", "2026", "", "", ""], ["", "Q1", "", "Q2", ""], ["", "Rev", "Cost", "Rev", "Cost"], ["Ana", 1, 2, 3, 4]],
    ["B1:E1", "B2:C2", "D2:E2"]));
  assert.deepStrictEqual(three.problems, []);
});
ok("mg: a number merged across the table is skipped and reported; text is only noted", () => {
  const t = readMergedTable(mgBook([["Name", "Amount"], ["Ana", 5], [500, ""], ["Total: 500", ""]], ["A3:B3", "A4:B4"]));
  assert.deepStrictEqual(t.records.length, 1);
  assert.deepStrictEqual(text(t.problems), ["A3:B3: row 3 skipped: 500 spans the table"]);
  assert.deepStrictEqual(text(t.notes), ['A4:B4: row 4 skipped: "Total: 500" spans the table']);
});
ok("mg: a header that is not in the first row gives unnamed columns (headerTop)", () => {
  const t = readMergedTable(mgBook([["", ""], ["Name", "City"], ["Ana", "Paris"]], []));
  assert.deepStrictEqual([t.columns, t.records], [[], []]);
  assert.deepStrictEqual(text(t.problems), ["A1: row 1 has no column names; if the header is lower, pass its index as headerTop"]);
  // The same for a sheet whose stored range starts above the data, and for an empty CSV.
  const low = mgBook([["Name", "City"], ["Ana", "Paris"]], [], "C3");
  const shifted = XLSX.read(low); const sh = shifted.Sheets.S; sh["!ref"] = "A1:" + sh["!ref"].split(":")[1];
  const lowBytes = XLSX.write(shifted, { type: "buffer", bookType: "xlsx" });
  assert.deepStrictEqual(text(readMergedTable(lowBytes).problems), ["A1: row 1 has no column names; if the header is lower, pass its index as headerTop"]);
  assert.deepStrictEqual(readMergedTable(lowBytes, 2).columns, ["", "", "Name", "City"]);
  assert.deepStrictEqual(readMergedTable(lowBytes, 2).records[0].values, { Name: "Ana", City: "Paris" });
  assert.strictEqual(readMergedTable(Buffer.alloc(0)).problems.length, 1);
  assert.deepStrictEqual(readMergedTable(mgBook([["", ""], ["Name", "City"], ["Ana", "Paris"]], []), 1).columns, ["Name", "City"]);
});
ok("mg: a header label merged down into a blank row is not reported", () => {
  // Region over A1:A3, Q1 over C1:D1, row 3 empty, data from row 4.
  const t = readMergedTable(mgBook([["Region", "Rep", "Q1", ""], ["", "", "Revenue", "Cost"], ["", "", "", ""], ["North", "Ana", 1, 2]],
    ["A1:A3", "B1:B2", "C1:D1"]));
  assert.deepStrictEqual(t.columns, ["Region", "Rep", "Q1 Revenue", "Q1 Cost"]);
  assert.deepStrictEqual(t.problems, []);
  assert.deepStrictEqual(t.records, [{ row: 4, values: { Region: "North", Rep: "Ana", "Q1 Revenue": 1, "Q1 Cost": 2 } }]);
  // The same merge reaching a row with data is still reported.
  const d = readMergedTable(mgBook([["Region", "Rep", "Q1", ""], ["", "", "Revenue", "Cost"], ["", "Bo", 3, 4]],
    ["A1:A3", "B1:B2", "C1:D1"]));
  assert.deepStrictEqual(text(d.problems), ["A1:A3: runs from the header into the data"]);
});
ok("mg: SheetJS 0.20.3: raw: true gives stored numbers, not formatted text", () => {
  const sheet = XLSX.utils.aoa_to_sheet([["Share", "Price"], [0.12, 1234.5]]);
  sheet.A2.z = "0%";
  sheet.B2.z = "#,##0.00";
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "S");
  const bytes = XLSX.write(book, { type: "buffer", bookType: "xlsx" });
  // Without raw, SheetJS returns what Excel displays.
  const shownRows = XLSX.utils.sheet_to_json(XLSX.read(bytes).Sheets.S, { header: 1, raw: false });
  assert.deepStrictEqual(shownRows[1], ["12%", "1,234.50"]);
  const t = readMergedTable(bytes);
  assert.deepStrictEqual(t.records[0].values, { Share: 0.12, Price: 1234.5 });
});
ok("mg: text merged down in a value column is filled like a label", () => {
  const t = readMergedTable(mgBook([["Rep", "Amount"], ["Ana", "TBD"], ["Bo", ""]], ["B2:B3"]));
  assert.deepStrictEqual(t.records.map((r) => r.values.Amount), ["TBD", "TBD"]);
  assert.deepStrictEqual(text(t.notes), ['B2:B3: "TBD" copied into B3']);
});
ok("mg: unreadable files throw, and the example turns that into a problem", () => {
  const latin1 = Buffer.from([0x43, 0x69, 0x74, 0x79, 0x0a, 0x4d, 0xfc, 0x6e, 0x63, 0x68, 0x65, 0x6e, 0x0a]); // "City\nMünchen" in Windows-1252
  assert.throws(() => readMergedTable(latin1), TypeError);
  const example = "let table;\ntry {\n  table = readMergedTable(await file.arrayBuffer());\n} catch (error) {\n  // A text file that is not UTF-8 or UTF-16 throws a TypeError in readSheet,\n  // and SheetJS throws for a damaged .xlsx. Either way, ask for another export.\n  const reason = \"the file could not be read; save it as .xlsx or CSV UTF-8\";\n  table = { columns: [], records: [], notes: [], problems: [{ range: null, reason }] };\n}\nconst { columns, records, notes, problems } = table;\n\ncolumns;\n// [ 'Region', 'Rep', 'Q1 Revenue', 'Q1 Cost', 'Q2 Revenue', 'Q2 Cost' ]\nrecords[1];\n// { row: 4,\n//   values: { Region: 'North', Rep: 'Bo', 'Q1 Revenue': 90, 'Q1 Cost': 30,\n//             'Q2 Revenue': 95, 'Q2 Cost': 35 } }\nnotes.map((n) => `${n.range}: ${n.reason}`);\n// [ 'A1:F2: 2 header rows combined into one name per column',\n//   'A3:A4: \"North\" copied into A4',\n//   'A6:F6: row 6 skipped: \"Note: figures in EUR\" spans the table' ]\nproblems; // []\n";
  assert(example.includes("try {") && example.includes("catch (error)"));
  assert.throws(() => readMergedTable(Buffer.from("PK\x03\x04garbagegarbage")));
  // The example's catch turns both into one problem.
  const body = example.slice(0, example.indexOf("\n\ncolumns;"));
  const run = (bytes) => new Function("readMergedTable", "file", "return (async () => {" + body + "\nreturn problems; })();")(readMergedTable, { arrayBuffer: async () => bytes });
  return Promise.all([run(latin1), run(Buffer.from("PK\x03\x04garbagegarbage"))]).then((all) => {
    for (const p of all) assert.deepStrictEqual(text(p), ["null: the file could not be read; save it as .xlsx or CSV UTF-8"]);
  });
});
ok("mg: the post's text-only header examples are read as headers and reported", () => {
  const contact = readMergedTable(mgBook([["Name", "Contact", ""], ["Ana", "ana@example.com", "555-0100"], ["Bo", "bo@example.com", "555-0101"]], ["B1:C1"]));
  assert.deepStrictEqual(contact.columns, ["Name Ana", "Contact ana@example.com", "Contact 555-0100"]);
  assert(contact.problems.length > 0);
  const city = readMergedTable(mgBook([["Name", "City"], ["", "Berlin"], ["Ana", "Paris"]], ["A1:A2"]));
  assert.deepStrictEqual(city.columns, ["Name", "City Berlin"]);
  assert.deepStrictEqual(text(city.problems), ['B2: "Berlin" is under a header cell that is not merged; row 2 may be data']);
});
ok("mg: review fixes: empty layout merges, merges right of the table, hidden-only rows, UTF-16 without BOM", () => {
  // An empty merge across columns (layout) is not a problem.
  const empty = readMergedTable(mgBook([["Name", "Note", "Amount"], ["Ana", "", ""], ["Bo", "x", 2]], ["B2:C2"]));
  assert.deepStrictEqual(empty.problems, []);
  // Merges right of the last named column are ignored, filled or not.
  const right = readMergedTable(mgBook([["Name", "Amount", "", "", ""], ["Ana", 1, "", "Logo", ""], ["Bo", 2, "", "", ""], ["Cy", 3, "", "Box", ""]], ["D2:E2", "D4:D5"]));
  assert.deepStrictEqual(right.columns.slice(0, 2), ["Name", "Amount"]);
  assert.deepStrictEqual(right.notes, []);
  assert.deepStrictEqual(right.problems.filter((p) => /^D\d+:/.test(p.range)), []);
  // A row whose only content is a value hidden under a merge is not a record.
  const sheet = XLSX.utils.aoa_to_sheet([["Region", "Rep"], ["North", "Ana"], ["South", ""]]);
  sheet["!merges"] = [XLSX.utils.decode_range("A2:A3")];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "S");
  const hidden = readMergedTable(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
  assert.deepStrictEqual(hidden.records, [{ row: 2, values: { Region: "North", Rep: "Ana" } }]);
  assert.deepStrictEqual(text(hidden.problems), ['A2:A3: hides "South" in A3']);
  // UTF-16 without a BOM is refused, with a TypeError.
  const utf16 = Buffer.from("Name,City\nAna,Paris\n", "utf16le");
  assert.throws(() => readMergedTable(utf16), /zero bytes/);
});
ok("mg: the sheet grid in the post matches the fixture", () => {
  const post = fs.readFileSync(path.join(__dirname, "..", "content", "posts", "merged-cells-excel-sheetjs.html"), "utf8");
  const grid = /<table class="grid"[^>]*>([\s\S]*?)<\/table>/.exec(post)[1];
  const { rows, merges } = readSheet(salesBytes);
  // Each <td> gives its address in data-cell and its merge in data-merge.
  const cells = [...grid.matchAll(/<td data-cell="([A-Z]+\d+)"(?: data-merge="([A-Z0-9:]+)")?[^>]*>([^<]*)<\/td>/g)];
  assert(cells.length >= 20);
  for (const [, cell, merge, content] of cells) {
    const { r, c } = XLSX.utils.decode_cell(cell);
    assert.strictEqual(content, String(rows[r][c]), cell);
    if (merge) assert(merges.some((m) => m.address === merge && m.top === r && m.left === c), merge);
  }
  assert.deepStrictEqual(cells.filter((x) => x[2]).map((x) => x[2]).sort(), merges.map((m) => m.address).sort());
  // Every non-empty cell in the fixture is in the grid.
  let filled = 0;
  rows.forEach((row) => row.forEach((v) => { if (v !== "") filled++; }));
  assert.strictEqual(cells.filter((x) => x[3] !== "").length, filled);
});
ok("mg: snippets have no invisible characters", () => {
  for (const s of ["// Sales.xlsx, six merges: \"Region\" over A1:A2, \"Rep\" over B1:B2, \"Q1\" over C1:D1,\n// \"Q2\" over E1:F1, \"North\" over A3:A4, \"Note: figures in EUR\" over A6:F6.\nconst sheet = workbook.Sheets[workbook.SheetNames[0]];\nconst records = XLSX.utils.sheet_to_json(sheet, { defval: \"\" });\nObject.keys(records[0]); // [ 'Region', 'Rep', 'Q1', '__EMPTY', 'Q2', '__EMPTY_1' ]\nrecords[0].Q1;           // 'Revenue'  (the second header row, read as data)\nrecords[2].Region;       // ''         (Bo's row: \"North\" is only in A3)\nsheet[\"!merges\"].length; // 6\n", "// npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz\nimport * as XLSX from \"xlsx\";\n\n// rows: arrays of cells from the first sheet. merges: the sheet's merged ranges.\n// Both count from 0 at the top-left cell of the sheet's stored range (origin).\nfunction readSheet(bytes) {\n  const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;\n  const starts = (a, b) => data[0] === a && data[1] === b;\n  // .xlsx files are zip archives (they start with \"PK\"); .xls files start with D0 CF.\n  // Anything else is text. Decode it yourself: without a byte order mark (BOM),\n  // SheetJS does not assume UTF-8, and \"M\u00fcnchen\" would arrive as \"M\u00c3\u00bcnchen\".\n  // FF FE and FE FF are UTF-16 BOMs, as in Excel's \"Unicode Text\" export.\n  const binary = starts(0x50, 0x4b) || starts(0xd0, 0xcf);\n  const encoding = starts(0xff, 0xfe) ? \"utf-16le\" : starts(0xfe, 0xff) ? \"utf-16be\" : \"utf-8\";\n  let workbook;\n  if (binary) workbook = XLSX.read(data, { raw: true });\n  else {\n    // fatal: true throws a TypeError on bytes that are not valid in this encoding.\n    const text = new TextDecoder(encoding, { fatal: true }).decode(data);\n    // UTF-16 without a BOM is valid UTF-8 full of zero bytes: refuse it too.\n    if (text.includes(\"\\0\")) throw new TypeError(\"zero bytes: UTF-16 without a BOM, or not a text file\");\n    workbook = XLSX.read(text, { type: \"string\", raw: true });\n  }\n  const sheet = workbook.Sheets[workbook.SheetNames[0]];\n  if (!sheet || !sheet[\"!ref\"]) return { rows: [], merges: [], origin: { r: 0, c: 0 } };\n  const origin = XLSX.utils.decode_range(sheet[\"!ref\"]).s;\n  const rows = XLSX.utils.sheet_to_json(sheet, {\n    header: 1, defval: \"\", blankrows: true, raw: true });\n  const merges = (sheet[\"!merges\"] ?? []).map((m) => ({\n    address: XLSX.utils.encode_range(m), // \"C1:D1\", for messages\n    top: m.s.r - origin.r, bottom: m.e.r - origin.r,\n    left: m.s.c - origin.c, right: m.e.c - origin.c,\n  }));\n  return { rows, merges, origin };\n}\n", "const isEmpty = (value) => String(value ?? \"\").trim() === \"\";\nconst isLabel = (value) => typeof value === \"string\" && value.trim() !== \"\";\nconst covers = (m, r, c) => r >= m.top && r <= m.bottom && c >= m.left && c <= m.right;\n// What the user sees in a cell: a cell under a merge shows the merge's value.\nconst shown = (rows, merges, r, c) => {\n  const m = merges.find((range) => covers(range, r, c));\n  return m ? rows[m.top]?.[m.left] : rows[r]?.[c];\n};\n\n// A row can be part of the header only if it has labels and no numbers, dates or booleans.\nconst labelRow = (row = []) => row.some(isLabel) && row.every((v) => isEmpty(v) || isLabel(v));\n\n// How many rows the header has, starting at row `top`. A label merged down (\"Region\"\n// over two rows) covers the rows below it. A label merged across (\"Q1\" over two\n// columns) names a group, so the row below belongs to the header if it has a label\n// under every column of the group. maxDepth keeps a stray merge from eating the data.\nfunction headerDepth(rows, merges, top, maxDepth = 3) {\n  let bottom = top;\n  for (let changed = true; changed; ) {\n    changed = false;\n    for (const m of merges) {\n      if (m.top < top || m.top > bottom) continue;\n      // last: the lowest row this merge pulls into the header.\n      let last = m.bottom;\n      const below = [];\n      for (let c = m.left; c <= m.right; c++) below.push(shown(rows, merges, m.bottom + 1, c));\n      if (m.right > m.left && below.every(isLabel)) last = m.bottom + 1;\n      if (last <= bottom || last >= top + maxDepth) continue;\n      if (!rows.slice(bottom + 1, last + 1).every((row) => labelRow(row))) continue;\n      bottom = last;\n      changed = true;\n    }\n  }\n  return bottom - top + 1;\n}\n\n// One name per column: \"Q1\" above \"Revenue\" becomes \"Q1 Revenue\".\n// A merged cell gives its value to every column it covers, once per column.\nfunction headerNames(rows, merges, top, depth) {\n  const width = Math.max(0, ...rows.slice(top, top + depth).map((row) => row.length));\n  const names = [];\n  for (let c = 0; c < width; c++) {\n    const parts = [];\n    let previous = null;\n    for (let r = top; r < top + depth; r++) {\n      const m = merges.find((range) => covers(range, r, c)) ?? null;\n      if (m && m === previous) continue; // a label merged down counts once\n      previous = m;\n      const value = m ? rows[m.top]?.[m.left] : rows[r]?.[c];\n      if (!isEmpty(value)) parts.push(String(value).trim());\n    }\n    names.push(parts.join(\" \"));\n  }\n  return names;\n}\n", "// Copies each merged value down its column; reports the merges it will not fill.\n// Changes rows in place. firstData: index of the first row under the header.\n// width: number of named columns in the table.\nfunction fillMerges(rows, merges, firstData, width, origin) {\n  const notes = [];\n  const problems = [];\n  const titleRows = new Set();\n  const address = (r1, c1, r2, c2) => XLSX.utils.encode_range({\n    s: { r: origin.r + r1, c: origin.c + c1 }, e: { r: origin.r + r2, c: origin.c + c2 } });\n  for (const m of merges) {\n    if (m.bottom < firstData) continue; // inside the header: headerNames used it\n    if (m.top >= rows.length) continue;  // below the last row: nothing to read\n    if (m.left >= width) continue;       // right of the last named column: not in the table\n    if (m.top < firstData) {\n      // A header label merged down into blank rows only (\"Region\" over A1:A3, row 3\n      // empty) is harmless: blank rows are skipped. Anything else is reported.\n      const into = rows.slice(firstData, m.bottom + 1);\n      if (!into.every((row) => row.every(isEmpty))) {\n        problems.push({ range: m.address, reason: \"runs from the header into the data\" });\n      }\n      continue;\n    }\n    const value = rows[m.top]?.[m.left] ?? \"\";\n    const last = Math.min(m.bottom, rows.length - 1);\n    // A merged range shows only its first cell's value. A value stored under it is\n    // hidden from the user, so it is reported and not imported.\n    for (let r = m.top; r <= last; r++) {\n      for (let c = m.left; c <= m.right; c++) {\n        if ((r === m.top && c === m.left) || isEmpty(rows[r][c])) continue;\n        problems.push({ range: m.address, reason: `hides ${JSON.stringify(rows[r][c])} in ${address(r, c, r, c)}` });\n        rows[r][c] = \"\";\n      }\n    }\n    const height = m.bottom - m.top + 1;\n    const span = m.right - m.left + 1;\n    const first = address(m.top, m.left, m.top, m.left);\n    if (span === 1 && isLabel(value)) {\n      // One column, several rows, with text: a group label such as a region. Fill it down,\n      // except into rows that are empty in the file: those are skipped later.\n      const filled = [];\n      for (let r = m.top + 1; r <= last; r++) {\n        if (rows[r].every(isEmpty)) continue;\n        rows[r][m.left] = value;\n        filled.push(address(r, m.left, r, m.left));\n      }\n      if (filled.length > 0) {\n        notes.push({ range: m.address, reason: `${JSON.stringify(value)} copied into ${filled.join(\", \")}` });\n      }\n    } else if (span === 1) {\n      // A number, date or boolean merged down: copying 100 into two invoice lines\n      // would double it. Empty merges need nothing.\n      if (!isEmpty(value) && last > m.top) {\n        problems.push({ range: m.address, reason: `covers ${height} rows; its value ${JSON.stringify(value)} is read into ${first} only` });\n      }\n    } else if (m.left <= 0 && m.right >= width - 1) {\n      // One cell across the whole table: a title or a note, not a record.\n      for (let r = m.top; r <= last; r++) titleRows.add(r);\n      const row = origin.r + m.top + 1;\n      const where = last > m.top ? `rows ${row}-${origin.r + last + 1}` : `row ${row}`;\n      // Text is a title or a footnote. A number across the table (a total?) is reported.\n      const list = isLabel(value) || isEmpty(value) ? notes : problems;\n      list.push({ range: m.address, reason: `${where} skipped: ${JSON.stringify(value)} spans the table` });\n    } else if (!isEmpty(value)) {\n      // Across columns: the value belongs to one of them, and only the user knows which.\n      // An empty merge (kept for layout) needs nothing.\n      const size = height > 1 ? `${height} rows and ${span} columns` : `${span} columns`;\n      problems.push({ range: m.address, reason: `covers ${size}; its value is read into ${first} only` });\n    }\n  }\n  return { notes, problems, titleRows };\n}\n", "// Was a lower header row really the first record? Two signs, both reported:\n// a value under a header cell that is not merged (\"Ana\" under \"Name\"), or a first\n// data row with text in the same columns as the lower header row.\nfunction checkLowerHeaderRows(rows, merges, headerTop, firstData, width, origin) {\n  const problems = [];\n  const next = rows.slice(firstData).find((row) => !row.every(isEmpty)) ?? [];\n  for (let r = headerTop + 1; r < firstData; r++) {\n    const row = origin.r + r + 1;\n    const used = rows[r].flatMap((value, c) => (isEmpty(value) ? [] : [c]));\n    // Is column c under a header merge that starts above row r? (\"Q1\" over C1:D1)\n    const underMerge = (c) =>\n      merges.some((m) => m.top >= headerTop && m.top < r && c >= m.left && c <= m.right);\n    const loose = used.filter((c) => !underMerge(c));\n    for (const c of loose) {\n      const cell = XLSX.utils.encode_cell({ r: origin.r + r, c: origin.c + c });\n      problems.push({ range: cell, reason: `${JSON.stringify(rows[r][c])} is under a header cell that is not merged; row ${row} may be data` });\n    }\n    if (loose.length === 0 && used.length > 0 && used.every((c) => isLabel(next[c]))) {\n      const range = XLSX.utils.encode_range({\n        s: { r: origin.r + r, c: origin.c }, e: { r: origin.r + r, c: origin.c + width - 1 } });\n      problems.push({ range, reason: `row ${row} was read as a header row, but the first data row has text in the same columns; check whether row ${row} is data` });\n    }\n  }\n  return problems;\n}\n\n// A repeated name gets a number (\"Amount (2)\"), so its values are not overwritten.\n// \"Email\" and \"EMAIL\" count as the same name. Changes columns in place.\nfunction renameRepeats(columns, cellOf) {\n  const problems = [];\n  const taken = new Set(columns.map((name) => name.toLowerCase()));\n  const seen = new Set();\n  columns.forEach((name, c) => {\n    if (name === \"\") return;\n    if (seen.has(name.toLowerCase())) {\n      let n = 2;\n      while (taken.has(`${name} (${n})`.toLowerCase())) n++;\n      columns[c] = `${name} (${n})`;\n      taken.add(columns[c].toLowerCase());\n      problems.push({ range: cellOf(c), reason: `repeats the column name ${JSON.stringify(name)}; read as ${JSON.stringify(columns[c])}` });\n    }\n    seen.add(columns[c].toLowerCase());\n  });\n  return problems;\n}\n\n// headerTop: index into rows, counted from the first row of the stored range\n// (0, or what your header detection found). Its Excel row is origin.r + headerTop + 1.\nfunction readMergedTable(bytes, headerTop = 0) {\n  const { rows, merges, origin } = readSheet(bytes);\n  const cellOf = (c) => XLSX.utils.encode_cell({ r: origin.r + headerTop, c: origin.c + c });\n  if (rows.length <= headerTop) {\n    const problems = [{ range: null, reason: \"the sheet has no header row\" }];\n    return { columns: [], records: [], notes: [], problems };\n  }\n  // 1. Name the columns.\n  const depth = headerDepth(rows, merges, headerTop);\n  const columns = headerNames(rows, merges, headerTop, depth);\n  const firstData = headerTop + depth;\n  // The table ends at the last named column; a stray cell further right does not widen it.\n  const width = columns.findLastIndex((name) => name !== \"\") + 1;\n  if (width === 0) {\n    const reason = `row ${origin.r + headerTop + 1} has no column names; if the header is lower, pass its index as headerTop`;\n    return { columns: [], records: [], notes: [], problems: [{ range: cellOf(0), reason }] };\n  }\n  // 2. Fill or flag the merges in the data.\n  const { notes, problems, titleRows } = fillMerges(rows, merges, firstData, width, origin);\n  // 3. Check the header.\n  if (depth > 1) {\n    const range = XLSX.utils.encode_range({\n      s: { r: origin.r + headerTop, c: origin.c }, e: { r: origin.r + firstData - 1, c: origin.c + width - 1 } });\n    notes.unshift({ range, reason: `${depth} header rows combined into one name per column` });\n    problems.push(...checkLowerHeaderRows(rows, merges, headerTop, firstData, width, origin));\n  }\n  // Data rows: below the header, not a title, not empty (checked after fillMerges,\n  // which clears hidden values).\n  const isData = (r) => r >= firstData && !titleRows.has(r) && !rows[r].every(isEmpty);\n  columns.forEach((name, c) => {\n    if (name === \"\" && rows.some((row, r) => isData(r) && !isEmpty(row[c]))) {\n      problems.push({ range: cellOf(c), reason: \"has data but no column name\" });\n    }\n  });\n  problems.push(...renameRepeats(columns, cellOf));\n\n  // 4. Build one record per data row.\n  const records = [];\n  rows.forEach((row, r) => {\n    if (!isData(r)) return;\n    // fromEntries defines own properties, so a column named \"__proto__\" is safe.\n    const values = Object.fromEntries(\n      columns.flatMap((name, c) => (name ? [[name, row[c] ?? \"\"]] : [])));\n    records.push({ row: origin.r + r + 1, values }); // the row number the user sees in Excel\n  });\n  return { columns, records, notes, problems };\n}\n", "let table;\ntry {\n  table = readMergedTable(await file.arrayBuffer());\n} catch (error) {\n  // A text file that is not UTF-8 or UTF-16 throws a TypeError in readSheet,\n  // and SheetJS throws for a damaged .xlsx. Either way, ask for another export.\n  const reason = \"the file could not be read; save it as .xlsx or CSV UTF-8\";\n  table = { columns: [], records: [], notes: [], problems: [{ range: null, reason }] };\n}\nconst { columns, records, notes, problems } = table;\n\ncolumns;\n// [ 'Region', 'Rep', 'Q1 Revenue', 'Q1 Cost', 'Q2 Revenue', 'Q2 Cost' ]\nrecords[1];\n// { row: 4,\n//   values: { Region: 'North', Rep: 'Bo', 'Q1 Revenue': 90, 'Q1 Cost': 30,\n//             'Q2 Revenue': 95, 'Q2 Cost': 35 } }\nnotes.map((n) => `${n.range}: ${n.reason}`);\n// [ 'A1:F2: 2 header rows combined into one name per column',\n//   'A3:A4: \"North\" copied into A4',\n//   'A6:F6: row 6 skipped: \"Note: figures in EUR\" spans the table' ]\nproblems; // []\n", "// A CSV keeps no merges: \"North\" merged over three rows arrives as \"North\", \"\", \"\".\n// Fill a column only after the user says it is grouped this way, and after\n// title and footnote rows are removed: in a CSV they arrive as records.\nfunction fillDown(records, column) {\n  let last = \"\";\n  for (const record of records) {\n    if (isEmpty(record.values[column])) record.values[column] = last;\n    else last = record.values[column];\n  }\n  return records;\n}\n"]) assert(!/[\u00A0\u00AD\u200B-\u200F\u2028\u2029\u202F\u2060\u3000\uFEFF]/.test(s));
});
}

// --- blog/detect-lookalike-cyrillic-greek-letters-javascript ---
{
// Scripts to tell apart. A letter in a script that is not listed counts as "Other".
const SCRIPTS = ["Latin", "Greek", "Cyrillic", "Armenian", "Georgian", "Cherokee", "Hebrew",
  "Arabic", "Devanagari", "Thai", "Han", "Hiragana", "Katakana", "Hangul", "Bopomofo"];
const SCRIPT_TESTS = SCRIPTS.map((name) =>
  [name, new RegExp(`\\p{Script_Extensions=${name}}`, "u")]);

// Writing systems that mix scripts on purpose (UTS #39 calls them Hanb, Jpan and Kore).
const WRITING_SYSTEMS = {
  Han: ["Han with Bopomofo", "Japanese", "Korean"],
  Hiragana: ["Japanese"],
  Katakana: ["Japanese"],
  Hangul: ["Korean"],
  Bopomofo: ["Han with Bopomofo"],
};

// Most digits, punctuation, spaces, emoji and combining marks belong to every script.
const ANY_SCRIPT = /[\p{Script_Extensions=Common}\p{Script_Extensions=Inherited}]/u;

// The scripts one character can belong to, or null for "any script".
// Cached, because a regular expression per script is slow on large files.
const scriptCache = new Map();
function scriptsOf(char) {
  if (!scriptCache.has(char)) scriptCache.set(char, findScripts(char));
  return scriptCache.get(char);
}
function findScripts(char) {
  if (ANY_SCRIPT.test(char)) return null;
  const found = SCRIPT_TESTS.filter(([, test]) => test.test(char)).map(([name]) => name);
  if (found.length === 0) return ["Other"];
  return [...found, ...new Set(found.flatMap((name) => WRITING_SYSTEMS[name] ?? []))];
}

// The scripts that every character in text can belong to.
// null: no letters at all. []: the text mixes scripts.
function resolvedScripts(text) {
  let common = null;
  for (const char of text) {
    const scripts = scriptsOf(char);
    if (scripts === null) continue;
    common = common === null ? scripts : common.filter((name) => scripts.includes(name));
  }
  return common;
}

const codeOf = (char) =>
  "U+" + char.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
const SYSTEM_NAMES = new Set(Object.values(WRITING_SYSTEMS).flat());
// "U+0430 Cyrillic", for messages: scripts only, not the writing systems.
function label(char) {
  if (/\p{M}/u.test(char)) return `${codeOf(char)} combining mark`;
  const scripts = scriptsOf(char)?.filter((name) => !SYSTEM_NAMES.has(name)) ?? ["Common"];
  return `${codeOf(char)} ${scripts.join("/")}`;
}
// Puts square brackets around the characters isOdd picks out.
function describe(chars, isOdd) {
  const marked = chars.map((char) => (isOdd(char) ? `[${char}]` : char)).join("");
  return { marked, odd: [...new Set(chars.filter(isOdd).map(label))] };
}

// UTS #39 "Highly Restrictive" also allows Latin with Japanese, Korean or Chinese.
const WITH_LATIN = ["Japanese", "Korean", "Han with Bopomofo"];
function isMixed(text) {
  const scripts = resolvedScripts(text);
  if (scripts === null || scripts.length > 0) return false;
  const rest = [...text].filter((char) => !scriptsOf(char)?.includes("Latin")).join("");
  return !resolvedScripts(rest)?.some((name) => WITH_LATIN.includes(name));
}

// Names and other text: null, or the characters that are not in the main script.
// preferred: the script your users write. It is the main one whenever the text uses it.
function checkText(text, preferred = "Latin") {
  const chars = [...String(text ?? "")];
  if (!isMixed(chars.join(""))) return null;
  const counts = new Map();
  for (const char of chars) {
    for (const name of scriptsOf(char) ?? []) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const top = Math.max(...counts.values());
  const main = counts.has(preferred) ? preferred : [...counts].find(([, n]) => n === top)[0];
  // Next to Latin, the Japanese, Korean or Chinese part most characters share is allowed.
  const partner = main === "Latin"
    ? WITH_LATIN.filter((name) => counts.has(name)).sort((a, b) => counts.get(b) - counts.get(a))[0]
    : undefined;
  const isOdd = (char) => {
    const scripts = scriptsOf(char);
    return scripts !== null && !scripts.includes(main) && !scripts.includes(partner);
  };
  return { main, ...describe(chars, isOdd) };
}

// IDs such as emails, SKUs and customer numbers: null, or the characters that are not ASCII.
function checkId(value) {
  const chars = [...String(value ?? "")];
  const isOdd = (char) => char.codePointAt(0) > 0x7f;
  return chars.some(isOdd) ? describe(chars, isOdd) : null;
}

const COLUMN_KINDS = { email: "id", sku: "id", name: "text", company: "text" };

// records: objects from your parser, after cleaning invisible characters. Each has
// rowNumber, the row in the file, so messages still point to the right row
// when the parser skips blank rows or the header is not on row 1.
function checkRecords(records, preferred = "Latin") {
  const warnings = [];
  for (const record of records) {
    for (const [column, kind] of Object.entries(COLUMN_KINDS)) {
      const found = kind === "id" ? checkId(record[column]) : checkText(record[column], preferred);
      if (!found) continue;
      const problem = kind === "id" ? "is not plain ASCII:" : `mixes ${found.main} with`;
      const where = `Row ${record.rowNumber}, ${column}`;
      warnings.push(`${where}: "${found.marked}" ${problem} ${found.odd.join(", ")}.`);
    }
  }
  return warnings;
}

const evalLine = (line) => new Function("typed", "imported", "return " + line.split(";")[0])("paypal", "p\u0430yp\u0430l");
ok("lk: the problem lines give what the comments say", () => {
  const lines = "const typed = \"paypal\";\nconst imported = \"p\\u0430yp\\u0430l\"; // both a's are CYRILLIC SMALL LETTER A (U+0430)\n\nimported === typed;                   // false\nimported.toLowerCase() === typed;     // false\nimported.normalize(\"NFKC\") === typed; // false: NFKC does not touch it\n/^[\\x20-\\x7E]+$/.test(imported);      // false: an ASCII-only rule does catch it\n".split("\n").filter((l) => /^(imported|\/)/.test(l));
  assert.strictEqual(lines.length, 4);
  for (const line of lines) assert.strictEqual(evalLine(line), / \/\/ true/.test(line), line);
});
ok("lk: the table in the post matches the functions", () => {
  for (const [input, [shown, , resolved, text, id]] of [["Circle", ["Circle", "Latin", "Latin", "ok", "ok"]], ["\u0421ir\u0441l\u0435", ["\u0421ir\u0441l\u0435", "Latin with three Cyrillic letters", "none: mixed", "[\u0421]ir[\u0441]l[\u0435]", "flagged"]], ["p\u0430yp\u0430l", ["p\u0430yp\u0430l", "Latin with two Cyrillic \u0430", "none: mixed", "p[\u0430]yp[\u0430]l", "flagged"]], ["\u0391\u0392C-123", ["\u0391\u0392C-123", "two Greek capitals, then Latin", "none: mixed", "[\u0391][\u0392]C-123", "flagged"]], ["\u0408. Smith", ["\u0408. Smith", "Cyrillic initial, Latin name", "none: mixed", "[\u0408]. Smith", "flagged"]], ["\u0421\u0456\u0433\u0441\u04cf\u0435", ["\u0421\u0456\u0433\u0441\u04cf\u0435", "all Cyrillic, looks like \"Circle\"", "Cyrillic", "ok", "flagged"]], ["\u0410\u043d\u043d\u0430 Petrova", ["\u0410\u043d\u043d\u0430 Petrova", "a name in two alphabets", "none: mixed", "[\u0410][\u043d][\u043d][\u0430] Petrova", "flagged"]], ["Jos\u00e9", ["Jos\u00e9", "Latin with an accent", "Latin", "ok", "flagged"]], ["\u306d\u30ac", ["\u306d\u30ac", "Hiragana and Katakana", "Japanese", "ok", "flagged"]], ["T\u30b7\u30e3\u30c4", ["T\u30b7\u30e3\u30c4", "Latin and Katakana (allowed together)", "none: mixed", "ok", "flagged"]], ["AB\u201312", ["AB\u201312", "Latin with an en dash", "Latin", "ok", "flagged"]], ["123-45", ["123-45", "no letters", "any", "ok", "ok"]]]) {
    assert.strictEqual(shown, input);
    const r = resolvedScripts(input);
    assert.strictEqual(resolved, r === null ? "any" : r.length === 0 ? "none: mixed" : r.join(", "), input);
    assert.strictEqual(text, checkText(input)?.marked ?? "ok", input);
    assert.strictEqual(id, checkId(input) ? "flagged" : "ok", input);
  }
});
ok("lk: the example prints what its comment says", () => {
  const src = "checkRecords([\n  { rowNumber: 2, email: \"ana@example.com\", sku: \"AB-123\",\n    name: \"Ana Petrova\", company: \"Acme\" },\n  { rowNumber: 3, email: \"bo@ex\\u0430mple.com\", sku: \"AB-124\",\n    name: \"Bo Chen\", company: \"\\u0410cme\" },\n  { rowNumber: 5, email: \"chloe@example.com\", sku: \"\\u039a\\u039c-7\",\n    name: \"Chlo\\u00eb \\u041c. Martin\", company: \"Zeta\" },\n]);\n// [ 'Row 3, email: \"bo@ex[\u0430]mple.com\" is not plain ASCII: U+0430 Cyrillic.',\n//   'Row 3, company: \"[\u0410]cme\" mixes Latin with U+0410 Cyrillic.',\n//   'Row 5, sku: \"[\u039a][\u039c]-7\" is not plain ASCII: U+039A Greek, U+039C Greek.',\n//   'Row 5, name: \"Chlo\u00eb [\u041c]. Martin\" mixes Latin with U+041C Cyrillic.' ]\n";
  const got = new Function("checkRecords", "return " + src.split("\n// [")[0].trim().replace(/;$/, ""))(checkRecords);
  const comment = src.split("\n").filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n");
  assert.deepStrictEqual(got, eval(comment));
  assert.strictEqual(got.length, 4);
});
ok("lk: UTS #39 table 1a examples and the cases in the text", () => {
  assert.deepStrictEqual(resolvedScripts("Circle"), ["Latin"]);
  assert.deepStrictEqual(resolvedScripts("\u0421ir\u0441l\u0435"), []);
  assert.deepStrictEqual(resolvedScripts("\u0421\u0456\u0433\u0441\u04c0\u0435"), ["Cyrillic"]);
  assert.deepStrictEqual(resolvedScripts("Circ1e"), ["Latin"]);
  assert.deepStrictEqual(resolvedScripts("\u3006\u5207"), ["Han", "Han with Bopomofo", "Japanese", "Korean"]);
  assert.deepStrictEqual(resolvedScripts("\u306d\u30ac"), ["Japanese"]);
  assert.strictEqual(resolvedScripts("123-45"), null);
  assert.strictEqual(resolvedScripts(""), null);
  // Digits, punctuation, spaces and emoji count as any script.
  for (const c of ["1", "-", " ", "!", "\u{1F600}", "\u2013"]) assert.strictEqual(scriptsOf(c), null, c);
  // The long vowel mark: Script is Common, Script_Extensions Hiragana and Katakana.
  assert(/\p{Script=Common}/u.test("\u30fc") && !/\p{Script=Hiragana}/u.test("\u30fc"));
  assert(/\p{Script_Extensions=Hiragana}/u.test("\u30fc") && /\p{Script_Extensions=Katakana}/u.test("\u30fc"));
  assert.deepStrictEqual(scriptsOf("\u30fc"), ["Hiragana", "Katakana", "Japanese"]);
  assert.deepStrictEqual(resolvedScripts("\u30bf\u30fc\u30e0"), ["Katakana", "Japanese"]);
  // A script that is not listed is Other, and mixed next to Latin.
  assert(/\p{Script=Lisu}/u.test("\ua4ee"));
  assert.deepStrictEqual(scriptsOf("\ua4ee"), ["Other"]);
  assert.strictEqual(checkText("\ua4eepple").marked, "[\ua4ee]pple");
  // Two different unlisted scripts are taken as one (the limit the post states).
  assert(/\p{Script=Ethiopic}/u.test("\u1200"));
  assert.strictEqual(checkText("\u1200\ua4ee"), null);
  // The cache returns the same answer.
  assert.strictEqual(scriptsOf("\u0430"), scriptsOf("\u0430"));
});
ok("lk: checkText checks the whole value", () => {
  assert.strictEqual(checkText("Toys-\u042f-Us").marked, "Toys-[\u042f]-Us");
  assert.strictEqual(checkText("\u0408. Smith").marked, "[\u0408]. Smith");
  assert.strictEqual(checkText("John \u0410. Smith").marked, "John [\u0410]. Smith");
  assert.strictEqual(checkText("\u0410-1 Plumbing").marked, "[\u0410]-1 Plumbing");
  assert.deepStrictEqual(checkText("\u0410\u043d\u043d\u0430 Petrova").odd, ["U+0410 Cyrillic", "U+043D Cyrillic", "U+0430 Cyrillic"]);
  const circle = checkText("\u0421ir\u0441l\u0435");
  assert.deepStrictEqual([circle.main, circle.marked], ["Latin", "[\u0421]ir[\u0441]l[\u0435]"]);
  assert.deepStrictEqual(circle.odd, ["U+0421 Cyrillic", "U+0441 Cyrillic", "U+0435 Cyrillic"]);
  for (const v of [null, undefined, "", 42, "Circle", "\u0410\u043d\u043d\u0430 \u041f\u0435\u0442\u0440\u043e\u0432\u0430", "\u0395\u03bb\u03ad\u03bd\u03b7"]) assert.strictEqual(checkText(v), null, v);
});
ok("lk: checkText allows Latin with Japanese, Korean and Chinese, but not more", () => {
  for (const v of ["T\u30b7\u30e3\u30c4", "iPhone\u7528", "\u65e5\u672c\u8a9eabc", "\u30e4\u30de\u30c0taro", "\u5c71\u7530 \u592a\u90ce \u3084\u307e\u3060 \u30e4\u30de\u30c0\u3055\u3093", "K\ud31d", "\u3105\u3106\u6f22\u5b57abc"]) assert.strictEqual(checkText(v), null, v);
  assert.deepStrictEqual(resolvedScripts("T\u30b7\u30e3\u30c4"), []);
  assert.strictEqual(checkText("\u042f\u30b7").main, "Cyrillic");
  assert.strictEqual(checkText("T\u30b7\u03b1").marked, "T\u30b7[\u03b1]");
  assert(checkText("\ud55c\u3072")); // Korean with Japanese is mixed
  assert.strictEqual(checkText("T\u30b7\u30e3\u30c4\u0430").marked, "T\u30b7\u30e3\u30c4[\u0430]");
  assert.strictEqual(checkText("T\ud55c\u30b7").marked, "T[\ud55c]\u30b7");
  // Digits from other scripts belong to that script.
  assert.strictEqual(checkText("abc\u0660").marked, "abc[\u0660]");
  assert.deepStrictEqual(checkText("abc\u0660").odd, ["U+0660 Arabic"]);
});
ok("lk: preferred decides the main script whenever the text uses it", () => {
  const greek = checkText("\u0391\u0392C-123");
  assert.deepStrictEqual([greek.main, greek.marked, greek.odd], ["Latin", "[\u0391][\u0392]C-123", ["U+0391 Greek", "U+0392 Greek"]]);
  assert.strictEqual(checkText("\u0391\u0392C-123", "Greek").marked, "\u0391\u0392[C]-123");
  assert.strictEqual(checkText("\u041co\u0441\u043a\u0432\u0430", "Cyrillic").marked, "\u041c[o]\u0441\u043a\u0432\u0430");
  assert.strictEqual(checkText("\u041co\u0441\u043a\u0432\u0430").marked, "[\u041c]o[\u0441][\u043a][\u0432][\u0430]");
  assert.strictEqual(checkText("\u0410\u043d\u043d\u0430 Petrova", "Cyrillic").marked, "\u0410\u043d\u043d\u0430 [P][e][t][r][o][v][a]");
  // No character in preferred: the majority wins.
  assert.strictEqual(checkText("\u0391\u0392\u0393\u0416").main, "Greek");
  assert.strictEqual(checkText("\u0421ir\u0441l\u0435", "Cyrillic").marked, "\u0421[i][r]\u0441[l]\u0435");
});
ok("lk: checkId flags every character that is not ASCII", () => {
  for (const v of ["ana@example.com", "AB-123", "", null, undefined, 12345]) assert.strictEqual(checkId(v), null, v);
  assert.deepStrictEqual(checkId("p\u0430yp\u0430l"), { marked: "p[\u0430]yp[\u0430]l", odd: ["U+0430 Cyrillic"] });
  assert.deepStrictEqual(checkId("AB\u201312").odd, ["U+2013 Common"]);
  assert.deepStrictEqual(checkId("anna@m\u00fcnchen.de").odd, ["U+00FC Latin"]);
  assert.deepStrictEqual(checkId("\u3006\u5207").odd, ["U+3006 Han", "U+5207 Han"]);
  assert.deepStrictEqual(checkId("a\u{1F600}").marked, "a[\u{1F600}]");
  assert.deepStrictEqual(checkId("\ua4ee1").odd, ["U+A4EE Other"]);
  assert.deepStrictEqual(checkId("Jose\u0301").odd, ["U+0301 combining mark"]);
  // Control characters are not above U+007F, so they pass.
  assert.strictEqual(checkId("a\tb\u0000"), null);
  // Latin M in a Cyrillic word: with the default, the Cyrillic letters are marked.
  assert.strictEqual(checkText("M\u043e\u0441\u043a\u0432\u0430").marked, "M[\u043e][\u0441][\u043a][\u0432][\u0430]");
  // Full-width letters are Latin but not ASCII: NFKC first, then they pass.
  assert(checkId("\uff21\uff22-1"));
  assert.strictEqual(checkId("\uff21\uff22-1".normalize("NFKC")), null);
});
ok("lk: NFKC composes accents and styled letters, and leaves the lookalikes alone", () => {
  assert.strictEqual("Jose\u0301".normalize("NFKC"), "Jos\u00e9");
  assert.strictEqual("\u{1D400}pple".normalize("NFKC"), "Apple");
  assert.strictEqual(checkText("\u{1D400}pple"), null);
  for (const s of ["bo@ex\u0430mple.com", "\u0410cme", "\u039a\u039c-7", "p\u0430yp\u0430l", "\u0421ir\u0441l\u0435", "\u0408. Smith"]) assert.strictEqual(s.normalize("NFKC"), s);
});
ok("lk: checkRecords skips unlisted columns and missing values", () => {
  assert.deepStrictEqual(checkRecords([{ rowNumber: 2, email: "ana@example.com", note: "p\u0430yp\u0430l" }, { rowNumber: 3 }]), []);
  assert.deepStrictEqual(checkRecords([{ rowNumber: 7, name: "\u041co\u0441\u043a\u0432\u0430" }], "Cyrillic"), ['Row 7, name: "\u041c[o]\u0441\u043a\u0432\u0430" mixes Cyrillic with U+006F Latin.']);
});
ok("lk: the Unicode version the post names", () => assert.strictEqual(process.versions.unicode, "17.0"));
ok("lk: snippets have no invisible characters", () => {
  for (const s of ["const typed = \"paypal\";\nconst imported = \"p\\u0430yp\\u0430l\"; // both a's are CYRILLIC SMALL LETTER A (U+0430)\n\nimported === typed;                   // false\nimported.toLowerCase() === typed;     // false\nimported.normalize(\"NFKC\") === typed; // false: NFKC does not touch it\n/^[\\x20-\\x7E]+$/.test(imported);      // false: an ASCII-only rule does catch it\n", "// Scripts to tell apart. A letter in a script that is not listed counts as \"Other\".\nconst SCRIPTS = [\"Latin\", \"Greek\", \"Cyrillic\", \"Armenian\", \"Georgian\", \"Cherokee\", \"Hebrew\",\n  \"Arabic\", \"Devanagari\", \"Thai\", \"Han\", \"Hiragana\", \"Katakana\", \"Hangul\", \"Bopomofo\"];\nconst SCRIPT_TESTS = SCRIPTS.map((name) =>\n  [name, new RegExp(`\\\\p{Script_Extensions=${name}}`, \"u\")]);\n\n// Writing systems that mix scripts on purpose (UTS #39 calls them Hanb, Jpan and Kore).\nconst WRITING_SYSTEMS = {\n  Han: [\"Han with Bopomofo\", \"Japanese\", \"Korean\"],\n  Hiragana: [\"Japanese\"],\n  Katakana: [\"Japanese\"],\n  Hangul: [\"Korean\"],\n  Bopomofo: [\"Han with Bopomofo\"],\n};\n\n// Most digits, punctuation, spaces, emoji and combining marks belong to every script.\nconst ANY_SCRIPT = /[\\p{Script_Extensions=Common}\\p{Script_Extensions=Inherited}]/u;\n\n// The scripts one character can belong to, or null for \"any script\".\n// Cached, because a regular expression per script is slow on large files.\nconst scriptCache = new Map();\nfunction scriptsOf(char) {\n  if (!scriptCache.has(char)) scriptCache.set(char, findScripts(char));\n  return scriptCache.get(char);\n}\nfunction findScripts(char) {\n  if (ANY_SCRIPT.test(char)) return null;\n  const found = SCRIPT_TESTS.filter(([, test]) => test.test(char)).map(([name]) => name);\n  if (found.length === 0) return [\"Other\"];\n  return [...found, ...new Set(found.flatMap((name) => WRITING_SYSTEMS[name] ?? []))];\n}\n\n// The scripts that every character in text can belong to.\n// null: no letters at all. []: the text mixes scripts.\nfunction resolvedScripts(text) {\n  let common = null;\n  for (const char of text) {\n    const scripts = scriptsOf(char);\n    if (scripts === null) continue;\n    common = common === null ? scripts : common.filter((name) => scripts.includes(name));\n  }\n  return common;\n}\n", "const codeOf = (char) =>\n  \"U+\" + char.codePointAt(0).toString(16).toUpperCase().padStart(4, \"0\");\nconst SYSTEM_NAMES = new Set(Object.values(WRITING_SYSTEMS).flat());\n// \"U+0430 Cyrillic\", for messages: scripts only, not the writing systems.\nfunction label(char) {\n  if (/\\p{M}/u.test(char)) return `${codeOf(char)} combining mark`;\n  const scripts = scriptsOf(char)?.filter((name) => !SYSTEM_NAMES.has(name)) ?? [\"Common\"];\n  return `${codeOf(char)} ${scripts.join(\"/\")}`;\n}\n// Puts square brackets around the characters isOdd picks out.\nfunction describe(chars, isOdd) {\n  const marked = chars.map((char) => (isOdd(char) ? `[${char}]` : char)).join(\"\");\n  return { marked, odd: [...new Set(chars.filter(isOdd).map(label))] };\n}\n\n// UTS #39 \"Highly Restrictive\" also allows Latin with Japanese, Korean or Chinese.\nconst WITH_LATIN = [\"Japanese\", \"Korean\", \"Han with Bopomofo\"];\nfunction isMixed(text) {\n  const scripts = resolvedScripts(text);\n  if (scripts === null || scripts.length > 0) return false;\n  const rest = [...text].filter((char) => !scriptsOf(char)?.includes(\"Latin\")).join(\"\");\n  return !resolvedScripts(rest)?.some((name) => WITH_LATIN.includes(name));\n}\n\n// Names and other text: null, or the characters that are not in the main script.\n// preferred: the script your users write. It is the main one whenever the text uses it.\nfunction checkText(text, preferred = \"Latin\") {\n  const chars = [...String(text ?? \"\")];\n  if (!isMixed(chars.join(\"\"))) return null;\n  const counts = new Map();\n  for (const char of chars) {\n    for (const name of scriptsOf(char) ?? []) counts.set(name, (counts.get(name) ?? 0) + 1);\n  }\n  const top = Math.max(...counts.values());\n  const main = counts.has(preferred) ? preferred : [...counts].find(([, n]) => n === top)[0];\n  // Next to Latin, the Japanese, Korean or Chinese part most characters share is allowed.\n  const partner = main === \"Latin\"\n    ? WITH_LATIN.filter((name) => counts.has(name)).sort((a, b) => counts.get(b) - counts.get(a))[0]\n    : undefined;\n  const isOdd = (char) => {\n    const scripts = scriptsOf(char);\n    return scripts !== null && !scripts.includes(main) && !scripts.includes(partner);\n  };\n  return { main, ...describe(chars, isOdd) };\n}\n\n// IDs such as emails, SKUs and customer numbers: null, or the characters that are not ASCII.\nfunction checkId(value) {\n  const chars = [...String(value ?? \"\")];\n  const isOdd = (char) => char.codePointAt(0) > 0x7f;\n  return chars.some(isOdd) ? describe(chars, isOdd) : null;\n}\n", "const COLUMN_KINDS = { email: \"id\", sku: \"id\", name: \"text\", company: \"text\" };\n\n// records: objects from your parser, after cleaning invisible characters. Each has\n// rowNumber, the row in the file, so messages still point to the right row\n// when the parser skips blank rows or the header is not on row 1.\nfunction checkRecords(records, preferred = \"Latin\") {\n  const warnings = [];\n  for (const record of records) {\n    for (const [column, kind] of Object.entries(COLUMN_KINDS)) {\n      const found = kind === \"id\" ? checkId(record[column]) : checkText(record[column], preferred);\n      if (!found) continue;\n      const problem = kind === \"id\" ? \"is not plain ASCII:\" : `mixes ${found.main} with`;\n      const where = `Row ${record.rowNumber}, ${column}`;\n      warnings.push(`${where}: \"${found.marked}\" ${problem} ${found.odd.join(\", \")}.`);\n    }\n  }\n  return warnings;\n}\n", "checkRecords([\n  { rowNumber: 2, email: \"ana@example.com\", sku: \"AB-123\",\n    name: \"Ana Petrova\", company: \"Acme\" },\n  { rowNumber: 3, email: \"bo@ex\\u0430mple.com\", sku: \"AB-124\",\n    name: \"Bo Chen\", company: \"\\u0410cme\" },\n  { rowNumber: 5, email: \"chloe@example.com\", sku: \"\\u039a\\u039c-7\",\n    name: \"Chlo\\u00eb \\u041c. Martin\", company: \"Zeta\" },\n]);\n// [ 'Row 3, email: \"bo@ex[\u0430]mple.com\" is not plain ASCII: U+0430 Cyrillic.',\n//   'Row 3, company: \"[\u0410]cme\" mixes Latin with U+0410 Cyrillic.',\n//   'Row 5, sku: \"[\u039a][\u039c]-7\" is not plain ASCII: U+039A Greek, U+039C Greek.',\n//   'Row 5, name: \"Chlo\u00eb [\u041c]. Martin\" mixes Latin with U+041C Cyrillic.' ]\n"]) assert(!/[\u00a0\u00ad\u200b-\u200f\u2028\u2029\u202f\u2060\u3000\ufeff]/.test(s));
  // The lookalike letters in code are written as escapes, so the code shows them.
  for (const s of ["const typed = \"paypal\";\nconst imported = \"p\\u0430yp\\u0430l\"; // both a's are CYRILLIC SMALL LETTER A (U+0430)\n\nimported === typed;                   // false\nimported.toLowerCase() === typed;     // false\nimported.normalize(\"NFKC\") === typed; // false: NFKC does not touch it\n/^[\\x20-\\x7E]+$/.test(imported);      // false: an ASCII-only rule does catch it\n", "// Scripts to tell apart. A letter in a script that is not listed counts as \"Other\".\nconst SCRIPTS = [\"Latin\", \"Greek\", \"Cyrillic\", \"Armenian\", \"Georgian\", \"Cherokee\", \"Hebrew\",\n  \"Arabic\", \"Devanagari\", \"Thai\", \"Han\", \"Hiragana\", \"Katakana\", \"Hangul\", \"Bopomofo\"];\nconst SCRIPT_TESTS = SCRIPTS.map((name) =>\n  [name, new RegExp(`\\\\p{Script_Extensions=${name}}`, \"u\")]);\n\n// Writing systems that mix scripts on purpose (UTS #39 calls them Hanb, Jpan and Kore).\nconst WRITING_SYSTEMS = {\n  Han: [\"Han with Bopomofo\", \"Japanese\", \"Korean\"],\n  Hiragana: [\"Japanese\"],\n  Katakana: [\"Japanese\"],\n  Hangul: [\"Korean\"],\n  Bopomofo: [\"Han with Bopomofo\"],\n};\n\n// Most digits, punctuation, spaces, emoji and combining marks belong to every script.\nconst ANY_SCRIPT = /[\\p{Script_Extensions=Common}\\p{Script_Extensions=Inherited}]/u;\n\n// The scripts one character can belong to, or null for \"any script\".\n// Cached, because a regular expression per script is slow on large files.\nconst scriptCache = new Map();\nfunction scriptsOf(char) {\n  if (!scriptCache.has(char)) scriptCache.set(char, findScripts(char));\n  return scriptCache.get(char);\n}\nfunction findScripts(char) {\n  if (ANY_SCRIPT.test(char)) return null;\n  const found = SCRIPT_TESTS.filter(([, test]) => test.test(char)).map(([name]) => name);\n  if (found.length === 0) return [\"Other\"];\n  return [...found, ...new Set(found.flatMap((name) => WRITING_SYSTEMS[name] ?? []))];\n}\n\n// The scripts that every character in text can belong to.\n// null: no letters at all. []: the text mixes scripts.\nfunction resolvedScripts(text) {\n  let common = null;\n  for (const char of text) {\n    const scripts = scriptsOf(char);\n    if (scripts === null) continue;\n    common = common === null ? scripts : common.filter((name) => scripts.includes(name));\n  }\n  return common;\n}\n", "const codeOf = (char) =>\n  \"U+\" + char.codePointAt(0).toString(16).toUpperCase().padStart(4, \"0\");\nconst SYSTEM_NAMES = new Set(Object.values(WRITING_SYSTEMS).flat());\n// \"U+0430 Cyrillic\", for messages: scripts only, not the writing systems.\nfunction label(char) {\n  if (/\\p{M}/u.test(char)) return `${codeOf(char)} combining mark`;\n  const scripts = scriptsOf(char)?.filter((name) => !SYSTEM_NAMES.has(name)) ?? [\"Common\"];\n  return `${codeOf(char)} ${scripts.join(\"/\")}`;\n}\n// Puts square brackets around the characters isOdd picks out.\nfunction describe(chars, isOdd) {\n  const marked = chars.map((char) => (isOdd(char) ? `[${char}]` : char)).join(\"\");\n  return { marked, odd: [...new Set(chars.filter(isOdd).map(label))] };\n}\n\n// UTS #39 \"Highly Restrictive\" also allows Latin with Japanese, Korean or Chinese.\nconst WITH_LATIN = [\"Japanese\", \"Korean\", \"Han with Bopomofo\"];\nfunction isMixed(text) {\n  const scripts = resolvedScripts(text);\n  if (scripts === null || scripts.length > 0) return false;\n  const rest = [...text].filter((char) => !scriptsOf(char)?.includes(\"Latin\")).join(\"\");\n  return !resolvedScripts(rest)?.some((name) => WITH_LATIN.includes(name));\n}\n\n// Names and other text: null, or the characters that are not in the main script.\n// preferred: the script your users write. It is the main one whenever the text uses it.\nfunction checkText(text, preferred = \"Latin\") {\n  const chars = [...String(text ?? \"\")];\n  if (!isMixed(chars.join(\"\"))) return null;\n  const counts = new Map();\n  for (const char of chars) {\n    for (const name of scriptsOf(char) ?? []) counts.set(name, (counts.get(name) ?? 0) + 1);\n  }\n  const top = Math.max(...counts.values());\n  const main = counts.has(preferred) ? preferred : [...counts].find(([, n]) => n === top)[0];\n  // Next to Latin, the Japanese, Korean or Chinese part most characters share is allowed.\n  const partner = main === \"Latin\"\n    ? WITH_LATIN.filter((name) => counts.has(name)).sort((a, b) => counts.get(b) - counts.get(a))[0]\n    : undefined;\n  const isOdd = (char) => {\n    const scripts = scriptsOf(char);\n    return scripts !== null && !scripts.includes(main) && !scripts.includes(partner);\n  };\n  return { main, ...describe(chars, isOdd) };\n}\n\n// IDs such as emails, SKUs and customer numbers: null, or the characters that are not ASCII.\nfunction checkId(value) {\n  const chars = [...String(value ?? \"\")];\n  const isOdd = (char) => char.codePointAt(0) > 0x7f;\n  return chars.some(isOdd) ? describe(chars, isOdd) : null;\n}\n", "const COLUMN_KINDS = { email: \"id\", sku: \"id\", name: \"text\", company: \"text\" };\n\n// records: objects from your parser, after cleaning invisible characters. Each has\n// rowNumber, the row in the file, so messages still point to the right row\n// when the parser skips blank rows or the header is not on row 1.\nfunction checkRecords(records, preferred = \"Latin\") {\n  const warnings = [];\n  for (const record of records) {\n    for (const [column, kind] of Object.entries(COLUMN_KINDS)) {\n      const found = kind === \"id\" ? checkId(record[column]) : checkText(record[column], preferred);\n      if (!found) continue;\n      const problem = kind === \"id\" ? \"is not plain ASCII:\" : `mixes ${found.main} with`;\n      const where = `Row ${record.rowNumber}, ${column}`;\n      warnings.push(`${where}: \"${found.marked}\" ${problem} ${found.odd.join(\", \")}.`);\n    }\n  }\n  return warnings;\n}\n", "checkRecords([\n  { rowNumber: 2, email: \"ana@example.com\", sku: \"AB-123\",\n    name: \"Ana Petrova\", company: \"Acme\" },\n  { rowNumber: 3, email: \"bo@ex\\u0430mple.com\", sku: \"AB-124\",\n    name: \"Bo Chen\", company: \"\\u0410cme\" },\n  { rowNumber: 5, email: \"chloe@example.com\", sku: \"\\u039a\\u039c-7\",\n    name: \"Chlo\\u00eb \\u041c. Martin\", company: \"Zeta\" },\n]);\n// [ 'Row 3, email: \"bo@ex[\u0430]mple.com\" is not plain ASCII: U+0430 Cyrillic.',\n//   'Row 3, company: \"[\u0410]cme\" mixes Latin with U+0410 Cyrillic.',\n//   'Row 5, sku: \"[\u039a][\u039c]-7\" is not plain ASCII: U+039A Greek, U+039C Greek.',\n//   'Row 5, name: \"Chlo\u00eb [\u041c]. Martin\" mixes Latin with U+041C Cyrillic.' ]\n"]) assert(!/[\u0370-\u04ff]/.test(s.split("\n").filter((l) => !l.startsWith("//")).join("\n")));
});
}
