import "server-only";
import ExcelJS from "exceljs";

// Opens an uploaded .xlsx for the Excel imports, with a message that says
// what's actually wrong when it can't.

export const PROTECTED_FILE_ERROR =
  "This file is protected, so it can't be read: it has a Sensitivity label (e.g. \"Confidential\") or a password, which encrypts it. " +
  "In Excel, set Home > Sensitivity to \"General\" or \"Public\" (or remove the password under File > Info > Protect Workbook), save, and upload it again. " +
  "An old .xls file renamed to .xlsx looks the same: use File > Save As > Excel Workbook (.xlsx).";

const UNREADABLE_ERROR =
  "That file couldn't be read as an Excel workbook. Open it in Excel, use File > Save As > Excel Workbook (.xlsx), and upload the saved copy.";

// Parts of a sheet the imports never read. If the full read fails (the
// reader can trip over pictures, charts or unusual formatting copied in
// from other workbooks), the file is read again without them.
const SKIPPABLE = [
  "dataValidations",
  "conditionalFormatting",
  "hyperlinks",
  "drawing",
  "legacyDrawing",
  "picture",
  "tableParts",
  "extLst",
  "autoFilter",
  "pageSetup",
  "printOptions",
  "headerFooter",
  "rowBreaks",
  "colBreaks",
];

export async function loadImportWorkbook(file: ArrayBuffer): Promise<{ book: ExcelJS.Workbook } | { error: string }> {
  const head = new Uint8Array(file.slice(0, 4));
  // D0 CF 11 E0: an Office "compound" file -- an encrypted (labelled or
  // password-protected) workbook, or a real .xls.
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return { error: PROTECTED_FILE_ERROR };

  let book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(file);
    return { book };
  } catch (first) {
    book = new ExcelJS.Workbook();
    try {
      await book.xlsx.load(file, { ignoreNodes: SKIPPABLE } as Parameters<ExcelJS.Xlsx["load"]>[1]);
      return { book };
    } catch (second) {
      console.error("Excel import: file couldn't be read:", first, second);
      return { error: UNREADABLE_ERROR };
    }
  }
}
