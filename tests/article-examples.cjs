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
