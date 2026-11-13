// SheetSift landing page checks. Run: node tests/smoke.cjs
const path = require("path");
const fs = require("fs");
const os = require("os");
const { chromium } = require("playwright");

const PAGE = "file://" + path.resolve(__dirname, "..", "index.html");
let failed = 0;
function check(name, ok, detail) {
  console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  -> " + JSON.stringify(detail)));
  if (!ok) failed++;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  // Offline runs: serve SheetJS from a local copy instead of the CDN.
  if (process.env.LOCAL_XLSX) {
    await page.route(/xlsx\.full\.min\.js/, (route) => route.fulfill({ path: process.env.LOCAL_XLSX, contentType: "application/javascript" }));
  }
  await page.goto(PAGE);
  await page.waitForTimeout(800);

  const run = (text) => page.evaluate((t) => {
    const E = window.SheetSiftEngine;
    const res = E.process(E.parseCSV(t));
    return { h: res.headerRow, skipped: res.skipped.length, cols: res.columns.map(c => c.type),
             rows: res.rows.map(r => r.cells.map(c => c.value + "|" + c.status)), counts: res.counts };
  }, text);
  const safe = async (name, text) => {
    try { return await run(text); } catch (e) { check(name + " does not crash", false, String(e)); return null; }
  };

  // 0. Visit counter: present, but never loads outside the public site (so tests and local runs are not counted)
  const gcr = await page.evaluate(() => ({ inline: document.documentElement.innerHTML.includes("sheetsift.goatcounter.com/count"), loaded: !!document.querySelector('script[src*="gc.zgo.at"]') }));
  check("counter: snippet present, not loaded on file://", gcr.inline && !gcr.loaded, gcr);

  // 1. Built-in sample
  let r = await page.evaluate(() => {
    const E = window.SheetSiftEngine; const res = E.process(E.parseCSV(window.__sheetsiftSample));
    return { h: res.headerRow, counts: res.counts, rows: res.rows.length };
  });
  check("sample: header on row 3", r.h === 3, r);
  check("sample: 5 data rows", r.rows === 5, r);
  check("sample: 1 bad, 1 ambiguous", r.counts.bad === 1 && r.counts.warn === 1, r);

  // 2. German export with semicolons and decimal commas
  r = await safe("german", "Kundenliste;;\n;;\nKunde;Datum;Betrag\nA GmbH;31/01/2026;1.234,50\nB AG;05/02/2026;99,90\nSumme;;1.334,40\n");
  if (r) {
    check("german: header row 3", r.h === 3, r);
    check("german: totals row skipped", r.rows.length === 2, r);
    check("german: day-first dates", r.rows[1][1] === "2026-02-05|fixed", r.rows);
    check("german: decimal comma", r.rows[0][2] === "1234.50|fixed", r.rows);
  }

  // 2b. Negative and Swiss formats from accounting exports (see the European numbers article)
  r = await page.evaluate(() => {
    const p = window.SheetSiftEngine.parseNumber;
    return [p("1.234,56-", true), p("\u22121.234,56", true), p("1'234.50", false), p("1\u2019234.50 CHF", false), p("CHF 99.90", false), p("(1,234.56)", false), p("-99,90 €", true), p("12abc34", false)];
  });
  check("numbers: trailing minus, U+2212, apostrophes, CHF", JSON.stringify(r) === JSON.stringify([-1234.56, -1234.56, 1234.5, 1234.5, 99.9, -1234.56, -99.9, null]), r);
  r = await safe("ledger", "Konto;Saldo\nKasse;1.234,56-\nBank;2.000,00\nDebitoren;\u2212150,00\n");
  if (r) check("ledger: negative formats become numbers", r.cols[1] === "number" && r.rows.map((x) => x[1]).join() === "-1234.56|fixed,2000.00|fixed,-150.00|fixed", r);

  // 2c. A row with more values than columns (unquoted comma) is flagged, not silently cut
  r = await safe("extra values", "Name,Company,Amount\nYui,Acme,49\nKen,Acme, Inc,120\nLi,Orbit,7\n");
  if (r) {
    check("extra values: row is flagged", r.rows[1][2].endsWith("|warn") && r.counts.warn >= 1, r.rows);
    check("extra values: other rows untouched", !r.rows[0].some((c) => c.endsWith("|warn")) && !r.rows[2].some((c) => c.endsWith("|warn")), r.rows);
  }

  // 3. Japanese headers, yen, Japanese dates
  r = await safe("japanese", "顧客一覧,,,\n氏名,メール,登録日,金額\n田中,tanaka@example.jp,2026年4月3日,\"¥1,200\"\n佐藤,sato@example.jp,2026/04/05,800円\n鈴木,suzuki@example.jp,2026-04-06,1500\n合計,,,3500\n");
  if (r) {
    check("japanese: header row 2", r.h === 2, r);
    check("japanese: totals skipped", r.rows.length === 3, r);
    check("japanese: email column", r.cols[1] === "email", r.cols);
    check("japanese: date normalised", r.rows[0][2] === "2026-04-03|fixed", r.rows);
    check("japanese: yen parsed", r.rows[0][3].startsWith("1200") && r.rows[1][3].startsWith("800"), r.rows);
  }

  // 4. Edge cases that must not crash
  for (const [name, text] of [
    ["empty file", ""],
    ["only whitespace", "\n\n  \n"],
    ["header only", "Name,Email\n"],
    ["single column", "Name\nA\nB\n"],
    ["quoted newline", "Name,Note\nA,\"line one\nline two\"\nB,ok\n"],
    ["BOM and CRLF", "\ufeffName,Email\r\nA,a@example.com\r\nB,b@example.com\r\n"],
    ["tab separated", "Name\tEmail\nA\ta@example.com\n"],
    ["garbage", "\u0000\u0001PK\u0003\u0004 binary junk \ufffd\ufffd"],
    ["unclosed quote", "Name,Note\nA,\"never closed\nB,x\n"],
    ["ragged rows", "a,b,c\n1\n1,2,3,4,5\n"],
  ]) {
    const res = await safe(name, text);
    if (res) check(name + " does not crash", true);
  }

  // 5. Performance: 20,000 rows under 2 seconds
  const big = ["Name,Email,Date,Amount"].concat(Array.from({ length: 20000 }, (_, i) =>
    `User ${i},user${i}@example.com,2026/0${(i % 9) + 1}/1${i % 9},"${i},50"`)).join("\n");
  const t0 = Date.now(); r = await safe("20k rows", big); const ms = Date.now() - t0;
  check("20k rows under 2s (" + ms + "ms)", r && ms < 2000, ms);

  // 6. Excel upload through the real file input
  const xlsxB64 = await page.evaluate(() => {
    const ws = XLSX.utils.aoa_to_sheet([["Report"], [], ["Name", "Joined", "Amount"], ["A", new Date(Date.UTC(2026, 3, 3)), 10.5], ["B", new Date(Date.UTC(2026, 3, 4)), 20], ["Total", "", 30.5]]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  });
  const xlsxPath = path.join(os.tmpdir(), "sheetsift-test.xlsx");
  fs.writeFileSync(xlsxPath, Buffer.from(xlsxB64, "base64"));
  await page.setInputFiles("#file", xlsxPath);
  await page.waitForTimeout(800);
  const xs = await page.locator("#summary").innerText();
  const firstDate = await page.locator("#out tbody tr:first-child td:nth-child(3)").innerText().catch(() => "");
  check("xlsx: header found on row 3", /row 3/.test(xs), xs);
  check("xlsx: date cell is ISO", /^2026-04-0[34]$/.test(firstDate.trim()), firstDate);

  // 6a. Excel date cells are read from the stored date, not from their display text:
  // dd/mm/yyyy display, a 1904-system workbook, date-times, and serial 60 (1900-02-29, a day that never existed).
  const datesB64 = await page.evaluate(() => {
    const cell = (v, z) => ({ t: "n", v, z });
    const ws = { "!ref": "A1:B5",
      A1: { t: "s", v: "Name" }, B1: { t: "s", v: "Joined" },
      A2: { t: "s", v: "A" }, B2: cell(46027, "dd/mm/yyyy"),
      A3: { t: "s", v: "B" }, B3: cell(46059, "dd/mm/yyyy"),
      A4: { t: "s", v: "C" }, B4: cell(46027.5625, "dd/mm/yyyy hh:mm"),
      A5: { t: "s", v: "D" }, B5: cell(60, "dd/mm/yyyy") };
    const wb = { SheetNames: ["S"], Sheets: { S: ws } };
    const ws1904 = { "!ref": "A1:B2", A1: { t: "s", v: "Name" }, B1: { t: "s", v: "Joined" }, A2: { t: "s", v: "A" }, B2: cell(44565, "m/d/yy") };
    return [XLSX.write(wb, { type: "base64", bookType: "xlsx" }),
            XLSX.write({ SheetNames: ["S"], Sheets: { S: ws1904 }, Workbook: { WBProps: { date1904: true } } }, { type: "base64", bookType: "xlsx" })];
  });
  const datesPath = path.join(os.tmpdir(), "sheetsift-dates.xlsx");
  fs.writeFileSync(datesPath, Buffer.from(datesB64[0], "base64"));
  await page.setInputFiles("#file", datesPath);
  await page.waitForTimeout(800);
  const dateCells = await page.locator("#out tbody tr td:nth-child(3)").allInnerTexts();
  check("xlsx: dd/mm/yyyy date cells become ISO, not ambiguous", dateCells.slice(0, 3).map((s) => s.trim()).join() === "2026-01-05,2026-02-06,2026-01-05", dateCells);
  check("xlsx: serial 60 (1900-02-29) is flagged", /1900-02-29/.test(dateCells[3] || "") && /does not exist/i.test(await page.locator("#out tbody tr:nth-child(4)").innerHTML()), dateCells[3]);
  fs.writeFileSync(datesPath, Buffer.from(datesB64[1], "base64"));
  await page.setInputFiles("#file", datesPath);
  await page.waitForTimeout(800);
  const d1904 = await page.locator("#out tbody tr:first-child td:nth-child(3)").innerText().catch(() => "");
  check("xlsx: 1904 date system", d1904.trim() === "2026-01-05", d1904);

  // 6b. Excel with an empty first sheet uses the sheet that has data
  const multiB64 = await page.evaluate(() => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "Cover");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Name", "Email"], ["A", "a@example.com"], ["B", "b@example.com"]]), "Data");
    return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  });
  const multiPath = path.join(os.tmpdir(), "sheetsift-multi.xlsx");
  fs.writeFileSync(multiPath, Buffer.from(multiB64, "base64"));
  await page.setInputFiles("#file", multiPath);
  await page.waitForTimeout(800);
  check("xlsx: skips an empty first sheet", (await page.locator("#out tbody tr").count()) === 2, await page.locator("#summary").innerText());

  // 6c. Hostile file content is shown as text, never run as HTML
  const evilPath = path.join(os.tmpdir(), "sheetsift-evil.csv");
  fs.writeFileSync(evilPath, "Name,Email\n\"'><img src=x onerror=window.__pwned=1>\",bad'mail\nB,b@example.com\n");
  await page.setInputFiles("#file", evilPath);
  await page.waitForTimeout(500);
  check("hostile cell text is not executed", (await page.evaluate(() => !window.__pwned && !document.querySelector("#out img"))), "");

  // 7. Unsupported file type is refused politely
  const pdfPath = path.join(os.tmpdir(), "sheetsift-test.pdf");
  fs.writeFileSync(pdfPath, "%PDF-1.4 fake");
  await page.setInputFiles("#file", pdfPath);
  await page.waitForTimeout(300);
  const ps = await page.locator("#summary").innerText();
  check("pdf: refused with a message", /CSV or Excel/i.test(ps), ps);

  // 7b. CSV files that are not UTF-8
  const upload = async (name, bytes) => {
    const p = path.join(os.tmpdir(), name);
    fs.writeFileSync(p, bytes);
    await page.setInputFiles("#file", p);
    await page.waitForTimeout(500);
    return { summary: await page.locator("#summary").innerText(), table: await page.locator("#out").innerText().catch(() => "") };
  };
  let enc = await upload("sjis.csv", Buffer.from("8e8196bc2c8be08a7a0a8e52936391be98592c313230300a8db293a189d48e712c3830300a", "hex"));
  check("encoding: Shift_JIS CSV is decoded", /山田太郎/.test(enc.table) && /佐藤花子/.test(enc.table) && /shift_jis/i.test(enc.summary), enc);
  enc = await upload("latin.csv", Buffer.from("4e616d652c436974790a4dfc6c6c65722c4bf66c6e0a4a6f73e92c53e36f205061756c6f0a", "hex"));
  check("encoding: Windows-1252 CSV is decoded", /Müller/.test(enc.table) && /São Paulo/.test(enc.table) && /windows-1252/i.test(enc.summary), enc);
  enc = await upload("utf16.txt", Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Name\tCity\nYui\t東京\nAnna\tKöln\n", "utf16le")]));
  check("encoding: UTF-16LE with BOM (tab-separated) is decoded", /東京/.test(enc.table) && /Köln/.test(enc.table), enc);
  enc = await upload("utf8bom.csv", Buffer.from("\ufeffName,City\nYui,東京\n", "utf8"));
  check("encoding: UTF-8 BOM is not part of the first header", /Name/.test(enc.table) && !/\ufeff/.test(enc.table) && !/utf-8|encoding/i.test(enc.summary), enc);
  enc = await upload("renamed.csv", Buffer.from(await page.evaluate(() => XLSX.write({ SheetNames: ["S"], Sheets: { S: XLSX.utils.aoa_to_sheet([["a"]]) } }, { type: "base64", bookType: "xlsx" })), "base64"));
  check("encoding: an .xlsx renamed to .csv is refused with a reason", /xlsx/i.test(enc.summary) && /bad/.test(await page.locator("#summary .tag").first().getAttribute("class")), enc);
  enc = await upload("old.csv", Buffer.from("d0cf11e0a1b11ae1000000000000000000000000", "hex"));
  check("encoding: an old .xls renamed to .csv is refused with a reason", /old \.xls/.test(enc.summary), enc);
  enc = await upload("crdamaged.csv", Buffer.concat([Buffer.from("Name,City\rYui,東京\r", "utf8"), Buffer.from([0x4a, 0x6f, 0x73, 0xe9, 0x2c, 0x58, 0x0d]), Buffer.from("Ken,大阪\r", "utf8")]));
  check("encoding: damaged UTF-8 with CR-only line breaks reports the right line", /line 3/.test(enc.summary), enc);
  enc = await upload("damaged.csv", Buffer.concat([Buffer.from("Name,City\nYui,東京\n", "utf8"), Buffer.from([0x4a, 0x6f, 0x73, 0xe9, 0x2c, 0x58, 0x0a]), Buffer.from("Ken,大阪\n", "utf8")]));
  check("encoding: damaged UTF-8 is read and flagged with the line", /大阪/.test(enc.table) && /line 3/.test(enc.summary), enc);

  enc = await upload("yen.csv", Buffer.from("4974656d2c50726963650a50656e2c313030897e0a426f6f6b2c31323030897e0a", "hex"));
  check("encoding: Shift_JIS prices with 円 and no kana", /Book\t1200/.test(enc.table) && /shift_jis/i.test(enc.summary) && !/Encoding:/.test(enc.summary), enc);
  enc = await upload("quotes.csv", Buffer.from("4e6f74650a6c92e974e92c204a6f73e9927320636166e90a", "hex"));
  check("encoding: Windows-1252 with curly apostrophes", /l’été/.test(enc.table) && /windows-1252/i.test(enc.summary) && !/Encoding:/.test(enc.summary), enc);

  // 7c. Blob.text() in Chromium (quoted in the encodings post, with the version printed here)
  console.log("Chromium version: " + browser.version());
  const blobText = await page.evaluate(async () => [
    await new Blob([new Uint8Array([0x43, 0x61, 0x66, 0xe9])]).text(),
    await new Blob([new Uint8Array([0xff, 0xfe, 0x48, 0x00, 0x69, 0x00])]).text(),
  ]);
  check("encoding: Chromium Blob.text() reads Windows-1252 as UTF-8 but honours a UTF-16 BOM", blobText[0] === "Caf\ufffd" && blobText[1] === "Hi", blobText);

  // 8. Waitlist form
  const key = await page.locator('#wl input[name="access_key"]').inputValue();
  if (key === "YOUR_ACCESS_KEY") {
    await page.fill("#email", "test@example.com");
    await page.click('#wl button[type="submit"]');
    await page.waitForTimeout(200);
    const m = await page.locator("#form-msg").innerText();
    check("form: placeholder key shows 'not connected'", /connected yet/.test(m), m);
  } else {
    check("form: access key looks valid", /^[0-9a-f-]{36}$/i.test(key), key);
  }
  await page.goto(PAGE + "?joined=1");
  await page.waitForTimeout(300);
  check("form: thank-you message after redirect", /on the list/.test(await page.locator("#form-msg").innerText()));

  // 9. Layout: no sideways scroll on a phone, light and dark
  for (const scheme of ["light", "dark"]) {
    const p2 = await browser.newPage({ viewport: { width: 375, height: 800 }, colorScheme: scheme });
    await p2.goto(PAGE); await p2.waitForTimeout(500);
    const w = await p2.evaluate(() => document.documentElement.scrollWidth);
    check("phone " + scheme + ": no horizontal scroll (" + w + ")", w <= 375, w);
    await p2.close();
  }

  check("no script errors on the page", errors.length === 0, errors);

  // 10. Blog: every page renders on a phone and every local link points to a real file
  const root = path.resolve(__dirname, "..");
  const pages = ["index.html", "blog/index.html"].concat(
    fs.readdirSync(path.join(root, "blog"), { withFileTypes: true }).filter((d) => d.isDirectory())
      .map((d) => "blog/" + d.name + "/index.html"));
  for (const rel of pages) {
    const file = path.join(root, rel);
    const htmlText = fs.readFileSync(file, "utf8");
    const hrefs = [...htmlText.matchAll(/href="([^"#:]+)(#[^"]*)?"/g)].map((m) => m[1]).filter((h) => !h.startsWith("//"));
    const broken = hrefs.filter((h) => {
      let target = path.resolve(path.dirname(file), h);
      if (h.endsWith("/") || fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, "index.html");
      return !fs.existsSync(target);
    });
    check(rel + ": local links resolve", broken.length === 0, broken);
    const p3 = await browser.newPage({ viewport: { width: 375, height: 800 } });
    const errs3 = []; p3.on("pageerror", (e) => errs3.push(String(e)));
    await p3.goto("file://" + file); await p3.waitForTimeout(300);
    const w3 = await p3.evaluate(() => document.documentElement.scrollWidth);
    check(rel + ": no horizontal scroll on phone (" + w3 + ")", w3 <= 375 && errs3.length === 0, { w3, errs3 });
    await p3.close();
  }
  await browser.close();
  console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
  process.exit(failed ? 1 : 0);
})();
