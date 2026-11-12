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
