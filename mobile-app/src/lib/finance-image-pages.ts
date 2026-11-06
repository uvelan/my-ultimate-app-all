import { financeImageLines, type FinanceImageRow } from './finance-image';

export const FINANCE_IMAGE_WIDTH = 720;
export const FINANCE_IMAGE_HEIGHT = 1080;
export const FINANCE_IMAGE_SCALE = 3;
export interface FinanceImagePageRow extends FinanceImageRow {
    indent: number; lines: string[]; detailLines: string[]; y: number; height: number;
}
export interface FinanceImagePage { rows: FinanceImagePageRow[]; context: string[]; headerHeight: number }
export function financeImagePages(rows: FinanceImageRow[], hidden: string): { pages: FinanceImagePage[]; hiddenLines: string[] } {
    const allHidden = hidden ? financeImageLines('Hidden: ' + hidden, 62) : [];
    const hiddenLines = allHidden.slice(0, 2);
    if (allHidden.length > 2) hiddenLines[1] += '…';
    const pages: FinanceImagePage[] = [];
    const parents: string[] = [];
    let page: FinanceImagePage | null = null, y = 0;
    for (const row of rows) {
        const indent = Math.min(row.depth, 6) * 20;
        const lines = financeImageLines(row.name, Math.max(14, 28 - Math.min(row.depth, 6) * 2));
        const detailLines = row.detail ? financeImageLines(row.detail, 54 - Math.min(row.depth, 6) * 2) : [];
        const height = 34 + lines.length * 27 + detailLines.length * 24;
        if (!page || y + height > FINANCE_IMAGE_HEIGHT - 56) {
            const context = row.depth ? financeImageLines('Continued: ' + parents.slice(0, row.depth).filter(Boolean).join(' › '), 58) : [];
            const headerHeight = 190 + hiddenLines.length * 22 + context.length * 22;
            page = { rows: [], context, headerHeight }; pages.push(page); y = headerHeight;
        }
        if (y + height > FINANCE_IMAGE_HEIGHT - 56) throw new Error('A description is too long for an image page. Export the full PDF instead.');
        page.rows.push({ ...row, indent, lines, detailLines, y, height });
        y += height + 10;
        parents.length = row.depth;
        if (row.percentage !== undefined) parents[row.depth] = row.name;
    }
    if (!pages.length) pages.push({ rows: [], context: [], headerHeight: 190 + hiddenLines.length * 22 });
    return { pages, hiddenLines };
}

export { financeBreakdownPdfHtml } from './finance-image';
