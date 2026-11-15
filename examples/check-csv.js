// Generated from tools/snippets.py by tools/make_article_tests.py. Do not edit.
// From https://shoheitaro003.github.io/sheetsift/blog/find-csv-rows-broken-by-unquoted-commas-javascript/

// \r\n, \n and a lone \r each end one line. Returns 2, 1, or 0 (no line break).
function breakLength(text, i) {
  if (text[i] === "\r" && text[i + 1] === "\n") return 2;
  return text[i] === "\n" || text[i] === "\r" ? 1 : 0;
}
const countBreaks = (s) => (s.match(/\r\n|\r|\n/g) || []).length;

// Reads a quoted value; text[open] is the opening quote. "" inside it is one quote.
function readQuoted(text, open) {
  let value = "", breaks = 0, i = open + 1;
  while (i < text.length) {
    if (text[i] === '"' && text[i + 1] === '"') { value += '"'; i += 2; continue; }
    if (text[i] === '"') return { value, end: i + 1, breaks, closed: true };
    const n = breakLength(text, i);
    if (n) breaks++;
    value += text.slice(i, i + (n || 1));
    i += n || 1;
  }
  return { value, end: i, breaks, closed: false };
}

// Reads one value starting at text[i]. `end` is the index of the delimiter,
// line break or end of text that stops it.
function readField(text, i, delimiter) {
  const stopsAt = (j) =>
    j >= text.length || text[j] === delimiter || breakLength(text, j) > 0;
  const scanTo = (j) => { while (!stopsAt(j)) j++; return j; };
  let open = i;
  while (text[open] === " ") open++;        // spaces before an opening quote
  if (text[open] !== '"') {                 // unquoted: everything up to the stop
    const end = scanTo(i);
    const value = text.slice(i, end);
    const problems = value.includes('"') ? ["stray-quote"] : [];
    return { value, end, breaks: 0, problems };
  }
  const quoted = readQuoted(text, open);
  if (!quoted.closed) {
    const { value, end, breaks } = quoted;
    return { value, end, breaks, problems: ["unclosed-quote"] };
  }
  const end = scanTo(quoted.end);
  const after = text.slice(quoted.end, end).trimEnd(); // text after the closing quote
  const problems = [];
  if (after) problems.push("text-after-quote");
  if (after.includes('"')) problems.push("stray-quote");
  return { value: quoted.value + after, end, breaks: quoted.breaks, problems };
}

// Reads CSV text into records. Each record keeps the line it starts on and
// a list of quote problems, so nothing odd is accepted without a note.
function parseRecords(text, delimiter = ",", limit = Infinity) {
  const records = [];
  let i = 0, line = 1;
  while (i < text.length && records.length < limit) {
    const record = { line, fields: [], problems: [], spaced: false };
    for (;;) {
      const field = readField(text, i, delimiter);
      record.fields.push(field.value);
      for (const p of field.problems) {
        if (!record.problems.includes(p)) record.problems.push(p);
      }
      if (field.problems.includes("unclosed-quote")) {
        record.quoteLine = line;
        // The last line with text on it; blank lines at the end do not count.
        record.lastLine = line + countBreaks(field.value.trimEnd());
      }
      line += field.breaks;
      i = field.end;
      if (text[i] !== delimiter) break;     // a line break or the end of the text
      if (text[i + 1] === " ") record.spaced = true; // the file may write "a, b, c"
      i++;
    }
    records.push(record);
    i += breakLength(text, i);
    line++;
  }
  return records;
}

// A blank line, or a row of empty values such as ",,,".
const isBlank = (record) =>
  !record.problems.length && record.fields.every((f) => f.trim() === "");

function guessDelimiter(text, candidates = [",", ";", "\t", "|"]) {
  const scores = candidates.map((delimiter) => {
    const records = parseRecords(text.replace(/^\uFEFF/, ""), delimiter, 30)
      .filter((r) => !isBlank(r));
    const width = records.length ? records[0].fields.length : 0;
    const rest = records.slice(1);
    const same = rest.filter((r) => r.fields.length === width).length;
    const score = width < 2 ? 0 : rest.length ? same / rest.length : 0.5;
    return { delimiter, score };
  });
  scores.sort((a, b) => b.score - a.score);
  const [best, next] = scores;
  if (best.score === 0) return { delimiter: ",", sure: false };
  // Sure when most rows agree and no other delimiter comes close.
  return { delimiter: best.delimiter, sure: best.score > 0.5 && next.score <= best.score / 2 };
}

// A plain number, with or without thousands separators: 49, -1,234.50
const NUMBER = /^[-+]?(\d+|\d{1,3}(,\d{3})+)(\.\d+)?$/;
// Files that do not use the comma as delimiter often use it for decimals: 1.234,50
const DECIMAL_COMMA = /^[-+]?(\d+|\d{1,3}(\.\d{3})+)(,\d+)?$/;
const isNumber = (v, delimiter = ",") =>
  NUMBER.test(v) || (delimiter !== "," && DECIMAL_COMMA.test(v));
// Placeholders that mean "no value" count as blank: "-", "n/a", "N/A", "na".
const isEmpty = (v) => v === "" || /^(-|n\/?a)$/i.test(v);

// "number" if every value in the column is a number, "text" if none is,
// "any" if it is mixed or has fewer than two values (blanks are ignored).
function columnKinds(rows, width, delimiter = ",") {
  return Array.from({ length: width }, (_, column) => {
    const values = rows.map((r) => r.fields[column].trim())
      .filter((v) => !isEmpty(v));
    if (values.length < 2) return "any";
    const numbers = values.filter((v) => isNumber(v, delimiter)).length;
    if (numbers === values.length) return "number";
    return numbers === 0 ? "text" : "any";
  });
}

function fits(fields, kinds, delimiter = ",") {
  return fields.every((value, column) => {
    const v = value.trim();
    if (isEmpty(v) || kinds[column] === "any") return true;
    return (kinds[column] === "number") === isNumber(v, delimiter);
  });
}

// Which run of fields, joined back with the delimiter, gives the right width?
// A join counts only if something explains it: every piece after the first
// starts with a space (a comma inside a sentence), or the joined value is a
// grouped number such as 1,234 in a number column. It must also fit the kinds.
function findJoins(fields, width, kinds, delimiter, spacedFile) {
  const extra = fields.length - width;
  const joins = [];
  for (let at = 0; at + extra < fields.length; at++) {
    const pieces = fields.slice(at, at + extra + 1);
    const joined = pieces.join(delimiter);
    const prose = !spacedFile && delimiter !== "\t" &&
      pieces.slice(1).every((p) => /^ \S/.test(p));
    const grouped = delimiter === "," && kinds[at] === "number" &&
      NUMBER.test(joined.trim());
    const result = [...fields.slice(0, at), joined, ...fields.slice(at + extra + 1)];
    if ((prose || grouped) && fits(result, kinds, delimiter)) {
      joins.push({ at, result, grouped: grouped && !prose });
    }
  }
  return joins;
}

const QUOTE_PROBLEMS = {
  "stray-quote": "a quote mark inside a value that does not start with one",
  "text-after-quote": "text after the closing quote of a value",
};

// The message for a row with too many values: why a join is or is not suggested.
function whyJoin(joins, extra, kinds) {
  if (joins.length > 1) {
    return `${joins.length} different joins would fit, so none is suggested.`;
  }
  if (joins.length === 0) {
    return extra > 1
      ? "No single join of neighbouring values explains them: " +
        "more than one value may need quotes."
      : "No join is explained by a space after the delimiter or a grouped number, " +
        "so the data cannot tell which values belong together.";
  }
  const { result, at, dropped, grouped } = joins[0];
  const checked = kinds.some((k) => k !== "any")
    ? "fits the other rows"
    : "gives the right count (too few complete rows to check the columns)";
  const empties = dropped === 1 ? ", once the empty value at the end is dropped"
    : dropped ? `, once the ${dropped} empty values at the end are dropped` : "";
  // A grouped number can also be a row shifted by one column: Porto,1,234
  const shifted = grouped ? " Check that the row is not shifted by one column." : "";
  return `${JSON.stringify(result[at])} as one value ${checked}${empties}.${shifted}`;
}
const values = (n) => `${n} ${n === 1 ? "value" : "values"}`;

// Splits a file into rows you can import and issues a person must look at.
// A row with a problem is never in `rows`; a suggestion waits for a yes.
function checkCsv(text, { delimiter = ",", headerIndex = 0 } = {}) {
  const records = parseRecords(text.replace(/^\uFEFF/, ""), delimiter)
    .filter((r) => !isBlank(r));
  const header = records[headerIndex];
  if (!header) return { header: [], rows: [], issues: [] };
  const width = header.fields.length;
  const body = records.slice(headerIndex + 1);
  const good = body.filter((r) => r.fields.length === width && !r.problems.length);
  const kinds = columnKinds(good, width, delimiter);
  // If the file writes "a, b, c", a space after a comma explains nothing.
  const spacedFile = good.some((r) => r.spaced);
  const rows = [], issues = [];
  const report = (r, kind, message, suggestion = null, endLine = r.line) => issues.push({
    line: r.line, endLine, kind, message: `Line ${r.line}: ${message}`, fields: r.fields,
    suggestion,
  });
  let skip = -1; // a line already covered by the issue before it

  body.forEach((r, index) => {
    if (index === skip) return;
    const count = r.fields.length;
    if (r.problems.includes("unclosed-quote")) {
      const lines = r.lastLine > r.quoteLine
        ? `lines ${r.quoteLine} to ${r.lastLine}` : "the rest of the file";
      report(r, "unclosed-quote", `a quote opens on line ${r.quoteLine} and never ` +
        `closes, so ${lines} became one value.`);
    } else if (r.problems.length) {
      const what = r.problems.map((p) => QUOTE_PROBLEMS[p]).join(" and ");
      const counted = count === width ? "" : `${values(count)}, the header has ${width}, and `;
      report(r, r.problems[0], `${counted}${what}. Check that it reads correctly.`,
        count === width ? r.fields : null);
    } else if (count === width) {
      rows.push({ line: r.line, fields: r.fields });
    } else if (count > width) {
      // Empty values at the end ("15,," or "120,") lose nothing when dropped.
      let last = count;
      while (last > width && !r.fields[last - 1].trim()) last--;
      const kept = r.fields.slice(0, last);
      if (last === width && fits(kept, kinds, delimiter)) {
        report(r, "trailing-delimiter", `${values(count - width)} after the last column, ` +
          "all empty.", kept);
        return;
      }
      // Look for joins with all values, then with the empty ones at the end dropped.
      const joins = [];
      for (let n = count; n >= Math.max(last, width + 1); n--) {
        const fields = r.fields.slice(0, n);
        for (const join of findJoins(fields, width, kinds, delimiter, spacedFile)) {
          joins.push({ ...join, dropped: count - n });
        }
      }
      report(r, "too-many", `${values(count)}, the header has ${width}. ` +
        whyJoin(joins, count - width, kinds), joins.length === 1 ? joins[0].result : null);
    } else {
      // An unquoted line break splits one row into two short ones.
      const next = body[index + 1];
      const short = next && !next.problems.length && next.fields.length < width;
      if (short && count + next.fields.length - 1 === width) {
        skip = index + 1;
        report(r, "too-few", `${values(count)}, the header has ${width}. With line ` +
          `${next.line} it would fit: a line break inside a value?`, null, next.line);
      } else {
        report(r, "too-few", `${values(count)}, the header has ${width}.`);
      }
    }
  });
  return { header: header.fields, rows, issues };
}

// confirm(issue) is your UI: show issue.message and issue.suggestion, and
// return (or resolve to) true if the user accepts the suggestion.
// Pass `delimiter` once the user has picked one; without it, an unsure guess
// returns no rows. `headerIndex` is passed on to checkCsv.
async function importCsv(text, confirm, { delimiter, headerIndex = 0 } = {}) {
  const guess = delimiter ? { delimiter, sure: true } : guessDelimiter(text);
  if (!guess.sure) {
    const { delimiter: guessed } = guess;
    return { header: [], rows: [], open: [], delimiter: guessed, delimiterSure: false };
  }
  const { header, rows, issues } = checkCsv(text, { delimiter: guess.delimiter, headerIndex });
  const accepted = [...rows];
  const open = [];
  for (const issue of issues) {
    if (issue.suggestion && (await confirm(issue)) === true) {
      accepted.push({ line: issue.line, fields: issue.suggestion });
    } else {
      open.push(issue);
    }
  }
  accepted.sort((a, b) => a.line - b.line);
  return { header, rows: accepted, open, delimiter: guess.delimiter, delimiterSure: true };
}

export { parseRecords, guessDelimiter, columnKinds, findJoins, checkCsv, importCsv };
