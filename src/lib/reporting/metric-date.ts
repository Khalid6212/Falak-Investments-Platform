// Date metrics (e.g. "Expected cash out date"): whatever way a date is
// written -- typed, pasted, picked or from an Excel cell -- it is stored
// as one ISO day, YYYY-MM-DD. Pure, so forms, imports and displays share it.

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
  يناير: 1, فبراير: 2, مارس: 3, أبريل: 4, ابريل: 4, إبريل: 4, مايو: 5, يونيو: 6, يوليو: 7, أغسطس: 8, اغسطس: 8,
  سبتمبر: 9, أكتوبر: 10, اكتوبر: 10, نوفمبر: 11, ديسمبر: 12,
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(s: string | null | undefined): s is string {
  return !!s && ISO_DAY.test(s);
}

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null; // e.g. 31 February
  return date.toISOString().slice(0, 10);
}

/** Excel's day number (1900 system), as Excel files without date formatting store dates. */
function fromSerial(n: number): string | null {
  const date = new Date(Math.round((n - 25569) * 86400000));
  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * The ISO day (YYYY-MM-DD) for a date written in any common way, or null.
 * Numeric dates are read day first (31/01/2027), unless that's impossible
 * and month first works (01/31/2027). A month with no day (Jan 2027,
 * 2027-01, 01/2027) is its first day. Arabic digits and English or Arabic
 * month names work; so do 31012027 (as founders type into number boxes)
 * and Excel day numbers.
 */
export function parseMetricDate(raw: string): string | null {
  const s = raw
    .trim()
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[‎‏؜]/g, "")
    .toLowerCase();
  if (!s) return null;
  let m: RegExpMatchArray | null;

  // 2027-01-31, 2027/1/31, 2027.01.31, optionally with a time after it.
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[t\s].*)?$/))) return iso(+m[1], +m[2], +m[3]);
  // 31/01/2027, 31-1-27, 31.01.2027 (day first; month first only if it must be).
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    const [a, b, y] = [+m[1], +m[2], +m[3]];
    return iso(y, b, a) ?? (a <= 12 ? iso(y, a, b) : null);
  }
  // 2027-01, 01/2027, 2027.07 (a month: its first day).
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})$/))) return iso(+m[1], +m[2], 1);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{4})$/))) return iso(+m[2], +m[1], 1);
  // 31012027 / 1032027 (day, month, year run together) or 20270131.
  if ((m = s.match(/^\d{7,8}$/))) {
    if (s.length === 8 && /^(19|20|21)/.test(s)) {
      const ymd = iso(+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8));
      if (ymd) return ymd;
    }
    const y = +s.slice(-4);
    const dm = s.slice(0, -4);
    return iso(y, +dm.slice(-2), +dm.slice(0, -2));
  }
  // An Excel day number (1 Jul 1995 to 2119).
  if (/^\d{5}(\.\d+)?$/.test(s) && +s >= 35000 && +s <= 80000) return fromSerial(+s);

  // Month names: 31 Jan 2027, 31-January-2027, Jan 31, 2027, January 2027, 31 يناير 2027.
  const words = s.replace(/,/g, " ").replace(/(\d)(st|nd|rd|th)\b/g, "$1").split(/[\s\-/.]+/).filter(Boolean);
  if (words.length === 2 || words.length === 3) {
    const monthAt = words.findIndex((w) => MONTHS[w]);
    if (monthAt === -1) return null;
    const month = MONTHS[words[monthAt]];
    const nums = words.filter((_, i) => i !== monthAt);
    if (!nums.every((w) => /^\d{1,4}$/.test(w))) return null;
    if (nums.length === 1) return nums[0].length === 4 ? iso(+nums[0], month, 1) : null;
    const [p, q] = nums;
    if (q.length === 4) return iso(+q, month, +p);
    if (p.length === 4) return iso(+p, month, +q);
    return iso(+q, month, +p);
  }
  return null;
}
