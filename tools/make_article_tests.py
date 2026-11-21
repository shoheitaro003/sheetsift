import sys; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from snippets import *
hdr_cjs = HDR_SHEETJS.replace('// npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz\nimport * as XLSX from "xlsx";\n', '')
excel_cjs = EXCEL.replace('// npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz\nimport * as XLSX from "xlsx";\n', 'const XLSX = require(process.env.XLSX_MODULE || "xlsx");\n')
xd_read_cjs = XD_READ.replace('// npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz\nimport * as XLSX from "xlsx";\n', '')
import json as _json
DEC_SAMPLES_TEXT = {
    "latin": 'Name,City,Amount\nMüller GmbH,Köln,"1.234,50 €"\nCafé Crème,Paris,“12,00”\nJosé Peña,São Paulo,–5\nÅsa Ørsted,Århus,99\nà la carte,Zürich,1\n',
    "latinEnd": "Name\nJosé",
    "japanese": "氏名,住所,金額\n山田太郎,東京都千代田区一丁目,1200\n株式会社テスト,福岡県,￥300\n",
    "kanjiOnly": "東京都,大阪府\n",
    "halfKana": "ﾌﾘｶﾞﾅ,金額\nｶﾌﾞｼｷｶﾞｲｼｬ ﾔﾏﾀﾞ,500\n",
    "eucjp": "氏名,住所\n山田太郎,東京都です\n",
    "cyrillic": "Имя,Город\nИв\u0430н,Москв\u0430\n",
    "yen": "Item,Price\nPen,100円\nBook,1200円\n",
    "kanjiDate": "Date,Qty\n2024年1月5日,3\n",
    "quotes": "Note\nl’été, José’s café, “Zoë”, „Grüße“, Škoda, Œuvre\n",
    "ellipsis": "Note\nCafé…\n",
    "macRoman": "Name,City\nMüller,Köln\n",
}
DEC_SAMPLES_HEX = {f"{k}:{e}": DEC_SAMPLES_TEXT[k].encode(e).hex() for k, e in [
    ("latin", "cp1252"), ("latinEnd", "cp1252"), ("japanese", "cp932"), ("kanjiOnly", "cp932"),
    ("halfKana", "cp932"), ("eucjp", "euc_jp"), ("cyrillic", "cp1251"),
    ("yen", "cp932"), ("kanjiDate", "cp932"), ("quotes", "cp1252"),
    ("ellipsis", "cp1252"), ("macRoman", "mac_roman")]}
out = f'''// Runs every code example from the blog posts. Run: node tests/article-examples.cjs
// Generated from the same source as the article, so the two never drift apart.
const assert = require("assert");
let n = 0;
const ok = (name, fn) => {{ Promise.resolve().then(fn).then(() => {{ n++; console.log("PASS " + name); }}).catch((e) => {{ console.log("FAIL " + name + "  -> " + e.message); process.exitCode = 1; }}); }};

{HEADER}

{TOTALS}

{DATES}

{NUMBERS}

{ENCODING}

ok("header on row 3", () => assert.strictEqual(findHeaderRow([["Export (do not edit)"], [], ["Name", "Email", "Plan"], ["Yui", "yui@example.jp", "Pro"]]), 2));
ok("header on row 1", () => assert.strictEqual(findHeaderRow([["Name", "Email"], ["A", "a@example.com"]]), 0));
ok("totals rows", () => {{ assert(isTotalsRow(["Total", "", "227"])); assert(isTotalsRow(["", "Grand total", "9"])); assert(isTotalsRow(["合計", "", "1"])); assert(isTotalsRow(["Summe", "1"])); assert(!isTotalsRow(["Totally Fit Ltd", "x"])); }});
ok("date order", () => {{ assert.strictEqual(dateOrder(["04/05/2026", "31/01/2026"]), "dmy"); assert.strictEqual(dateOrder(["04/05/2026", "01/31/2026"]), "mdy"); assert.strictEqual(dateOrder(["04/05/2026"]), null); }});
ok("amounts", () => {{ assert.strictEqual(parseAmount("1.234,50", true), 1234.5); assert.strictEqual(parseAmount("1,234.50", false), 1234.5); assert.strictEqual(parseAmount("49,00", usesDecimalComma(["49,00", "129"])), 49); assert.strictEqual(parseAmount("€ 99,90", true), 99.9); assert.strictEqual(parseAmount("abc", false), null); }});
const file = (bytes) => ({{ arrayBuffer: async () => Uint8Array.from(bytes).buffer }});
ok("utf-8 text", async () => assert.strictEqual(await readText(file([...Buffer.from("Café")])), "Café"));
ok("utf-16 with BOM", async () => assert.strictEqual(await readText(file([0xff, 0xfe, ...Buffer.from("Hi", "utf16le")])), "Hi"));
ok("windows-1252 fallback", async () => assert.strictEqual(await readText(file([0x43, 0x61, 0x66, 0xe9])), "Café"));
ok("shift_jis decoder exists", () => assert.strictEqual(new TextDecoder("shift_jis").decode(Uint8Array.from([0x93, 0xfa, 0x96, 0x7b])), "日本"));

// --- blog/parse-european-number-formats-javascript ---
{EU_SPLIT}

{EU_TONUMBER}

{EU_LOCALE}

{EU_DETECT}

{EU_COLUMN}

ok("eu: the problem is real", () => {{ assert.strictEqual(parseFloat("1.234,56"), 1.234); assert(Number.isNaN(Number("1.234,56"))); assert(Number.isNaN(Number("1,234.56"))); assert.strictEqual(parseFloat("1,234.56"), 1); assert.strictEqual(typeof Intl.NumberFormat.prototype.parse, "undefined"); assert.strictEqual(String(Number("12345678901234567891")), "12345678901234567000"); }});
ok("eu: splitSign accepts real formats", () => {{
  const b = (v) => {{ const s = splitSign(v); return s && (s.negative ? "-" : "") + s.body; }};
  const cases = {{
    "1.234,56": "1.234,56", "-1.234,56 €": "-1.234,56", "1.234,56-": "-1.234,56", "(1,234.56)": "-1,234.56",
    "(€1,234.56)": "-1,234.56", "\\u22121 234,56": "-1234,56", "EUR 1.234,56": "1.234,56", "1.234,56EUR": "1.234,56",
    "1’234.50 CHF": "1234.50", "1'234'567.50": "1234567.50", "-€1,234.56": "-1,234.56", "€-1,234.56": "-1,234.56",
    "+€5": "5", "€+5": "5", "R$ 1.234,56": "1.234,56", "kr 1 234,56": "1234,56", "1.234,56 kr.": "1.234,56",
    "kr. 1.234,56": "1.234,56", "1 234,56 zł": "1234,56", "₩1,234": "1,234", "+12": "12",
    "1 234,56\\u202f€": "1234,56", "1\\u00a0234,56": "1234,56", "1\\u202f234\\u202f567,89": "1234567,89",
  }};
  for (const [input, want] of Object.entries(cases)) assert.strictEqual(b(input), want, input);
}});
ok("eu: splitSign rejects what it cannot prove", () => {{
  for (const v of ["", null, "n/a", "12abc34", "ISO9001", "ABC123", "12 PCS", "2,5 Mio", "1,5 MRD", "100 TSD", "12k", "1,5E+03",
                   "1$234", "$1$2", "1€2", "$5€", "10 20", "2026 11", "1 23,4", "12'3", "1'000'00", "030 123 456", "0 500", "1 234'567",
                   "(-5)", "(\\u22125)", "(5-)", "-5-", "EURO", "\\u0661\\u0662\\u0663", "\\uff11,234"])
    assert.strictEqual(splitSign(v), null, String(v));
}});
ok("eu: toNumber", () => {{
  const n = (b, d, opts) => toNumber({{ negative: false, body: b }}, d, opts);
  assert.strictEqual(n("1.234,56", ","), 1234.56); assert.strictEqual(n("1,234.56", "."), 1234.56);
  assert.strictEqual(n("1.234.567", ","), 1234567); assert.strictEqual(n(",5", ","), 0.5); assert.strictEqual(n("0,5", ","), 0.5);
  assert.strictEqual(toNumber({{ negative: true, body: "1234,56" }}, ","), -1234.56);
  assert.strictEqual(n("12,34,567.89", ".", {{ indian: true }}), 1234567.89);
  assert.strictEqual(n("123456789012345", "."), 123456789012345);
  for (const [b, d] of [["1,2,3", ","], ["1,23.4", ","], ["1.23", ","], ["1.2345", ","], ["1,", ","], ["1.", "."], ["030.123.456", ","],
                        ["07.11.2026", ","], ["12,34,567.89", "."], ["1.23.456", ","], ["12.34.567", ","], ["1234567890123456", "."],
                        ["1.234.567.890.123.456.789", ","]])
    assert.strictEqual(n(b, d), null, b);
  assert.strictEqual(n("1.23.456", ",", {{ indian: true }}), null); // Indian grouping only with commas
}});
ok("eu: locale separators (ICU)", () => {{
  assert.deepStrictEqual(localeSeparators("de-DE"), {{ group: ".", decimal: ",", indian: false }});
  assert.deepStrictEqual(localeSeparators("en-US"), {{ group: ",", decimal: ".", indian: false }});
  assert.deepStrictEqual(localeSeparators("fr-FR"), {{ group: "\\u202f", decimal: ",", indian: false }});
  assert.deepStrictEqual(localeSeparators("en-IN"), {{ group: ",", decimal: ".", indian: true }});
  const ch = localeSeparators("de-CH"); assert.strictEqual(ch.decimal, "."); assert.match(ch.group, /^['’]$/);
  assert.strictEqual(localeSeparators("xx_YY"), null);
  const table = {{ "en-US": "1,234,567.89", "en-GB": "1,234,567.89", "ja-JP": "1,234,567.89", "de-DE": "1.234.567,89", "it-IT": "1.234.567,89",
                  "es-ES": "1.234.567,89", "nl-NL": "1.234.567,89", "pt-BR": "1.234.567,89", "fr-FR": "1\\u202f234\\u202f567,89", "en-IN": "12,34,567.89" }};
  for (const [l, want] of Object.entries(table)) assert.strictEqual(new Intl.NumberFormat(l).format(1234567.89), want, l);
  assert.match(new Intl.NumberFormat("de-CH").format(1234567.89), /^1['’]234['’]567\\.89$/);
  for (const l of ["es-ES", "it-IT", "pl-PL"]) assert.strictEqual(new Intl.NumberFormat(l).format(1234.56).replace(/\\s/g, " "), "1234,56", l);
  for (const l of [...Object.keys(table), "de-CH", "de-AT", "pl-PL", "he-IL", "sv-SE"])
    assert.strictEqual(parseLocaleNumber(new Intl.NumberFormat(l).format(-1234567.891), l), -1234567.891, l);
}});
ok("eu: parseLocaleNumber", () => {{
  assert.strictEqual(parseLocaleNumber("1.234,56", "de-DE"), 1234.56);
  assert.strictEqual(parseLocaleNumber("1.234,56", "en-US"), null);
  assert.strictEqual(parseLocaleNumber(1.234, "de-DE"), 1.234);
  assert.strictEqual(parseLocaleNumber("1.234", "fr-FR"), 1234); assert.strictEqual(parseLocaleNumber(new Intl.NumberFormat("de-AT", {{ style: "currency", currency: "EUR" }}).format(1234.5), "de-AT"), 1234.5); assert.strictEqual(parseLocaleNumber("1\\n234", "en-US"), null); assert.strictEqual(parseLocaleNumber("1\\t234", "en-US"), null); assert.strictEqual(parseLocaleNumber("01067", "de-DE"), null); assert.strictEqual(parseLocaleNumber("007", "en-US"), null); assert.ok(Object.is(parseLocaleNumber("-0", "en-US"), 0)); assert.ok(Object.is(parseLocaleNumber("(0)", "en-US"), 0)); assert.strictEqual(parseLocaleNumber("0,5", "de-DE"), 0.5); for (const l of ["de-AT", "fr-FR", "pl-PL"]) assert.strictEqual(parseLocaleNumber("1.234,56", l), 1234.56, l); for (const v of ["(€5)", "€(5)", "-€5"]) assert.strictEqual(parseLocaleNumber(v, "en-US"), -5, v);
  assert.strictEqual(parseLocaleNumber("1 234,5", "fr-FR"), 1234.5);
  assert.strictEqual(parseLocaleNumber("1.234", "ar-EG"), null);
  assert.strictEqual(parseLocaleNumber("1", "xx_YY"), null);
  assert.strictEqual(parseLocaleNumber("12,34,567", "en-IN"), 1234567);
  assert.strictEqual(parseLocaleNumber("1,23,456", "en-US"), null);
  assert.strictEqual(parseLocaleNumber("030 123 456", "de-DE"), null);
}});
ok("eu: detect decimal separator", () => {{
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
  assert.deepStrictEqual(columnVotes(["1.234,56", "-99,90 €", "1.000-"]), {{ ".": 0, ",": 2 }});
}});
ok("eu: parse a column", () => {{
  assert.deepStrictEqual(parseNumberColumn(["1.234,56", "-99,90 €", "1.000-", "", "n/a"]), {{ decimal: ",", numbers: [1234.56, -99.9, -1000, null, null], ask: null }});
  assert.deepStrictEqual(parseNumberColumn(["1,234", "5,678"]), {{ decimal: null, numbers: null, ask: "no clear format" }});
  assert.deepStrictEqual(parseNumberColumn(["1,234", "5,678"], "de-DE"), {{ decimal: ",", numbers: [1.234, 5.678], ask: null }});
  assert.deepStrictEqual(parseNumberColumn(["1,234", "5,678", "9.99"], "de-DE").ask, "data disagrees with the chosen locale");
  assert.deepStrictEqual(parseNumberColumn(["1.234", "2.500", "3,5"], "en-US").ask, "data disagrees with the chosen locale");
  assert.deepStrictEqual(parseNumberColumn(["1.234", "2.500", "12.000"], "en-US").numbers, [1.234, 2.5, 12]); // nothing in the data can tell
  assert.deepStrictEqual(parseNumberColumn(["1.234", "5.678"], "fr-FR").numbers, [1234, 5678]); assert.deepStrictEqual(parseNumberColumn(["1.234,56", "2.500,00", "99,90"], "de-AT").numbers, [1234.56, 2500, 99.9]);
  assert.deepStrictEqual(parseNumberColumn(["1,5", "2,5"], "ar-EG").ask, "locale not supported");
  assert.deepStrictEqual(parseNumberColumn(["1"], "xx_YY").ask, "locale not supported");
  assert.deepStrictEqual(parseNumberColumn(["1.234,56", "1.000-", "", "n/a"]).ask, "no clear format");
  assert.deepStrictEqual(parseNumberColumn(["-99,90 €", "1.000-", "", "n/a"]).ask, "no clear format");
  assert.strictEqual(parseLocaleNumber("2020-", "en-US"), -2020);
  assert.deepStrictEqual(parseNumberColumn([1.234, "2,5", "3,75"]), {{ decimal: ",", numbers: [1.234, 2.5, 3.75], ask: null }});
}});

// --- blog/detect-header-row-spreadsheet-javascript ---
{HDR_KIND}

{HDR_SCORE}

{HDR_FIND}

{HDR_RECORDS}

ok("hdr: the naive rules fail", () => {{
  const kv = [["Report", "Monthly sales"], ["Owner", "Ken"], ["Date", "Amount", "Date", "Amount"], ["2026-01-01", "5", "2026-01-02", "6"]];
  assert.strictEqual(findHeaderRow(kv), 0); // widest unique text row: duplicate names knock out the real header
  assert.strictEqual(findHeader(kv).row, 2);
}});
ok("hdr: cellKind", () => {{
  for (const v of [49, 0, true, new Date(), "49", "-5", "(1,234.56)", "1.234,56 €", "€ 99,90", "12%", "\\u22125", "1\\u00a0234,56", "2026-11-08", "08/11/2026", "8.11.2026", "2026-11-08 09:30", "09:30", "yui@example.jp"])
    assert.strictEqual(cellKind(v), "value", String(v));
  for (const v of ["Name", "E-mail", "Q1 2026", "MRR ($)", "Prepared by:", "090-1234-5678", "ID-0042", "2026-Q1", "May I help", "1/2"])
    assert.strictEqual(cellKind(v), "label", v);
  for (const v of ["2026-11-08T10:00:00Z", "2026-11-08T10:00:00.123+09:00", "10:30 AM", "TRUE", "false", "Nov 8, 2026", "November 8th, 2026", "8-Nov-2026", "8 Nov 26", "1e5", "-2.5E-3", "+81 90 1234 5678", "1.2.3.4"])
    assert.strictEqual(cellKind(v), "value", v);
  for (const v of ["", "  ", null, undefined, "N/A", "n/a", "#N/A", "-", "\u2014", "?", "null", "None"]) assert.strictEqual(cellKind(v), "empty", String(v));
}});
ok("hdr: finds the header in real layouts", () => {{
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
  for (const [rows, want] of cases) assert.deepStrictEqual(findHeader(rows), {{ row: want, sure: true, why: "column names above typed values" }}, JSON.stringify(rows[want]));
}});
ok("hdr: says when it is not sure", () => {{
  const why = (rows) => {{ const f = findHeader(rows); assert.strictEqual(f.sure, false); return [f.row, f.why]; }};
  assert.deepStrictEqual(why([["Name", "City"], ["Yui", "Osaka"], ["Ken", "Kyoto"]]), [0, "no typed values under it, so the header cannot be confirmed"]);
  assert.deepStrictEqual(why([["Name", "Amount"], ["Yui", "5"], ["Ken", "7"], [], ["Product", "Units"], ["Tea", "3"]]), [0, "another row is almost as likely"]);
  assert.deepStrictEqual(why([["", "Q1", "", "Q2", ""], ["Name", "Revenue", "Cost", "Revenue", "Cost"], ["Tea", "100", "40", "120", "50"]]), [1, "the row above may be part of the header"]);
  assert.deepStrictEqual(why([["Customer", "", "Contact", ""], ["Name", "Plan", "Email", "Phone"], ["Yui", "Pro", "yui@example.jp", "090-1234-5678"]]), [1, "the row above may be part of the header"]);
  assert.deepStrictEqual(why([["Owner", "", "Ken"], ["Name", "Email", "MRR"], ["Yui", "yui@example.jp", "49"]]), [1, "the row above may be part of the header"]); // a false alarm: asks, never guesses
  for (const rows of [[], [[], [], []], [["Yui", "yui@example.jp", "49"], ["Ken", "ken@example.com", "0"]], [["Region", "2024", "2025"], ["North", "1200", "1350"], ["South", "900", "1010"]], [[1, 2], [3, 4]]])
    assert.deepStrictEqual(findHeader(rows), {{ row: null, sure: false, why: "no row looks like column names" }}, JSON.stringify(rows));
}});
ok("hdr: claims in the text", () => {{
  assert.strictEqual(findHeader([["Region", "Product", "Channel", "2026"], ["North", "Tea", "Web", "1200"], ["South", "Rice", "Shop", "900"]]).row, 0); // one numeric header
  assert.deepStrictEqual(findHeader([["Title"], ["Name", "MRR"], ["Yui", ""], ["Ken", "49"]]), {{ row: 1, sure: true, why: "column names above typed values" }}); // blank first value
  const csv = "Monthly sales\\n\\nName,MRR\\nYui,49\\nKen,0".split("\\n").map((line) => line.split(","));
  assert.strictEqual(findHeader(csv).row, 2);
  const shortFile = [["Note 1"], ["Note 2"], ["Note 3"], ["Note 4"], ["Note 5"], ["Name", "MRR"], ["Yui", 49], ["Ken", 0]];
  assert.strictEqual(findHeader(shortFile).row, 5); // notes outnumber data rows: contrast still wins
}});
ok("hdr: review findings", () => {{
  assert.deepStrictEqual(findHeader([["Name", "Amount"], ["a", "N/A"], ["b", "-"], ["c", 3]]).row, 0);
  for (const rows of [[["Name", "Email"], ["Ann", "Ann at acme"], ["Bob", "b@x.co"]], [["Name", "Email"], ["Ann", "Ann at acme"], ["Bob", "b@x.co"], ["Cy", "c@x.co"]]])
    assert.deepStrictEqual(findHeader(rows), {{ row: 1, sure: false, why: "the row above may be part of the header" }}); // a bad first value: flagged, not trusted
  assert.deepStrictEqual(findHeader([["Name", "Joined"], ["Yui", "2026-11-08T10:00:00Z"], ["Ken", "Nov 8, 2026"]]).sure, true);
  assert.deepStrictEqual(findHeader([["Export"], ["Name", "Phone", "Plan", "MRR"], ["Yui", "090-1234-5678", "Pro", 49], ["Ken", "+81 90 1234 5678", "Free", 0]]), {{ row: 1, sure: false, why: "another row is almost as likely" }}); // mostly text columns: right row, flagged
  const holes = [["A", "B"], , ["1", "2"], undefined, ["3", "4"]];
  assert.strictEqual(findHeader(holes).row, 0);
  assert.deepStrictEqual(toRecords(holes, 0).map((r) => r.row), [3, 5]);
  assert.deepStrictEqual(findHeader([["Name", "Amount"], ["x", 1, 2, 3, 4], ["y", 5, 6, 7, 8]]).row, null); // narrower header: listed as a limit
  assert.deepStrictEqual(toRecords([["A", "Column C", ""], [1, 2, 3]], 0)[0].values, {{ A: 1, "Column C": 2, "Column C (2)": 3 }});
  for (const v of ["#DIV/0!", "#VALUE!", "#REF!", "#NAME?", "#N/A"]) assert.strictEqual(cellKind(v), "empty", v);
  for (const v of ["No", "yes", "#ID", "#1", "Jan 2026"]) assert.strictEqual(cellKind(v), "label", v);
  assert.deepStrictEqual(findHeader([["No", "Name", "Date"], [1, "Yui", "2026-01-01"], [2, "Ken", "2026-01-02"]]).row, 0);
  assert.deepStrictEqual(findHeader([["#ID", "Name"], [1, "Yui"], [2, "Ken"]]).row, 0);
  assert.deepStrictEqual(toRecords([["Yui"]], null), []);
  for (const v of ["#NUM!", "#NULL!", "#SPILL!", "#CALC!"]) assert.strictEqual(cellKind(v), "empty", v);
  for (const v of ["5 kg", "USD 5"]) assert.strictEqual(cellKind(v), "label", v); // listed as a limit
  assert.deepStrictEqual(findHeader([["Report", "Sales"], ["Owner", "Ken"], ["Name", "Amount"], ["Yui", 5], ["Ken", 7]]), {{ row: 2, sure: false, why: "the row above may be part of the header" }});
  assert.deepStrictEqual(findHeader([["Item", "Weight", "Price"], ["", "kg", "USD"], ["Tea", 5, 4.5], ["Rice", 2, 3]]).row, 1); // units row: flagged, listed as a limit
  assert.strictEqual(findHeader([["Item", "Weight", "Price"], ["", "kg", "USD"], ["Tea", 5, 4.5], ["Rice", 2, 3]]).sure, false);
  assert.deepStrictEqual(findHeader([["Name", "Email"]]), {{ row: 0, sure: false, why: "no typed values under it, so the header cannot be confirmed" }});
  const proto = toRecords([["__proto__", "b"], ["x", 2]], 0)[0].values;
  assert.strictEqual(Object.getPrototypeOf(proto), Object.prototype);
  assert.deepStrictEqual(Object.keys(proto), ["__proto__", "b"]); assert.strictEqual(proto["__proto__"], "x");
}});
ok("hdr: scan limit", () => {{
  const rows = [...Array.from({{ length: 25 }}, () => []), ["Name", "Amount"], ["Yui", 5], ["Ken", 7]];
  assert.strictEqual(findHeader(rows).row, null);
  assert.strictEqual(findHeader(rows, {{ scan: 30 }}).row, 25);
}});
ok("hdr: columnNames", () => {{
  const none = () => false, all = () => true;
  assert.deepStrictEqual(columnNames(["Amount", "amount", " Amount ", "", "Amount (2)"], none), ["Amount", "amount (3)", "Amount (4)", null, "Amount (2)"]);
  assert.deepStrictEqual(columnNames(["Amount", "amount", "Amount (2)"], none), ["Amount", "amount (3)", "Amount (2)"]);
  assert.deepStrictEqual(columnNames(["A", "", "Column B"], all), ["A", "Column B (2)", "Column B"]);
  assert.deepStrictEqual(columnNames(["A", ""], all, 1), ["A", "Column C"]);
  assert.deepStrictEqual([0, 25, 26, 27, 701, 702].map(columnLetter), ["A", "Z", "AA", "AB", "ZZ", "AAA"]);
}});
ok("hdr: toRecords", () => {{
  const rows = [["Report"], [], ["Name", "Amount", "", "Amount"], ["Yui", 5, "", 6], [], ["Name", "Amount", "", "Amount"], ["Ken", 7, "x", 8], ["Ann"]];
  assert.deepStrictEqual(toRecords(rows, 2), [
    {{ row: 4, values: {{ Name: "Yui", Amount: 5, "Column C": "", "Amount (2)": 6 }} }},
    {{ row: 7, values: {{ Name: "Ken", Amount: 7, "Column C": "x", "Amount (2)": 8 }} }},
    {{ row: 8, values: {{ Name: "Ann", Amount: "", "Column C": "", "Amount (2)": "" }} }},
  ]);
  assert.deepStrictEqual(toRecords([["Name", ""], ["Yui", ""]], 0), [{{ row: 2, values: {{ Name: "Yui" }} }}]);
  assert.deepStrictEqual(toRecords([["Name"], ["Yui"]], 0, {{ row: 4, col: 0 }})[0].row, 6);
}});
'''
if len(sys.argv) > 1:
    out += f'''
{excel_cjs}

{hdr_cjs}
ok("hdr: readTable with SheetJS", async () => {{
  const sheet = XLSX.utils.aoa_to_sheet([["Export (do not edit)"], [], ["Name", "Joined", "MRR"], ["Yui", new Date(Date.UTC(2026, 3, 3)), 49], ["Ken", new Date(Date.UTC(2026, 3, 4)), 0]], {{ origin: "B3", cellDates: true }});
  sheet["!ref"] = "B3:D7"; // as saved by tools that only record the used range
  sheet["D6"].z = "#,##0.00 \\"€\\"";
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, sheet, "Data");
  const bytes = XLSX.write(wb, {{ type: "array", bookType: "xlsx" }});
  const raw = XLSX.utils.sheet_to_json(XLSX.read(bytes).Sheets.Data, {{ header: 1, defval: "", blankrows: true }});
  assert.deepStrictEqual(raw[2], ["Name", "Joined", "MRR"]); // index 2, although the header is on row 5
  const t = await readTable({{ arrayBuffer: async () => bytes }});
  assert.strictEqual(t.sure, true); assert.strictEqual(t.headerRow, 5);
  assert.deepStrictEqual(t.records.map((r) => r.row), [6, 7]);
  assert.deepStrictEqual(Object.keys(t.records[0].values), ["Name", "Joined", "MRR"]);
  assert.strictEqual(t.records[0].values.MRR, 49);
  assert.ok(t.records[0].values.Joined instanceof Date);
  const plain = XLSX.utils.sheet_to_json(XLSX.utils.aoa_to_sheet([["Date", "Amount", "Date", "Amount"], ["a", 1, "b", 2]]));
  assert.deepStrictEqual(Object.keys(plain[0]), ["Date", "Amount", "Date_1", "Amount_1"]);
  const repeated = XLSX.utils.sheet_to_json(XLSX.utils.aoa_to_sheet([["Name", "MRR"], ["Yui", 49], ["Name", "MRR"], ["Ken", 0]]));
  assert.deepStrictEqual(repeated[1], {{ Name: "Name", MRR: "MRR" }}); // the default keeps a repeated header as data
  const none = await readTable({{ arrayBuffer: async () => XLSX.write((() => {{ const w = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet([[1, 2], [3, 4]]), "S"); return w; }})(), {{ type: "array", bookType: "xlsx" }}) }});
  assert.deepStrictEqual([none.row, none.headerRow, none.records], [null, null, []]);
}});
ok("excel: skips empty first sheet and returns ISO dates", async () => {{
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "Cover");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Name", "Joined"], ["A", new Date(Date.UTC(2026, 3, 3))]]), "Data");
  const bytes = XLSX.write(wb, {{ type: "array", bookType: "xlsx" }});
  const rows = await readWorkbook({{ arrayBuffer: async () => bytes }});
  assert.deepStrictEqual(rows[0], ["Name", "Joined"]);
  assert.match(String(rows[1][1]), /^2026-04-0[23]$/);
}});

// --- blog/read-excel-dates-javascript-sheetjs ---
{XD_KIND}

{XD_SERIAL}

{xd_read_cjs}

const {{ execFileSync }} = require("child_process");
const XLSX_PATH = require.resolve(process.env.XLSX_MODULE || "xlsx");
// Runs a snippet exactly as printed, in a fresh Node process with the given time zone,
// and returns the value of every line that ends in a comment such as `x; // 4`.
function runSnippet(tz, setup, snippet) {{
  const body = snippet.split("\\n").map((line) => {{
    const m = /^([^/ ].*?);\\s*\\/\\/ /.exec(line);
    return m && !/^(const|let) /.test(m[1]) ? `out.push(${{m[1]}});` : line;
  }}).join("\\n");
  const code = `const XLSX = require(${{JSON.stringify(XLSX_PATH)}}); const out = [];\\n${{setup}}\\n${{body}}\\nprocess.stdout.write(JSON.stringify(out));`;
  return JSON.parse(execFileSync(process.execPath, ["-e", code], {{ env: {{ ...process.env, TZ: tz }} }}).toString());
}}
const XD_JOINED_SETUP = `const bytes = XLSX.write({{ SheetNames: ["Sheet1"], Sheets: {{ Sheet1: {{ "!ref": "A1:A3",
  A1: {{ t: "s", v: "Joined" }}, A2: {{ t: "n", v: 46027, z: "yyyy-mm-dd" }}, A3: {{ t: "n", v: 60, z: "m/d/yy" }} }} }} }}, {{ type: "buffer", bookType: "xlsx" }});`;

ok("xd: the one-line formula depends on the time zone", () => {{
  const snippet = {_json.dumps(XD_FORMULA)};
  assert.deepStrictEqual(runSnippet("America/Los_Angeles", "", snippet), ["2026-01-05T00:00:00.000Z", 4, "1/4/2026", "1900-02-27"]);
  assert.deepStrictEqual(runSnippet("Asia/Tokyo", "", snippet), ["2026-01-05T00:00:00.000Z", 5, "1/5/2026", "1900-02-27"]);
  assert.strictEqual(XLSX.SSF.format("m/d/yyyy", 59), "2/28/1900");
  assert.strictEqual(XLSX.SSF.format("m/d/yyyy", 60), "2/29/1900");
}});
ok("xd: cellDates gives UTC dates in cells but local dates from sheet_to_json", () => {{
  const snippet = {_json.dumps(XD_CELLDATES)};
  assert.deepStrictEqual(runSnippet("Asia/Tokyo", XD_JOINED_SETUP, snippet), ["2026-01-05T00:00:00.000Z", "2026-01-04T15:00:00.000Z", 60]);
  assert.deepStrictEqual(runSnippet("America/Los_Angeles", XD_JOINED_SETUP, snippet), ["2026-01-05T00:00:00.000Z", "2026-01-05T08:00:00.000Z", 60]);
  assert.deepStrictEqual(runSnippet("UTC", XD_JOINED_SETUP, snippet), ["2026-01-05T00:00:00.000Z", "2026-01-05T00:00:00.000Z", 60]);
  const wb1904 = XLSX.write({{ SheetNames: ["S"], Sheets: {{ S: {{ "!ref": "A1", A1: {{ t: "n", v: 44565, z: "m/d/yy" }} }} }}, Workbook: {{ WBProps: {{ date1904: true }} }} }}, {{ type: "buffer", bookType: "xlsx" }});
  assert.strictEqual(XLSX.read(wb1904, {{ cellDates: true }}).Sheets.S.A1.v.toISOString(), "2026-01-05T00:00:00.000Z"); // handles 1904
  assert.strictEqual(XLSX.read(wb1904).Sheets.S.A1.v, 44565); // numbers by default
}});
ok("xd: the smallest fix for sheet_to_json", () => {{
  const snippet = {_json.dumps(XD_QUICKFIX)};
  for (const tz of ["America/Los_Angeles", "Asia/Tokyo", "UTC"]) assert.deepStrictEqual(runSnippet(tz, XD_JOINED_SETUP, snippet), ["2026-01-05", 5], tz);
  const left = runSnippet("America/Los_Angeles", XD_JOINED_SETUP, snippet + "\\nrows[2][0]; // 60\\nrows[1][0].getDate(); // 4");
  assert.deepStrictEqual(left, ["2026-01-05", 5, 60, 4]);
  const timeOnly = runSnippet("UTC", `const bytes = XLSX.write({{ SheetNames: ["S"], Sheets: {{ S: {{ "!ref": "A1", A1: {{ t: "n", v: 0.75, z: "hh:mm" }} }} }} }}, {{ type: "buffer", bookType: "xlsx" }});
    const t = XLSX.utils.sheet_to_json(XLSX.read(bytes, {{ cellDates: true }}).Sheets.S, {{ header: 1, UTC: true }})[0][0];`, "t.toISOString(); // x");
  assert.deepStrictEqual(timeOnly, ["1899-12-31T18:00:00.000Z"]); // a time becomes a date in December 1899
}});
ok("xd: ISO strings back to Date", () => {{
  assert.deepStrictEqual(runSnippet("America/Los_Angeles", "", 'new Date("2026-01-05").toISOString(); // a\\nnew Date("2026-01-05T13:30:00").toISOString(); // b'),
    ["2026-01-05T00:00:00.000Z", "2026-01-05T21:30:00.000Z"]);
}});
ok("xd: no Date cells without cellDates, raw CSV is all text", () => {{
  const ws = {{ "!ref": "A1:A2", A1: {{ t: "d", v: new Date(Date.UTC(2026, 0, 5)) }}, A2: {{ t: "d", v: new Date(Date.UTC(2026, 0, 5, 13, 30)), z: "yyyy-mm-dd hh:mm" }} }};
  for (const opts of [{{}}, {{ cellDates: true }}]) {{
    const back = XLSX.read(XLSX.write({{ SheetNames: ["S"], Sheets: {{ S: ws }} }}, {{ type: "buffer", bookType: "xlsx", ...opts }}), {{ cellNF: true }}).Sheets.S;
    assert.deepStrictEqual([back.A1.t, back.A1.v, back.A2.t, back.A2.v], ["n", 46027, "n", 46027.5625]);
  }}
  const csv = XLSX.read("a\\n12.5\\n2026-01-05", {{ type: "string", raw: true }}).Sheets.Sheet1;
  assert.deepStrictEqual([csv.A2.v, csv.A3.v], ["12.5", "2026-01-05"]);
  assert.deepStrictEqual(XLSX.SSF.parse_date_code(60), {{ D: 60, T: 0, u: 0, y: 1900, m: 2, d: 29, H: 0, M: 0, S: 0, q: 3 }}); // no warning
  assert.strictEqual(XLSX.SSF.parse_date_code(44565, {{ date1904: true }}).y, 2026);
}});
ok("xd: SheetJS reads CSV dates month first unless raw is set", () => {{
  const snippet = {_json.dumps(XD_CSV)};
  for (const tz of ["UTC", "Asia/Tokyo"]) assert.deepStrictEqual(runSnippet(tz, "", snippet), [46085, "31/12/2026", "03/04/2026"]);
  assert.strictEqual(serialToISO(46085, "date").value, "2026-03-04");
}});
ok("xd: dateFormatKind", () => {{
  const cases = {{
    "yyyy-mm-dd": "date", "m/d/yy": "date", "dd/mm/yyyy;@": "date", "[$-409]mmmm d, yyyy": "date", "mmm-yy": "date",
    "mmmm": "date", "d-mmm": "date", "yyyy\\\\-mm\\\\-dd": "date", '"Due "yyyy-mm-dd': "date", 'yyyy"年"m"月"d"日"': "date",
    "yyyy-mm-dd hh:mm": "datetime", "dd.mm.yyyy hh:mm:ss": "datetime", "m/d/yy h:mm AM/PM": "datetime",
    "hh:mm": "time", "mm:ss": "time", "h:mm AM/PM": "time", "[h]:mm:ss": "duration", "[mm]:ss": "duration",
    "0.00": null, "General": null, "#,##0": null, "[Red]0.00": null, "0%": null, "0.00E+00": null, "@": null,
    '"h"0': null, '0.00" days"': null, '#,##0.00 "€"': null, "[$€-407] #,##0.00": null, "_(* #,##0_)": null,
    "0;[Red]-0": null, "": null,
  }};
  for (const [format, want] of Object.entries(cases)) {{
    assert.strictEqual(dateFormatKind(format), want, format);
    assert.strictEqual(XLSX.SSF.is_date(format), want !== null, "SheetJS agrees: " + format);
  }}
  for (const v of [undefined, null, 14]) assert.strictEqual(dateFormatKind(v), null);
}});
ok("xd: serialToISO edge cases", () => {{
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
  for (let minute = 0; minute < 1440; minute++) {{
    const serial = 46027 + minute / 1440;
    if (Math.floor((serial % 1) * 86400) !== minute * 60) cut++;
    assert.strictEqual(v(serial, "time"), `${{String(Math.floor(minute / 60)).padStart(2, "0")}}:${{String(minute % 60).padStart(2, "0")}}:00`);
  }}
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
}});
ok("xd: serialToISO agrees with the SheetJS formatter", () => {{
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 20000; i++) {{
    const serial = 61 + random() * 60000;
    assert.strictEqual(serialToISO(serial, "date").value, XLSX.SSF.format("yyyy-mm-dd", serial), String(serial));
    assert.strictEqual(serialToISO(serial, "datetime").value, XLSX.SSF.format("yyyy-mm-dd hh:mm:ss", serial).replace(" ", "T"), String(serial));
    assert.strictEqual(serialToISO(serial, "time").value, XLSX.SSF.format("hh:mm:ss", serial), String(serial));
    assert.strictEqual(serialToISO(serial, "date", true).value, XLSX.SSF.format("yyyy-mm-dd", serial, {{ date1904: true }}), "1904 " + serial);
  }}
  for (let serial = 1; serial < 60; serial++) assert.strictEqual(serialToISO(serial, "date").value, XLSX.SSF.format("yyyy-mm-dd", serial));
}});
const xdFile = (wb) => ({{ arrayBuffer: async () => XLSX.write(wb, {{ type: "array", bookType: "xlsx" }}) }});
ok("xd: readSheetCells on a workbook", async () => {{
  const n = (v, z) => ({{ t: "n", v, z }});
  const sheet = {{ "!ref": "B2:C11",
    B2: {{ t: "s", v: "What" }}, C2: {{ t: "s", v: "Value" }},
    B3: {{ t: "s", v: "dd/mm/yyyy" }}, C3: n(46027, "dd/mm/yyyy"),
    B4: {{ t: "s", v: "date-time" }}, C4: n(46027.5625, "dd/mm/yyyy hh:mm"),
    B5: {{ t: "s", v: "time" }}, C5: n(0.75, "h:mm AM/PM"),
    B6: {{ t: "s", v: "duration" }}, C6: n(1.25, "[h]:mm"),
    B7: {{ t: "s", v: "amount" }}, C7: n(12.5, "#,##0.00"),
    B8: {{ t: "s", v: "fake day" }}, C8: n(60, "m/d/yy"),
    B9: {{ t: "s", v: "text" }}, C9: {{ t: "s", v: "05.01.2026" }},
    B10: {{ t: "s", v: "flag" }}, C10: {{ t: "b", v: true }},
    B11: {{ t: "s", v: "error" }}, C11: {{ t: "e", v: 0x2a, w: "#N/A" }} }};
  const rows = await readSheetCells(xdFile({{ SheetNames: ["S"], Sheets: {{ S: sheet }} }}));
  assert.strictEqual(rows.length, 10);
  assert.deepStrictEqual(rows.map((r) => r[1]), [
    {{ value: "Value" }},
    {{ value: "2026-01-05", kind: "date" }},
    {{ value: "2026-01-05T13:30:00", kind: "datetime" }},
    {{ value: "18:00:00", kind: "time" }},
    {{ value: 108000, kind: "duration" }},
    {{ value: 12.5 }},
    {{ value: null, kind: "date", problem: "C8: 1900-02-29 does not exist (Excel's 1900 leap-year bug)" }},
    {{ value: "05.01.2026" }},
    {{ value: true }},
    {{ value: null, problem: "C11: Excel error #N/A" }},
  ]);
}});
ok("xd: readSheetCells handles the 1904 system, built-in formats, CSV and every time zone", async () => {{
  const one = (cell, props) => xdFile({{ SheetNames: ["S"], Sheets: {{ S: {{ "!ref": "A1", A1: cell }} }}, Workbook: props }});
  assert.deepStrictEqual((await readSheetCells(one({{ t: "n", v: 44565, z: "m/d/yy" }}, {{ WBProps: {{ date1904: true }} }})))[0][0], {{ value: "2026-01-05", kind: "date" }});
  assert.deepStrictEqual((await readSheetCells(one({{ t: "n", v: 44565, z: "m/d/yy" }})))[0][0], {{ value: "2022-01-04", kind: "date" }}); // same number, 1900 system
  const typed = XLSX.utils.aoa_to_sheet([[new Date(Date.UTC(2026, 0, 5))]]); // stored with built-in format 14
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, typed, "S");
  const back = XLSX.read(XLSX.write(wb, {{ type: "array", bookType: "xlsx" }}), {{ cellNF: true }}).Sheets.S.A1;
  assert.strictEqual(back.z, "m/d/yy");
  assert.strictEqual(XLSX.read(XLSX.write(wb, {{ type: "array", bookType: "xlsx" }})).Sheets.S.A1.z, undefined); // without cellNF there is no format code
  const csv = {{ arrayBuffer: async () => new TextEncoder().encode("Joined\\n03/04/2026\\n2026-03-04\\n").buffer }};
  assert.deepStrictEqual((await readSheetCells(csv)).map((r) => r[0].value), ["Joined", "03/04/2026", "2026-03-04"]);
  const empty = {{ "!ref": "A1:B1", A1: {{ t: "s", v: "x" }} }};
  assert.deepStrictEqual(await readSheetCells(xdFile({{ SheetNames: ["S"], Sheets: {{ S: empty }} }})), [[{{ value: "x" }}, {{ value: null }}]]);
  assert.deepStrictEqual(await readSheetCells(xdFile({{ SheetNames: ["S"], Sheets: {{ S: {{}} }} }})), []);
  const code = `${{dateFormatKind}}\\n${{serialToISO}}\\nconst DAY_MS = 86400000, DAY_ZERO_1900 = Date.UTC(1899, 11, 31), DAY_ZERO_1904 = Date.UTC(1904, 0, 1);
    out.push(serialToISO(46027.5625, "datetime").value, serialToISO(46027, "date").value);`;
  for (const tz of ["America/Los_Angeles", "Asia/Tokyo", "Pacific/Kiritimati"])
    assert.deepStrictEqual(runSnippet(tz, "", code), ["2026-01-05T13:30:00", "2026-01-05"], tz);
}});

// --- blog/decode-shift-jis-windows-1252-utf-16-csv-javascript ---
{DEC_SNIFF}

{DEC_DAMAGE}

{DEC_SCORE}

{DEC_DECODE}

// Runs a snippet as printed and checks every line that ends in a comment holding a
// JSON string (the expected value) or "throws ErrorName".
async function checkCommentedLines(snippet) {{
  const checks = [];
  const body = snippet.split("\\n").map((line) => {{
    const m = /^([^/ ].*?);\\s*\\/\\/ (.+)$/.exec(line);
    if (!m || /^(const|let) /.test(m[1])) return line;
    const want = m[2];
    checks.push(want);
    if (want.startsWith("throws ")) return `try {{ ${{m[1]}}; out.push("no error"); }} catch (e) {{ out.push("throws " + e.name); }}`;
    return `out.push(await (${{m[1]}}));`;
  }}).join("\\n");
  const AsyncFunction = (async () => {{}}).constructor;
  const out = [];
  await new AsyncFunction("out", body)(out);
  assert.strictEqual(out.length, checks.length);
  checks.forEach((want, i) => assert.strictEqual(out[i], want.startsWith("throws ") ? want : JSON.parse(want), want));
  return checks.length;
}}
const hex = (h) => Uint8Array.from(Buffer.from(h.replace(/\\s/g, ""), "hex"));
const DEC_SAMPLES_TEXT = {_json.dumps(DEC_SAMPLES_TEXT, ensure_ascii=False)};
const DEC_SAMPLES_HEX = {_json.dumps(DEC_SAMPLES_HEX)};

ok("dec: the problem lines print what the comments say", async () => assert.strictEqual(await checkCommentedLines({_json.dumps(DEC_PROBLEM)}), 5));
ok("dec: the trap lines print what the comments say", async () => assert.strictEqual(await checkCommentedLines({_json.dumps(DEC_TRAPS)}), 12));
ok("dec: windows-1252 maps every byte, so it never fails", () => {{
  const all = Uint8Array.from({{ length: 256 }}, (_, i) => i);
  const text = decodeStrict(all, "windows-1252");
  assert.strictEqual(Array.from(text).length, 256);
  assert.strictEqual(text[0x80], "€");
  for (const b of [0x81, 0x8d, 0x8f, 0x90, 0x9d]) assert.strictEqual(text.charCodeAt(b), b); // C1 controls
}});
ok("dec: BOMs and UTF-16 without a BOM", () => {{
  const u16le = (s) => Uint8Array.from(Buffer.from(s, "utf16le"));
  const u16be = (s) => Uint8Array.from(Buffer.from(s, "utf16le").swap16());
  const withBom = (bom, b) => Uint8Array.from([...bom, ...b]);
  const csv = "Name\\tCity\\nYui\\t東京\\nAnna\\tKöln\\n";
  for (const [bytes, enc, reason] of [
    [withBom([0xef, 0xbb, 0xbf], new TextEncoder().encode(csv)), "utf-8", "byte order mark"],
    [withBom([0xff, 0xfe], u16le(csv)), "utf-16le", "byte order mark"],
    [withBom([0xfe, 0xff], u16be(csv)), "utf-16be", "byte order mark"],
    [u16le(csv), "utf-16le", "UTF-16 zero-byte pattern"],
    [u16be(csv), "utf-16be", "UTF-16 zero-byte pattern"],
    [u16le("番地,住所\\r\\n一丁目,東京都千代田区\\r\\n"), "utf-16le", "UTF-16 zero-byte pattern"], // 一 is 00 4E: a zero on the other side
  ]) {{
    const r = decodeCsv(bytes);
    assert.strictEqual(r.encoding, enc, enc + " " + reason);
    assert.strictEqual(r.reason, reason);
    assert.strictEqual(r.sure, true);
    assert(!r.text.startsWith("\\ufeff"), "BOM removed");
  }}
  assert.deepStrictEqual(decodeCsv(withBom([0xff, 0xfe, 0, 0], [0x41, 0, 0, 0])), {{ encoding: null, text: null, sure: false, reason: "UTF-32 file: save it as UTF-8 and try again", options: [] }});
  assert.strictEqual(decodeCsv(withBom([0, 0, 0xfe, 0xff], [0, 0, 0, 0x41])).reason, "UTF-32 file: save it as UTF-8 and try again");
  assert.strictEqual(decodeCsv(withBom([0xff, 0xfe], [0x00, 0xd8, 0x41, 0x00])).reason, "looks like utf-16le but is not valid utf-16le"); // lone surrogate
  assert.strictEqual(decodeCsv(withBom([0xef, 0xbb, 0xbf], [0x43, 0xe9])).reason, "looks like utf-8 but is not valid utf-8");
  assert.strictEqual(guessUtf16(new TextEncoder().encode("Name,City\\nYui,Tokyo\\n")), null);
  assert.strictEqual(guessUtf16(new Uint8Array([])), null);
}});
ok("dec: refuses files that are not text", () => {{
  assert.strictEqual(decodeCsv(hex("504b0304 14000600 08000000 2100")).reason, "this is a ZIP file, probably an .xlsx renamed to .csv");
  assert.strictEqual(decodeCsv(hex("d0cf11e0 a1b11ae1 0000 0000")).reason, "this is an old .xls file renamed to .csv");
  assert.strictEqual(decodeCsv(hex("61 00 62 2c 63 0a")).reason, "contains zero bytes: a binary file, or UTF-16 without a byte order mark"); // too short to be UTF-16
  assert.strictEqual(decodeCsv(new TextEncoder().encode("Name,City\\nYui,Tokyo\\u0000\\nAnna,Berlin\\n")).reason, "contains zero bytes: a binary file, or UTF-16 without a byte order mark");
}});
ok("dec: UTF-8 and plain ASCII are read as UTF-8", () => {{
  assert.deepStrictEqual(decodeCsv(new TextEncoder().encode("Name,City\\nYui,東京\\n"), ["shift_jis"]), {{ encoding: "utf-8", text: "Name,City\\nYui,東京\\n", sure: true, reason: "valid UTF-8", options: [] }});
  assert.strictEqual(decodeCsv(new TextEncoder().encode("a,b\\n1,2\\n")).encoding, "utf-8");
  assert.strictEqual(decodeCsv(new Uint8Array([])).text, "");
}});
ok("dec: damaged UTF-8 is flagged with the line, not re-read as a legacy encoding", () => {{
  const bytes = Uint8Array.from([...new TextEncoder().encode("名前,都市\\n山田,東京\\n"), ...hex("4361 66e9 2c50 6172 6973 0a"), ...new TextEncoder().encode("佐藤,大阪\\n")]);
  const r = decodeCsv(bytes, ["windows-1252", "shift_jis"]);
  assert.deepStrictEqual([r.encoding, r.sure, r.reason], ["utf-8", false, "UTF-8 with invalid bytes, first on line 3"]);
  assert(r.text.includes("Caf\\uFFFD,Paris") && r.text.includes("佐藤,大阪"));
  assert.deepStrictEqual(utf8Damage(hex("43 61 66 e9")), {{ share: 0, firstInvalid: 3 }});
  assert.deepStrictEqual(utf8Damage(new TextEncoder().encode("abc")), {{ share: 0, firstInvalid: -1 }});
  assert.strictEqual(utf8Damage(hex("e6 9d b1 41")).share, 1);
  assert.strictEqual(utf8Damage(hex("e6 9d 41")).share, 0); // truncated sequence
  assert.deepStrictEqual(utf8Damage(hex("e6 9d b1 0a ed a0 80 0a")), {{ share: 0.5, firstInvalid: 4 }}); // a surrogate
  assert.strictEqual(utf8Damage(hex("e0 80 80")).firstInvalid, 0); // overlong
  assert.strictEqual(utf8Damage(hex("f4 90 80 80")).firstInvalid, 0); // above U+10FFFF
  assert.strictEqual(utf8Damage(hex("f0 9f 98 80")).share, 1);
  assert.strictEqual(lineAt(hex("41 0a 42 0a 43"), 4), 3);
  assert.strictEqual(lineAt(hex("41 0d 0a 42 0d 0a 43"), 6), 3); // CRLF
  assert.strictEqual(lineAt(hex("41 0d 42 0d 43"), 4), 3); // CR only (old Mac files)
}});
ok("dec: damaged UTF-8 still lists the legacy candidates for a picker", () => {{
  const bytes = Uint8Array.from([...new TextEncoder().encode("名前,都市\\n山田,東京\\n"), ...hex("4361 66e9 2c50 6172 6973 0a"), ...new TextEncoder().encode("佐藤,大阪\\n")]);
  assert.deepStrictEqual(decodeCsv(bytes, ["windows-1252", "shift_jis"]).options.map((o) => o.encoding), ["windows-1252"]); // not valid Shift_JIS
}});
ok("dec: UTF-8 cut off in the middle of a character at the end", () => {{
  const whole = new TextEncoder().encode("名前,都市\\n山田,東京\\n佐藤,大阪");
  for (const drop of [1, 2]) {{
    const r = decodeCsv(whole.subarray(0, whole.length - drop), ["windows-1252", "shift_jis"]);
    assert.deepStrictEqual([r.encoding, r.sure, r.reason], ["utf-8", false, "UTF-8 cut off in the middle of a character at the end (line 3)"]);
    assert(r.text.startsWith("名前,都市\\n山田,東京\\n佐藤,大") && r.text.endsWith("\\uFFFD"));
  }}
  assert.strictEqual(cutCharacterAtEnd(whole), -1);
  assert.strictEqual(cutCharacterAtEnd(new Uint8Array([])), -1);
  assert.strictEqual(cutCharacterAtEnd(hex("41 f0 9f 98")), 1);
  // A Windows-1252 file ending in é (E9) is not mistaken for cut-off UTF-8: the rest is plain ASCII.
  assert.deepStrictEqual([decodeCsv(hex("43 61 66 e9")).encoding, decodeCsv(hex("43 61 66 e9")).sure], ["windows-1252", true]);
}});
ok("dec: UTF-16 without a BOM and without ASCII is refused, not misread", () => {{
  const r = decodeCsv(Uint8Array.from(Buffer.from("東京都千代田区\\n大阪府大阪市\\n", "utf16le")), ["windows-1252", "shift_jis"]);
  assert.strictEqual(r.reason, "contains zero bytes: a binary file, or UTF-16 without a byte order mark");
}});
ok("dec: Node's Blob.text() ignores a UTF-16 byte order mark", async () => {{
  assert.strictEqual(await new Blob([new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00])]).text(), "\\uFFFD\\uFFFDH\\u0000i\\u0000");
}});
ok("dec: scores in the not-sure rows of the table", () => {{
  const rows = [
    ["kanjiDate:cp932", ["windows-1252", "shift_jis"], [["windows-1252", 1], ["shift_jis", 1]]],
    ["japanese:cp932", ["windows-1252"], [["windows-1252", 0.23]]],
    ["japanese:cp932", ["shift_jis", "gb18030"], [["shift_jis", 1], ["gb18030", 1]]],
    ["cyrillic:cp1251", ["windows-1252", "windows-1251"], [["windows-1252", 1], ["windows-1251", 1]]],
    ["ellipsis:cp1252", ["windows-1252", "shift_jis"], [["windows-1252", 0], ["shift_jis", 0]]],
  ];
  for (const [k, legacy, want] of rows)
    assert.deepStrictEqual(decodeCsv(hex(DEC_SAMPLES_HEX[k]), legacy).options.map((o) => [o.encoding, Math.round(o.score * 100) / 100]), want, k);
}});
ok("dec: a real per-mille sign or dagger in Windows-1252 is a false alarm", () => {{
  for (const hexText of ["4e616d652c526174650a4b6f63682c35890a", "4e616d652c4e6f74650a536d6974682c8631393930"]) {{ // "Koch,5‰", "Smith,†1990"
    const r = decodeCsv(hex(hexText), ["windows-1252", "shift_jis"]);
    assert.deepStrictEqual([r.encoding, r.sure], ["windows-1252", false], r.reason);
  }}
}});
ok("dec: utf8SequenceLength", () => {{
  assert.deepStrictEqual([0x41, 0x80, 0xc1, 0xc2, 0xdf, 0xe0, 0xef, 0xf0, 0xf4, 0xf5, 0xff].map(utf8SequenceLength), [1, 0, 0, 2, 2, 3, 3, 4, 4, 0, 0]);
}});
ok("dec: decodeAs can switch back to damaged UTF-8", async () => {{
  const bytes = Uint8Array.from([...new TextEncoder().encode("名前,都市\\n山田,東京\\n"), ...hex("4361 66e9 2c50 6172 6973 0a"), ...new TextEncoder().encode("佐藤,大阪\\n")]);
  const AsyncFunction = (async () => {{}}).constructor;
  const got = await new AsyncFunction("file", "decodeCsv", "decodeStrict", {_json.dumps(DEC_USE)} + "\\nreturn {{ encoding, text, back: decodeAs('utf-8'), other: decodeAs('windows-1252') }};")(new Blob([bytes]), decodeCsv, decodeStrict);
  assert.strictEqual(got.encoding, "utf-8");
  assert.strictEqual(got.back, got.text);
  assert(got.other.includes("Café,Paris"));
}});
ok("dec: sample counts quoted in step 3", () => {{
  const valid = (keys, e) => keys.filter((k) => decodeStrict(hex(DEC_SAMPLES_HEX[k]), e) !== null).length;
  const western = ["latin:cp1252", "latinEnd:cp1252", "quotes:cp1252", "ellipsis:cp1252"];
  const sjis = ["japanese:cp932", "kanjiOnly:cp932", "halfKana:cp932", "yen:cp932", "kanjiDate:cp932"];
  assert.strictEqual(valid(western, "shift_jis"), 1); // 3 of 4 Windows-1252 samples are not valid Shift_JIS
  assert.strictEqual(valid(sjis, "euc-jp"), 1); // 4 of 5 Shift_JIS samples are not valid EUC-JP
  assert.strictEqual(valid(sjis, "gb18030"), 4); // 4 of 5 Shift_JIS samples are valid GB18030
}});
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
ok("dec: decision table", () => {{
  for (const [sample, savedAs, legacy, encoding, sure] of DEC_TABLE) {{
    const r = decodeCsv(hex(DEC_SAMPLES_HEX[sample + ":" + savedAs]), legacy);
    assert.deepStrictEqual([r.encoding, r.sure], [encoding, sure], `${{sample}} as ${{savedAs}} with ${{legacy}}: ${{r.reason}}`);
    if (sure && sample !== "cyrillic" && sample !== "macRoman") assert.strictEqual(r.text, DEC_SAMPLES_TEXT[sample]);
  }}
}});
ok("dec: numbers quoted in the post", () => {{
  const bytes = (k) => hex(DEC_SAMPLES_HEX[k]);
  const score = (k, e) => Math.round(plausibility(decodeStrict(bytes(k), e)) * 100) / 100;
  assert.strictEqual(score("japanese:cp932", "shift_jis"), 1);
  assert.strictEqual(score("japanese:cp932", "windows-1252"), 0.23);
  assert.strictEqual(score("japanese:cp932", "gb18030"), 1);
  const japanese = ["japanese:cp932", "kanjiOnly:cp932", "halfKana:cp932", "eucjp:euc_jp"].map((k) => utf8Damage(bytes(k)).share);
  assert.strictEqual(Math.min(...japanese), 0);
  assert.strictEqual(Math.round(Math.max(...japanese) * 100) / 100, 0.31);
  for (const k of ["latin:cp1252", "latinEnd:cp1252"]) {{
    assert.strictEqual(utf8Damage(bytes(k)).share, 0);
    assert.strictEqual(decodeStrict(bytes(k), "shift_jis"), null);
  }}
  for (const k of ["japanese:cp932", "kanjiOnly:cp932", "halfKana:cp932"]) assert.strictEqual(decodeStrict(bytes(k), "euc-jp"), null);
  assert.deepStrictEqual(["japanese:cp932", "kanjiOnly:cp932", "halfKana:cp932", "eucjp:euc_jp"].map((k) => decodeStrict(bytes(k), "gb18030") !== null), [true, true, false, true]);
  for (const k of Object.keys(DEC_SAMPLES_HEX)) assert.strictEqual(decodeStrict(bytes(k), "utf-8"), null, k);
  const ascii = Uint8Array.from([9, 10, 13, ...Array.from({{ length: 95 }}, (_, i) => i + 32)]); // tab, line breaks, printable ASCII
  for (const e of ["utf-8", "windows-1252", "shift_jis", "euc-jp", "gb18030", "windows-1251"])
    assert.strictEqual(decodeStrict(ascii, e), String.fromCharCode(...ascii), e);
  const high = decodeStrict(Uint8Array.from({{ length: 128 }}, (_, i) => i + 128), "windows-1252");
  assert.strictEqual(Array.from(high).filter((c) => /\\p{{Cc}}/u.test(c)).length, 5); // five invisible control characters
}});
ok("dec: plausibility scores", () => {{
  assert.strictEqual(plausibility("Müller, Köln, São Paulo, Ørsted, à la carte, “12,00”, 1.234,50 €, –5"), 1);
  assert.strictEqual(plausibility("plain ASCII"), 1);
  assert.strictEqual(plausibility("山田太郎,東京都"), 1);
  assert.strictEqual(plausibility("ｶﾌﾞｼｷｶﾞｲｼｬ"), 1);
  assert.strictEqual(Math.round(plausibility("“ú–{{") * 100) / 100, 0.33); // 日本 read as Windows-1252
  assert.strictEqual(plausibility("Caf\\uFFFD"), 0);
  assert.strictEqual(plausibility("a\\u0081b"), 0);
  assert.strictEqual(plausibility("S翳 Paulo"), 0); // a lone kanji between Latin letters
  assert.strictEqual(plausibility("\\uFFFD".repeat(100001) + "é".repeat(10)), 0); // only the first 100,000 characters count
}});
ok("dec: readCsvText on a file", async () => {{
  const snippet = {_json.dumps(DEC_USE)};
  const file = new Blob([hex(DEC_SAMPLES_HEX["japanese:cp932"])]);
  const AsyncFunction = (async () => {{}}).constructor;
  const got = await new AsyncFunction("file", "decodeCsv", "decodeStrict", snippet + "\\nreturn {{ encoding, text, sure, reason, options, other: decodeAs('windows-1252'), invalid: decodeAs('euc-jp') }};")(file, decodeCsv, decodeStrict);
  assert.deepStrictEqual([got.encoding, got.sure, got.text], ["shift_jis", true, DEC_SAMPLES_TEXT.japanese]);
  assert.strictEqual(got.invalid, null);
  assert.deepStrictEqual(got.options.map((o) => o.encoding), ["shift_jis", "windows-1252"]);
  assert(got.other.startsWith("\\u017d\\u0081\\u2013\\u00bc")); // the same bytes as Windows-1252
}});
'''
MAP_TESTS = r"""
// --- blog/map-spreadsheet-columns-to-fields-javascript ---
{
%%MAP_NORMALIZE%%

%%MAP_COMPARE%%

%%MAP_FIELDS%%

%%MAP_COLUMNS%%

%%MAP_REMEMBER%%

%%MAP_USE%%

// Short form of a result: field -> header ("?" when not sure), plus unmatched headers, missing fields and sure.
const summary = (r) => ({
  mapped: Object.fromEntries(Object.entries(r.byField).filter(([, m]) => m).map(([k, m]) => [k, String(m.header) + (m.sure ? "" : "?")])),
  unmatched: r.unmatched.map((u) => String(u.header)),
  missing: r.missing,
  sure: r.sure,
});
const run = (headers, samples) => summary(mapColumns(headers, FIELDS, { samples }));

ok("map: the problem lines print what the comments say", async () => assert.strictEqual(await checkCommentedLines(%%MAP_PROBLEM_JSON%%), 6));
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
  const table = %%MAP_TABLE_JSON%%;
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
  for (const s of %%MAP_ALL_JSON%%) assert(!/[\u00A0\u200B-\u200F\u2028\u2029\uFEFF]/.test(s));
});
}
"""
MAP_TABLE = [
  [["Name", "E-mail", "Company", "MRR"], None, {"mapped": {"name": "Name", "email": "E-mail", "company": "Company", "mrr": "MRR"}, "unmatched": [], "missing": [], "sure": True}],
  [["Customer name", "Email address", "Organisation", "Monthly revenue"], None, {"mapped": {"name": "Customer name", "email": "Email address", "company": "Organisation", "mrr": "Monthly revenue"}, "unmatched": [], "missing": [], "sure": True}],
  [["\uFF2E\uFF41\uFF4D\uFF45", "\uFEFFE-Mail-Adresse", "Téléphone"], None, {"mapped": {"name": "\uFF2E\uFF41\uFF4D\uFF45", "email": "\uFEFFE-Mail-Adresse", "phone": "Téléphone"}, "unmatched": [], "missing": [], "sure": True}],
  [["名前", "\uFF92\uFF70\uFF99\uFF71\uFF84\uFF9E\uFF9A\uFF7D", "電話番号"], None, {"mapped": {"name": "名前", "email": "\uFF92\uFF70\uFF99\uFF71\uFF84\uFF9E\uFF9A\uFF7D", "phone": "電話番号"}, "unmatched": [], "missing": [], "sure": True}],
  [["Name", "Primary email", "Phone number (mobile)"], None, {"mapped": {"name": "Name", "email": "Primary email?", "phone": "Phone number (mobile)?"}, "unmatched": [], "missing": [], "sure": False}],
  [["Name", "Primary email"], [["Yui"], ["yui@example.jp"]], {"mapped": {"name": "Name", "email": "Primary email"}, "unmatched": [], "missing": [], "sure": True}],
  [["File name", "Email verified"], None, {"mapped": {"name": "File name?", "email": "Email verified?"}, "unmatched": [], "missing": [], "sure": False}],
  [["Name", "Name", "Email"], None, {"mapped": {"name": "Name?", "email": "Email"}, "unmatched": ["Name"], "missing": [], "sure": False}],
  [["Name", "Email", "Work email"], None, {"mapped": {"name": "Name", "email": "Email"}, "unmatched": ["Work email"], "missing": [], "sure": False}],
  [["Name", "Email", "E-mail"], None, {"mapped": {"name": "Name", "email": "Email?"}, "unmatched": ["E-mail"], "missing": [], "sure": False}],
  [["First name", "Last name", "Email"], None, {"mapped": {"name": "First name?", "email": "Email"}, "unmatched": ["Last name"], "missing": [], "sure": False}],
  [["Company name", "Email"], None, {"mapped": {"email": "Email", "company": "Company name"}, "unmatched": [], "missing": ["name"], "sure": False}],
  [["Name", "Emial", "ARR"], None, {"mapped": {"name": "Name", "email": "Emial?"}, "unmatched": ["ARR"], "missing": [], "sure": False}],
  [["Name", "Mailing address"], None, {"mapped": {"name": "Name"}, "unmatched": ["Mailing address"], "missing": ["email"], "sure": False}],
  [["Name", "Email opt-in"], None, {"mapped": {"name": "Name", "email": "Email opt-in?"}, "unmatched": [], "missing": [], "sure": False}],
  [["Name", "Email opt-in"], [["Yui"], ["yes"]], {"mapped": {"name": "Name"}, "unmatched": ["Email opt-in"], "missing": ["email"], "sure": False}],
  [["Name", "Email", "Email opt-in"], [["Yui"], ["yui@example.jp"], ["yes"]], {"mapped": {"name": "Name", "email": "Email"}, "unmatched": ["Email opt-in"], "missing": [], "sure": True}],
  [["Name", "Contact"], [["Yui"], ["yui@example.jp"]], {"mapped": {"name": "Name", "email": "Contact?"}, "unmatched": [], "missing": [], "sure": False}],
  [["Name", "Contact", "Backup contact"], [["Yui"], ["yui@example.jp"], ["ken@example.com"]], {"mapped": {"name": "Name"}, "unmatched": ["Contact", "Backup contact"], "missing": ["email"], "sure": False}],
  [["Name", "Email", "MRR"], [["Yui"], ["yui@example.jp"], ["n/a", "free"]], {"mapped": {"name": "Name", "email": "Email"}, "unmatched": ["MRR"], "missing": [], "sure": False}],
  [["Name", "顧客メールアドレス"], None, {"mapped": {"name": "Name"}, "unmatched": ["顧客メールアドレス"], "missing": ["email"], "sure": False}],
  [[2024, None, "Email"], None, {"mapped": {"email": "Email"}, "unmatched": ["2024", "null"], "missing": ["name"], "sure": False}],
]
_map_names = ["MAP_NORMALIZE", "MAP_COMPARE", "MAP_FIELDS", "MAP_COLUMNS", "MAP_REMEMBER", "MAP_USE"]
for _k in _map_names:
    MAP_TESTS = MAP_TESTS.replace("%%" + _k + "%%", globals()[_k])
MAP_TESTS = MAP_TESTS.replace("%%MAP_PROBLEM_JSON%%", _json.dumps(MAP_PROBLEM))
MAP_TESTS = MAP_TESTS.replace("%%MAP_TABLE_JSON%%", _json.dumps(MAP_TABLE, ensure_ascii=False))
MAP_TESTS = MAP_TESTS.replace("%%MAP_ALL_JSON%%", _json.dumps([globals()[k] for k in _map_names + ["MAP_PROBLEM"]]))
out += MAP_TESTS

# --- blog/find-invisible-characters-csv-excel-javascript ---
import re as _re, unicodedata as _ud
# The names in NAMES must be the Unicode name or a formal alias of each character.
for _key, _name in _re.findall(r'^  "(\\[a-z]|\\u[0-9A-F]{4})": "([^"]+)",$', INV_FIND, _re.M):
    _ch = {"\\t": "\t", "\\n": "\n", "\\r": "\r"}.get(_key) or chr(int(_key[2:], 16))
    assert _ud.lookup(_name.upper()) == _ch, (_key, _name)
assert len(_re.findall(r'^  "(\\[a-z]|\\u[0-9A-F]{4})": "([^"]+)",$', INV_FIND, _re.M)) == 18
# Facts about categories and names that the post states.
assert all(_ud.category(_c) in ("Cc", "Cf", "Zs", "Zl", "Zp") for _c in "\t\n\r\u00A0\u00AD\u200B\u200C\u200D\u200E\u200F\u2028\u202F\u2060\u3000\uFEFF\u0007")
assert [_ud.category(chr(_c)) for _c in [*range(0x202A, 0x202F), *range(0x2066, 0x206A)]] == ["Cf"] * 9
assert all(_re.search("EMBEDDING|OVERRIDE|ISOLATE|POP DIRECTIONAL", _ud.name(chr(_c))) for _c in [*range(0x202A, 0x202F), *range(0x2066, 0x206A)])
assert [_ud.category(_c) for _c in "\u2800\u3164\uffa0"] == ["So", "Lo", "Lo"]
assert _ud.category("\U000E0067") == "Cf" and _ud.name("\U000E007F") == "CANCEL TAG"
assert _ud.name("\u0430") == "CYRILLIC SMALL LETTER A" and _ud.lookup("ALERT") == "\u0007"
assert _ud.category("\uFE0F") == "Mn" and _ud.name("\uFE0F") == "VARIATION SELECTOR-16"
assert _ud.category("\u0301") == "Mn" and _ud.name("\u0301") == "COMBINING ACUTE ACCENT"
_inv_names = ["INV_PROBLEM", "INV_FIND", "INV_CLEAN", "INV_USE", "INV_EXAMPLE"]
INV_TESTS = r"""
// --- blog/find-invisible-characters-csv-excel-javascript ---
{
%%INV_FIND%%

%%INV_CLEAN%%

%%INV_USE%%

const runLines = (src) => new Function(src.split("\n").filter((l) => /^\S.*;\s*\/\/ /.test(l)).map((l) => "")[0] ?? "");
ok("inv: the problem lines print what the comments say", () => {
  const src = %%INV_PROBLEM_JSON%%;
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
  const got = new Function("cleanRows", %%INV_EXAMPLE_JSON%% + "\nreturn { clean, notes, errors };")(cleanRows);
  const src = %%INV_EXAMPLE_JSON%%;
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
  for (const s of %%INV_ALL_JSON%%) assert(!/[\u00A0\u00AD\u200B-\u200F\u2028\u2029\u202F\u2060\u3000\uFEFF]/.test(s));
});
}
"""
for _k in _inv_names:
    INV_TESTS = INV_TESTS.replace("%%" + _k + "%%", globals()[_k])
    INV_TESTS = INV_TESTS.replace("%%" + _k + "_JSON%%", _json.dumps(globals()[_k]))
INV_TESTS = INV_TESTS.replace("%%INV_ALL_JSON%%", _json.dumps([globals()[k] for k in _inv_names]))
out += INV_TESTS

# --- blog/find-placeholder-values-csv-excel-javascript ---
_ph_names = ["PH_PROBLEM", "PH_STATUS", "PH_CHECK", "PH_EXAMPLE", "PH_SHEETJS"]
_ph_post = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "content/posts/find-placeholder-values-csv-excel-javascript.html")).read()
import html as _html
# The status table in the post: first cell holds the input(s) in <code>, last cell the cellStatus result.
_ph_table = []
for _row in _re.findall(r'<tr class="st">(.*?)</tr>', _ph_post, _re.S):
    _cells = _re.findall(r"<td>(.*?)</td>", _row, _re.S)
    _inputs = [_html.unescape(c) for c in _re.findall(r"<code>(.*?)</code>", _cells[0])]
    _ph_table.append([_inputs, _html.unescape(_re.sub(r"<[^>]+>", "", _cells[-1])).strip()])
assert len(_ph_table) >= 8, len(_ph_table)
PH_TESTS = r"""
// --- blog/find-placeholder-values-csv-excel-javascript ---
{
const XLSX = require(process.env.XLSX_MODULE || "xlsx");
%%PH_STATUS%%

%%PH_CHECK%%

%%PH_SHEETJS_CJS%%

ok("ph: the problem lines print what the comments say", () => {
  const lines = %%PH_PROBLEM_JSON%%.split("\n");
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
  const table = %%PH_TABLE_JSON%%;
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
  const src = %%PH_EXAMPLE_JSON%%;
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
ok("ph: SheetJS %%XLSX_VERSION%%: sheet_to_json turns Excel error cells into empty cells", () => {
  assert.strictEqual(XLSX.version, "%%XLSX_VERSION%%");
  const bytes = phBook([["Email", "Phone"], ["ana@example.com", ""], ["bo@example.com", ""]], { B2: 0x17, B3: 0x2a });
  const sheet = XLSX.read(bytes).Sheets.Contacts;
  assert.deepStrictEqual([sheet.B2.t, sheet.B2.w, sheet.B3.w], ["e", "#REF!", "#N/A"]);
  assert.deepStrictEqual(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }).slice(1).map((r) => r[1]), ["", ""]);
  assert.deepStrictEqual(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }).slice(1).map((r) => r[1]), ["", ""]);
  assert.deepStrictEqual(XLSX.utils.sheet_to_json(sheet, { defval: null }).map((r) => r.Phone), [null, null]);
  // ...while sheet_to_csv writes the error text.
  assert.strictEqual(XLSX.utils.sheet_to_csv(sheet).split("\n")[1], "ana@example.com,#REF!");
});
ok("ph: SheetJS %%XLSX_VERSION%%: every error code it writes reads back as text the check finds", () => {
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
ok("ph: SheetJS %%XLSX_VERSION%%: CSV error text, with and without raw: true", () => {
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
ok("ph: SheetJS %%XLSX_VERSION%%: sheet_to_json gives every error cell the defval, like an empty cell", () => {
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
ok("ph: SheetJS %%XLSX_VERSION%%: raw: true keeps CSV text; without it values are converted", () => {
  const csv = Buffer.from("Phone,Active\n0123,TRUE\n");
  const plain = XLSX.read(csv).Sheets.Sheet1;
  assert.deepStrictEqual([plain.A2.v, plain.B2.v], [123, true]);
  const records = readRecords(csv, { Phone: "phone", Active: "active" });
  assert.deepStrictEqual(records, [{ rowNumber: 2, phone: "0123", active: "TRUE" }]);
});
ok("ph: snippets have no invisible characters", () => {
  for (const s of %%PH_ALL_JSON%%) assert(!/[\u00A0\u00AD\u200B-\u200F\u2028\u2029\u202F\u2060\u3000\uFEFF]/.test(s));
});
}
"""
_ph_sheetjs_cjs = PH_SHEETJS.replace('// npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz\nimport * as XLSX from "xlsx";\n', '')
assert _ph_sheetjs_cjs != PH_SHEETJS
PH_TESTS = PH_TESTS.replace("%%PH_SHEETJS_CJS%%", _ph_sheetjs_cjs)
for _k in _ph_names:
    PH_TESTS = PH_TESTS.replace("%%" + _k + "%%", globals()[_k])
    PH_TESTS = PH_TESTS.replace("%%" + _k + "_JSON%%", _json.dumps(globals()[_k]))
PH_TESTS = PH_TESTS.replace("%%PH_TABLE_JSON%%", _json.dumps(_ph_table))
PH_TESTS = PH_TESTS.replace("%%PH_ALL_JSON%%", _json.dumps([globals()[k] for k in _ph_names]))
PH_TESTS = PH_TESTS.replace("%%XLSX_VERSION%%", "0.20.3")
out += PH_TESTS

# --- blog/merged-cells-excel-sheetjs ---
_mg_names = ["MG_PROBLEM", "MG_READ", "MG_HEADER", "MG_DATA", "MG_TABLE", "MG_EXAMPLE", "MG_CSV"]
MG_TESTS = r"""
// --- blog/merged-cells-excel-sheetjs ---
{
const XLSX = require(process.env.XLSX_MODULE || "xlsx");
const fs = require("fs");
const path = require("path");
%%MG_READ_CJS%%
%%MG_HEADER%%
%%MG_DATA%%
%%MG_TABLE%%
%%MG_CSV%%
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

ok("mg: SheetJS %%XLSX_VERSION%%: the problem lines give what the comments say", () => {
  assert.strictEqual(XLSX.version, "%%XLSX_VERSION%%");
  const workbook = XLSX.read(salesBytes);
  const src = %%MG_PROBLEM_JSON%%;
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
ok("mg: SheetJS %%XLSX_VERSION%%: the example gives the output in its comments", async () => {
  const file = { arrayBuffer: async () => salesBytes };
  const src = %%MG_EXAMPLE_JSON%%;
  const body = src.split("\n").filter((l) => l.startsWith("const ")).join("\n");
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
ok("mg: SheetJS %%XLSX_VERSION%%: a file SheetJS writes reads the same way", () => {
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
    'A2:A4: "North" copied into A3:A4',
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
  assert.deepStrictEqual(text(t.problems), ['B1: repeats the column name "name"; read as "name (2)"', "D1: has data but no column name"]);
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
ok("mg: SheetJS %%XLSX_VERSION%%: a CSV has no merges; fillDown fills one column on request", () => {
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
  assert.deepStrictEqual(text(n.notes), ['A2:A4: "A-1" copied into A3:A4']);
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
ok("mg: SheetJS %%XLSX_VERSION%%: text files are read as UTF-8, with or without a BOM", () => {
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
  assert.deepStrictEqual(t.columns, ["", ""]);
  assert.deepStrictEqual(text(t.problems), ["A1: has data but no column name", "B1: has data but no column name"]);
  assert.deepStrictEqual(readMergedTable(mgBook([["", ""], ["Name", "City"], ["Ana", "Paris"]], []), 1).columns, ["Name", "City"]);
});
ok("mg: snippets have no invisible characters", () => {
  for (const s of %%MG_ALL_JSON%%) assert(!/[\u00A0\u00AD\u200B-\u200F\u2028\u2029\u202F\u2060\u3000\uFEFF]/.test(s));
});
}
"""
_mg_read_cjs = MG_READ.replace('// npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz\nimport * as XLSX from "xlsx";\n', '')
assert _mg_read_cjs != MG_READ
MG_TESTS = MG_TESTS.replace("%%MG_READ_CJS%%", _mg_read_cjs)
for _k in _mg_names:
    MG_TESTS = MG_TESTS.replace("%%" + _k + "%%", globals()[_k])
    MG_TESTS = MG_TESTS.replace("%%" + _k + "_JSON%%", _json.dumps(globals()[_k]))
MG_TESTS = MG_TESTS.replace("%%MG_ALL_JSON%%", _json.dumps([globals()[k] for k in _mg_names]))
MG_TESTS = MG_TESTS.replace("%%XLSX_VERSION%%", "0.20.3")
out += MG_TESTS
open(sys.argv[1] if len(sys.argv) > 1 else "/dev/stdout", "w").write(out)
