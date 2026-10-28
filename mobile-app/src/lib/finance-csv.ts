import { DashboardCategory, DashboardTransaction } from './finance-dashboard'
import { financeDay } from './finance-range'

export function financeCsv(transactions: DashboardTransaction[], categories: DashboardCategory[]) {
  const categoryMap = new Map(categories.map(category => [category.id, category]))
  const cell = (text: string) => {
    const safe = /^[=+@\-\t\r]/.test(text) ? "'" + text : text
    return '"' + safe.replace(/"/g, '""') + '"'
  }
  const rows = ['Date,Type,Parent Category,Category,Description,Method,Amount (INR)']
  for (const item of [...transactions].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))) {
    const category = categoryMap.get(item.categoryId)
    rows.push([
      financeDay(new Date(item.transactionDate)), item.type,
      cell(category?.parentId ? categoryMap.get(category.parentId)?.name || '' : ''),
      cell(category?.name || 'Uncategorized'), cell(item.description || ''),
      cell(item.paymentMethod || 'Unknown'), (item.amountPaise / 100).toFixed(2),
    ].join(','))
  }
  return '\uFEFF' + rows.join('\r\n')
}
