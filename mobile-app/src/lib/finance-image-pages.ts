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

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function financeBreakdownPdfHtml(snapshot: {
    rows: FinanceImageRow[]; rangeStart: string; rangeEnd: string; totalExpense: number; grouping: string; hidden: string;
}): string {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
        @page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#041b3c;font-size:11pt}
        h1{font-size:22pt;color:#001642}p{margin:6pt 0}table{width:100%;border-collapse:collapse;margin-top:18pt;table-layout:fixed}
        th,td{text-align:left;padding:9pt 6pt;vertical-align:top;overflow-wrap:anywhere}tr{break-inside:avoid}
        th{border-bottom:1pt solid #d7e2ff}td{border-bottom:.5pt solid #e8eeff}.amount{text-align:right;width:34%;white-space:nowrap}
        .category{background:#f1f3ff;font-weight:bold}.detail{display:block;color:#747782;font-size:9pt;margin-top:4pt}
        </style></head><body><h1>Expense breakdown</h1>
        <p>${escapeHtml(snapshot.rangeStart)} – ${escapeHtml(snapshot.rangeEnd)} (inclusive)</p>
        <p><strong>Total expenses: ${money(snapshot.totalExpense)}</strong></p>
        <p>Grouped by ${escapeHtml(snapshot.grouping)} · Current filters and expanded rows</p>
        ${snapshot.hidden ? `<p>Hidden: ${escapeHtml(snapshot.hidden)}</p>` : ''}
        <table><thead><tr><th>Description</th><th class="amount">Amount / share</th></tr></thead><tbody>
        ${snapshot.rows.map(row => {
            const color = /^#[0-9a-f]{3,8}$/i.test(row.color) ? row.color : '#888';
            return `<tr class="${row.percentage === undefined ? '' : 'category'}"><td style="padding-left:${6 + Math.min(row.depth, 6) * 10}pt;border-left:3pt solid ${color}">${escapeHtml(row.name)}${row.detail ? `<span class="detail">${escapeHtml(row.detail)}</span>` : ''}</td><td class="amount">${money(row.amountPaise)}${row.percentage !== undefined ? ' · ' + row.percentage.toLocaleString('en-IN', { maximumFractionDigits: 1 }) + '%' : ''}</td></tr>`;
        }).join('') || '<tr><td colspan="2">No expenses match this selection.</td></tr>'}
        </tbody></table></body></html>`;
}
