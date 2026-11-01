import React, { useMemo, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Rect, Text as SvgText } from 'react-native-svg';
import type { FinanceImageRow } from '@/src/lib/finance-image';
import { financeImagePages, financeBreakdownPdfHtml, FINANCE_IMAGE_WIDTH, FINANCE_IMAGE_HEIGHT, FINANCE_IMAGE_SCALE } from '@/src/lib/finance-image-pages';
import { shareFinanceImage, shareFinancePdf } from '@/src/services/finance-export.service';

export interface FinanceImageSnapshot {
    rows: FinanceImageRow[]; rangeStart: string; rangeEnd: string; totalExpense: number;
    grouping: string; hidden: string;
}
const money = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Svg's native root forwards `font`, but drops a bare root `fontFamily`.
const ImageText = (props: React.ComponentProps<typeof SvgText>) => <SvgText {...props} fontFamily="sans-serif" />;
export function FinanceBreakdownImage({ snapshot, onClose }: { snapshot: FinanceImageSnapshot; onClose(): void }) {
    const svg = useRef<Svg>(null), { width } = useWindowDimensions();
    const [ready, setReady] = useState(false), [sharing, setSharing] = useState(false), [pageIndex, setPageIndex] = useState(0);
    const layout = useMemo(() => {
        try { return { ...financeImagePages(snapshot.rows, snapshot.hidden), error: '' }; }
        catch (error: any) { return { pages: [], hiddenLines: [], error: error.message || 'Use PDF for this breakdown.' }; }
    }, [snapshot]);
    const page = layout.pages[pageIndex], previewWidth = Math.max(240, Math.min(width - 32, FINANCE_IMAGE_WIDTH));
    const share = async (pdf = false) => {
        if (sharing || (!pdf && (!ready || !svg.current || !page))) return;
        setSharing(true);
        try {
            if (pdf) {
                await shareFinancePdf(financeBreakdownPdfHtml(snapshot), `breakdown_${snapshot.rangeStart}_${snapshot.rangeEnd}.pdf`);
            } else {
                const base64 = await new Promise<string>((resolve, reject) => {
                    const timer = setTimeout(() => reject(new Error('Image export timed out. Please try again.')), 15000);
                    svg.current!.toDataURL(value => { clearTimeout(timer); value ? resolve(value) : reject(new Error('Could not render the image.')); },
                        { width: FINANCE_IMAGE_WIDTH * FINANCE_IMAGE_SCALE, height: FINANCE_IMAGE_HEIGHT * FINANCE_IMAGE_SCALE });
                });
                await shareFinanceImage(base64, `breakdown_${snapshot.rangeStart}_${snapshot.rangeEnd}_page_${pageIndex + 1}_of_${layout.pages.length}.png`);
            }
        } catch (error: any) { Alert.alert('Export failed', error.message || 'Please try again.'); }
        finally { setSharing(false); }
    };
    const changePage = (next: number) => { setReady(false); setPageIndex(next); };
    return <Modal visible animationType="slide" onRequestClose={() => { if (!sharing) onClose(); }}>
        <View style={{ flex: 1, backgroundColor: '#eef0f8', paddingTop: 36 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', padding: 16, gap: 16 }}>
                <TouchableOpacity accessibilityRole="button" disabled={sharing} onPress={onClose}><Text style={{ color: '#001642', fontWeight: '700' }}>Close</Text></TouchableOpacity>
                <Text style={{ color: '#001642', fontWeight: '700' }}>Breakdown export</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Share full breakdown PDF" disabled={sharing} onPress={() => { void share(true); }}><Text style={{ color: '#026c47', fontWeight: '700', opacity: sharing ? 0.5 : 1 }}>Full PDF</Text></TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Share current breakdown page as PNG" disabled={!ready || sharing || !page} onPress={() => { void share(); }}><Text style={{ color: '#026c47', fontWeight: '700', opacity: !ready || sharing ? 0.5 : 1 }}>{sharing ? 'Sharing…' : 'Share PNG'}</Text></TouchableOpacity>
            </View>
            <Text style={{ paddingHorizontal: 16, paddingBottom: 12, color: '#444650', fontSize: 12 }}>PNG shares one readable page. Full PDF includes every expanded row in one file.</Text>
            {page && <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 }}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Previous export page" disabled={sharing || pageIndex === 0} onPress={() => changePage(pageIndex - 1)}><Text style={{ color: pageIndex === 0 ? '#aaa' : '#001642' }}>Previous</Text></TouchableOpacity>
                <Text style={{ color: '#001642' }}>Page {pageIndex + 1} of {layout.pages.length}</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Next export page" disabled={sharing || pageIndex >= layout.pages.length - 1} onPress={() => changePage(pageIndex + 1)}><Text style={{ color: pageIndex >= layout.pages.length - 1 ? '#aaa' : '#001642' }}>Next</Text></TouchableOpacity>
            </View>}
            {!!layout.error && <Text accessibilityRole="alert" style={{ padding: 16, color: '#ba1a1a' }}>{layout.error}</Text>}
            <ScrollView contentContainerStyle={{ alignItems: 'center', padding: 16, paddingBottom: 40 }}>
                {page && <Svg key={pageIndex} ref={svg} width={previewWidth} height={FINANCE_IMAGE_HEIGHT * previewWidth / FINANCE_IMAGE_WIDTH}
                    viewBox={`0 0 ${FINANCE_IMAGE_WIDTH} ${FINANCE_IMAGE_HEIGHT}`} font={{ fontFamily: 'sans-serif' }} onLayout={() => setReady(true)}>
                    <Rect width={FINANCE_IMAGE_WIDTH} height={FINANCE_IMAGE_HEIGHT} fill="#fff" />
                    <ImageText x={28} y={42} fontSize={28} fontWeight="bold" fill="#001642">Expense breakdown</ImageText>
                    <ImageText x={28} y={78} fontSize={21} fill="#444650">{snapshot.rangeStart} – {snapshot.rangeEnd} (inclusive)</ImageText>
                    <ImageText x={28} y={114} fontSize={23} fontWeight="bold" fill="#001642">Total expenses: {money(snapshot.totalExpense)}</ImageText>
                    <ImageText x={28} y={148} fontSize={18} fill="#747782">Grouped by {snapshot.grouping} · Expanded rows</ImageText>
                    {layout.hiddenLines.map((line, i) => <ImageText key={i} x={28} y={174 + i * 22} fontSize={17} fill="#747782">{line}</ImageText>)}
                    {page.context.map((line, i) => <ImageText key={i} x={28} y={174 + (layout.hiddenLines.length + i) * 22} fontSize={17} fill="#747782">{line}</ImageText>)}
                    {!page.rows.length && <ImageText x={28} y={page.headerHeight + 30} fontSize={20} fill="#747782">No expenses match this selection.</ImageText>}
                    {page.rows.map(row => <React.Fragment key={row.id}>
                        <Rect x={24 + row.indent} y={row.y} width={672 - row.indent} height={row.height} rx={10} fill={row.detail ? '#fff' : '#f1f3ff'} />
                        <Circle cx={38 + row.indent} cy={row.y + 27} r={5} fill={row.color} />
                        {row.lines.map((line, i) => <ImageText key={i} x={52 + row.indent} y={row.y + 34 + i * 27} fontSize={22} fontWeight="600" fill="#041b3c">{line}</ImageText>)}
                        <ImageText x={678} y={row.y + 34} textAnchor="end" fontSize={20} fill="#444650">{money(row.amountPaise)}{row.percentage !== undefined ? ' · ' + row.percentage.toLocaleString('en-IN', { maximumFractionDigits: 1 }) + '%' : ''}</ImageText>
                        {row.detailLines.map((line, i) => <ImageText key={i} x={52 + row.indent} y={row.y + 38 + row.lines.length * 27 + i * 24} fontSize={18} fill="#747782">{line}</ImageText>)}
                        {row.percentage !== undefined && <>
                            <Rect x={40 + row.indent} y={row.y + row.height - 10} width={640 - row.indent} height={3} fill="#d7e2ff" />
                            <Rect x={40 + row.indent} y={row.y + row.height - 10} width={(640 - row.indent) * Math.max(0, Math.min(100, row.percentage)) / 100} height={3} fill={row.color} />
                        </>}
                    </React.Fragment>)}
                    <ImageText x={28} y={1056} fontSize={18} fill="#747782">{snapshot.rangeStart} – {snapshot.rangeEnd}</ImageText>
                    <ImageText x={692} y={1056} textAnchor="end" fontSize={18} fill="#747782">Page {pageIndex + 1} of {layout.pages.length}</ImageText>
                </Svg>}
            </ScrollView>
        </View>
    </Modal>;
}
