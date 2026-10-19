export type SmsPageCursor = { date: number; id: string } | null;
// Zero/empty also works with already-installed bridges that rejected negatives.
export const NO_SMS_CURSOR = 0;

/** One bridge contract for the initial scan and every keyset continuation. */
export function buildSmsPageArguments(minDate: number, maxDate: number, cursor: SmsPageCursor, pageSize = 250): [number, number, number, string, number] {
    return [minDate, maxDate, cursor?.date ?? NO_SMS_CURSOR, cursor?.id ?? '', pageSize];
}
