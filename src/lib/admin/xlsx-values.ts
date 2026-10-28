import "server-only";
import JSZip from "jszip";
import ExcelJS from "exceljs";

// A plain reader for the cell values of an .xlsx file, used when the full
// Excel reader fails on something the imports never need (unusual styles,
// charts, pivot tables, labels' metadata...). It reads only the sheets'
// text, numbers, dates and true/false, and hands them back as an ExcelJS
// workbook so the imports read them exactly as before.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()];
    return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  });
}

// Element names may carry a namespace prefix (some writers use "x:").
const P = "(?:[A-Za-z_][\\w.-]*:)?";

/** The text of all <t> runs inside a fragment (a shared or inline string). */
function runsText(xml: string): string {
  const out: string[] = [];
  for (const m of xml.matchAll(new RegExp(`<${P}t(?:\\s[^>]*)?>([\\s\\S]*?)</${P}t>`, "g"))) out.push(unescapeXml(m[1]));
  return out.join("");
}

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
}

/** Excel's built-in date formats, plus any custom format with day/month/year parts. */
function dateStyles(stylesXml: string | null): Set<number> {
  const dated = new Set<number>();
  if (!stylesXml) return dated;
  const custom = new Map<number, string>();
  for (const m of stylesXml.matchAll(new RegExp(`<${P}numFmt\\s[^>]*>`, "g"))) {
    const id = Number(attr(m[0], "numFmtId"));
    const code = unescapeXml(attr(m[0], "formatCode") ?? "");
    custom.set(id, code);
  }
  const isDateFormat = (id: number) => {
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) return true;
    const code = custom.get(id);
    if (!code) return false;
    const bare = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
    return /[dmy]/i.test(bare) && !/^[#0.,%\s]*$/.test(bare);
  };
  const xfs = stylesXml.match(new RegExp(`<${P}cellXfs[^>]*>([\\s\\S]*?)</${P}cellXfs>`))?.[1] ?? "";
  let i = 0;
  for (const m of xfs.matchAll(new RegExp(`<${P}xf\\s[^>]*>`, "g"))) {
    if (isDateFormat(Number(attr(m[0], "numFmtId") ?? 0))) dated.add(i);
    i++;
  }
  return dated;
}

/** Excel's day number (1900 system) as a UTC date. */
function serialToDate(serial: number): Date {
  return new Date(Math.round((serial - 25569) * 86400000));
}

function columnNumber(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "").toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function resolve(base: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

export async function readXlsxValues(file: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const zip = await JSZip.loadAsync(file);
  // Case-insensitive lookup: some tools write "xl/SharedStrings.xml".
  const names = new Map(Object.keys(zip.files).map((n) => [n.toLowerCase(), n] as const));
  const text = async (path: string) => {
    const real = names.get(path.toLowerCase());
    return real ? zip.file(real)!.async("string") : null;
  };

  const workbookXml = await text("xl/workbook.xml");
  if (!workbookXml) throw new Error("no xl/workbook.xml");
  const relsXml = (await text("xl/_rels/workbook.xml.rels")) ?? "";
  const targets = new Map<string, string>();
  for (const m of relsXml.matchAll(new RegExp(`<${P}Relationship\\s[^>]*>`, "g"))) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) targets.set(id, resolve("xl/workbook.xml", target));
  }

  const sharedXml = await text("xl/sharedStrings.xml");
  const shared = sharedXml ? [...sharedXml.matchAll(new RegExp(`<${P}si>([\\s\\S]*?)</${P}si>`, "g"))].map((m) => runsText(m[1])) : [];
  const dated = dateStyles(await text("xl/styles.xml"));

  const book = new ExcelJS.Workbook();
  let index = 0;
  for (const m of workbookXml.matchAll(new RegExp(`<${P}sheet\\s[^>]*>`, "g"))) {
    index++;
    const name = unescapeXml(attr(m[0], "name") ?? `Sheet${index}`);
    const rid = m[0].match(/\s(?:[\w]+:)?id="([^"]*)"/)?.[1];
    const path = (rid && targets.get(rid)) || `xl/worksheets/sheet${index}.xml`;
    const xml = await text(path);
    const sheet = book.addWorksheet(name.slice(0, 31) || `Sheet${index}`);
    if (!xml) continue;

    let rowNo = 0;
    for (const row of xml.matchAll(new RegExp(`<${P}row(\\s[^>]*)?(?:/>|>([\\s\\S]*?)</${P}row>)`, "g"))) {
      rowNo = Number(attr(row[1] ?? "", "r")) || rowNo + 1;
      let colNo = 0;
      for (const c of (row[2] ?? "").matchAll(new RegExp(`<${P}c(\\s[^>]*?)?(?:/>|>([\\s\\S]*?)</${P}c>)`, "g"))) {
        const tag = c[1] ?? "";
        const ref = attr(tag, "r");
        colNo = ref ? columnNumber(ref) : colNo + 1;
        const body = c[2] ?? "";
        const type = attr(tag, "t") ?? "n";
        const raw = body.match(new RegExp(`<${P}v>([\\s\\S]*?)</${P}v>`))?.[1];
        let value: ExcelJS.CellValue = null;
        if (type === "inlineStr") value = runsText(body);
        else if (raw === undefined) continue;
        else if (type === "s") value = shared[Number(raw)] ?? "";
        else if (type === "str" || type === "e") value = unescapeXml(raw);
        else if (type === "b") value = raw.trim() === "1";
        else if (type === "d") value = new Date(raw);
        else {
          const n = Number(raw);
          if (!Number.isFinite(n)) value = unescapeXml(raw);
          else value = dated.has(Number(attr(tag, "s") ?? 0)) ? serialToDate(n) : n;
        }
        if (value !== "" && value !== null) sheet.getCell(rowNo, colNo).value = value;
      }
    }
  }
  if (book.worksheets.length === 0) throw new Error("no sheets listed in xl/workbook.xml");
  return book;
}
