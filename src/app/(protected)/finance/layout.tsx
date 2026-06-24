'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/finance/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { href: '/finance/transactions', icon: 'receipt_long', label: 'Transactions' },
  { href: '/finance/calendar', icon: 'calendar_month', label: 'Calendar' },
  { href: '/finance/budgets', icon: 'account_balance_wallet', label: 'Budgets' },
  { href: '/finance/categories', icon: 'category', label: 'Categories' },
  { href: '/finance/reports', icon: 'bar_chart', label: 'Reports' },
  { href: '/finance/recurring', icon: 'update', label: 'Recurring' },
]

export default function FinanceLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const search = formData.get('search') as string
    if (search) {
      router.push(`/finance/transactions?search=${encodeURIComponent(search)}`)
    }
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Geist:wght@400;600;700&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');

        .ft-root {
          --ft-primary: #001642;
          --ft-primary-container: #00296d;
          --ft-secondary: #026c47;
          --ft-secondary-container: #9df5c5;
          --ft-on-secondary-container: #002113;
          --ft-surface: #f9f9ff;
          --ft-surface-low: #f1f3ff;
          --ft-surface-container: #e8eeff;
          --ft-surface-high: #e0e8ff;
          --ft-surface-highest: #d7e2ff;
          --ft-on-surface: #041b3c;
          --ft-on-surface-variant: #444650;
          --ft-outline: #747782;
          --ft-outline-variant: #c4c6d2;
          --ft-error: #ba1a1a;
          --ft-error-container: #ffdad6;
          --ft-glass-bg: rgba(255,255,255,0.75);
          --ft-glass-border: rgba(255,255,255,0.5);
          --ft-on-primary: #ffffff;
          font-family: 'Inter', sans-serif;
        }

        .ft-glass {
          background: var(--ft-glass-bg);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--ft-glass-border);
          box-shadow: 0 8px 32px rgba(4,27,60,0.06);
        }

        .ft-accent-card {
          background: linear-gradient(135deg, #00296d 0%, #001848 100%);
          box-shadow: 0 10px 40px rgba(0,41,109,0.25);
        }

        .ft-sidebar-link {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 20px;
          border-radius: 14px;
          margin: 2px 12px;
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.03em;
          color: rgba(255,255,255,0.65);
          transition: all 0.2s ease;
          text-decoration: none;
        }

        .ft-sidebar-link:hover {
          background: rgba(178,197,255,0.15);
          color: rgba(255,255,255,0.9);
        }

        .ft-sidebar-link.active {
          background: var(--ft-secondary-container);
          color: var(--ft-on-secondary-container);
          font-weight: 700;
        }

        .ft-sidebar-link.active .material-symbols-outlined {
          font-variation-settings: 'FILL' 1, 'wght' 600, 'GRAD' 0, 'opsz' 24;
        }

        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
          font-size: 22px;
          line-height: 1;
          flex-shrink: 0;
        }

        .ft-mobile-nav-link {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          padding: 6px 12px;
          min-width: 72px;
          border-radius: 20px;
          color: var(--ft-on-surface-variant);
          text-decoration: none;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.04em;
          transition: all 0.2s ease;
        }

        .ft-mobile-nav-link.active {
          background: var(--ft-secondary-container);
          color: var(--ft-on-secondary-container);
        }
      `}</style>

      <div className="ft-root flex h-[100dvh]" style={{ background: 'var(--ft-surface)' }}>
        {/* Sidebar — Desktop */}
        <aside
          className="hidden lg:flex flex-col fixed left-0 top-0 h-full w-72 z-50"
          style={{ background: 'var(--ft-primary)', borderRight: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* Brand */}
          <div className="px-8 pt-8 pb-6">
            <Link 
              href="/dashboard" 
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600, textDecoration: 'none', marginBottom: 16, transition: 'color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'} 
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
              Main App
            </Link>
            <h1 style={{ fontFamily: 'Inter', fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
              Finance
            </h1>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 4 }}>
              Personal Tracker
            </p>
          </div>

          {/* Nav */}
          <nav className="flex-1 py-2">
            {NAV_ITEMS.map(item => {
              const isActive = pathname === item.href || (item.href !== '/finance/dashboard' && pathname?.startsWith(item.href))
              return (
                <Link key={item.href} href={item.href} className={`ft-sidebar-link${isActive ? ' active' : ''}`}>
                  <span className="material-symbols-outlined">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Bottom */}
          <div className="p-6 mt-auto">
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '16px' }}>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600 }}>INR Financial Tracker</p>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 4 }}>All amounts in ₹</p>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 lg:ml-72 flex flex-col h-[100dvh] min-h-0 overflow-hidden">
          {/* Top bar — desktop */}
          <header
            className="hidden lg:flex sticky top-0 z-40 h-16 items-center justify-between px-8 flex-shrink-0"
            style={{ background: 'var(--ft-glass-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid var(--ft-glass-border)' }}
          >
            <form
              onSubmit={handleSearch}
              className="flex items-center gap-3 rounded-full px-4 py-2"
              style={{ background: 'var(--ft-surface-low)', border: '1px solid var(--ft-outline-variant)', width: 320 }}
            >
              <span className="material-symbols-outlined" style={{ color: 'var(--ft-outline)', fontSize: 18 }}>search</span>
              <input
                type="text"
                name="search"
                placeholder="Search transactions..."
                style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: 'var(--ft-on-surface)', width: '100%' }}
              />
            </form>
            <div className="flex items-center gap-3">
              <div style={{ background: 'var(--ft-surface-container)', borderRadius: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: 'var(--ft-primary)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>calendar_today</span>
                {new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
              </div>
            </div>
          </header>

          {/* Mobile top bar */}
          <header
            className="lg:hidden sticky top-0 z-40 h-14 flex items-center px-4"
            style={{ background: 'var(--ft-glass-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid var(--ft-glass-border)' }}
          >
            <div className="flex items-center gap-3">
              <Link href="/dashboard" style={{ color: 'var(--ft-on-surface-variant)', display: 'flex' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
              </Link>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--ft-primary)', letterSpacing: '-0.02em' }}>Finance</h2>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto no-scrollbar pb-32 lg:pb-8" style={{ background: 'var(--ft-surface)' }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
              {children}
            </div>
          </main>
        </div>

        {/* Mobile Bottom Nav */}
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-start items-center px-2 h-16 overflow-x-auto no-scrollbar gap-1"
          style={{ background: 'var(--ft-glass-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: '1px solid var(--ft-glass-border)' }}
        >
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href || (item.href !== '/finance/dashboard' && pathname?.startsWith(item.href))
            return (
              <Link key={item.href} href={item.href} className={`ft-mobile-nav-link${isActive ? ' active' : ''}`}>
                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </>
  )
}
