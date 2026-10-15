// Wording shared by the startup report emails.

const QUARTER_WORDS = ["One", "Two", "Three", "Four"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * "Quarter Three (Q3 2026)" for a calendar quarter; otherwise the cycle's
 * own label, e.g. "the H1 2026 period".
 */
export function periodPhrase(periodStart: Date, periodEnd: Date, periodLabel: string): string {
  const startMonth = periodStart.getUTCMonth();
  const months = (periodEnd.getUTCFullYear() - periodStart.getUTCFullYear()) * 12 + periodEnd.getUTCMonth() - startMonth + 1;
  if (months === 3 && startMonth % 3 === 0) {
    const q = startMonth / 3 + 1;
    return `Quarter ${QUARTER_WORDS[q - 1]} (Q${q} ${periodStart.getUTCFullYear()})`;
  }
  return `the ${periodLabel} period`;
}

/** "15 October 2026". */
export function longDate(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
