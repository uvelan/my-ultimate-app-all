# Topic 12 of 16 — SQL & Query Optimization

**Domain:** Data Layer
**Complexity:** Intermediate–Advanced
**Profile:** Senior/Lead Backend Engineer — Fintech/Payments

---

## Topic Overview

| Concept | Description |
|---------|-------------|
| Query Execution Plan | EXPLAIN / EXPLAIN ANALYZE — understanding how the DB engine executes a query |
| Indexing | B-tree, Hash, Composite, Partial, Covering indexes — design and trade-offs |
| Joins | INNER, LEFT, RIGHT, FULL OUTER, CROSS, SELF — performance implications |
| Aggregations | GROUP BY, HAVING, window functions — analytical query patterns |
| Transactions | ACID properties, isolation levels, locking, deadlock prevention |
| Normalization | 1NF–3NF — reducing redundancy vs denormalization for read performance |
| Query Tuning | Rewriting queries, avoiding full table scans, reducing round trips |
| Pagination | OFFSET vs keyset pagination — correctness and performance at scale |
| Schema Design | Data types, constraints, partitioning, archival strategies |
| Stored Procedures | Encapsulating logic in DB vs application layer — trade-offs |
| Connection Management | Pool sizing, long-running queries, lock contention |
| Partitioning | Range, list, hash partitioning — managing large financial data sets |

---

## Basic Questions (13)

**Q1.** What are the ACID properties of a database transaction? Give a concrete example of each in the context of a credit card authorization system.

**Q2.** What is the difference between `WHERE` and `HAVING`? When must you use `HAVING`, and can it always be replaced by a subquery with `WHERE`?

**Q3.** What is a database index? What is a B-tree index, and why is it the default index type in most relational databases?

**Q4.** What is the difference between `INNER JOIN`, `LEFT JOIN`, `RIGHT JOIN`, and `FULL OUTER JOIN`? Give a financial domain example of when each is appropriate.

**Q5.** What is a primary key vs a unique key vs a composite key? When would you use a composite primary key in a card transaction table?

**Q6.** What is database normalization? What is the difference between 1NF, 2NF, and 3NF? Give an example of a denormalized card transaction table and how you would normalize it.

**Q7.** What is the difference between `DELETE`, `TRUNCATE`, and `DROP`? Which is transactional, and which resets auto-increment sequences?

**Q8.** What is a subquery vs a `JOIN`? When is a correlated subquery significantly worse than a join in terms of performance?

**Q9.** What is a `NULL` value in SQL? How does `NULL` behave in comparisons, aggregations, and joins — and what are the common bugs caused by incorrect `NULL` handling?

**Q10.** What is the difference between `UNION` and `UNION ALL`? When would you use `UNION ALL` in a card transaction query for performance?

**Q11.** What is an execution plan (`EXPLAIN`)? What are the key fields to look for — scan type, rows estimate, cost — and what does a sequential scan vs an index scan indicate?

**Q12.** What is a foreign key constraint? How does it affect `INSERT`, `UPDATE`, and `DELETE` performance on large card transaction tables?

**Q13.** What is a database view? What is the difference between a regular view and a materialized view, and when would you use each for card authorization reporting?

---

## Intermediate Questions (13)

**Q1.** How do you design a composite index for a card transaction query that filters by `issuer_id`, `transaction_date`, and `status`? What is the column order rule for composite indexes, and how does it affect which queries benefit from the index?

**Q2.** How do you identify and fix an N+1 query problem in a Spring Boot application that loads card authorization records and then queries each record's associated policy rule separately?

**Q3.** How do you implement keyset pagination (seek method) for a card transaction table with 500 million rows? Why is `OFFSET` pagination dangerous at large offsets, and how does keyset pagination solve it?

**Q4.** How do you use window functions (`ROW_NUMBER`, `RANK`, `LAG`, `LEAD`, `SUM OVER`) in a query that computes the running daily spend total per card and flags the transaction that first exceeds the credit limit?

**Q5.** How do you optimize a slow `GROUP BY` query on a 100-million-row card transaction table — adding indexes, rewriting with a subquery, using a covering index, or pre-aggregating with a materialized view?

**Q6.** How do you implement optimistic locking at the SQL level for a card policy configuration table that is updated concurrently by multiple admin users? What does the `UPDATE ... WHERE version = ?` pattern look like, and how do you handle the lost-update case?

**Q7.** How do you diagnose and resolve a deadlock between two transactions that both update the card account balance and the transaction ledger table in opposite orders? What locking order convention prevents this?

**Q8.** How does the `EXPLAIN ANALYZE` output differ from `EXPLAIN`? What does `actual time`, `rows`, `loops`, and `Buffers: hit/read` tell you about a slow card transaction query?

**Q9.** How do you implement table partitioning for a card transaction table that grows by 50 million rows per month — what partitioning strategy (range by date, hash by card number) do you choose, and what are the query and maintenance implications?

**Q10.** How do you implement a query that finds duplicate authorization requests — same `card_number`, `amount`, `merchant_id`, and `timestamp` within a 5-second window — using `GROUP BY`, `HAVING`, or window functions?

**Q11.** How do you design the schema for an immutable audit log table for authorization decisions — ensuring fast append writes, efficient time-range queries, and prevention of any UPDATE or DELETE operations?

**Q12.** How do you implement a soft delete pattern in a card account table — marking records as deleted without removing them — while ensuring that live queries don't return deleted records without filtering on every query?

**Q13.** How do you use CTEs (Common Table Expressions) to simplify a complex card transaction query that requires multiple aggregation steps? When does a CTE improve readability without hurting performance, and when does it create an optimisation fence?

---

## Advanced Questions (12)

**Q1.** How do you design the indexing strategy for a card authorization table (`card_id`, `merchant_id`, `amount`, `status`, `created_at`) that must support: (1) point lookups by `card_id` + `status`, (2) range scans by `created_at`, (3) aggregations by `merchant_id` + `status`, and (4) idempotency checks by `request_id`? How do you balance index count vs write amplification?

**Q2.** How does the MVCC (Multi-Version Concurrency Control) mechanism work in PostgreSQL? How does it allow concurrent reads and writes without locking, and what is the `VACUUM` process's role in reclaiming dead tuple space in a high-write card transaction table?

**Q3.** How do you implement a real-time velocity check query — counting the number of authorizations per card in the last 60 seconds — that executes in under 5ms on a table with 1 billion rows? What index, partitioning, and query design make this feasible?

**Q4.** How do you implement read/write splitting in a Spring Boot application — routing authorization writes to the primary DB and policy/reporting reads to a read replica — ensuring that reads after writes don't return stale data for time-sensitive operations?

**Q5.** How does the SQL query optimizer decide between a nested loop join, a hash join, and a merge join? Under what data distribution and index conditions does each join algorithm win for a query joining card accounts to authorization records?

**Q6.** How do you implement a slowly changing dimension (SCD Type 2) pattern for a card policy table — preserving historical policy versions with `valid_from` and `valid_to` timestamps — and write a query that retrieves the policy that was active at the time of a given authorization?

**Q7.** How do you implement a hot row update pattern for a card's daily spend accumulator — where hundreds of concurrent transactions are incrementing the same row — avoiding lock contention using counter sharding or deferred aggregation?

**Q8.** How do you implement online schema migration for a 500-million-row card transaction table — adding a new `fraud_score` column with a default value — without locking the table and without downtime? Compare `pt-online-schema-change`, `gh-ost`, and native `ALTER TABLE ... ALGORITHM=INSTANT`.

**Q9.** How do you implement a distributed SQL query across sharded card transaction databases — where each shard holds transactions for a range of card numbers — aggregating results at the application layer using a scatter-gather pattern?

**Q10.** How do you diagnose and fix a query regression after a statistics update — a query that was using an efficient index scan is now doing a sequential scan after `ANALYZE` ran and updated row count estimates? What forces the optimizer back to the correct plan?

**Q11.** How do you implement full-text search on card transaction descriptions in PostgreSQL — using `tsvector`, `tsquery`, and GIN indexes — and how does this perform vs a LIKE `%term%` query on a 100-million-row table?

**Q12.** How do you implement a time-series data archival strategy for a card transaction table — moving records older than 12 months to a cold storage table or an object store (S3 + Parquet) — while keeping recent data in the hot table without disrupting live queries?

---

## Scenario-Based Questions (11)

**Q1.** A card authorization query that joins four tables and applies three filters is taking 8 seconds in production. `EXPLAIN ANALYZE` shows a sequential scan on the 200-million-row transaction table. Walk through your step-by-step optimization approach — index design, query rewrite, and statistics update.

**Q2.** Your card transaction table has grown to 800 million rows, and nightly reports that previously ran in 10 minutes now take 4 hours. The queries aggregate by date range and merchant category. How do you redesign the table and query strategy to restore report performance?

**Q3.** Two concurrent transactions are updating the same card's available balance — one for a new authorization and one for a settlement credit. You observe occasional incorrect balance values in production. Diagnose the race condition and fix it at the SQL isolation level without introducing deadlocks.

**Q4.** A developer writes a query using `SELECT *` with a `LIKE '%VISA%'` filter on the card network column of a 100-million-row transaction table. It runs in development (10,000 rows) in 20ms but takes 45 seconds in production. Explain the root causes and rewrite the query.

**Q5.** Your authorization service's idempotency check — `SELECT COUNT(*) FROM authorizations WHERE request_id = ?` — is taking 200ms under load. The `request_id` column has no index. How do you add the index safely on a live, high-write table, and what index type is optimal?

**Q6.** A financial report query that computes monthly revenue per card product using `GROUP BY product_type, MONTH(created_at)` is causing full table scans and locking up the reporting database during business hours. How do you redesign this — materialized views, pre-aggregation tables, or a separate OLAP store?

**Q7.** Your card reissue batch job performs 2 million individual `UPDATE` statements — one per card record — in a loop. The batch takes 6 hours and causes DB CPU to spike to 100%. Rewrite this as a set-based `UPDATE` and explain the performance difference.

**Q8.** A soft-delete bug in the card account service means that `deleted_at IS NULL` is missing from 30% of queries, causing deleted accounts to appear in authorization lookups. How do you systematically find all affected queries across a large Spring Boot codebase and enforce the filter at the persistence layer?

**Q9.** Your card transaction table uses `OFFSET 500000 LIMIT 100` for pagination in the compliance reporting API. The query takes 12 seconds at high offsets. Migrate this to keyset pagination — show the before and after query, the required index, and how you handle the API contract change.

**Q10.** A database deadlock is occurring every 30 minutes between the authorization service (which updates `card_accounts` then `transaction_ledger`) and the settlement service (which updates `transaction_ledger` then `card_accounts`). Fix the deadlock without changing the transaction isolation level.

**Q11.** The card transaction table is partitioned by month. A query with a date range spanning 3 months is not using partition pruning, causing all 36 monthly partitions to be scanned. Diagnose why pruning is failing (implicit type cast, function on column, parameter type mismatch) and fix it.

---

## Follow-up / Deep Dive Questions (12)

**Q1.** Walk me through the most complex SQL query you wrote in your card authorization or reissue project — what was the business requirement, how did you structure the query, and how did you optimise it?

**Q2.** How did you use SQL for validation and quantitative analysis at Solverminds — what kinds of queries did you write for the Vessel Scorecard or Automated Prediction tool, and what were the data volumes?

**Q3.** How did you design the database schema for the card reissue workflow at UST — what were the key tables, relationships, and constraints, and how did you handle schema evolution over the project lifetime?

**Q4.** How did you identify and fix slow queries in production — what tooling (slow query log, `EXPLAIN ANALYZE`, APM) did you use, and what was the most impactful optimization you made?

**Q5.** How did you manage database transactions across the card reissue workflow — what was the transaction boundary, what isolation level did you use, and did you encounter any locking issues?

**Q6.** How did you implement the idempotency check for card reissue requests at the database level — what column, index, and constraint enforced uniqueness, and how did you handle the race condition when two requests arrived simultaneously?

**Q7.** How does your Spring Boot application handle database connection pool exhaustion under high load — what happens to requests that can't acquire a connection, and how did you configure HikariCP timeouts and pool size?

**Q8.** How did you handle database schema migration across environments (dev, staging, production) in your Spring Boot projects — Flyway, Liquibase, or manual scripts? What was your rollback strategy for a failed migration?

**Q9.** How do you write a query that efficiently finds the last authorization attempt per card — using `MAX(created_at)` with a subquery vs a window function vs a lateral join? Which is most efficient for a 500-million-row table, and why?

**Q10.** How do you implement a covering index? Give a concrete example from your card authorization system where adding `INCLUDE` columns to an index eliminated a table heap fetch and significantly improved query performance?

**Q11.** How do you handle time zone storage in a card transaction database — do you store timestamps in UTC, local time, or with explicit timezone offset? What bugs arise from inconsistent timezone handling in a multi-region card payment system?

**Q12.** How do you implement database-level constraints to enforce business rules — CHECK constraints for valid authorization amounts, UNIQUE constraints for idempotency keys, NOT NULL for mandatory fields — and how do you balance DB-level enforcement with application-level validation?

---

*Topic 12 of 16 — Generated from work experience profile: Lead Software Engineer, UST Global / Cognizant / Solverminds*
