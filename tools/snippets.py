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
EU_SPLIT = r'''function splitSign(raw) {
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
}'''
EU_TONUMBER = r'''const GROUPS = {
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
}'''
EU_LOCALE = r'''function localeSeparators(locale) {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.891);
  const find = (type) => parts.find((p) => p.type === type)?.value ?? "";
  return { group: find("group"), decimal: find("decimal") };
}

function parseLocaleNumber(raw, locale) {
  const s = splitSign(raw);
  return s ? toNumber(s, localeSeparators(locale).decimal) : null;
}'''
EU_DETECT = r'''function decimalVote(body) {
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
}'''
EU_COLUMN = r'''function parseNumberColumn(values, chosenLocale) {
  const decimal = detectDecimalSeparator(values)
    ?? (chosenLocale ? localeSeparators(chosenLocale).decimal : null);
  if (!decimal) return { decimal: null, numbers: null }; // show the column and ask
  const numbers = values.map((v) => {
    const s = splitSign(v);
    return s ? toNumber(s, decimal) : null; // null: empty or not a number, flag the cell
  });
  return { decimal, numbers };
}'''
