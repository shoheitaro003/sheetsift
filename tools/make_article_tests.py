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
    "cyrillic": "Имя,Город\nИван,Москва\n",
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
BIG_TESTS = r"""
// --- blog/parse-large-csv-browser-web-worker ---
{
%%BIG_PARSER%%

%%BIG_BATCHES%%

const WORKER_SOURCE = %%WORKER_SOURCE_JSON%%;
// Runs the worker code in this thread, with messages delivered later and copied, as a browser does.
class FakeWorker {
  static all = [];
  constructor(url, options) {
    this.url = url;
    this.type = options?.type;
    this.terminated = false;
    this.ahead = 0;    // batches sent but not yet acknowledged by the page
    this.maxAhead = 0;
    const self = { postMessage: (data) => {
      if (this.terminated) return;
      if (data.type === "batch") this.maxAhead = Math.max(this.maxAhead, ++this.ahead);
      setTimeout(() => !this.terminated && this.onmessage?.({ data: structuredClone(data) }));
    } };
    new Function("self", WORKER_SOURCE)(self);
    this.inner = self;
    FakeWorker.all.push(this);
  }
  postMessage(data) {
    const copy = structuredClone(data); // throws DataCloneError for functions, as browsers do
    if (data.type === "next") this.ahead--;
    setTimeout(() => !this.terminated && this.inner.onmessage({ data: copy }));
  }
  terminate() { this.terminated = true; }
}
const importCsv = new Function("Worker", %%MAIN_JSON%%.replace('new URL("./csv-worker.js", import.meta.url)', '"csv-worker.js"') + "\nreturn importCsv;")(FakeWorker);

const parseChunks = (chunks, options = {}) => {
  const rows = [], errors = [];
  const parser = createCsvParser({ ...options, onRow: (cells, line) => rows.push([line, cells]), onError: (e) => errors.push([e.line, e.message]) });
  for (const chunk of chunks) parser.push(chunk);
  parser.end();
  return { rows, errors };
};
const parse = (text, options) => parseChunks([text], options);
// A Blob-like object whose stream() returns the given byte chunks, to control where chunks end.
const chunkedFile = (parts) => {
  const chunks = parts.map((p) => (typeof p === "string" ? new TextEncoder().encode(p) : Uint8Array.from(p)));
  return { size: chunks.reduce((n, c) => n + c.length, 0), stream: () => new ReadableStream({
    start(controller) { for (const c of chunks) controller.enqueue(c); controller.close(); } }) };
};
const collect = async (file, options) => {
  const batches = [];
  for await (const b of csvBatches(file, options)) batches.push(b);
  return batches;
};
const bigCsv = (n) => "id,name,note,amount\r\n" + Array.from({ length: n }, (_, i) => `${i},"Name ${i}","a, ""b""\nc 日本",${i}.5`).join("\r\n") + "\r\n";

ok("big: the problem lines print what the comments say", async () => assert.strictEqual(await checkCommentedLines(%%PROBLEM_JSON%%), 3));
ok("big: parser decision table", () => {
  const table = %%TABLE_JSON%%;
  for (const [input, options, rows, errors] of table)
    assert.deepStrictEqual(parse(input, options ?? undefined), { rows, errors }, JSON.stringify(input));
});
ok("big: the same rows wherever the chunks end", () => {
  const text = '\uFEFFName,Note\r\n"Acme, Inc","He said ""hi""\r\nthen left"\r\n\r\nKen,5" screen 😀\r"",x\n"bad" x,1\n"open,1';
  const whole = JSON.stringify(parse(text));
  let splits = 0;
  for (let i = 0; i <= text.length; i++) {
    assert.strictEqual(JSON.stringify(parseChunks([text.slice(0, i), text.slice(i)])), whole, "split at " + i);
    for (let j = i; j <= text.length; j += 5) { assert.strictEqual(JSON.stringify(parseChunks([text.slice(0, i), text.slice(i, j), text.slice(j)])), whole); splits++; }
    splits++;
  }
  assert(splits > 1000);
  assert.strictEqual(JSON.stringify(parseChunks(Array.from(text))), whole); // one character per chunk
  assert.strictEqual(JSON.stringify(parseChunks(text.split(""))), whole);   // emoji split into its two halves
});
ok("big: csvBatches across byte chunks (split characters, BOM, \\r\\n)", async () => {
  const text = "\uFEFFname,city\r\n山田,東京\r\n\"Ken\",\"Köln\"\r\n";
  const bytes = [...new TextEncoder().encode(text)];
  for (let cut = 0; cut <= bytes.length; cut++) {
    const batches = await collect(chunkedFile([bytes.slice(0, cut), bytes.slice(cut)]));
    const rows = batches.flatMap((b) => b.rows);
    assert.deepStrictEqual(rows, [{ line: 1, cells: ["name", "city"] }, { line: 2, cells: ["山田", "東京"] }, { line: 3, cells: ["Ken", "Köln"] }], "cut " + cut);
    assert.strictEqual(batches.at(-1).bytesRead, bytes.length);
    assert.strictEqual(batches.at(-1).done, true);
  }
  // A TextDecoder without stream: true breaks a character split this way; TextDecoderStream does not.
  const hi = [...new TextEncoder().encode("日")];
  assert.strictEqual(new TextDecoder().decode(Uint8Array.from(hi.slice(0, 1))), "�");
});
ok("big: batch sizes, row counts and progress", async () => {
  const text = bigCsv(20000);
  const batches = await collect(new Blob([text]), { batchSize: 1000 });
  const rows = batches.flatMap((b) => b.rows);
  assert.strictEqual(rows.length, 20001);
  assert.deepStrictEqual(rows[1], { line: 2, cells: ["0", "Name 0", 'a, "b"\nc 日本', "0.5"] });
  assert.strictEqual(rows.at(-1).line, 40000); // each record takes two lines
  for (const b of batches.slice(0, -1)) assert(b.rows.length === 1000 && !b.done);
  assert.strictEqual(batches.at(-1).rows.length, 1);
  assert(batches.length > 5);
  const read = batches.map((b) => b.bytesRead);
  assert.deepStrictEqual(read, [...read].sort((a, b) => a - b));
  assert.strictEqual(read.at(-1), new Blob([text]).size);
  assert.deepStrictEqual(batches.flatMap((b) => b.errors), []);
});
ok("big: Node 22 gives a whole Blob as one stream chunk", async () => {
  const reader = new Blob(["x".repeat(11000000)]).stream().getReader();
  const sizes = [];
  for (;;) { const { value, done } = await reader.read(); if (done) break; sizes.push(value.length); }
  assert.deepStrictEqual(sizes, [11000000]); // so csvBatches must cut chunks into pieces itself
});
ok("big: without fatal, bad bytes silently become U+FFFD; Node 22 has no global Worker", async () => {
  const reader = new Blob([Uint8Array.from([0x43, 0x61, 0x66, 0xe9, 0x2c, 0x31])]).stream().pipeThrough(new TextDecoderStream()).getReader();
  let text = "";
  for (;;) { const { value, done } = await reader.read(); if (done) break; text += value; }
  assert.strictEqual(text, "Caf\uFFFD,1");
  assert.strictEqual(typeof Worker, "undefined");
  assert.strictEqual(parse("a,b\n1,2").rows[0][1].join(), "a,b"); // the first row is the header row
});
ok("big: errors arrive with the batch that contains them", async () => {
  const batches = await collect(new Blob(['a,b\n"x" y,1\n"never closed,2\n3,4\n']));
  assert.deepStrictEqual(batches.flatMap((b) => b.errors), [{ line: 2, message: 'text after a closing quote: " "' }, { line: 3, message: "a quote opened on this line is never closed" }]);
  assert.deepStrictEqual(batches.flatMap((b) => b.rows).at(-1), { line: 3, cells: ["never closed,2\n3,4\n"] });
});
ok("big: bytes that are not valid UTF-8 fail instead of turning into �", async () => {
  await assert.rejects(collect(chunkedFile([[0x43, 0x61, 0x66, 0xe9, 0x0a]])), TypeError);
  const sjis = [0x8e, 0x52, 0x93, 0x63, 0x2c, 0x93, 0x8c, 0x8b, 0x9e, 0x0a]; // 山田,東京 in Shift_JIS
  const rows = (await collect(chunkedFile([sjis.slice(0, 3), sjis.slice(3)]), { encoding: "shift_jis" })).flatMap((b) => b.rows);
  assert.deepStrictEqual(rows, [{ line: 1, cells: ["山田", "東京"] }]);
  assert.deepStrictEqual((await collect(chunkedFile(["a;b\n1;2"]), { delimiter: ";" })).flatMap((b) => b.rows.map((r) => r.cells)), [["a", "b"], ["1", "2"]]);
});
ok("big: importCsv gets every row, one batch at a time", async () => {
  let rows = 0, calls = 0;
  const progress = [];
  const job = importCsv(new Blob([bigCsv(30000)]), {
    onBatch: async (batch, errors) => { rows += batch.length; calls++; assert.deepStrictEqual(errors, []); await new Promise((r) => setTimeout(r, 2)); },
    onProgress: (share) => progress.push(share),
    options: { batchSize: 2000 },
  });
  const worker = FakeWorker.all.at(-1); // tests run at the same time, so take it right away
  assert.deepStrictEqual(await job.result, { rowCount: 30001 });
  assert.strictEqual(rows, 30001);
  assert(calls > 5);
  assert.strictEqual(worker.maxAhead, 1); // the worker never ran ahead of the page
  assert.strictEqual(worker.terminated, true);
  assert.deepStrictEqual(progress, [...progress].sort((a, b) => a - b));
  assert.strictEqual(progress.at(-1), 1);
  job.cancel(); // after the end: no effect
  assert.deepStrictEqual(await job.result, { rowCount: 30001 });
});
ok("big: importCsv cancel, failures and empty files", async () => {
  let calls = 0;
  const job = importCsv(new Blob([bigCsv(30000)]), { onBatch: () => { calls++; job.cancel(); } });
  const worker = FakeWorker.all.at(-1); // tests run at the same time, so take it right away
  await assert.rejects(job.result, (e) => e.name === "AbortError");
  await new Promise((r) => setTimeout(r, 20));
  assert.strictEqual(calls, 1);
  assert.strictEqual(worker.terminated, true);

  const early = importCsv(new Blob([bigCsv(1000)]), { onBatch: () => { throw new Error("should not run"); } });
  early.cancel();
  await assert.rejects(early.result, (e) => e.name === "AbortError");

  const saveFails = importCsv(new Blob([bigCsv(10)]), { onBatch: async () => { throw new Error("API down"); } });
  const saveWorker = FakeWorker.all.at(-1);
  await assert.rejects(saveFails.result, /API down/);
  assert.strictEqual(saveWorker.terminated, true);

  const notUtf8 = importCsv(new Blob([Uint8Array.from([0x43, 0x61, 0x66, 0xe9])]), { onBatch() {} });
  await assert.rejects(notUtf8.result, /not valid/);

  let seen = null;
  const empty = importCsv(new Blob([""]), { onBatch: (r) => { seen = r; }, onProgress: (p) => assert.strictEqual(p, 1) });
  assert.deepStrictEqual(await empty.result, { rowCount: 0 });
  assert.deepStrictEqual(seen, []);
});
ok("big: the upload form example", async () => {
  const handlers = {};
  const els = {
    "#csv-file": { files: [], value: "C:\\fakepath\\x.csv", addEventListener: (t, f) => (handlers[t] = f) },
    "#import-status": { textContent: "" },
    "#cancel-import": {},
  };
  const staged = new Map(), live = [], statuses = [];
  let failDiscard = false;
  const fakes = {
    document: { querySelector: (q) => els[q] },
    crypto,
    importCsv,
    async saveRows(id, header, rows, signal) {
      assert(signal instanceof AbortSignal);
      assert(Array.isArray(header));
      staged.set(id, [...(staged.get(id) ?? []), ...rows]);
      statuses.push(els["#import-status"].textContent);
      await new Promise((r) => setTimeout(r, 1));
    },
    async commitImport(id) { live.push(...staged.get(id)); staged.delete(id); },
    async discardImport(id) { staged.delete(id); if (failDiscard) throw new Error("network down"); },
  };
  new Function(...Object.keys(fakes), %%USE_JSON%%)(...Object.values(fakes));
  const choose = (content) => { els["#csv-file"].files = content === null ? [] : [new Blob([content])]; return handlers.change(); };
  const status = () => els["#import-status"].textContent;

  await choose(bigCsv(5000));
  assert.strictEqual(status(), "Imported 5000 rows");
  assert.strictEqual(live.length, 5000); // the header row is not saved as a record
  assert.strictEqual(live[0].cells[0], "0");
  assert.strictEqual(els["#csv-file"].value, "");
  assert(statuses.some((s) => /^\d+% read$/.test(s)));

  // A ragged row or a parser problem: nothing goes live, staged rows are deleted.
  await choose("a,b\n1,2\n3\n4,5\n");
  assert.strictEqual(status(), "1 problems; line 3: 1 cells, header has 2");
  await choose('a,b\n"x" y,1\n');
  assert.strictEqual(status(), '1 problems; line 2: text after a closing quote: " "');
  assert.strictEqual(staged.size, 0);
  assert.strictEqual(live.length, 5000);
  // A wrong delimiter: every row is a problem, and the import stops after the first batch.
  let saves = statuses.length;
  await choose("a;b;c\n" + "1;2,3\n".repeat(10000));
  assert.match(status(), /^1999 problems; line 2: 2 cells, header has 1$/);
  assert.strictEqual(statuses.length, saves); // nothing was saved
  // Other failures, and a failing discard, still end with a status.
  failDiscard = true;
  await choose(new Uint8Array([0x43, 0x61, 0x66, 0xe9]));
  assert.match(status(), /^Import failed: .*not valid/);
  failDiscard = false;

  // Cancel during the import.
  const running = choose(bigCsv(30000));
  await new Promise((r) => setTimeout(r, 5));
  els["#cancel-import"].onclick();
  await running;
  assert.strictEqual(status(), "Import cancelled");
  assert.strictEqual(staged.size, 0);

  // A second file replaces the first; the cancelled first import does not overwrite the status.
  const first = choose(bigCsv(30000));
  await new Promise((r) => setTimeout(r, 5));
  const second = choose("a,b\n1,2\n");
  await Promise.all([first, second]);
  assert.strictEqual(status(), "Imported 1 rows");
  assert.strictEqual(staged.size, 0);
  assert.strictEqual(live.length, 5001);

  await choose(null); // no file chosen: nothing happens
  assert.strictEqual(status(), "Imported 1 rows");
});
ok("big: cancel while onBatch is saving: no progress afterwards, the signal aborts", async () => {
  const events = [];
  let signalSeen = null;
  const job = importCsv(new Blob([bigCsv(30000)]), {
    async onBatch(rows, errors, signal) {
      signalSeen = signal;
      events.push("batch");
      job.cancel();
      events.push("aborted " + signal.aborted);
      await new Promise((r) => setTimeout(r, 5));
      events.push("save done");
    },
    onProgress: () => events.push("progress"),
  });
  await assert.rejects(job.result, (e) => e.name === "AbortError");
  await new Promise((r) => setTimeout(r, 30));
  assert.deepStrictEqual(events, ["batch", "aborted true", "save done"]);
  assert.strictEqual(signalSeen.aborted, true);
  // A falsy thrown value still rejects.
  const odd = importCsv(new Blob(["a\n"]), { onBatch() { throw undefined; } });
  await assert.rejects(odd.result.then(() => { throw new Error("resolved"); }, () => { throw new Error("rejected"); }), /rejected/);
  // The worker is started as a module worker.
  assert.strictEqual(FakeWorker.all.at(-1).type, "module");
});
ok("big: failures in onProgress, options and batchSize reject instead of hanging", async () => {
  const thrower = importCsv(new Blob([bigCsv(5000)]), { onBatch() {}, onProgress() { throw new Error("bad progress bar"); } });
  const w1 = FakeWorker.all.at(-1);
  await assert.rejects(thrower.result, /bad progress bar/);
  assert.strictEqual(w1.terminated, true);
  const withFunction = importCsv(new Blob(["a\n"]), { onBatch() {}, options: { onError() {} } });
  const w2 = FakeWorker.all.at(-1);
  await assert.rejects(withFunction.result, (e) => e.name === "DataCloneError");
  assert.strictEqual(w2.terminated, true);
  for (const batchSize of [0, -1, 1.5, "10"]) {
    await assert.rejects(importCsv(new Blob(["a\n"]), { onBatch() {}, options: { batchSize } }).result, /batchSize must be a whole number/);
    await assert.rejects(collect(new Blob(["a\n"]), { batchSize }), /batchSize must be a whole number/);
  }
  assert.strictEqual((await collect(new Blob(["a\nb\n"]), { batchSize: 1 })).length, 3);
});
ok("big: stopping early or failing releases the file stream", async () => {
  let cancelled = 0;
  // An endless file: `first`, then `rest` again and again.
  const file = (first, rest = first) => ({ size: 1, stream: () => { let n = 0; return new ReadableStream({
    pull(c) { c.enqueue(new TextEncoder().encode(n++ ? rest : first)); }, cancel() { cancelled++; } }); } });
  for await (const batch of csvBatches(file("a\n".repeat(100)), { batchSize: 10 })) { assert.strictEqual(batch.rows.length, 10); break; }
  await new Promise((r) => setTimeout(r, 5));
  assert.strictEqual(cancelled, 1);
  await assert.rejects(collect(file('a,"', "x".repeat(100)), { maxCellLength: 1000 }), /line 1: a cell is longer than 1000 characters/);
  await new Promise((r) => setTimeout(r, 5));
  assert.strictEqual(cancelled, 2);
});
ok("big: a quote that is never closed stops at maxCellLength", async () => {
  const text = 'id,note\n1,ok\n2,"never closed\n' + "3,x\n".repeat(400000);
  const job = importCsv(new Blob([text]), { onBatch() {}, options: { maxCellLength: 100000 } });
  await assert.rejects(job.result, /^Error: line 3: a cell is longer than 100000 characters$/);
  assert.throws(() => parse("a".repeat(11), { maxCellLength: 10 }), /line 1: a cell is longer than 10 characters/);
  assert.deepStrictEqual(parse("a".repeat(10), { maxCellLength: 10 }).rows, [[1, ["a".repeat(10)]]]);
});
ok("big: a delimiter must be one character, not a quote or line break", async () => {
  for (const d of [",,", "", '"', "\r", "\n"]) assert.throws(() => parse("a", { delimiter: d }), /delimiter must be one character/, JSON.stringify(d));
  const job = importCsv(new Blob(["a\n"]), { onBatch() {}, options: { delimiter: ";;" } });
  await assert.rejects(job.result, /delimiter must be one character/);
});
ok("big: TextDecoderStream already removes a UTF-8 byte order mark", async () => {
  const reader = new Blob([Uint8Array.from([0xef, 0xbb, 0xbf, 0x61])]).stream().pipeThrough(new TextDecoderStream()).getReader();
  assert.strictEqual((await reader.read()).value, "a");
  assert.deepStrictEqual(parse("\uFEFF\uFEFFa").rows, [[1, ["\uFEFFa"]]]); // only one is removed
});
ok("big: no invisible characters in the snippets", () => {
  for (const s of %%ALL_JSON%%) assert(!/[\u00A0\u200B-\u200F\u2028\u2029\uFEFF]/.test(s));
});
}
"""
BIG_TABLE = [
  ["a,b\r\nc,d\r\n", None, [[1, ["a", "b"]], [2, ["c", "d"]]], []],
  ["a,b\rc,d", None, [[1, ["a", "b"]], [2, ["c", "d"]]], []],
  ['id,note\n1,"Acme, Inc"\n', None, [[1, ["id", "note"]], [2, ["1", "Acme, Inc"]]], []],
  ['id,note\n1,"two\r\nlines"\n2,x\n', None, [[1, ["id", "note"]], [2, ["1", "two\r\nlines"]], [4, ["2", "x"]]], []],
  ['"He said ""hi"""', None, [[1, ['He said "hi"']]], []],
  ['Ken,5" screen', None, [[1, ["Ken", '5" screen']]], []],
  ['"Acme" Inc,1', None, [[1, ["Acme Inc", "1"]]], [[1, 'text after a closing quote: " "']]],
  ["a\n\n\nb\n", None, [[1, ["a"]], [4, ["b"]]], []],
  ['a\n""\n', None, [[1, ["a"]], [2, [""]]], []],
  ["a,\n,\n", None, [[1, ["a", ""]], [2, ["", ""]]], []],
  ["\uFEFFname", None, [[1, ["name"]]], []],
  ['a\n"open,1\n2,3\n', None, [[1, ["a"]], [2, ["open,1\n2,3\n"]]], [[2, "a quote opened on this line is never closed"]]],
  ["a;b\n1,5;2", {"delimiter": ";"}, [[1, ["a", "b"]], [2, ["1,5", "2"]]], []],
  ["a\tb\n1\t2", {"delimiter": "\t"}, [[1, ["a", "b"]], [2, ["1", "2"]]], []],
  ["", None, [], []],
  [" a , b ", None, [[1, [" a ", " b "]]], []],
]
_big_names = ["BIG_PROBLEM", "BIG_PARSER", "BIG_BATCHES", "BIG_WORKER", "BIG_MAIN", "BIG_USE"]
def _script(src):
    """The article's ES modules as plain script for the Node tests: no import lines, no export keywords."""
    lines = [l for l in src.split("\n") if not l.startswith("import ")]
    return "\n".join(l[len("export "):] if l.startswith("export ") else l for l in lines)
BIG_WORKER_SOURCE = _script(BIG_PARSER + "\n\n" + BIG_BATCHES + "\n\n" + BIG_WORKER)
for _k in ["BIG_PARSER", "BIG_BATCHES"]:
    BIG_TESTS = BIG_TESTS.replace("%%" + _k + "%%", _script(globals()[_k]))
BIG_TESTS = BIG_TESTS.replace("%%WORKER_SOURCE_JSON%%", _json.dumps(BIG_WORKER_SOURCE))
BIG_TESTS = BIG_TESTS.replace("%%MAIN_JSON%%", _json.dumps(_script(BIG_MAIN)))
BIG_TESTS = BIG_TESTS.replace("%%USE_JSON%%", _json.dumps(_script(BIG_USE)))
BIG_TESTS = BIG_TESTS.replace("%%PROBLEM_JSON%%", _json.dumps(BIG_PROBLEM))
BIG_TESTS = BIG_TESTS.replace("%%TABLE_JSON%%", _json.dumps(BIG_TABLE, ensure_ascii=False))
BIG_TESTS = BIG_TESTS.replace("%%ALL_JSON%%", _json.dumps([globals()[k] for k in _big_names]))
out += BIG_TESTS
# The Chromium test (tests/smoke.cjs) runs the same worker code in a real Worker.
_out_dir = os.path.dirname(os.path.abspath(sys.argv[1])) if len(sys.argv) > 1 else None
if _out_dir:
    open(os.path.join(_out_dir, "article-browser.json"), "w").write(_json.dumps(
        {"csv-stream.js": BIG_PARSER + "\n\n" + BIG_BATCHES + "\n", "csv-worker.js": BIG_WORKER + "\n",
         "import-csv.js": BIG_MAIN + "\n"}, indent=1) + "\n")
open(sys.argv[1] if len(sys.argv) > 1 else "/dev/stdout", "w").write(out)
