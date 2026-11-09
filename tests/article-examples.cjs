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
