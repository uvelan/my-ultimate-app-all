export interface DashboardTransaction {
  id: string
  description: string | null
  amountPaise: number
  type: 'INCOME' | 'EXPENSE'
  transactionDate: string
  categoryId: string
  paymentMethod: string | null
}

export interface DashboardCategory {
  id: string
  name: string
  color: string
  parentId: string | null
}

interface CategoryNode {
  id: string
  name: string
  color: string
  amountPaise: number
  items: DashboardTransaction[]
  children: CategoryNode[]
}

export function dashboardCategoryTree(transactions: DashboardTransaction[], categories: DashboardCategory[]): CategoryNode[] {
  const categoryMap = new Map(categories.map(category => [category.id, category]))
  const roots: CategoryNode[] = []
  for (const item of transactions) {
    if (item.type !== 'EXPENSE') continue
    const path: string[] = []
    let id: string | null = item.categoryId
    while (id && !path.includes(id)) {
      path.unshift(id)
      const parent: string | null = categoryMap.get(id)?.parentId || null
      id = parent && categoryMap.has(parent) ? parent : null
    }
    let siblings = roots
    for (const categoryId of path) {
      let node = siblings.find(candidate => candidate.id === categoryId)
      if (!node) {
        const category = categoryMap.get(categoryId)
        node = { id: categoryId, name: category?.name || 'Other', color: category?.color || '#888', amountPaise: 0, items: [], children: [] }
        siblings.push(node)
      }
      node.amountPaise += item.amountPaise
      if (categoryId === item.categoryId) node.items.push(item)
      siblings = node.children
    }
  }
  const sort = (nodes: CategoryNode[]): CategoryNode[] => nodes.sort((a, b) => b.amountPaise - a.amountPaise).map(node => ({ ...node, children: sort(node.children) }))
  return sort(roots)
}

export function dashboardView(transactions: DashboardTransaction[], categories: DashboardCategory[], excludedCategories: readonly string[] | null, excludedMethods: readonly string[] | null, view: 'CATEGORY' | 'METHOD') {
  const categoryMap = new Map(categories.map(item => [item.id, item]))
  const rootCategory = (id: string) => {
    const visited = new Set<string>()
    while (categoryMap.get(id)?.parentId && !visited.has(id)) {
      visited.add(id)
      const parent = categoryMap.get(id)!.parentId!
      if (!categoryMap.has(parent)) break
      id = parent
    }
    return id
  }
  const filtered = transactions.filter(item => !excludedCategories?.includes(rootCategory(item.categoryId)) && !excludedMethods?.includes(item.paymentMethod || 'Unknown'))
  const totalIncome = filtered.filter(item => item.type === 'INCOME').reduce((sum, item) => sum + item.amountPaise, 0)
  const totalExpense = filtered.filter(item => item.type === 'EXPENSE').reduce((sum, item) => sum + item.amountPaise, 0)
  const palette = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e']
  const methods = Array.from(new Set(transactions.map(item => item.paymentMethod || 'Unknown'))).sort()
  const groups = new Map<string, { id: string; name: string; color: string; amountPaise: number; items: DashboardTransaction[] }>()
  for (const item of filtered) {
    if (item.type !== 'EXPENSE') continue
    const id = view === 'CATEGORY' ? rootCategory(item.categoryId) : item.paymentMethod || 'Unknown'
    const group = groups.get(id) || { id, name: view === 'CATEGORY' ? categoryMap.get(id)?.name || 'Other' : id, color: view === 'CATEGORY' ? categoryMap.get(id)?.color || '#888' : palette[methods.indexOf(id) % palette.length], amountPaise: 0, items: [] }
    group.amountPaise += item.amountPaise
    group.items.push(item)
    groups.set(id, group)
  }
  return { totalIncome, totalExpense, netSavings: totalIncome - totalExpense, filteredTransactions: filtered, groups: Array.from(groups.values()).sort((a, b) => b.amountPaise - a.amountPaise) }
}
