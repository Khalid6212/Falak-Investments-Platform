/**
 * Name of the checkbox that confirms applying one change (a value that
 * differs from what is saved) to an existing startup during an Excel
 * import. Shared by the import panel and the server action.
 */
export function importConfirmName(companyId: string, field: string): string {
  return `apply:${companyId}:${field}`;
}
