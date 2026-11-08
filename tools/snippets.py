# Code shown in the article. The same strings are written into tests/article-examples.cjs,
# so every example on the page is executed by the test suite.
HEADER = r'''function findHeaderRow(rows, scan = 15) {
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
}'''
TOTALS = r'''const TOTAL = /^(grand\s+)?(sub-?)?totals?\b|^(sum|summe|gesamt)\b|^(合計|小計|総計)/i;

function isTotalsRow(row) {
  const first = row.map((c) => String(c ?? "").trim()).find(Boolean) ?? "";
  return TOTAL.test(first);
}'''
DATES = r'''function dateOrder(values) {
  let dayFirst = false, monthFirst = false;
  for (const v of values) {
    const m = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(String(v).trim());
    if (!m) continue;
    if (+m[1] > 12) dayFirst = true;   // 31/01/2026
    if (+m[2] > 12) monthFirst = true; // 01/31/2026
  }
  if (dayFirst === monthFirst) return null; // no evidence, or contradictory: ask the user
  return dayFirst ? "dmy" : "mdy";
}'''
NUMBERS = r'''const usesDecimalComma = (values) =>
  values.some((v) => /^-?\d{1,3}(\.\d{3})*,\d{1,2}$/.test(String(v).trim()));

function parseAmount(raw, decimalComma) {
  let t = String(raw).trim().replace(/[\s ]/g, "").replace(/^[$€£¥]|[$€£¥円]$/g, "");
  t = decimalComma ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}'''
EXCEL = r'''// npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
import * as XLSX from "xlsx";

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
}'''
ENCODING = r'''async function readText(file) {
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
}'''

# --- blog/parse-european-number-formats-javascript ---
EU_PROBLEM = r'''parseFloat("1.234,56"); // 1.234   (wrong, and no error)
Number("1.234,56");     // NaN
Number("1,234.56");     // NaN
parseFloat("1,234.56"); // 1       (wrong, and no error)'''
EU_SPLIT = r'''const CURRENCY = "R\\$|[$€£¥₹₽₩円]|kr\\.?|zł|EUR|USD|GBP|CHF|JPY|SEK|NOK|DKK|PLN|CZK|BRL|INR|CAD|AUD";
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
}'''
EU_TONUMBER = r'''const GROUPED = { ".": /^[1-9]\d{0,2}(\.\d{3})+$/, ",": /^[1-9]\d{0,2}(,\d{3})+$/ };
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
}'''
EU_LOCALE = r'''const separatorCache = new Map();

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
}'''
EU_DETECT = r'''function decimalVote(body) {
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
}'''
EU_COLUMN = r'''function parseNumberColumn(values, chosenLocale) {
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
}'''

# --- blog/detect-header-row-spreadsheet-javascript ---
HDR_KIND = r'''const asText = (value) => String(value ?? "").trim();

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
}'''

HDR_SCORE = r'''// The most common number of filled cells per row: data rows outnumber everything else.
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
}'''

HDR_FIND = r'''// Same text in the same columns -> same key (trailing empty cells ignored).
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
}'''

HDR_RECORDS = r'''// 0 -> "A", 27 -> "AB"
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
}'''

HDR_SHEETJS = r'''// npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
import * as XLSX from "xlsx";

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
}'''
