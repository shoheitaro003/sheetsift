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
  let t = String(raw).trim().replace(/[\s\u00a0]/g, "").replace(/^[$€£¥]|[$€£¥円]$/g, "");
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


# --- blog/read-excel-dates-javascript-sheetjs ---
XD_FORMULA = r'''// The usual one-liner: 25569 is the serial number of 1970-01-01.
const toDate = (serial) => new Date((serial - 25569) * 86400000);

toDate(46027).toISOString();               // "2026-01-05T00:00:00.000Z"
toDate(46027).getDate();                   // 4 in Los Angeles, 5 in Tokyo
toDate(46027).toLocaleDateString("en-US"); // "1/4/2026" in Los Angeles
toDate(59).toISOString().slice(0, 10);     // "1900-02-27", but Excel shows 2/28/1900'''

XD_CELLDATES = r'''// Joined.xlsx: A1 "Joined", A2 = 2026-01-05, A3 = serial 60, all formatted as dates
const workbook = XLSX.read(bytes, { cellDates: true });
const sheet = workbook.Sheets[workbook.SheetNames[0]];

sheet.A2.v.toISOString(); // "2026-01-05T00:00:00.000Z" on every machine
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
rows[1][0].toISOString(); // "2026-01-04T15:00:00.000Z" in Tokyo: local midnight
rows[2][0];               // 60: the cell for 29 February 1900 is still a number'''

XD_QUICKFIX = r'''const workbook = XLSX.read(bytes, { cellDates: true });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, UTC: true });

rows[1][0].toISOString().slice(0, 10); // "2026-01-05" in every time zone
rows[1][0].getUTCDate();               // 5 (getDate() would still give 4 in Los Angeles)'''

XD_CSV = r'''const csv = "Joined\n03/04/2026\n31/12/2026\n";

const guessed = XLSX.read(csv, { type: "string" }).Sheets.Sheet1;
guessed.A2.v; // 46085, the serial number of 2026-03-04 (read month first)
guessed.A3.v; // "31/12/2026", left as text in the same column

const kept = XLSX.read(csv, { type: "string", raw: true }).Sheets.Sheet1;
kept.A2.v;    // "03/04/2026", text you can check with the rest of the column'''

XD_KIND = r'''// What a cell's number format says about its value:
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
}'''

XD_SERIAL = r'''const DAY_MS = 86400000;
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
}'''

XD_READ = r'''// npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
import * as XLSX from "xlsx";

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
}'''


# --- blog/decode-shift-jis-windows-1252-utf-16-csv-javascript ---
DEC_PROBLEM = r'''const cafe = new Uint8Array([0x43, 0x61, 0x66, 0xe9]); // "Café" saved as Windows-1252
await new Blob([cafe]).text();                 // "Caf\uFFFD"
new TextDecoder().decode(cafe);                // "Caf\uFFFD"
new TextDecoder("windows-1252").decode(cafe);  // "Café"

const nihon = new Uint8Array([0x93, 0xfa, 0x96, 0x7b]); // "日本" saved as Shift_JIS
new TextDecoder("shift_jis").decode(nihon);    // "日本"
new TextDecoder("windows-1252").decode(nihon); // "“ú–{"'''
DEC_TRAPS = r'''// 1. Several labels give the same decoder.
new TextDecoder("latin1").encoding;      // "windows-1252"
new TextDecoder("iso-8859-1").encoding;  // "windows-1252"
new TextDecoder("ascii").encoding;       // "windows-1252"
new TextDecoder("sjis").encoding;        // "shift_jis"
new TextDecoder("windows-31j").encoding; // "shift_jis"
new TextDecoder("utf-16").encoding;      // "utf-16le"
new TextDecoder("utf-32");               // throws RangeError

// 2. A byte order mark only helps if you picked the right decoder already.
// "Hi" in UTF-16LE, with a BOM:
const hi = new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00]);
new TextDecoder("utf-16le").decode(hi);  // "Hi"
new TextDecoder("utf-8").decode(hi);     // "\uFFFD\uFFFDH\u0000i\u0000"

// 3. Windows-1252 accepts every byte, so "no error" proves nothing.
const strict1252 = new TextDecoder("windows-1252", { fatal: true });
strict1252.decode(new Uint8Array([0x81, 0x8d])); // "\u0081\u008d"

// 4. Chunks decoded separately break characters that cross a chunk boundary.
const tokyo = new TextEncoder().encode("東京"); // 6 bytes, 3 per character
const decoder = new TextDecoder();
decoder.decode(tokyo.slice(0, 4)) + decoder.decode(tokyo.slice(4)); // "東\uFFFD\uFFFD\uFFFD"
decoder.decode(tokyo.slice(0, 4), { stream: true }) + decoder.decode(tokyo.slice(4)); // "東京"'''
DEC_SNIFF = r'''const BOMS = [ // byte order marks; UTF-32 before UTF-16, because FF FE starts both
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
}'''
DEC_DAMAGE = r'''// How many bytes a UTF-8 character starting with this byte has (0: not a valid first byte).
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
}'''
DEC_SCORE = r'''// Symbols that wrongly decoded Japanese produces often and real Western text almost never uses.
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
}'''
DEC_DECODE = r'''// legacy: the encodings your users' older software writes, most likely first.
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
}'''
DEC_USE = r'''async function readCsvText(file, legacy) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const decoded = decodeCsv(bytes, legacy);
  // When decoded.sure is false, show a preview and let the user pick another encoding.
  // decodeAs returns null if the bytes are not valid in the chosen encoding; switching
  // back to the first result always works, even for damaged UTF-8.
  const decodeAs = (encoding) => (encoding === decoded.encoding ? decoded.text : decodeStrict(bytes, encoding));
  return { ...decoded, decodeAs };
}

const { encoding, text, sure, reason, options, decodeAs } = await readCsvText(file, ["windows-1252", "shift_jis"]);'''

