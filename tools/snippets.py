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



# --- blog/map-spreadsheet-columns-to-fields-javascript ---
MAP_PROBLEM = r'''const EMAIL_NAMES = ["email", "e-mail", "email address", "mail"];
const exactMatch = (header) => EMAIL_NAMES.includes(header.trim().toLowerCase());
exactMatch("E-mail");             // true
exactMatch("E-Mail-Adresse");     // false
exactMatch("Email\u00A0address");  // false
exactMatch("Ｅｍａｉｌ");         // false

const looseMatch = (header) => header.toLowerCase().includes("mail");
looseMatch("Mailing address");    // true
looseMatch("Email opt-in");       // true'''
MAP_NORMALIZE = r'''function normalizeHeader(text) {
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
const headerKey = (text) => words(text).join(" ");'''
MAP_COMPARE = r'''// True when b is a with one letter changed, added or removed,
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
}'''
MAP_FIELDS = r'''const looksLikeEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());
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
];'''
MAP_COLUMNS = r'''const MIN_SCORE = 0.6;   // weaker name matches are ignored
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
}'''
MAP_REMEMBER = r'''// After the user confirms the mapping screen, store their choices
// (in your database or in localStorage).
function rememberMapping(remembered, headers, byField) {
  for (const [key, match] of Object.entries(byField)) {
    const header = match && headerKey(headers[match.column]);
    if (header) remembered[header] = key; // blank headers are not remembered
  }
  return remembered;
}'''
MAP_USE = r'''// rows: arrays of cells from your CSV or Excel parser.
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
}'''



# --- blog/find-invisible-characters-csv-excel-javascript ---
INV_PROBLEM = r'''const typed = "ana@example.com";
const imported = "ana@example.com\u200B"; // a zero width space at the end

typed === imported;                // false
imported.length;                   // 16
imported.trim() === typed;         // false: trim() keeps U+200B
"\u00A0ana@example.com".trim() === typed; // true: trim() removes U+00A0'''
INV_FIND = r'''// Control (Cc), format (Cf) and separator (Z) characters, plus three blank
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
  [...String(text ?? "")].map((ch) => (isHidden(ch) ? `<${codeOf(ch)}>` : ch)).join("");'''
INV_CLEAN = r'''// Invisible on purpose: the non-joiner and joiner (U+200C, U+200D), the
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
}'''
INV_USE = r'''const COLUMN_KINDS = { email: "id", sku: "id", name: "text", note: "text" };

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
}'''
INV_EXAMPLE = r'''const { clean, notes, errors } = cleanRows([
  { email: "ana@example.com", sku: "ＡＢ－１２３", name: "Ana Lima", note: "" },
  { email: "ana@example.com\u200B", sku: "AB-124", name: "Ana\u00A0Lima", note: "Call\r\nafter 5" },
  { email: "ken@example.com", sku: "AB 125", name: "Ken", note: "" },
]);
clean[0].sku; // "AB-123"
clean[1].note; // "Call\nafter 5"
notes;
// ["Row 2, sku: normalized to \"AB-123\" (NFKC)",
//  "Row 3, email: removed zero width space (U+200B) at position 16",
//  "Row 3, name: no-break space (U+00A0) at position 4 became a space"]
errors;
// ["Row 3, email: same as row 2",
//  "Row 4, sku: contains a space or line break"]'''

# --- blog/find-placeholder-values-csv-excel-javascript ---
PH_PROBLEM = r'''const row = { email: "N/A", name: "   ", company: "-" };
Boolean(row.email);       // true
row.name.length > 0;      // true
row.company !== "";       // true
'''

PH_STATUS = r'''// Text that stands for "no value", compared in lower case, with spaces,
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
'''

PH_CHECK = r'''// columns: { field: { required, allowed } }. records: objects from your parser,
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
'''

PH_EXAMPLE = r'''const columns = {
  email:   { required: true },
  country: { required: true, allowed: ["NA"] }, // "NA" is Namibia
  phone:   {},
};
const { rows, problems, skipped } = checkRecords([
  { rowNumber: 2, email: "ana@example.com", country: "NA",  phone: "n/a" },
  { rowNumber: 3, email: "N/A",             country: "DE",  phone: "" },
  { rowNumber: 4, email: "bo@example.com",  country: "  ",  phone: "#REF!" },
  { rowNumber: 5, email: "",                country: "",    phone: "" },
], columns);

problems.map(describe);
// [ 'Row 2, phone: "n/a" was read as empty.',
//   'Row 3, email: "N/A" is a placeholder, but this column is required.',
//   'Row 4, country: is empty, but this column is required.',
//   'Row 4, phone: "#REF!" is a formula error in the file. Fix it there and export again.' ]
skipped;       // [5]  (row numbers of empty rows)
rows[0].phone; // null
'''

PH_SHEETJS = r'''// npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
import * as XLSX from "xlsx";

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
'''

LK_PROBLEM = r'''const typed = "paypal";
const imported = "p\u0430yp\u0430l"; // both a's are CYRILLIC SMALL LETTER A (U+0430)

imported === typed;                   // false
imported.toLowerCase() === typed;     // false
imported.normalize("NFKC") === typed; // false: NFKC does not touch it
/^[\x20-\x7E]+$/.test(imported);      // false: an ASCII-only rule does catch it
'''

LK_SCRIPTS = r'''// Scripts to tell apart. A letter in a script that is not listed counts as "Other".
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
'''

LK_CHECK = r'''const codeOf = (char) =>
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
'''

LK_USE = r'''const COLUMN_KINDS = { email: "id", sku: "id", name: "text", company: "text" };

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
'''

LK_EXAMPLE = r'''checkRecords([
  { rowNumber: 2, email: "ana@example.com", sku: "AB-123",
    name: "Ana Petrova", company: "Acme" },
  { rowNumber: 3, email: "bo@ex\u0430mple.com", sku: "AB-124",
    name: "Bo Chen", company: "\u0410cme" },
  { rowNumber: 5, email: "chloe@example.com", sku: "\u039a\u039c-7",
    name: "Chlo\u00eb \u041c. Martin", company: "Zeta" },
]);
// [ 'Row 3, email: "bo@ex[а]mple.com" is not plain ASCII: U+0430 Cyrillic.',
//   'Row 3, company: "[А]cme" mixes Latin with U+0410 Cyrillic.',
//   'Row 5, sku: "[Κ][Μ]-7" is not plain ASCII: U+039A Greek, U+039C Greek.',
//   'Row 5, name: "Chloë [М]. Martin" mixes Latin with U+041C Cyrillic.' ]
'''


# --- blog/fill-merged-cells-excel-import-sheetjs ---
MD_PROBLEM = r'''// Orders.xlsx: "North" is merged over A2:A4, "Note: amounts in EUR" over A6:D6.
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const records = XLSX.utils.sheet_to_json(sheet, { defval: "" });
records.length;          // 5
records[1].Region;       // ''  (Bo's row: "North" is stored in A2 only)
records[4].Region;       // 'Note: amounts in EUR'  (the footnote, read as an order)
sheet["!merges"].length; // 2
'''

MD_READ = r'''// npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
import * as XLSX from "xlsx";

const isEmpty = (value) => String(value ?? "").trim() === "";
const isLabel = (value) => typeof value === "string" && value.trim() !== "";

// Reads the first sheet of an .xlsx file.
// rows: one array of cells per row. merges: the merged ranges.
// Both count from 0 at the first cell of the sheet's stored range (origin).
function readXlsx(bytes) {
  const data = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  // An .xlsx file is a zip archive, and zip archives start with the bytes "PK".
  if (data[0] !== 0x50 || data[1] !== 0x4b) throw new TypeError("not an .xlsx file");
  const workbook = XLSX.read(data);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet?.["!ref"]) return { rows: [], merges: [], origin: { r: 0, c: 0 } };
  const origin = XLSX.utils.decode_range(sheet["!ref"]).s;
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1, defval: "", blankrows: true, raw: true });
  const merges = (sheet["!merges"] ?? []).map((m) => ({
    address: XLSX.utils.encode_range(m), // "A2:A4", for messages
    top: m.s.r - origin.r, bottom: m.e.r - origin.r,
    left: m.s.c - origin.c, right: m.e.c - origin.c,
  }));
  return { rows, merges, origin };
}
'''

MD_FILL = r'''// Fills the merges in the data that are safe to fill; reports the others.
// Changes rows in place. firstData: index of the first row under the header.
// width: number of columns in the table.
function fillMerges(rows, merges, firstData, width, origin) {
  const notes = [];
  const problems = [];
  const skipRows = new Set();
  const excelAddress = (r, c) => XLSX.utils.encode_cell({ r: origin.r + r, c: origin.c + c });
  // Only the table's columns count: a stray comment further right does not make a row data.
  const blank = (row) => row.slice(0, width).every(isEmpty);
  for (const m of merges) {
    if (m.bottom < firstData) continue; // in or above the header row
    if (m.top >= rows.length) continue;  // below the last row: nothing to read
    if (m.left >= width) continue;       // right of the table, such as a logo box
    if (m.top < firstData) {
      // A header cell merged down into the data. Harmless only if those rows are empty.
      const into = rows.slice(firstData, m.bottom + 1);
      if (!into.every(blank)) {
        const reason = "runs from the header into the data; the header may have two rows";
        problems.push({ range: m.address, reason });
      }
      continue;
    }
    const value = rows[m.top][m.left];
    const last = Math.min(m.bottom, rows.length - 1);
    // The user sees only the first cell's value. A value stored in another cell of
    // the range is hidden in Excel, so it is reported and not imported.
    for (let r = m.top; r <= last; r++) {
      for (let c = m.left; c <= m.right; c++) {
        if ((r === m.top && c === m.left) || isEmpty(rows[r][c])) continue;
        problems.push({ range: m.address, reason: `hides ${JSON.stringify(rows[r][c])} in ${excelAddress(r, c)}` });
        rows[r][c] = "";
      }
    }
    const height = last - m.top + 1; // rows that exist, if the merge runs past the end
    const span = m.right - m.left + 1;
    if (span === 1 && isLabel(value)) {
      // Text in one column over several rows: a group label. Copy it down, except
      // into rows that are empty in the file (those are skipped, not imported).
      const filled = [];
      for (let r = m.top + 1; r <= last; r++) {
        if (blank(rows[r])) continue;
        rows[r][m.left] = value;
        filled.push(excelAddress(r, m.left));
      }
      if (filled.length > 0) {
        notes.push({ range: m.address, reason: `${JSON.stringify(value)} copied into ${filled.join(", ")}` });
      }
    } else if (span === 1) {
      // A number, date or boolean over several rows, such as one total for two
      // invoice lines. Copying it would count it twice.
      if (!isEmpty(value) && last > m.top) {
        problems.push({ range: m.address, reason: `covers ${height} rows; ${JSON.stringify(value)} is read into ${excelAddress(m.top, m.left)} only` });
      }
    } else if (m.left === 0 && m.right >= width - 1) {
      // One cell across the whole table: a title, a section name or a footnote.
      for (let r = m.top; r <= last; r++) skipRows.add(r);
      const first = origin.r + m.top + 1;
      const where = last > m.top ? `rows ${first}-${origin.r + last + 1}` : `row ${first}`;
      // Text is skipped quietly; a number across the table (a grand total?) is reported.
      const list = isLabel(value) || isEmpty(value) ? notes : problems;
      list.push({ range: m.address, reason: `${where} skipped: ${JSON.stringify(value)} spans the table` });
    } else if (!isEmpty(value)) {
      // Several columns but not the whole table: the value belongs to one of them,
      // and only the user knows which. An empty merge, kept for layout, is left alone.
      const size = height > 1 ? `${height} rows and ${span} columns` : `${span} columns`;
      problems.push({ range: m.address, reason: `covers ${size}; ${JSON.stringify(value)} is read into ${excelAddress(m.top, m.left)} only` });
    }
  }
  return { notes, problems, skipRows };
}
'''

MD_TABLE = r'''// Reads an .xlsx file with a one-row header into records.
// headerTop: index of the header row, counted from the first row of the stored
// range (0 for most files). The header row must not be merged across columns.
function readMergedTable(bytes, headerTop = 0) {
  const { rows, merges, origin } = readXlsx(bytes);
  const headerCell = (c) => XLSX.utils.encode_cell({ r: origin.r + headerTop, c: origin.c + c });
  const columns = (rows[headerTop] ?? []).map((name) => String(name).trim());
  const width = columns.findLastIndex((name) => name !== "") + 1;
  if (width === 0) {
    const reason = "the header row has no column names; if the header is lower, pass its index as headerTop";
    return { columns: [], records: [], notes: [], problems: [{ range: headerCell(0), reason }] };
  }
  const problems = [];
  // A header cell merged across columns ("Q1" over C1:D1) means a header with two
  // or more rows. This code reads one header row, so it reports the file instead.
  for (const m of merges) {
    if (m.top <= headerTop && m.bottom >= headerTop && m.right > m.left && m.left < width) {
      problems.push({ range: m.address, reason: "header cell merged across columns; this code reads a one-row header only" });
    }
  }
  if (problems.length > 0) return { columns: [], records: [], notes: [], problems };

  const firstData = headerTop + 1;
  const filled = fillMerges(rows, merges, firstData, width, origin);
  problems.push(...filled.problems);
  const isData = (r) => r >= firstData && !filled.skipRows.has(r) &&
    !rows[r].slice(0, width).every(isEmpty);
  columns.length = width;
  columns.forEach((name, c) => {
    if (name === "" && rows.some((row, r) => isData(r) && !isEmpty(row[c]))) {
      problems.push({ range: headerCell(c), reason: "has data but no column name" });
    }
  });
  const seen = new Set();
  columns.forEach((name, c) => {
    if (name === "") return;
    // "Email" and "email" would become one field in most mappings: report it.
    if (seen.has(name.toLowerCase())) {
      problems.push({ range: headerCell(c), reason: `repeats the column name ${JSON.stringify(name)}` });
    }
    seen.add(name.toLowerCase());
  });

  const records = [];
  rows.forEach((row, r) => {
    if (!isData(r)) return;
    // Object.fromEntries defines own properties, so a column named "__proto__" is safe.
    // With a repeated name, the later column wins; the problem above says so.
    const values = Object.fromEntries(
      columns.flatMap((name, c) => (name ? [[name, row[c] ?? ""]] : [])));
    records.push({ row: origin.r + r + 1, values }); // the row number the user sees in Excel
  });
  return { columns: columns.filter((name) => name !== ""), records, notes: filled.notes, problems };
}
'''

MD_EXAMPLE = r'''let table;
try {
  table = readMergedTable(await file.arrayBuffer());
} catch (error) {
  // readXlsx throws a TypeError for a file that is not .xlsx,
  // and SheetJS throws for a damaged one.
  // Log the original error, so a bug in your own code is not mistaken for a bad file.
  console.error(error);
  const reason = "the file could not be read as .xlsx";
  table = { columns: [], records: [], notes: [], problems: [{ range: null, reason }] };
}
const { columns, records, notes, problems } = table;

records.map((r) => `${r.row}: ${r.values.Region}, ${r.values.Rep}`);
// [ '2: North, Ana', '3: North, Bo', '4: North, Cy', '5: South, Di' ]
notes.map((n) => `${n.range}: ${n.reason}`);
// [ 'A2:A4: "North" copied into A3, A4',
//   'A6:D6: row 6 skipped: "Note: amounts in EUR" spans the table' ]
problems; // []
'''

MD_PROBLEMS = r'''// Invoices.xlsx: header Customer, Invoice, Line, Amount (A1:D1). Merged in the data:
// "Acme" over A2:A3, 150 over D2:D3 (one amount for two lines),
// and "Paid by card, see note" over B4:C4.
problems.map((p) => `${p.range}: ${p.reason}`);
// [ 'D2:D3: covers 2 rows; 150 is read into D2 only',
//   'B4:C4: covers 2 columns; "Paid by card, see note" is read into B4 only' ]
records[1].values; // { Customer: 'Acme', Invoice: 'INV-7', Line: 'Shipping', Amount: '' }
'''


MH_PROBLEM = r'''// Sales.xlsx: "Region" and "Rep" are merged down over A1:A2 and B1:B2,
// "Q1" across C1:D1 and "Q2" across E1:F1, with Revenue and Cost under each.
// bytes: the file's contents, e.g. new Uint8Array(await file.arrayBuffer()).
const workbook = XLSX.read(bytes);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const records = XLSX.utils.sheet_to_json(sheet);
records.length;                    // 4  (row 2, the second header row, is read as a record)
Object.keys(records[0]).join(", ");  // 'Q1, __EMPTY, Q2, __EMPTY_1'
const fromRow2 = XLSX.utils.sheet_to_json(sheet, { range: 1 });
Object.keys(fromRow2[0]).join(", "); // '__EMPTY, __EMPTY_1, Revenue, Cost, Revenue_1, Cost_1'
'''

MH_FIXED = r'''// Only for a template you control: the header is always rows 1-2 of Sales.xlsx.
const columns = ["Region", "Rep", "Q1 Revenue", "Q1 Cost", "Q2 Revenue", "Q2 Cost"];
const records = XLSX.utils.sheet_to_json(sheet, { header: columns, range: 2 });
records[1]; // { Rep: 'Bo', 'Q1 Revenue': 90, 'Q1 Cost': 50, 'Q2 Revenue': 80, 'Q2 Cost': 40 }
'''


MH_READ = r'''// npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
import * as XLSX from "xlsx";

const hasText = (value) => String(value ?? "").trim() !== "";
// Line breaks typed with Alt+Enter and runs of spaces become one space.
const tidy = (value) => String(value).replace(/\s+/g, " ").trim();

// Reads the first sheet. rows: one array of cells per row. merges: the merged
// ranges. Both count from 0 at the start of the sheet's range (its "!ref").
function readSheet(bytes) {
  const workbook = XLSX.read(bytes);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet?.["!ref"]) return { rows: [], merges: [], origin: { r: 0, c: 0 } };
  const origin = XLSX.utils.decode_range(sheet["!ref"]).s;
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1, defval: null, blankrows: true, raw: true });
  const merges = (sheet["!merges"] ?? []).map((m) => ({
    address: XLSX.utils.encode_range(m), // "C1:D1", for messages
    top: m.s.r - origin.r, bottom: m.e.r - origin.r,
    left: m.s.c - origin.c, right: m.e.c - origin.c,
  }));
  return { rows, merges, origin };
}

// The text of a merge (in its top-left cell). A merge can lie outside the
// sheet's range, so the row may not exist.
const mergeText = (rows, m) => rows[m.top]?.[m.left];
// A group label: a merge with text across two or more columns.
const isGroupLabel = (rows, m) => m.right > m.left && hasText(mergeText(rows, m));
'''

MH_FIND = r'''// Finds the header rows. headerRow is the Excel row number of its first row.
// Returns { top, end } (row indexes; end is the first row after the header)
// or { problem }.
function findHeaderRows(sheet, { headerRow = sheet.origin.r + 1, maxRows = 3 } = {}) {
  const { rows, merges, origin } = sheet;
  const top = headerRow - 1 - origin.r;
  const label = (m) => `"${tidy(mergeText(rows, m))}" (${m.address})`;
  const problem = (range, reason, hint) => ({ problem: { range, reason, hint } });
  if (top < 0 || top >= rows.length) return problem(null, `row ${headerRow} is outside the sheet`);
  if (!rows[top].some(hasText)) return problem(null, `row ${headerRow} is empty`,
    "pass headerRow: the Excel row number of the column names");

  // Each group label needs a row of names under it: grow the header until
  // every group label that starts in it has one.
  let end = top + 1;
  for (;;) {
    const groups = merges.filter((m) => isGroupLabel(rows, m) && m.top >= top && m.top < end);
    const needed = Math.max(end, ...groups.map((m) => m.bottom + 2));
    if (needed === end) break;
    end = needed;
  }
  const lastRow = headerRow + (end - top) - 1;
  if (end > rows.length) return problem(null,
    `the header (rows ${headerRow}-${lastRow}) runs past the end of the sheet`);

  // A title: a group label in the first row over every column that has a label.
  const labelled = (c) => {
    for (let r = top; r < end; r++) {
      if (hasText(rows[r]?.[c])) return true;
    }
    return merges.some((m) => hasText(mergeText(rows, m)) && m.left <= c && c <= m.right &&
      m.top < end && m.bottom >= top);
  };
  const width = Math.max(...rows.slice(top, end).map((row) => row.length));
  const named = [];
  for (let c = 0; c < width; c++) if (labelled(c)) named.push(c);
  const title = merges.find((m) => isGroupLabel(rows, m) && m.top === top &&
    named.length > 1 && m.left <= named[0] && m.right >= named.at(-1));
  if (title) {
    const next = rows.findIndex((row, r) => r > title.bottom && row.some(hasText));
    return problem(title.address, `${label(title)} spans every column, so it looks like a title`,
      next < 0 ? undefined : `pass headerRow: ${next + origin.r + 1} if the names start there`);
  }
  if (end - top > maxRows) return problem(null,
    `the merges make a header of ${end - top} rows; the limit is ${maxRows}`,
    "check the merges, or pass a larger maxRows if the header is real");

  // A labelled merge that starts above the header or reaches below it.
  const crossing = merges.find((m) => hasText(mergeText(rows, m)) &&
    m.bottom >= top && m.top < end &&       // it touches the header
    (m.top < top || m.bottom >= end));      // and goes past its edge
  if (crossing) return problem(crossing.address,
    `${label(crossing)} crosses the edge of the header (rows ${headerRow}-${lastRow})`,
    `merge it over rows ${headerRow}-${lastRow} only, or unmerge it`);
  return { top, end, headerRow, lastRow };
}
'''

MH_HEADER = r'''// Names each column from the header rows, top to bottom: "Q1" over "Revenue"
// gives "Q1 Revenue". Returns { columns, end } or { problems }.
function readHeader(sheet, options) {
  const { rows, merges, origin } = sheet;
  const found = findHeaderRows(sheet, options);
  if (found.problem) return { problems: [found.problem] };
  const { top, end } = found;
  const cellAt = (r, c) => XLSX.utils.encode_cell({ r: r + origin.r, c: c + origin.c });
  const mergeAt = (r, c) =>
    merges.find((m) => r >= m.top && r <= m.bottom && c >= m.left && c <= m.right);
  // What Excel shows: a merge shows the value of its top-left cell.
  const shown = (r, c) => {
    const m = mergeAt(r, c);
    return m ? mergeText(rows, m) : rows[r][c];
  };
  const headerRows = [];
  for (let r = top; r < end; r++) headerRows.push(r);
  const groups = merges.filter((m) => isGroupLabel(rows, m) && m.top >= top && m.top < end);
  const width = Math.max(...headerRows.map((r) => rows[r].length));

  const columns = [], problems = [];
  for (let c = 0; c < width; c++) {
    const parts = [];
    let lastMerge = null;  // a merge counts once, however many rows it covers
    let plainLabel = null; // the last label above that is not a group label
    for (const r of headerRows) {
      const m = mergeAt(r, c);
      if (m && m === lastMerge) continue;
      lastMerge = m;
      const value = shown(r, c);
      if (!hasText(value)) continue;
      // Text under a plain label is a data row that a merge pulled into the header.
      if (plainLabel !== null) problems.push({ range: cellAt(r, c),
        reason: `"${tidy(value)}" is under "${tidy(plainLabel)}", ` +
          `which is not a group label, so row ${r + origin.r + 1} looks like data`,
        hint: "unmerge cells that are only layout, or type the full name in one cell" });
      if (!groups.includes(m)) plainLabel = value;
      parts.push(tidy(value));
    }
    // Every column under a group label needs a name in a row below the label.
    for (const g of groups) {
      if (c < g.left || c > g.right) continue;
      if (headerRows.some((r) => r > g.bottom && hasText(shown(r, c)))) continue;
      problems.push({ range: cellAt(g.bottom + 1, c),
        reason: `"${tidy(mergeText(rows, g))}" (${g.address}) has no column name under it here`,
        hint: "type the column's name in this cell" });
    }
    if (parts.length) columns.push({ name: parts.join(" "), parts, index: c,
      letter: XLSX.utils.encode_col(c + origin.c) });
  }
  if (problems.length) return { problems };
  if (!rows.slice(end).some((row) => row.some(hasText))) return { problems: [{ range: null,
    reason: `there are no data rows under the header (rows ${found.headerRow}-${found.lastRow})` }] };

  // A repeated name would overwrite the first column's value in every record.
  // Names that differ only in case are refused too: a mapping that ignores
  // case would mix them up.
  const seen = new Map();
  for (const col of columns) {
    const first = seen.get(col.name.toLowerCase());
    if (!first) { seen.set(col.name.toLowerCase(), col); continue; }
    problems.push({ range: col.letter,
      reason: `column ${col.letter} has the same name as column ${first.letter}: "${first.name}"`,
      hint: "rename one of them" });
  }
  return problems.length ? { problems } : { columns, end };
}
'''

MH_TABLE = r'''// Reads the records under the header. Each record has its Excel row number.
function readGroupedTable(bytes, options) {
  const sheet = readSheet(bytes);
  const header = readHeader(sheet, options);
  const { rows, merges, origin } = sheet;
  if (header.problems) {
    return { columns: [], records: [], notes: [], problems: header.problems };
  }
  const records = [], notes = [];
  for (let r = header.end; r < rows.length; r++) {
    if (!rows[r].some(hasText)) continue; // blank row
    // fromEntries keeps a column named "__proto__" as an ordinary key.
    const values = Object.fromEntries(
      header.columns.map((col) => [col.name, rows[r][col.index] ?? null]));
    records.push({ row: r + origin.r + 1, values });
  }
  // A loop, not Math.max(...rows): spreading 100,000 rows overflows the stack.
  let width = 0;
  for (const row of rows) width = Math.max(width, row.length);
  const data = rows.slice(header.end);
  for (let c = 0; c < width; c++) {
    const named = header.columns.some((col) => col.index === c);
    if (!named && data.some((row) => hasText(row[c]))) notes.push({
      range: XLSX.utils.encode_col(c + origin.c),
      reason: "this column has data but no name, so it was left out" });
  }
  for (const m of merges) {
    const first = XLSX.utils.encode_cell({ r: m.top + origin.r, c: m.left + origin.c });
    if (m.top >= header.end) notes.push({ range: m.address,
      reason: `merged in the data: only ${first} holds the value` });
  }
  const columns = header.columns.map((col) => col.name);
  return { columns, records, notes, problems: [] };
}
'''

MH_EXAMPLE = r'''// file: a File from <input type="file">, inside an async change handler.
const bytes = new Uint8Array(await file.arrayBuffer());
const { columns, records, notes, problems } = readGroupedTable(bytes);
columns;
// [ 'Region', 'Rep', 'Q1 Revenue', 'Q1 Cost', 'Q2 Revenue', 'Q2 Cost' ]
records[0];
// { row: 3, values: { Region: 'North', Rep: 'Ana', 'Q1 Revenue': 100, 'Q1 Cost': 60, 'Q2 Revenue': 120, 'Q2 Cost': 70 } }
records[1].values.Region; // null
notes.map((n) => `${n.range}: ${n.reason}`);
// [ 'A3:A4: merged in the data: only A3 holds the value' ]
problems; // []
'''

MH_PROBLEMS = r'''// title, hole, layout and total hold the bytes of four small .xlsx files:
// title: "Sales 2026" merged across A1:C1, above the names Name, Rep, City in row 2.
// hole: "Name" merged over A1:A2; "Q1" merged across B1:C1, with "Revenue"
//   in B2 and nothing in C2.
// layout: "Name" in A1 and "Note" merged across B1:C1 only to make room;
//   row 2 is Ana's data: Ana, hi, 5.
// total: "Q1" merged across A1:B1 over Revenue and Cost; "Total" in C1 over
//   "Amount" in C2, not merged.
const reasons = (table) => table.problems.map((p) => `${p.range}: ${p.reason}`);
const titled = readGroupedTable(title);
reasons(titled);
// [ 'A1:C1: "Sales 2026" (A1:C1) spans every column, so it looks like a title' ]
titled.problems[0].hint; // 'pass headerRow: 2 if the names start there'
readGroupedTable(title, { headerRow: 2 }).columns; // [ 'Name', 'Rep', 'City' ]
reasons(readGroupedTable(hole));
// [ 'C2: "Q1" (B1:C1) has no column name under it here' ]
reasons(readGroupedTable(layout));
// [ 'A2: "Ana" is under "Name", which is not a group label, so row 2 looks like data' ]
reasons(readGroupedTable(total));
// [ 'C2: "Amount" is under "Total", which is not a group label, so row 2 looks like data' ]
'''
