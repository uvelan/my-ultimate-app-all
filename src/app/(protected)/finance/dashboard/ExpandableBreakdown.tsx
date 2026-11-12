'use client'

import { DashboardCategory, DashboardTransaction, dashboardCategoryTree } from '@/lib/finance-dashboard'
import styles from './DashboardClient.module.css'
import { useRef, useState } from 'react'
import { financeBreakdownImageRows } from '@/lib/finance-image'
import type { FinanceImageSnapshot } from '@/lib/finance-image-export'
import FinanceImageExport from '@/components/finance/FinanceImageExport'

const money = (value: number) => '₹' + (value / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Node {
  id: string
  name: string
  color: string
  amountPaise: number
  items: DashboardTransaction[]
  children: Node[]
}

function BreakdownBranch({ node, total, path = [] }: { node: Node; total: number; path?: string[] }) {
  const branch = [...path, node.id]
  const percent = total > 0 ? Math.round(node.amountPaise / total * 100) : 0
  return (
    <details data-image-path={JSON.stringify(branch)} style={{ borderRadius: 8, background: 'var(--ft-surface-low)', padding: '6px 10px' }}>
      <summary style={{ cursor: 'pointer', lineHeight: '18px', color: 'var(--ft-on-surface)' }}>
        <span style={{ display: 'inline-flex', width: 'calc(100% - 24px)', alignItems: 'center', justifyContent: 'space-between', gap: 12, verticalAlign: 'middle' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}><span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: node.color }} />{node.name}</span>
          <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{money(node.amountPaise)} · {percent}%</span>
        </span>
        <span aria-hidden="true" style={{ display: 'block', marginTop: 4, height: 2, borderRadius: 999, background: 'var(--ft-surface-highest)', overflow: 'hidden' }}>
          <span style={{ display: 'block', width: `${percent}%`, height: '100%', background: node.color }} />
        </span>
      </summary>
      <div style={{ display: 'grid', gap: 8, marginTop: 12, paddingLeft: 12, borderLeft: '2px solid var(--ft-outline-variant)' }}>
        {node.children.map(child => <BreakdownBranch key={child.id} node={child} total={node.amountPaise} path={branch} />)}
        {[...node.items].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)).map(item => (
          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', fontSize: 12, color: 'var(--ft-on-surface)' }}>
            <div style={{ minWidth: 0 }}><div style={{ overflowWrap: 'anywhere' }}>{item.description || 'No description'}</div><div style={{ fontSize: 11, marginTop: 4, color: 'var(--ft-on-surface-variant)' }}>{new Date(item.transactionDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} · {item.paymentMethod || 'Unknown'}</div></div>
            <span style={{ whiteSpace: 'nowrap' }}>{money(item.amountPaise)}</span>
          </div>
        ))}
      </div>
    </details>
  )
}

export default function ExpandableBreakdown({ groups, categories, view, total, rangeStart, rangeEnd, hidden }: {
  groups: { id: string; name: string; color: string; amountPaise: number; items: DashboardTransaction[] }[]
  categories: DashboardCategory[]
  view: 'CATEGORY' | 'METHOD'
  total: number
  rangeStart: string
  rangeEnd: string
  hidden: string
}) {
  const section = useRef<HTMLElement>(null)
  const [snapshot, setSnapshot] = useState<FinanceImageSnapshot | null>(null)
  const nodes: Node[] = view === 'CATEGORY'
    ? dashboardCategoryTree(groups.flatMap(group => group.items), categories)
    : groups.map(group => ({ ...group, items: [], children: dashboardCategoryTree(group.items, categories) }))
  const setAllBranches = (open: boolean) => {
    section.current?.querySelectorAll<HTMLDetailsElement>('details').forEach(node => { node.open = open })
  }
  const buttonStyle = { border: '1px solid var(--ft-outline-variant)', borderRadius: 8, padding: '8px 12px', background: 'var(--ft-surface-low)', color: 'var(--ft-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
  return (
    <section ref={section} aria-label="Expandable expense breakdown" style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--ft-primary)' }}>Breakdown</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {nodes.length > 0 && <>
            <button type="button" style={buttonStyle} onClick={() => setAllBranches(true)}>Expand all</button>
            <button type="button" style={buttonStyle} onClick={() => setAllBranches(false)}>Collapse all</button>
          </>}
          <button type="button" aria-label="Export breakdown with selected date range" onClick={() => {
            const expanded = new Set(Array.from(section.current?.querySelectorAll<HTMLDetailsElement>('details[open]') || []).map(node => node.dataset.imagePath || ''))
            setSnapshot({ rows: financeBreakdownImageRows(nodes, total, expanded), allRows: financeBreakdownImageRows(nodes, total, 'all'), totalExpense: total,
              rangeStart, rangeEnd, grouping: view === 'CATEGORY' ? 'category' : 'payment method', hidden })
          }} style={buttonStyle}>Export breakdown</button>
        </div>
      </div>
      <div className={styles.breakdownList}>
        {nodes.map(node => <BreakdownBranch key={node.id} node={node} total={total} />)}
        {nodes.length === 0 && <p style={{ color: 'var(--ft-on-surface-variant)', fontSize: 13 }}>No expenses match the current filters.</p>}
      </div>
      {snapshot && <FinanceImageExport snapshot={snapshot} onClose={() => setSnapshot(null)} />}
    </section>
  )
}
