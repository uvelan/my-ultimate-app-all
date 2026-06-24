# Expense Page → INR Financial Tracker: Analysis Review & Optimized Plan

## 0. Non-Negotiable Rules

- Do not implement until the MVP boundary and migration gates are approved.
- Do not trust UI labels as behavior evidence. Verify from code.
- Do not invent APIs, fields, schemas, routes, or behavior.
- Mark missing items as `Not found in current codebase`.
- Challenge both current functionality and proposed functionality before accepting it.
- All money is INR-only.
- Persist money as integer paise only.
- Do not add currency selector, exchange-rate logic, multi-currency reports, or non-INR fields.
- Use Google Stitch MCP only after current-state analysis, MVP boundary, and migration gates are accepted.

---

## 1. Codebase Discovery & Corrected Decision Matrix

| Capability | Evidence | Challenge | Decision | Optimized Action |
|---|---|---|---|---|
| Expense CRUD | Present: `actions/expense.ts`, `ExpenseList.tsx` | Essential, but validation/state handling is weak | Refactor | Keep behavior; harden server actions, schema validation, and user isolation |
| Income tracking | Present: `Income` model, `stats.ts` | Separate model hurts unified reporting | Replace gradually | Introduce canonical `Transaction(type)` and migrate safely |
| Amount | Prisma `Float` | Financial correctness bug | Replace | Add `amountPaise Int`; backfill from `amount`; INR only |
| Currency | INR display exists / no multi-currency found | Multi-currency adds scope and bugs | Reject | INR-only; display with `₹` and Indian number format |
| Category | Present: `CategoryManager.tsx` | Needs income/expense separation | Refactor | Add `type`; archive instead of hard delete |
| Search/filter/sort | Client-side state | Breaks at scale | Refactor | URL-driven server filtering and pagination |
| Dashboard/charts | Present: `Dashboard.tsx` | Client aggregation can drift and overfetch | Refactor | Server-side aggregates from canonical transaction data |
| Export | Client CSV build | Fails for large data and permission boundaries | Refactor | Server-side export using current filters |
| Recurring | Boolean exists in schema | Full recurrence engine too large for MVP | Defer expansion | Preserve flag; do not build scheduler in MVP |
| Receipt upload | Not found in current codebase | Storage/security complexity | Defer | Exclude from MVP |
| AI categorization | Not found in current codebase | Overkill and low trust before clean categories | Reject | Manual categories first |
| Forecasting | Not found in current codebase | Inaccurate without stable historical data | Reject | Revisit after stable transaction history |
| Budgets | Generic `monthlyBudget` on `User` | Not actionable by category | Replace | Category-month budgets in INR paise |
| Payment method | String | Weak, but acceptable for MVP | Refactor later | Normalize allowed string values now; model later if needed |

---

## 2. INR-Only Money Rules

- Currency is fixed to INR.
- UI must always display `₹`.
- Use Indian number formatting, for example `₹1,23,456.78`.
- Persist money as integer paise only.
- Example: `₹125.50` = `12550` paise.
- Do not persist money as `Float`, JS Number-derived decimal, currency string, or mixed currency representation.
- `Decimal` is not needed for this INR-only app.
- Convert for display only at the UI boundary: `amountPaise / 100`.
- All calculations must use integer paise.
- Reject currency selectors, exchange rates, multi-currency reports, and non-INR fields.

---

## 3. Safe Migration Plan

| Step | Action | Gate |
|---|---|---|
| 1 | Add nullable `amountPaise Int` beside existing `amount Float` | Existing app still works |
| 2 | Add migration audit fields: `sourceModel`, `sourceId`, `migrationBatchId` | Migration is traceable |
| 3 | Add temporary unique constraint: `(sourceModel, sourceId, userId)` | Reruns cannot duplicate records |
| 4 | Backfill: `amountPaise = round(amount * 100)` | Sample audit passes |
| 5 | Update reads to prefer `amountPaise`, fallback to `amount` | No display regression |
| 6 | Update writes to save only `amountPaise` | New records are correct |
| 7 | Run before/after monthly total comparison | Totals match |
| 8 | Make `amountPaise` required | Migration verified |
| 9 | Remove old `amount` only after all removal gates pass | No rollback dependency |

### Old Amount Removal Gate

Remove old `amount` only after:

- 100% of records have `amountPaise`.
- Before/after monthly totals match.
- No active code path reads `amount`.
- Rollback snapshot exists.
- Production has passed one full reporting cycle.

---

## 4. Optimized MVP Scope

### P0 — Must Build

| Feature | Reason |
|---|---|
| Unified transactions | Income and expense reporting needs one canonical ledger |
| INR paise storage | Current Float money is a correctness bug |
| Server-side pagination | Prevent large-list failure |
| URL-based filters | Shareable, stable, server-friendly |
| Server-side dashboard aggregates | Avoid client overfetch and inconsistent totals |
| Category-month budgets | Practical financial tracking |
| Mobile transaction cards | Expense entry and review must work well on phone |
| Strong server-action auth checks | Prevent cross-user access |
| Soft delete | Financial records need recovery/audit safety |

### P1 — Build After MVP

| Feature | Reason |
|---|---|
| Server-side CSV export | Useful but not core CRUD |
| Better reports | Depends on stable transaction model |
| Payment method model | Useful after transaction migration |
| Recurring payments UI | Needs separate recurrence rules |

### Reject / Not MVP

| Feature | Reason |
|---|---|
| Multi-currency | App is INR-only |
| AI categorization | Overkill before clean category data |
| Forecasting | Low accuracy until historical data is stable |
| Receipt upload | Storage/security scope not justified for MVP |

---

## 5. Target Routes

| Route | Purpose | Decision |
|---|---|---|
| `/myexpence` | Existing route | Keep temporarily |
| `/finance/dashboard` | New dashboard | Add |
| `/finance/transactions` | Unified income/expense ledger | Add |
| `/finance/budgets` | Category-month budget tracking | Add |
| `/finance/categories` | Category management | Add |
| `/finance/reports` | Reports and export | Add |

No redirect from `/myexpence` until parity and regression checks pass.

---

## 6. Target Data Model

### Transaction

| Field | Type | Required | Validation | Migration Impact |
|---|---|---:|---|---|
| `id` | String | Yes | UUID/CUID/ObjectId | New or mapped |
| `userId` | String | Yes | Must match session | Map existing records |
| `type` | Enum | Yes | `INCOME` / `EXPENSE` | Replaces separate models |
| `amountPaise` | Int | Yes | `> 0` | Backfilled from Float |
| `categoryId` | String | Yes | Existing active/archived category | Map existing |
| `transactionDate` | DateTime | Yes | Valid date; UTC stored | Map existing date |
| `description` | String? | No | Max 500 chars | Map notes |
| `paymentMethod` | String? | No | Normalized allowed values | Map existing |
| `deletedAt` | DateTime? | No | Null means active | New; enables soft delete |
| `sourceModel` | Enum | Yes during migration | `EXPENSE` / `INCOME` | Migration traceability |
| `sourceId` | String | Yes during migration | Existing row id | Migration dedupe |
| `migrationBatchId` | String? | No | Batch identifier | Rollback/debug support |
| `createdAt` | DateTime | Yes | System-generated | Map existing |
| `updatedAt` | DateTime | Yes | System-generated | Map existing |

### Category

| Field | Type | Required | Validation | Migration Impact |
|---|---|---:|---|---|
| `id` | String | Yes | Existing identity | Map existing |
| `userId` | String | Yes | Must match session | Map existing |
| `name` | String | Yes | Unique per user + type | Map existing |
| `type` | Enum | Yes | `INCOME` / `EXPENSE` | New field |
| `isArchived` | Boolean | Yes | Default false | New field |

### Budget

| Field | Type | Required | Validation | Migration Impact |
|---|---|---:|---|---|
| `id` | String | Yes | UUID/CUID/ObjectId | New |
| `userId` | String | Yes | Must match session | New |
| `categoryId` | String | Yes | Must reference EXPENSE category only | New |
| `month` | String | Yes | `YYYY-MM` | New |
| `amountPaise` | Int | Yes | `> 0` | New |
| `alertThreshold` | Int | No | Default `80`; range `1–100` | New |

Budget rule: one budget per `userId + categoryId + month`.

---

## 7. Index Strategy

| Query | Index |
|---|---|
| List transactions | `(userId, transactionDate DESC)` |
| Filter by category | `(userId, categoryId, transactionDate DESC)` |
| Filter by type | `(userId, type, transactionDate DESC)` |
| Active transaction list | `(userId, deletedAt, transactionDate DESC)` |
| Monthly budget lookup | `(userId, month, categoryId)` unique |
| Category uniqueness | `(userId, type, name)` unique |
| Migration dedupe | `(sourceModel, sourceId, userId)` unique |

---

## 8. Month Boundary Rule

- Store `transactionDate` in UTC.
- Use the user-local calendar month for filtering, reporting, and budgets.
- For INR-only MVP, default report boundary can be Asia/Kolkata unless user timezone support already exists.
- Convert timezone only at query/report boundary.
- Budget month format: `YYYY-MM`.

---

## 9. Server Action Contract

Every server action must:

- Call `auth()` internally.
- Reject unauthenticated requests.
- Scope every read/write query by `userId`.
- Never trust client-provided `userId`.
- Validate input with Zod before DB write.
- Return a typed success/error result.
- Avoid leaking record existence across users.
- Use idempotent handling for double-submit-sensitive mutations.

---

## 10. Delete Policy

- MVP should use soft delete with `deletedAt`.
- Deleted transactions are excluded from normal lists, dashboard metrics, budgets, and reports.
- Recovery/admin debug can be added later.
- Hard delete only for test/dev data or explicit account purge.

---

## 11. Release Gates

| Gate | Required |
|---|---|
| Auth | Every server action enforces `userId` |
| Money | No persisted Float money in active write path |
| Data | Migration audit passes |
| Dedupe | `(sourceModel, sourceId, userId)` prevents duplicate migration |
| Pagination | Large list does not load all records |
| Reports | Aggregates match raw transactions |
| Delete | Soft-deleted transactions are excluded from totals |
| Mobile | No horizontal scroll |
| A11y | Keyboard, focus, labels, and error states pass |
| Regression | Old `/myexpence` behavior remains usable until replacement passes parity |

---

## 12. Stitch MCP Gate & Prompt

Stitch MCP is allowed only after:

- MVP boundary is accepted.
- Migration strategy is accepted.
- Existing behavior parity list is documented.
- Current-state risks are acknowledged.

### Stitch Prompt

```text
Design a modern INR-only financial tracker web application for a Next.js React app.

It replaces an existing Expense page while preserving verified CRUD behavior.

Required screens:
1. Financial Dashboard
2. Transactions
3. Add/Edit Transaction
4. Budgets
5. Categories
6. Reports
7. Settings

Dashboard:
- Total income in ₹
- Total expenses in ₹
- Net savings in ₹
- Budget usage in ₹
- Monthly cash flow
- Recent transactions
- Category spending

Transactions:
- Unified income/expense ledger
- Search
- Date range filter
- Category filter
- Type filter
- Desktop table
- Mobile card list
- Add/edit/delete actions
- Empty/loading/error states

Budgets:
- Monthly category budgets
- Budget progress bars
- Overspending alerts
- Budget editor

Reports:
- Monthly trend
- Income vs expense
- Category breakdown
- Export action

Design rules:
- INR only
- Use ₹ symbol everywhere
- Use Indian number formatting
- No currency selector
- No exchange-rate UI
- Professional finance SaaS style
- Minimal visual noise
- Accessible contrast
- Responsive desktop/tablet/mobile
- Dark and light mode ready
- Reusable card/table/chart/filter/form components

Generate 3 variants:
1. Minimal MVP
2. Analytics-heavy
3. Mobile-first

Recommend the lowest-regression MVP design first.
```

---

## 13. Regression Test Plan

| Area | Scenario | Expected Result |
|---|---|---|
| Money | Negative, zero, non-numeric, overflow amount | Rejected |
| Money | `₹125.50` | Stored as `12550` paise |
| Money | Existing Float migration | Monthly totals match before/after |
| Auth | Cross-user record id | Blocked without leaking data |
| Filters | URL date/category/type filters | Correct server-filtered results |
| Pagination | 10,000+ records | No full-list load |
| Delete | Soft delete transaction | Excluded from list/reports |
| Category | Deleted/archived category used by old transaction | Historical transaction still displays safely |
| Budget | Duplicate category-month budget | Rejected by unique constraint |
| Budget | Non-expense category budget | Rejected |
| Date | Month boundary around timezone conversion | Correct local-month report |
| Mutation | Double submit | No duplicate/corrupt record |
| UI | Empty/loading/error states | Clear state shown |
| Mobile | Transactions page | Card layout, no horizontal scroll |
| A11y | Form/modal/table | Keyboard, focus, label, and error behavior works |
