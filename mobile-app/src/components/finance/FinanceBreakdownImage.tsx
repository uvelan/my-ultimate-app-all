import React, { useRef, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Rect, Text as SvgText } from 'react-native-svg';
import { financeImageLines, type FinanceImageRow } from '@/src/lib/finance-image';
import { shareFinanceImage } from '@/src/services/finance-export.service';

export interface FinanceImageSnapshot {
    rows: FinanceImageRow[]; rangeStart: string; rangeEnd: string; totalExpense: number;
    grouping: string; hidden: string;
}
const money = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function FinanceBreakdownImage({ snapshot, onClose }: { snapshot: FinanceImageSnapshot; onClose(): void }) {
    const svg = useRef<Svg>(null), { width } = useWindowDimensions();
    const [ready, setReady] = useState(false), [sharing, setSharing] = useState(false);
    const hidden = snapshot.hidden ? financeImageLines('Hidden: ' + snapshot.hidden, 68) : [];
    let nextY = 168 + hidden.length * 20;
    const rows = snapshot.rows.map(row => {
        const indent = Math.min(row.depth, 8) * 20, lines = financeImageLines(row.name, Math.max(14, 39 - Math.min(row.depth, 8) * 2));
        const height = 34 + lines.length * 23 + (row.detail ? 24 : 0);
        const layout = { ...row, indent, lines, y: nextY, height };
        nextY += height + 10;
        return layout;
    });
    const height = Math.max(260, nextY + 24), previewWidth = Math.max(240, Math.min(width - 32, 720));
    const share = async () => {
        if (!ready || !svg.current || sharing) return;
        setSharing(true);
        try {
            if (1080 * Math.round(height * 1.5) > 24_000_000) throw new Error('This image is too tall. Collapse some breakdown rows and export again.');
            const base64 = await new Promise<string>((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Image export timed out. Please try again.')), 15000);
                svg.current!.toDataURL(value => { clearTimeout(timer); value ? resolve(value) : reject(new Error('Could not render the image.')); }, { width: 1080, height: Math.round(height * 1.5) });
            });
            await shareFinanceImage(base64, `breakdown_${snapshot.rangeStart}_${snapshot.rangeEnd}.png`);
        } catch (error: any) { Alert.alert('Export failed', error.message || 'Please try again.'); }
        finally { setSharing(false); }
    };
    return <Modal visible animationType="slide" onRequestClose={() => { if (!sharing) onClose(); }}>
        <View style={{ flex: 1, backgroundColor: '#eef0f8', paddingTop: 36 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, gap: 12 }}>
                <TouchableOpacity accessibilityRole="button" disabled={sharing} onPress={onClose}><Text style={{ color: '#001642', fontWeight: '700' }}>Close</Text></TouchableOpacity>
                <Text style={{ color: '#001642', fontWeight: '700' }}>Breakdown image</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Share breakdown PNG image" disabled={!ready || sharing} onPress={share}><Text style={{ color: '#026c47', fontWeight: '700', opacity: !ready || sharing ? 0.5 : 1 }}>{sharing ? 'Sharing…' : 'Share PNG'}</Text></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ alignItems: 'center', padding: 16, paddingBottom: 40 }}>
                <Svg ref={svg} width={previewWidth} height={height * previewWidth / 720} viewBox={`0 0 720 ${height}`} fontFamily="sans-serif" onLayout={() => setReady(true)}>
                    <Rect width={720} height={height} fill="#fff" />
                    <SvgText x={28} y={42} fontSize={26} fontWeight="bold" fill="#001642">Expense breakdown</SvgText>
                    <SvgText x={28} y={75} fontSize={20} fill="#444650">{snapshot.rangeStart} – {snapshot.rangeEnd} (inclusive)</SvgText>
                    <SvgText x={28} y={110} fontSize={22} fontWeight="bold" fill="#001642">Total expenses: {money(snapshot.totalExpense)}</SvgText>
                    <SvgText x={28} y={140} fontSize={17} fill="#747782">Grouped by {snapshot.grouping} · Current filters and expanded rows</SvgText>
                    {hidden.map((line, i) => <SvgText key={i} x={28} y={164 + i * 20} fontSize={15} fill="#747782">{line}</SvgText>)}
                    {!rows.length && <SvgText x={28} y={202} fontSize={18} fill="#747782">No expenses match this selection.</SvgText>}
                    {rows.map(row => <React.Fragment key={row.id}>
                        <Rect x={24 + row.indent} y={row.y} width={672 - row.indent} height={row.height} rx={10} fill={row.detail ? '#fff' : '#f1f3ff'} />
                        <Circle cx={38 + row.indent} cy={row.y + 24} r={5} fill={row.color} />
                        {row.lines.map((line, i) => <SvgText key={i} x={52 + row.indent} y={row.y + 30 + i * 23} fontSize={18} fontWeight="600" fill="#041b3c">{line}</SvgText>)}
                        <SvgText x={680} y={row.y + 30} textAnchor="end" fontSize={17} fill="#444650">{money(row.amountPaise)}{row.percentage !== undefined ? ' · ' + row.percentage.toLocaleString('en-IN', { maximumFractionDigits: 1 }) + '%' : ''}</SvgText>
                        {row.detail && <SvgText x={52 + row.indent} y={row.y + 34 + row.lines.length * 23} fontSize={15} fill="#747782">{row.detail}</SvgText>}
                        {row.percentage !== undefined && <>
                            <Rect x={40 + row.indent} y={row.y + row.height - 10} width={640 - row.indent} height={3} fill="#d7e2ff" />
                            <Rect x={40 + row.indent} y={row.y + row.height - 10} width={(640 - row.indent) * Math.max(0, Math.min(100, row.percentage)) / 100} height={3} fill={row.color} />
                        </>}
                    </React.Fragment>)}
                </Svg>
            </ScrollView>
        </View>
    </Modal>;
}
