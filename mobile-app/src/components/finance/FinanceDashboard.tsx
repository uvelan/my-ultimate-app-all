import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { VictoryPie } from 'victory-native';
import { Wallet, TrendingUp, TrendingDown, ChevronDown, ChevronRight, Download } from 'lucide-react-native';
import { DashboardCategory, DashboardTransaction, dashboardView, dashboardCategoryTree } from '@/src/lib/finance-dashboard';
import { financeCsv } from '@/src/lib/finance-csv';
import { shareFinanceCsv } from '@/src/services/finance-export.service';
import { financeBreakdownImageRows } from '@/src/lib/finance-image';
import { FinanceBreakdownImage, type FinanceImageSnapshot } from './FinanceBreakdownImage';

interface Props {
    transactions: DashboardTransaction[];
    categories: DashboardCategory[];
    grouping: 'category' | 'method';
    rangeStart: string;
    rangeEnd: string;
    busy?: boolean;
    onGrouping: (value: 'category' | 'method') => void;
}
type Node = ReturnType<typeof dashboardCategoryTree>[number];
const money = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percentage = (amount: number, total: number) => total > 0 ? (amount / total * 100).toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '0';

function BreakdownBranch({ node, total, expanded, onToggle, path = [] }: {
    node: Node; total: number; expanded: ReadonlySet<string>; onToggle(id: string): void; path?: string[];
}) {
    const branch = [...path, node.id], id = JSON.stringify(branch), open = expanded.has(id);
    const Chevron = open ? ChevronDown : ChevronRight;
    return <View style={s.branch}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={(open ? 'Collapse ' : 'Expand ') + node.name} accessibilityState={{ expanded: open }} onPress={() => onToggle(id)} style={{ paddingVertical: 8 }}>
            <View style={s.row}>
                <View style={[s.name, { flex: 1 }]}><Chevron size={14} color="#001642" /><View style={[s.dot, { backgroundColor: node.color }]} /><Text style={s.rowName}>{node.name}</Text></View>
                <Text style={s.amount}>{money(node.amountPaise)} · {percentage(node.amountPaise, total)}%</Text>
            </View>
            <View style={s.track}><View style={[s.fill, { width: (total > 0 ? Math.min(100, node.amountPaise / total * 100) : 0) + '%' as any, backgroundColor: node.color }]} /></View>
        </TouchableOpacity>
        {open && <View style={s.children}>
            {node.children.map(child => <BreakdownBranch key={child.id} node={child} total={node.amountPaise} expanded={expanded} onToggle={onToggle} path={branch} />)}
            {[...node.items].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)).map(item => <View key={item.id} style={[s.row, { paddingVertical: 8 }]}>
                <View style={{ flex: 1 }}><Text style={s.rowName}>{item.description || 'No description'}</Text><Text style={s.note}>{new Date(item.transactionDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} · {item.paymentMethod || 'Unknown'}</Text></View>
                <Text style={s.amount}>{money(item.amountPaise)}</Text>
            </View>)}
        </View>}
    </View>;
}

export function FinanceDashboard({ transactions, categories, grouping, onGrouping, rangeStart, rangeEnd, busy }: Props) {
    const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
    const [methodFilter, setMethodFilter] = useState<string[]>([]);
    const [activeSlice, setActiveSlice] = useState<string | null>(null);
    const [panelWidth, setPanelWidth] = useState(0);
    const [exporting, setExporting] = useState(false);
    const [expandedByView, setExpandedByView] = useState<Record<string, Set<string>>>({});
    const [imageSnapshot, setImageSnapshot] = useState<FinanceImageSnapshot | null>(null);
    const view = grouping === 'category' ? 'CATEGORY' : 'METHOD';
    const expanded = expandedByView[view] || new Set<string>();
    const toggleBranch = (id: string) => setExpandedByView(previous => {
        const next = new Set(previous[view]);
        if (next.has(id)) next.delete(id); else next.add(id);
        return { ...previous, [view]: next };
    });
    const { totalIncome, totalExpense, netSavings, groups, filteredTransactions } = dashboardView(transactions, categories, categoryFilter, methodFilter, view);
    const legends = dashboardView(transactions, categories, [], [], view).groups;
    const excluded = grouping === 'category' ? categoryFilter : methodFilter;
    const toggleLegend = (id: string) => {
        const toggle = (values: string[]) => values.includes(id) ? values.filter(value => value !== id) : [...values, id];
        if (grouping === 'category') setCategoryFilter(toggle);
        else setMethodFilter(toggle);
        setActiveSlice(null);
    };
    const selected = groups.find(group => group.id === activeSlice);
    const horizontal = panelWidth >= 680;
    const tree: Node[] = grouping === 'category'
        ? dashboardCategoryTree(groups.flatMap(group => group.items), categories)
        : groups.map(group => ({ ...group, items: [], children: dashboardCategoryTree(group.items, categories) }));
    const exportCsv = async () => {
        setExporting(true);
        try { await shareFinanceCsv(financeCsv(filteredTransactions, categories), 'transactions_' + rangeStart + '_' + rangeEnd + '.csv'); }
        catch (error: any) { Alert.alert('Export failed', error.message || 'Please try again.'); }
        finally { setExporting(false); }
    };
    const metrics = [
        { label: 'Net Balance', value: money(netSavings), Icon: Wallet, color: '#fff', accent: true },
        { label: 'Income in range', value: '+' + money(totalIncome), Icon: TrendingUp, color: '#026c47', accent: false },
        { label: 'Expenses in range', value: '−' + money(totalExpense), Icon: TrendingDown, color: '#ba1a1a', accent: false },
    ];
    const branches = tree.length ? tree.map(node => <BreakdownBranch key={view + ':' + node.id} node={node} total={totalExpense} expanded={expanded} onToggle={toggleBranch} />) : <Text style={[s.note, { paddingVertical: 20 }]}>No expenses match this selection.</Text>;
    return <View style={s.page}>
        <View style={s.metrics}>{metrics.map(({ label, value, Icon, color, accent }) => <View key={label} style={[s.card, s.metric, accent && s.balance]}>
            <View style={s.metricHeading}><Text style={[s.metricLabel, accent && { color: '#c4d1ee' }]}>{label}</Text><Icon size={18} color={color} /></View>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={[s.metricValue, { color }]}>{value}</Text>
        </View>)}</View>
        <View style={s.card} onLayout={event => setPanelWidth(event.nativeEvent.layout.width - 32)}>
            <View style={s.headingRow}><Text style={s.heading}>Expense breakdown</Text><View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Export breakdown image with selected date range" disabled={busy || exporting} onPress={() => setImageSnapshot({
                    rows: financeBreakdownImageRows(tree, totalExpense, expanded), rangeStart, rangeEnd, totalExpense,
                    grouping: grouping === 'category' ? 'category' : 'payment method',
                    hidden: [...categoryFilter.map(id => categories.find(item => item.id === id)?.name || 'Other'), ...methodFilter].join(', '),
                })} style={[s.exportButton, { opacity: busy || exporting ? 0.5 : 1 }]}><Download size={14} color="#001642" /><Text style={s.choiceText}>Export image</Text></TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Export filtered finance CSV" disabled={busy || exporting} onPress={exportCsv} style={[s.exportButton, { opacity: busy || exporting ? 0.5 : 1 }]}><Download size={14} color="#001642" /><Text style={s.choiceText}>{exporting ? 'Exporting…' : 'Export CSV'}</Text></TouchableOpacity>
            </View></View>
            <View style={s.switcher}>{(['category', 'method'] as const).map(value => <TouchableOpacity key={value} accessibilityRole="tab" accessibilityState={{ selected: grouping === value }} onPress={() => { onGrouping(value); setActiveSlice(null); }} style={[s.choice, grouping === value && s.selected]}><Text style={[s.choiceText, grouping === value && { color: '#fff' }]}>{value === 'category' ? 'Category' : 'Payment method'}</Text></TouchableOpacity>)}</View>
            <Text style={[s.note, { marginVertical: 8 }]}>Tap legends to hide or restore items. Tap a slice for its percentage.</Text>
            {(categoryFilter.length > 0 || methodFilter.length > 0) && <View style={[s.row, { marginBottom: 8 }]}>
                <Text style={[s.note, { flex: 1 }]}>Hidden: {[...categoryFilter.map(id => categories.find(item => item.id === id)?.name || 'Other'), ...methodFilter].join(', ')}</Text>
                <TouchableOpacity accessibilityRole="button" onPress={() => { setCategoryFilter([]); setMethodFilter([]); setActiveSlice(null); }}><Text style={s.choiceText}>Clear filters</Text></TouchableOpacity>
            </View>}
            <View style={{ flexDirection: horizontal ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
                <View style={{ width: horizontal ? '48%' : '100%', minWidth: 0 }}>
                    <View accessibilityLabel="Expense pie chart. Tap a slice to show amount and percentage." style={{ alignItems: 'center', height: 160 }}>
                        {groups.length ? <VictoryPie width={180} height={160} padding={8} innerRadius={48} radius={72} data={groups.map(group => ({ ...group, x: group.name, y: group.amountPaise }))} colorScale={groups.map(group => group.color)} labels={() => ''} style={{ data: { stroke: '#fff', strokeWidth: 2 } }} events={[{ target: 'data', eventHandlers: {
                            onPressIn: (_event: unknown, props: any) => { setActiveSlice(props.datum.id); return []; },
                            onMouseOver: (_event: unknown, props: any) => { setActiveSlice(props.datum.id); return []; },
                        } }]} /> : <Text style={[s.note, { marginTop: 60 }]}>No expenses in this selection.</Text>}
                    </View>
                    {selected && <Text accessibilityLiveRegion="polite" style={[s.amount, { textAlign: 'center', marginVertical: 4 }]}>{selected.name}: {money(selected.amountPaise)} ({percentage(selected.amountPaise, totalExpense)}%)</Text>}
                    <View style={s.legends}>{legends.map(group => {
                        const hidden = excluded.includes(group.id);
                        return <TouchableOpacity key={group.id} accessibilityRole="button" accessibilityLabel={group.name + (hidden ? ', excluded. Tap to restore.' : ', included. Tap to exclude.')} accessibilityState={{ selected: !hidden }} onPress={() => toggleLegend(group.id)} style={[s.legend, hidden && { opacity: 0.5 }]}><View style={[s.dot, { backgroundColor: group.color }]} /><Text numberOfLines={1} style={[s.legendText, hidden && { textDecorationLine: 'line-through' }]}>{group.name}</Text></TouchableOpacity>;
                    })}</View>
                </View>
                <View style={{ width: horizontal ? '48%' : '100%' }}><Text style={[s.heading, { fontSize: 16, marginBottom: 8 }]}>Breakdown</Text>
                    {horizontal ? <ScrollView nestedScrollEnabled style={{ maxHeight: 216 }}>{branches}</ScrollView> : branches}
                </View>
            </View>
        </View>
        {imageSnapshot && <FinanceBreakdownImage snapshot={imageSnapshot} onClose={() => setImageSnapshot(null)} />}
    </View>;
}
const s = StyleSheet.create({
    page: { padding: 16, gap: 16, paddingBottom: 28 },
    metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    card: { padding: 16, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#eef0f8' },
    metric: { width: '47%', flexGrow: 1, padding: 16 },
    balance: { width: '100%', backgroundColor: '#00296d', borderColor: '#00296d' },
    metricHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 14 },
    metricLabel: { color: '#444650', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', flexShrink: 1 },
    metricValue: { fontSize: 22, fontWeight: '700' },
    note: { color: '#747782', fontSize: 11, marginTop: 3 },
    heading: { color: '#001642', fontSize: 18, fontWeight: '800' },
    headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
    switcher: { alignSelf: 'flex-start', flexDirection: 'row', backgroundColor: '#f1f3ff', padding: 3, borderRadius: 24 },
    choice: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 24 },
    selected: { backgroundColor: '#001642' },
    choiceText: { color: '#001642', fontSize: 12, fontWeight: '700' },
    exportButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
    legends: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 10, rowGap: 2, marginTop: 4 },
    legend: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 5, maxWidth: '100%', minHeight: 28 },
    legendText: { color: '#041b3c', fontSize: 11, flexShrink: 1 },
    branch: { backgroundColor: '#f1f3ff', paddingHorizontal: 8, borderRadius: 8, marginBottom: 6 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    name: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 75 },
    dot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
    rowName: { fontSize: 12, color: '#041b3c', fontWeight: '600', flexShrink: 1 },
    amount: { fontSize: 11, color: '#444650', fontWeight: '600' },
    track: { marginTop: 4, height: 2, backgroundColor: '#d7e2ff', borderRadius: 4, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 4 },
    children: { paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: '#d7e2ff', marginBottom: 8 },
});
