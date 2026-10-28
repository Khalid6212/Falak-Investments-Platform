import "server-only";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";

// Opens an uploaded file for the Excel imports (.xlsx, or .csv), with a
// message that names what's actually wrong when it can't.

const CSV_WAY_OUT = 'Or save a copy as CSV (File > Save As > "CSV UTF-8 (Comma delimited)") and upload that: CSV files carry no label or password.';

export const LABEL_PROTECTED_ERROR =
  `This file is encrypted by a Sensitivity label (such as "Confidential"), so the platform can't open it. ` +
  `In Excel, set Home > Sensitivity to "General" or "Public", save, and upload it again. ${CSV_WAY_OUT}`;

export const PASSWORD_PROTECTED_ERROR =
  "This file is password-protected, so the platform can't open it. In Excel, go to File > Info > Protect Workbook > Encrypt with Password, " +
  `clear the password, save, and upload it again. ${CSV_WAY_OUT}`;

export const OLD_XLS_ERROR =
  'This is an older Excel 97-2003 file (.xls), even if its name ends in .xlsx. In Excel, use File > Save As > "Excel Workbook (.xlsx)" and upload the saved copy.';

const UNREADABLE_ERROR =
  'That file couldn\'t be read as an Excel workbook. Open it in Excel, use File > Save As > "Excel Workbook (.xlsx)" (or CSV UTF-8), and upload the saved copy.';

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

const utf16 = (s: string) => Buffer.from(s, "utf16le");

/**
 * An Office "compound" file (D0 CF 11 E0) is either an encrypted .xlsx or
 * an old .xls. Their internal stream names tell which (MS-OFFCRYPTO): a
 * Sensitivity label (rights management) adds "DRMEncrypted..." parts, a
 * password "StrongEncryption..."; an .xls has a "Workbook" stream.
 */
function compoundFileError(bytes: Buffer): string {
  if (bytes.includes(utf16("EncryptedPackage"))) {
    return bytes.includes(utf16("DRMEncrypted")) ? LABEL_PROTECTED_ERROR : PASSWORD_PROTECTED_ERROR;
  }
  if (bytes.includes(utf16("Workbook")) || bytes.includes(utf16("Book"))) return OLD_XLS_ERROR;
  return UNREADABLE_ERROR;
}

export async function loadImportWorkbook(file: ArrayBuffer, fileName = ""): Promise<{ book: ExcelJS.Workbook } | { error: string }> {
  const bytes = Buffer.from(file);
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    return { error: compoundFileError(bytes) };
  }

  if (/\.csv$/i.test(fileName)) {
    const book = new ExcelJS.Workbook();
    try {
      // Excel's "CSV UTF-8" starts with a byte-order mark; drop it so the first header matches.
      const text = bytes.toString("utf8").replace(/^﻿/, "");
      await book.csv.read(Readable.from([text]));
      return { book };
    } catch (error) {
      console.error("Excel import: CSV couldn't be read:", error);
      return { error: "That CSV file couldn't be read. Save it from Excel as \"CSV UTF-8 (Comma delimited)\" and upload it again." };
    }
  }

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
      console.error("Excel import: file couldn't be read:", { fileName, size: bytes.length, head: bytes.subarray(0, 8).toString("hex") }, first, second);
      return { error: UNREADABLE_ERROR };
    }
  }
}
