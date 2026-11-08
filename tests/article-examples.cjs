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
