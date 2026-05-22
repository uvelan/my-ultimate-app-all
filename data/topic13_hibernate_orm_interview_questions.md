# Topic 13 of 16 — Hibernate / ORM Deep Dive

**Domain:** Data Layer
**Complexity:** Intermediate–Advanced
**Profile:** Senior/Lead Backend Engineer — Fintech/Payments

---

## Topic Overview

| Concept | Description |
|---------|-------------|
| JPA vs Hibernate | JPA is the spec; Hibernate is the most widely used implementation |
| Entity Lifecycle | Transient → Persistent → Detached → Removed — state transitions |
| Session / EntityManager | Unit of work — first-level cache, identity map, dirty checking |
| Associations | @OneToOne, @OneToMany, @ManyToOne, @ManyToMany — fetch and cascade |
| Fetch Strategies | EAGER vs LAZY loading — N+1 problem and solutions |
| Caching | L1 (Session), L2 (EhCache/Redis), Query cache |
| HQL / JPQL / Criteria API | Object-oriented query languages — typed vs string-based |
| @Transactional | Spring-managed transactions — propagation, isolation, rollback rules |
| Optimistic Locking | @Version — preventing lost updates in concurrent environments |
| Pessimistic Locking | LockModeType — SELECT FOR UPDATE semantics |
| Schema Generation | hbm2ddl, Flyway/Liquibase integration |
| Inheritance Mapping | SINGLE_TABLE, JOINED, TABLE_PER_CLASS strategies |
| Auditing | @CreatedDate, @LastModifiedDate, Hibernate Envers |
| Batch Operations | Batch insert/update — JDBC batching, StatelessSession |

---

## Basic Questions (13)

**Q1.** What is the difference between JPA and Hibernate? Can you use JPA without Hibernate, and can you use Hibernate without JPA?

**Q2.** What are the four states of a JPA entity — transient, persistent, detached, removed — and what triggers each state transition?

**Q3.** What is the difference between `Session` (Hibernate) and `EntityManager` (JPA)? Are they interchangeable in a Spring Boot application?

**Q4.** What is the first-level cache in Hibernate? What is its scope, and when is it cleared?

**Q5.** What is the difference between `FetchType.EAGER` and `FetchType.LAZY`? What is the default fetch type for `@OneToMany` and `@ManyToOne`?

**Q6.** What is the N+1 query problem in Hibernate? Give a concrete example involving card accounts and their authorization records.

**Q7.** What is `CascadeType` in JPA? What is the difference between `PERSIST`, `MERGE`, `REMOVE`, `REFRESH`, and `ALL`? When is `CascadeType.REMOVE` dangerous?

**Q8.** What is `@Version` in JPA? How does it implement optimistic locking, and what exception is thrown when a conflict is detected?

**Q9.** What is dirty checking in Hibernate? How does Hibernate know which entity fields have changed without you explicitly calling an update method?

**Q10.** What is the difference between `@OneToMany` with `mappedBy` vs without it? What does the owning side of a relationship mean?

**Q11.** What is JPQL? How does it differ from SQL — what does it operate on (objects vs tables), and what SQL features does it not support?

**Q12.** What is `@Transactional` in Spring? What is the default propagation level, and what happens if a `@Transactional` method is called from within the same class?

**Q13.** What is the difference between `save()`, `persist()`, `merge()`, `saveOrUpdate()`, and `update()` in Hibernate? Which are JPA-standard?

---

## Intermediate Questions (13)

**Q1.** How do you solve the N+1 query problem for a `@OneToMany` relationship between card accounts and authorization records? Compare `JOIN FETCH` in JPQL, `@EntityGraph`, `@BatchSize`, and `@Fetch(FetchMode.SUBSELECT)` — trade-offs for each.

**Q2.** How does Hibernate's second-level cache (L2) work? What is the difference between entity cache, collection cache, and query cache? How do you configure EhCache or Redis as an L2 provider in Spring Boot?

**Q3.** How do you implement optimistic locking with `@Version` in a card policy configuration entity? Walk through the full scenario: two admin users load the same policy, one updates it, the second tries to update — what happens at the JPA and SQL level?

**Q4.** How do you implement pessimistic locking in JPA using `LockModeType.PESSIMISTIC_WRITE`? When is pessimistic locking preferable to optimistic locking in a card authorization context, and what SQL does it generate?

**Q5.** How do you implement batch inserts in Hibernate for a card reissue job that writes 1 million records? What Hibernate properties must be set (`hibernate.jdbc.batch_size`, `order_inserts`, `order_updates`), and why must you flush and clear the session periodically?

**Q6.** How do you implement inheritance mapping in JPA for a payment event hierarchy — `AuthorizationEvent`, `ReversalEvent`, `SettlementEvent` — using `SINGLE_TABLE`, `JOINED`, and `TABLE_PER_CLASS`? What are the query and storage trade-offs for a high-volume financial event table?

**Q7.** How do you use the JPA Criteria API to build a dynamic card transaction query where filter conditions (date range, status, merchant ID) are applied only when the corresponding parameter is provided? How does this compare to a JPQL string-building approach?

**Q8.** How do you implement Spring Data JPA's `@Query` with native SQL vs JPQL? When must you use native SQL, and what are the risks of native queries in terms of portability and result mapping?

**Q9.** How does `@Transactional(propagation = REQUIRES_NEW)` differ from `NESTED` and `REQUIRED`? Give a scenario in the card reissue workflow where `REQUIRES_NEW` is necessary for writing an audit record even if the outer transaction rolls back.

**Q10.** How do you implement Hibernate Envers for auditing card policy configuration changes? What tables does Envers create, what is a revision, and how do you query the history of a specific policy entity?

**Q11.** How do you handle the `LazyInitializationException` in a Spring Boot REST API — when a lazily loaded association is accessed outside the Hibernate session? Compare `@Transactional` on the controller, `OpenSessionInView`, `DTO projection`, and `JOIN FETCH` as solutions.

**Q12.** How do you implement a `@NaturalId` in Hibernate for a card account entity where the business key (card number + issuer ID) differs from the surrogate primary key? How does Hibernate use the natural ID cache?

**Q13.** How do you implement soft delete at the Hibernate level using `@SQLDelete` and `@Where` annotations — so that deleted card records are filtered out of all queries automatically without modifying every repository method?

---

## Advanced Questions (12)

**Q1.** How does Hibernate's dirty checking mechanism work internally — what is the `EntityEntry`, how does the snapshot comparison work, and what is the performance implication of having 10,000 managed entities in a single session for a batch processing scenario?

**Q2.** How do you implement a `StatelessSession` in Hibernate for a high-throughput card reissue batch job? What features does it lack compared to a regular `Session` (no L1 cache, no dirty checking, no cascades), and when is the trade-off worth it?

**Q3.** How does Hibernate generate SQL for a `@ManyToMany` relationship with an intermediate join table that has additional columns (e.g., a card-to-issuer relationship with `effective_date` and `status`)? Why does `@ManyToMany` fall short, and how do you model this as two `@OneToMany` relationships through an explicit join entity?

**Q4.** How do you implement a multi-tenant data architecture in Hibernate — where each card issuer's data is isolated in a separate schema — using Hibernate's `MultiTenancyStrategy` with a custom `CurrentTenantIdentifierResolver` and `ConnectionProvider`?

**Q5.** How does Hibernate's query plan cache work? What is the `hibernate.query.plan_cache_max_size` property, and when does a large number of distinct JPQL queries with inline parameters (instead of bind parameters) cause cache eviction and performance degradation?

**Q6.** How do you implement a read-only entity in Hibernate — marked with `@Immutable` — for a card BIN reference table that is loaded once and never updated? What optimizations does Hibernate apply for immutable entities?

**Q7.** How do you implement database-level generated values in JPA — `@GeneratedValue` strategies (`IDENTITY`, `SEQUENCE`, `TABLE`, `AUTO`) — and what are the batch insert implications of each strategy? Why does `IDENTITY` break JDBC batch inserts?

**Q8.** How do you tune Hibernate for a high-concurrency Spring Boot authorization service — which L2 cache regions to enable, what `connection.provider_disables_autocommit` does, how to minimise session open time, and when to use `EntityManager` vs Spring Data repositories?

**Q9.** How do you implement a custom `UserType` in Hibernate for a `Money` value object (`amount` + `currency`) that maps to two database columns — `amount_value DECIMAL` and `amount_currency CHAR(3)` — in a card transaction entity?

**Q10.** How does Hibernate handle the `equals()` and `hashCode()` contract for entities in a `Set` or as `HashMap` keys — across the transient, persistent, and detached states? What is the recommended implementation strategy using business keys vs surrogate keys?

**Q11.** How do you implement Hibernate's `@Filter` for multi-tenant data isolation — dynamically enabling a filter that restricts all queries to the current issuer's data — and what is the risk if the filter is not enabled for a request?

**Q12.** How do you implement a composite `@Embeddable` type in JPA for a card address value object — embedding `street`, `city`, `country`, `postcode` directly into the card account table — and how does this differ from a separate `@Entity` with a `@OneToOne` relationship?

---

## Scenario-Based Questions (11)

**Q1.** A production incident shows that a Spring Boot authorization service is opening thousands of Hibernate sessions without closing them, exhausting the DB connection pool within minutes of startup. How do you diagnose the session leak and fix it — identifying which code paths open sessions without a `@Transactional` boundary?

**Q2.** A card reissue batch job using Hibernate processes 500,000 records but runs out of heap memory after 200,000 records. `jmap` shows the Hibernate session contains 200,000 managed entity objects. How do you fix this without switching to raw JDBC?

**Q3.** After upgrading from Hibernate 5 to Hibernate 6 (Spring Boot 3.x), several queries start failing with `QueryException` because HQL syntax has changed. Walk through the key HQL breaking changes in Hibernate 6 and how you systematically migrate affected queries.

**Q4.** Two concurrent card authorization requests for the same card are both approved, exceeding the credit limit by the amount of one transaction. Optimistic locking is not preventing this because the credit limit check and balance update are in separate transactions. How do you redesign the locking strategy?

**Q5.** A JPQL query that was performing well starts doing full table scans after a schema change added a new indexed column. `EXPLAIN ANALYZE` shows Hibernate is generating a different SQL than expected — with an unnecessary type cast that bypasses the index. How do you diagnose and fix the query generation issue?

**Q6.** A Spring Boot REST endpoint that returns a paginated list of card authorization records is causing `LazyInitializationException` for the associated merchant entity. The fix applied by a junior engineer — adding `FetchType.EAGER` on the association — causes a CartesianProduct for large result sets. Propose a correct fix.

**Q7.** Your card reissue service uses `CascadeType.ALL` on a `@OneToMany` from `CardAccount` to `AuthorizationRecord`. A developer accidentally deletes a `CardAccount` entity, which cascades and deletes 50,000 associated authorization records — violating audit retention requirements. How do you prevent this class of cascade delete in the future?

**Q8.** The Hibernate L2 cache for card policy entities is serving stale data — a policy updated via the admin API is not reflected in authorization decisions for up to 5 minutes. How do you implement targeted cache eviction so that a policy update immediately invalidates the relevant L2 cache entry across all service instances?

**Q9.** A batch job that inserts 1 million card records via Hibernate is generating 1 million individual `INSERT` statements despite `hibernate.jdbc.batch_size=100` being set. Diagnose why batching is not working — `IDENTITY` generator, missing `order_inserts`, or session flush interval — and fix it.

**Q10.** A card transaction query using the Criteria API is generating incorrect SQL — missing a `JOIN` condition — because a developer used `Root.join()` instead of `Root.fetch()` for an association that needs to be both joined and initialised. Explain the difference and fix the query.

**Q11.** Your Hibernate application is generating a different number of SQL queries per request in production vs development, causing intermittent performance issues. You suspect the L2 cache is hitting in dev but missing in production due to a serialization issue with the cached entity. How do you diagnose and fix the L2 cache miss?

---

## Follow-up / Deep Dive Questions (12)

**Q1.** Walk me through how you used Hibernate in your card reissue or authorization project — what entities did you model, what associations did you define, and what fetch strategy did you use for performance?

**Q2.** How did you handle the N+1 problem in your Spring Boot projects — did you use `JOIN FETCH`, `@EntityGraph`, or DTO projections? Walk through a specific case where you identified and fixed an N+1 issue.

**Q3.** How did you implement `@Transactional` boundaries in your card authorization service — what was the transaction scope, what propagation levels did you use, and did you encounter any self-invocation or rollback issues?

**Q4.** How did you manage Hibernate schema migrations across environments — did you use `hbm2ddl.auto`, Flyway, or Liquibase? What was your strategy for zero-downtime schema changes on large tables?

**Q5.** How did you use the Spring Data JPA repository layer in your project — did you use `JpaRepository` methods, custom `@Query` annotations, or the Criteria API for complex queries? What drove those choices?

**Q6.** How did you handle Hibernate performance tuning in production — did you enable SQL logging, use a slow query log, or instrument with Micrometer to track query counts per request? What was the most impactful optimisation you made?

**Q7.** How did you implement auditing for card policy and authorization entities — `@CreatedDate`, `@LastModifiedDate`, `@CreatedBy` via Spring Data Auditing, or Hibernate Envers for full history tracking?

**Q8.** How do you implement a `Specification` in Spring Data JPA for dynamic card transaction filtering — combining multiple optional predicates using `Specification.where().and()`? How does this compare to QueryDSL for complex dynamic queries?

**Q9.** How did you handle the `equals()` and `hashCode()` implementation for your JPA entities — did you use surrogate key, business key, or UUID-based equality? What problems did using the default `Object.equals()` cause in sets and Hibernate collections?

**Q10.** How does `@Transactional(readOnly = true)` affect Hibernate behaviour — does it disable dirty checking, affect the flush mode, or set a hint on the JDBC connection? When did you use it in your authorization or reissue service?

**Q11.** How did you implement pagination in your Spring Data JPA repositories — `Pageable` with `findAll(Pageable)` vs a custom JPQL query with `LIMIT`/`OFFSET`? Did you encounter the count query performance problem for large datasets?

**Q12.** If you were to replace Hibernate with jOOQ or JDBC Template for a new high-throughput card transaction service, what would drive that decision? What Hibernate features would you miss, and what would you gain?

---

*Topic 13 of 16 — Generated from work experience profile: Lead Software Engineer, UST Global / Cognizant / Solverminds*
