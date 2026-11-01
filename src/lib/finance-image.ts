import type { dashboardCategoryTree } from './finance-dashboard';

type Node = ReturnType<typeof dashboardCategoryTree>[number];
export interface FinanceImageRow {
    id: string; name: string; depth: number; amountPaise: number;
    color: string; percentage?: number; detail?: string;
}
export function financeBreakdownImageRows(nodes: Node[], total: number, expanded: ReadonlySet<string>, path: string[] = []): FinanceImageRow[] {
    return nodes.flatMap(node => {
        const branch = [...path, node.id], id = JSON.stringify(branch);
        const rows: FinanceImageRow[] = [{ id, name: node.name, depth: path.length,
            amountPaise: node.amountPaise, color: node.color, percentage: total > 0 ? node.amountPaise / total * 100 : 0 }];
        if (expanded.has(id)) {
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
