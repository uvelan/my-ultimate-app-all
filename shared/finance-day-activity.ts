type ActivityTransaction = { id: string; type: 'INCOME' | 'EXPENSE'; amountPaise: number };

export function financeDayActivity<T extends ActivityTransaction>(transactions: readonly T[], hiddenIds: ReadonlySet<string>) {
    const visible: T[] = [];
    let hiddenCount = 0;
    let incomePaise = 0;
    let expensePaise = 0;
    for (const transaction of transactions) {
        if (hiddenIds.has(transaction.id)) {
            hiddenCount++;
            continue;
        }
        visible.push(transaction);
        if (transaction.type === 'INCOME') incomePaise += transaction.amountPaise;
        else expensePaise += transaction.amountPaise;
    }
    return { visible, hiddenCount, incomePaise, expensePaise };
}

export function formatActivityAmount(paise: number) {
    return '₹' + (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
