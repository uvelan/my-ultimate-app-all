import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, TouchableOpacity, FlatList, ActivityIndicator,
    TextInput, PermissionsAndroid, Modal, Alert, ScrollView, NativeModules, Platform,
    KeyboardAvoidingView
} from 'react-native';
import { MessageSquare, Calendar, CreditCard, Save, CheckCircle, ChevronLeft, X } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { expenseService, categoryService } from '@/src/services/features.service';

const { SmsReader } = NativeModules;

interface ParsedTransaction {
    id: string;
    amount: number;
    source: string;
    notes: string;
    date: string;
    rawDateMillis: number;
    rawBody: string;
    synced: boolean;
}

// Memoized Item Component for performance
const TransactionItem = React.memo(({ 
    item, 
    onNoteChange, 
    onOpenCategorySelect 
}: { 
    item: ParsedTransaction, 
    onNoteChange: (id: string, text: string) => void,
    onOpenCategorySelect: (id: string) => void
}) => {
    return (
        <View className={`p-4 bg-background-surface mb-3 rounded-xl border border-border shadow-md ${item.synced ? 'opacity-50' : ''}`}>
            <View className="flex-row justify-between items-start mb-2">
                <View className="flex-1 pr-4">
                    <Text className="text-text-primary font-bold text-lg mb-1" numberOfLines={1}>
                        ₹{item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </Text>
                    <TextInput
                        value={item.notes}
                        onChangeText={(text) => onNoteChange(item.id, text)}
                        className="text-text-secondary text-sm p-0 m-0"
                        placeholder="Add notes..."
                        placeholderTextColor="#555"
                    />
                </View>

                <View className="items-end bg-background px-3 py-1 rounded-full border border-border flex-row">
                    <CreditCard size={14} color="#888" />
                    <Text className="text-text-secondary text-xs font-semibold ml-1">{item.source}</Text>
                </View>
            </View>

            <Text className="text-text-muted text-xs mb-3">
                {item.date}
            </Text>

            <TouchableOpacity
                disabled={item.synced}
                onPress={() => onOpenCategorySelect(item.id)}
                className={`py-3 rounded-lg flex-row items-center justify-center ${item.synced ? 'bg-green-500/10 border border-green-500/20' : 'bg-background border border-accent'}`}
            >
                {item.synced ? (
                    <>
                        <CheckCircle size={16} color="#10b981" />
                        <Text className="text-green-500 font-bold ml-2">Already Synced</Text>
                    </>
                ) : (
                    <>
                        <Save size={16} color="#8b5cf6" />
                        <Text className="text-accent font-bold ml-2">Save to Expenses</Text>
                    </>
                )}
            </TouchableOpacity>
        </View>
    );
});

export default function SpentSyncScreen() {
    const router = useRouter();
    
    const [loading, setLoading] = useState(false);
    const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
    const [existingExpenses, setExistingExpenses] = useState<any[]>([]);

    const [startDateObj, setStartDateObj] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d;
    });
    const [endDateObj, setEndDateObj] = useState(() => new Date());
    const [showStartPicker, setShowStartPicker] = useState(false);
    const [showEndPicker, setShowEndPicker] = useState(false);

    const startDate = startDateObj.toISOString().split('T')[0];
    const endDate = endDateObj.toISOString().split('T')[0];

    const formatDisplayDate = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    const [categories, setCategories] = useState<any[]>([]);
    const [activeTransactionId, setActiveTransactionId] = useState<string | null>(null);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

    useEffect(() => {
        fetchCategories();
        fetchExistingExpenses();
    }, [startDate, endDate]);

    const fetchCategories = async () => {
        try {
            const data = await categoryService.getCategories();
            // Remove the type filter as it might be blocking categories
            setCategories(data || []);
        } catch (error) {
            console.error('Failed to load categories', error);
        }
    };

    const fetchExistingExpenses = async () => {
        try {
            const exp = await expenseService.getExpenses(startDate, endDate);
            setExistingExpenses(exp || []);
        } catch (error) {
            console.error(error);
        }
    };

    const requestSmsPermission = async (): Promise<boolean> => {
        if (Platform.OS !== 'android') {
            Alert.alert("Not Supported", "SMS reading is only available on Android.");
            return false;
        }
        try {
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.READ_SMS,
                {
                    title: "SMS Read Permission",
                    message: "SpentSync needs to read your SMS messages to find transaction alerts.",
                    buttonNeutral: "Ask Me Later",
                    buttonNegative: "Cancel",
                    buttonPositive: "OK"
                }
            );
            return granted === PermissionsAndroid.RESULTS.GRANTED;
        } catch (err) {
            return false;
        }
    };

    const parseMessage = (msg: any): ParsedTransaction | null => {
        const body: string = msg.body || '';
        const lower = body.toLowerCase();
        
        // Only target debit/spend messages
        const isDebitKeyword = /(debited|spent|sent|paid|withdrawn|purchase|txn)/.test(lower);
        const isExcludedKeyword = /(received|refund|cashback|requested|will be)/.test(lower);
        
        // If it contains "credited" but NOT "debited", it's a credit alert, skip it.
        // If it contains "debited", we treat it as a debit alert even if "credited" exists (common for transfers).
        if (!isDebitKeyword) return null;
        if (isExcludedKeyword) return null;
        if (lower.includes('credited') && !lower.includes('debited')) return null;

        // Extract amount — try multiple common Indian banking formats
        const amountPatterns = [
            /(?:rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i,
            /(?:debited|spent|paid|sent|txn)\s+(?:by\s+|for\s+|of\s+)?(?:rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i,
            /([\d,]+(?:\.\d{1,2})?)\s*(?:has been|is|was)\s+(?:debited|spent)/i,
        ];

        let amount = 0;
        for (const pattern of amountPatterns) {
            const match = body.match(pattern);
            if (match) {
                amount = parseFloat(match[1].replace(/,/g, ''));
                break;
            }
        }
        
        if (!amount || amount <= 0 || amount > 100000000) return null;

        // Classify source type
        let sourceType = "Bank";
        if (/credit card|debit card|card/i.test(lower)) sourceType = 'Card';
        else if (/upi/i.test(lower)) sourceType = 'UPI';
        else if (/neft|rtgs|imps/i.test(lower)) sourceType = 'Transfer';

        // Find bank name
        const bankMatch = body.match(/(?:HDFC|SBI|ICICI|AXIS|KOTAK|PNB|CITI|BOB|IDFC|YES|UNION|CANARA|INDUS|FEDERAL|PAYTM|PHONEPE|GPAY)/i);
        const bankName = bankMatch ? bankMatch[0].toUpperCase() : '';

        // Extract merchant/notes
        let merchant = 'Transaction';
        const merchantPatterns = [
            /(?:to|at|info:)\s+([a-zA-Z0-9\s.*]+?)(?=\s+(?:on|via|ref|bal|avbl|a\/c)|[.]|$)/i,
            /(?:vpa|upi)\b.*?(?:\/|@|to\s+)([a-zA-Z0-9.@\- ]+)/i,
            /(?:txn|transaction)\s+(?:at|to|for)\s+([a-zA-Z0-9\s]+?)(?=\s+|$)/i,
        ];
        for (const pattern of merchantPatterns) {
            const match = body.match(pattern);
            if (match && match[1].trim().length > 1) {
                merchant = match[1].trim().substring(0, 50);
                break;
            }
        }

        // Notes includes full context: "HDFC UPI - Merchant"
        const notes = `${bankName}${bankName ? ' ' : ''}${sourceType} - ${merchant}`;
        
        const txnDateObj = new Date(msg.date);
        const txnDateStr = txnDateObj.toISOString().split('T')[0];

        return {
            id: msg._id?.toString() || `sms-${Math.random().toString(36).substring(7)}`,
            amount,
            source: sourceType, // Only show "UPI", "Card", etc in badge
            notes,
            date: txnDateStr,
            rawDateMillis: msg.date,
            rawBody: body,
            synced: false
        };
    };

    const scanInbox = async () => {
        setLoading(true);
        const hasPermission = await requestSmsPermission();
        if (!hasPermission) {
            Alert.alert("Permission Required", "Unable to read SMS messages without permission.");
            setLoading(false);
            return;
        }

        try {
            const minDate = startDateObj.getTime();
            const maxDate = endDateObj.getTime() + 86400000; // end of day

            const smsList = await SmsReader.readSms(minDate, maxDate);
            
            const parsed: ParsedTransaction[] = [];
            for (const sms of smsList) {
                const txn = parseMessage(sms);
                if (txn) {
                    // Check for duplicates in existing expenses
                    const isDuplicate = existingExpenses.some(e => 
                        Math.abs(e.amount - txn.amount) < 0.01 && 
                        e.date?.startsWith(txn.date)
                    );
                    txn.synced = isDuplicate;
                    parsed.push(txn);
                }
            }
            
            parsed.sort((a, b) => b.rawDateMillis - a.rawDateMillis);
            setTransactions(parsed);
            
            if (parsed.length === 0) {
                Alert.alert("No Transactions", "No debit/spend SMS found in the selected date range.");
            }
        } catch (error: any) {
            Alert.alert("Error", error.message || "Failed to read SMS");
        }
        setLoading(false);
    };

    const handleSaveTransaction = async (categoryId: string) => {
        if (!activeTransactionId) return;
        const txn = transactions.find(t => t.id === activeTransactionId);
        if (!txn) return;
        
        setIsCategoryModalOpen(false);

        try {
            await expenseService.addExpense({
                amount: txn.amount,
                categoryId: categoryId,
                date: new Date(txn.rawDateMillis).toISOString(),
                notes: txn.notes,
                paymentMethod: txn.source.includes('Card') ? 'Card' : txn.source.includes('UPI') ? 'UPI' : 'Bank Transfer'
            });
            
            setTransactions(prev => prev.map(t => 
                t.id === activeTransactionId ? { ...t, synced: true } : t
            ));
            Alert.alert("Saved!", `₹${txn.amount.toLocaleString()} saved to expenses.`);
            
            fetchExistingExpenses();
        } catch (error) {
            Alert.alert("Save Failed", "Could not sync this transaction.");
        }
    };

    const handleNoteChange = useCallback((id: string, text: string) => {
        setTransactions(prev => prev.map(t => t.id === id ? { ...t, notes: text } : t));
    }, []);

    const handleOpenCategorySelect = useCallback((id: string) => {
        setActiveTransactionId(id);
        setIsCategoryModalOpen(true);
    }, []);

    const renderItem = useCallback(({ item }: { item: ParsedTransaction }) => (
        <TransactionItem 
            item={item} 
            onNoteChange={handleNoteChange} 
            onOpenCategorySelect={handleOpenCategorySelect} 
        />
    ), [handleNoteChange, handleOpenCategorySelect]);

    const totalAmount = useMemo(() => {
        return transactions.reduce((sum, t) => sum + t.amount, 0);
    }, [transactions]);

    return (
        <View className="flex-1 bg-background">
            {/* Header - Keep it outside for easy back navigation */}
            <View className="px-6 py-4 pt-12 border-b border-border bg-background-surface flex-row items-center justify-between">
                <View className="flex-row items-center gap-3">
                    <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2 rounded-full">
                        <ChevronLeft size={24} color="#f5f5f0" />
                    </TouchableOpacity>
                    <MessageSquare size={24} color="#8b5cf6" />
                    <View>
                        <Text className="text-text-primary text-xl font-bold font-serif">Spent Sync</Text>
                        {transactions.length > 0 && (
                            <Text className="text-accent text-xs font-bold">Total: ₹{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                        )}
                    </View>
                </View>
            </View>

            {/* Transactions List */}
            <FlatList
                data={transactions}
                keyExtractor={item => item.id}
                contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 100 }}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
                removeClippedSubviews={true}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={
                    <>
                        {/* Filters moved inside scrollable area */}
                        <View className="p-4 bg-background-surface border border-border mt-4 mb-6 rounded-2xl shadow-xl">
                            <Text className="text-text-secondary font-semibold mb-3">Sync Date Bracket</Text>
                            
                            <View className="flex-row items-center gap-4 mb-4">
                                <View className="flex-1">
                                    <Text className="text-text-secondary text-xs mb-1">Start Date</Text>
                                    <TouchableOpacity
                                        onPress={() => setShowStartPicker(true)}
                                        className="flex-row items-center bg-background border border-border rounded-xl px-3 py-3"
                                    >
                                        <Calendar size={16} color="#8b5cf6" />
                                        <Text className="flex-1 ml-2 text-text-primary font-semibold">{formatDisplayDate(startDateObj)}</Text>
                                    </TouchableOpacity>
                                </View>
                                
                                <View className="flex-1">
                                    <Text className="text-text-secondary text-xs mb-1">End Date</Text>
                                    <TouchableOpacity
                                        onPress={() => setShowEndPicker(true)}
                                        className="flex-row items-center bg-background border border-border rounded-xl px-3 py-3"
                                    >
                                        <Calendar size={16} color="#8b5cf6" />
                                        <Text className="flex-1 ml-2 text-text-primary font-semibold">{formatDisplayDate(endDateObj)}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {showStartPicker && (
                                <DateTimePicker
                                    value={startDateObj}
                                    mode="date"
                                    display="calendar"
                                    maximumDate={endDateObj}
                                    onChange={(_, date) => {
                                        setShowStartPicker(false);
                                        if (date) setStartDateObj(date);
                                    }}
                                />
                            )}
                            {showEndPicker && (
                                <DateTimePicker
                                    value={endDateObj}
                                    mode="date"
                                    display="calendar"
                                    minimumDate={startDateObj}
                                    maximumDate={new Date()}
                                    onChange={(_, date) => {
                                        setShowEndPicker(false);
                                        if (date) setEndDateObj(date);
                                    }}
                                />
                            )}

                            <TouchableOpacity 
                                onPress={scanInbox}
                                disabled={loading}
                                className={`w-full py-4 rounded-xl flex-row items-center justify-center shadow-lg ${loading ? 'bg-accent/50' : 'bg-accent'}`}
                            >
                                {loading ? <ActivityIndicator color="#fff" /> : (
                                    <>
                                        <MessageSquare size={18} color="#fff" />
                                        <Text className="text-white font-bold text-base ml-2">Scan Inbox for Transactions</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>

                        {/* Results Count moved inside scrollable area */}
                        {transactions.length > 0 && (
                            <View className="px-2 mb-4 flex-row items-center justify-between">
                                <View>
                                    <Text className="text-text-primary text-2xl font-bold tracking-tight">
                                        ₹{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </Text>
                                    <Text className="text-text-secondary text-xs uppercase font-bold tracking-widest opacity-60">
                                        Found in {transactions.length} messages
                                    </Text>
                                </View>
                                <View className="items-end">
                                    <View className="bg-accent/20 px-3 py-1 rounded-full border border-accent/30">
                                        <Text className="text-accent text-[10px] font-bold uppercase">
                                            {transactions.filter(t => t.synced).length} SYNCED
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        )}
                    </>
                }
                ListEmptyComponent={
                    !loading ? (
                        <View className="flex-1 items-center justify-center mt-20 opacity-50">
                            <MessageSquare size={48} color="#a0aec0" />
                            <Text className="text-text-secondary mt-4 font-semibold text-center">
                                Tap "Scan Inbox" to find{'\n'}transaction SMS messages.
                            </Text>
                        </View>
                    ) : null
                }
                renderItem={renderItem}
            />

            {/* Category Mapping Modal */}
            <Modal visible={isCategoryModalOpen} animationType="slide" transparent={true}>
                <View className="flex-1 justify-end bg-black/60">
                    <View className="bg-background-surface rounded-t-3xl pt-6 pb-8 min-h-[50%] border-t border-border">
                        <View className="px-6 pb-4 border-b border-border flex-row justify-between items-center">
                            <Text className="text-xl font-bold text-text-primary font-serif">Select Category</Text>
                            <TouchableOpacity onPress={() => setIsCategoryModalOpen(false)} className="p-1">
                                <X size={24} color="#a0aec0" />
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView className="px-4 mt-2">
                            <View className="flex-row flex-wrap gap-3 mt-4">
                                {categories.map((cat: any) => (
                                    <TouchableOpacity
                                        key={cat.id}
                                        onPress={() => handleSaveTransaction(cat.id)}
                                        className="py-3 px-5 rounded-xl flex-row items-center border border-border bg-background shadow-sm"
                                        style={{ borderLeftWidth: 4, borderLeftColor: cat.color || '#8b5cf6' }}
                                    >
                                        <Text className="text-text-primary font-bold">{cat.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            {categories.length === 0 && (
                                <Text className="text-center text-text-muted mt-8">
                                    No expense categories found.{'\n'}Please create some in the Expenses screen first.
                                </Text>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}
