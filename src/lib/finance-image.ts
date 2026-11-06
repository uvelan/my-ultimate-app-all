import type { dashboardCategoryTree } from './finance-dashboard';

type Node = ReturnType<typeof dashboardCategoryTree>[number];
export interface FinanceImageRow {
    id: string; name: string; depth: number; amountPaise: number;
    color: string; percentage?: number; detail?: string;
}
export interface FinanceReport {
    rows: FinanceImageRow[]; rangeStart: string; rangeEnd: string; totalExpense: number;
    grouping: string; hidden: string; scope?: 'shown' | 'all';
}
export type FinanceExportSnapshot = FinanceReport & { allRows: FinanceImageRow[] };

export function financeBreakdownImageRows(nodes: Node[], total: number, expanded: ReadonlySet<string> | 'all', path: string[] = []): FinanceImageRow[] {
    return nodes.flatMap(node => {
        const branch = [...path, node.id], id = JSON.stringify(branch);
        const rows: FinanceImageRow[] = [{ id, name: node.name, depth: path.length,
            amountPaise: node.amountPaise, color: node.color, percentage: total > 0 ? node.amountPaise / total * 100 : 0 }];
        if (expanded === 'all' || expanded.has(id)) {
            rows.push(...financeBreakdownImageRows(node.children, node.amountPaise, expanded, branch));
            rows.push(...[...node.items].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)).map(item => ({
                id: id + ':' + item.id, name: item.description || 'No description', depth: branch.length,
                amountPaise: item.amountPaise, color: node.color,
                detail: new Date(item.transactionDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' · ' + (item.paymentMethod || 'Unknown'),
            })));
        }
        return rows;
    });
}
export function financeImageLines(text: string, columns = 42): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
        if (line && Array.from(line + ' ' + word).length > columns) { lines.push(line); line = ''; }
        const letters = Array.from(word);
        while (letters.length > columns) {
            if (line) { lines.push(line); line = ''; }
            lines.push(letters.splice(0, columns).join(''));
        }
        const tail = letters.join('');
        if (tail) line = line ? line + ' ' + tail : tail;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function financeBreakdownPdfHtml(snapshot: FinanceReport): string {
    return `<!doctype html><html><head><meta charset="utf-8"><title>Expense breakdown ${escapeHtml(snapshot.rangeStart)} to ${escapeHtml(snapshot.rangeEnd)}</title><style>
        @page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#041b3c;font-size:11pt}
        h1{font-size:22pt;color:#001642}p{margin:6pt 0}table{width:100%;border-collapse:collapse;margin-top:18pt;table-layout:fixed}
        th,td{text-align:left;padding:9pt 6pt;vertical-align:top;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}
        th{border-bottom:1pt solid #d7e2ff}td{border-bottom:.5pt solid #e8eeff}.amount{text-align:right;width:34%;white-space:nowrap}
        .category{background:#f1f3ff;font-weight:bold}.detail{display:block;color:#747782;font-size:9pt;margin-top:4pt}
        </style></head><body><h1>Expense breakdown</h1>
        <p>${escapeHtml(snapshot.rangeStart)} – ${escapeHtml(snapshot.rangeEnd)} (inclusive)</p>
        <p><strong>Total expenses: ${money(snapshot.totalExpense)}</strong></p>
        <p>Grouped by ${escapeHtml(snapshot.grouping)} · ${snapshot.scope === 'all' ? 'All rows expanded' : 'As shown'}</p>
        ${snapshot.hidden ? `<p>Hidden: ${escapeHtml(snapshot.hidden)}</p>` : ''}
        <table><thead><tr><th>Description</th><th class="amount">Amount / share</th></tr></thead><tbody>
        ${snapshot.rows.map(row => {
            const color = /^#[0-9a-f]{3,8}$/i.test(row.color) ? row.color : '#888';
            return `<tr class="${row.percentage === undefined ? '' : 'category'}"><td style="padding-left:${6 + Math.min(row.depth, 6) * 10}pt;border-left:3pt solid ${color}">${escapeHtml(row.name)}${row.detail ? `<span class="detail">${escapeHtml(row.detail)}</span>` : ''}</td><td class="amount">${money(row.amountPaise)}${row.percentage !== undefined ? ' · ' + row.percentage.toLocaleString('en-IN', { maximumFractionDigits: 1 }) + '%' : ''}</td></tr>`;
        }).join('') || '<tr><td colspan="2">No expenses match this selection.</td></tr>'}
        </tbody></table></body></html>`;
}
