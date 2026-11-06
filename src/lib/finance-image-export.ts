import { financeImageLines, financeBreakdownPdfHtml, type FinanceReport } from './finance-image';
export type { FinanceExportSnapshot as FinanceImageSnapshot } from './finance-image';

const xml = (value: string | number) => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
}[character]!));
const money = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function financeImageSvg(snapshot: FinanceReport) {
    const hidden = snapshot.hidden ? financeImageLines('Hidden: ' + snapshot.hidden, 68) : [];
    let y = 168 + hidden.length * 20;
    const text = (x: number, top: number, content: string, size = 18, fill = '#041b3c', extra = '') =>
        `<text x="${x}" y="${top}" font-size="${size}" fill="${fill}" ${extra}>${xml(content)}</text>`;
    const rows = snapshot.rows.map(row => {
        const indent = Math.min(row.depth, 8) * 20;
        const lines = financeImageLines(row.name, Math.max(14, 39 - Math.min(row.depth, 8) * 2));
        const height = 34 + lines.length * 23 + (row.detail ? 24 : 0), top = y;
        y += height + 10;
        const color = /^#[0-9a-f]{3,8}$/i.test(row.color) ? row.color : '#888';
        return `<g><rect x="${24 + indent}" y="${top}" width="${672 - indent}" height="${height}" rx="10" fill="${row.detail ? '#fff' : '#f1f3ff'}"/>
            <circle cx="${38 + indent}" cy="${top + 24}" r="5" fill="${color}"/>
            ${lines.map((line, i) => text(52 + indent, top + 30 + i * 23, line, 18, '#041b3c', 'font-weight="600"')).join('')}
            ${text(680, top + 30, money(row.amountPaise) + (row.percentage !== undefined ? ' · ' + row.percentage.toLocaleString('en-IN', { maximumFractionDigits: 1 }) + '%' : ''), 17, '#444650', 'text-anchor="end"')}
            ${row.detail ? text(52 + indent, top + 34 + lines.length * 23, row.detail, 15, '#747782') : ''}
            ${row.percentage !== undefined ? `<rect x="${40 + indent}" y="${top + height - 10}" width="${640 - indent}" height="3" fill="#d7e2ff"/>
                <rect x="${40 + indent}" y="${top + height - 10}" width="${(640 - indent) * Math.max(0, Math.min(100, row.percentage)) / 100}" height="3" fill="${color}"/>` : ''}</g>`;
    }).join('');
    const height = Math.max(260, y + 24), width = 1080, pixelHeight = Math.round(height * 1.5);
    if (width * pixelHeight > 24_000_000) throw new Error('This image is too tall. Choose PDF to export the full selection.');
    return { width, height: pixelHeight, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${pixelHeight}" viewBox="0 0 720 ${height}" font-family="Arial, sans-serif">
        <rect width="720" height="${height}" fill="#fff"/>
        ${text(28, 42, 'Expense breakdown', 26, '#001642', 'font-weight="bold"')}
        ${text(28, 75, `${snapshot.rangeStart} – ${snapshot.rangeEnd} (inclusive)`, 20, '#444650')}
        ${text(28, 110, 'Total expenses: ' + money(snapshot.totalExpense), 22, '#001642', 'font-weight="bold"')}
        ${text(28, 140, 'Grouped by ' + snapshot.grouping + (snapshot.scope === 'all' ? ' · All rows expanded' : ' · As shown'), 17, '#747782')}
        ${hidden.map((line, i) => text(28, 164 + i * 20, line, 15, '#747782')).join('')}
        ${snapshot.rows.length ? rows : text(28, 202, 'No expenses match this selection.', 18, '#747782')}
    </svg>` };
}

export async function downloadFinancePng(svgUrl: string, width: number, height: number, filename: string) {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve(); image.onerror = () => reject(new Error('Could not render the breakdown image.'));
        image.src = svgUrl;
    });
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Image export is unavailable in this browser.');
    context.drawImage(image, 0, 0, width, height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the PNG image.')), 'image/png'));
    const url = URL.createObjectURL(png), link = document.createElement('a');
    link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}


export function printFinancePdf(report: FinanceReport): Promise<void> {
    return new Promise((resolve, reject) => {
        const frame = document.createElement('iframe');
        frame.title = 'Expense breakdown PDF';
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0';
        const remove = () => frame.remove();
        const timer = setTimeout(() => {
            remove();
            reject(new Error('Could not load the printable breakdown.'));
        }, 10_000);
        frame.onload = () => {
            clearTimeout(timer);
            const printable = frame.contentWindow;
            if (!printable) { remove(); reject(new Error('PDF export is unavailable in this browser.')); return; }
            try {
                printable.addEventListener('afterprint', remove, { once: true });
                printable.print();
                resolve();
                // Some browsers do not emit afterprint for an iframe.
                setTimeout(remove, 120_000);
            } catch (error) { remove(); reject(error); }
        };
        frame.srcdoc = financeBreakdownPdfHtml(report);
        document.body.appendChild(frame);
    });
}
