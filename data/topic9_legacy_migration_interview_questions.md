# Topic 9 of 16 — Legacy System Migration (COBOL / Java 7 → Modern Java)

**Domain:** System Design
**Complexity:** Advanced
**Profile:** Senior/Lead Backend Engineer — Fintech/Payments

---

## Topic Overview

| Concept | Description |
|---------|-------------|
| Strangler Fig Pattern | Incrementally replace legacy system by routing traffic to new implementation |
| Anti-Corruption Layer | Translation boundary preventing legacy data models from polluting new design |
| Parallel Run | Running old and new systems simultaneously, comparing outputs before cutover |
| Feature Parity Testing | Ensuring new system produces identical results to legacy for all inputs |
| Technical Debt | Accumulated cost of legacy design decisions — quantifying and reducing it |
| COBOL → Java Mapping | Data types, copybooks, fixed-width records, EBCDIC encoding |
| Java 7 → Java 21 | Lambda migration, reactive rewrite, modern API adoption |
| Incremental Migration | Step-by-step replacement minimising risk vs big-bang rewrite |
| Rollback Strategy | Safe reversion to legacy if new system fails post-cutover |
| Data Migration | Schema evolution, dual-write, backfill strategies |
| Risk Assessment | Identifying high-risk migration components and sequencing accordingly |
| Regression Strategy | Test harness design for validating behavioural equivalence |

---

## Basic Questions (13)

**Q1.** What is the Strangler Fig pattern? Why is it preferred over a big-bang rewrite for migrating a legacy financial system?

**Q2.** What is an Anti-Corruption Layer (ACL)? Why is it essential when integrating a new Java service with a legacy COBOL system that has a different data model?

**Q3.** What is the difference between a big-bang migration and an incremental migration? What are the risks of each approach for a card reissue system that processes millions of records daily?

**Q4.** What is technical debt? How do you quantify it, and how do you prioritise which debt to pay down first in a migration project?

**Q5.** What is a parallel run strategy in a migration project? What does it mean for both systems to be "live" simultaneously, and how do you compare their outputs?

**Q6.** What is EBCDIC encoding? Why is it relevant when migrating COBOL-based mainframe systems to Java, and how do you handle encoding conversion?

**Q7.** What is a COBOL copybook? How does it map to a Java class, and what challenges arise when converting fixed-width record layouts to Java POJOs?

**Q8.** What is the difference between rehosting, replatforming, refactoring, and rewriting in the context of legacy modernisation? Give an example of each for a card processing system.

**Q9.** What is feature parity? How do you define and measure it when migrating a COBOL card reissue process to a Java Spring Boot service?

**Q10.** What is a data migration? What is the difference between a schema migration, a data backfill, and a dual-write strategy?

**Q11.** What is a rollback strategy? What conditions would trigger a rollback to the legacy system after a migration cutover, and how do you execute it safely?

**Q12.** What is a regression test harness? How do you build one to validate that a new Java implementation produces the same results as a COBOL system for the same inputs?

**Q13.** What is the Expand-Contract (parallel change) pattern? How does it apply to database schema migration during a service rewrite?

---

## Intermediate Questions (13)

**Q1.** How do you implement the Strangler Fig pattern for a card reissue system — routing a percentage of traffic to the new Java service while the COBOL system handles the rest? What infrastructure changes are needed at the routing layer?

**Q2.** How do you design an Anti-Corruption Layer between a new Spring Boot card reissue service and a legacy mainframe that communicates via fixed-width flat files? What does the translation layer look like in code?

**Q3.** How do you implement a dual-write strategy during migration — writing to both the legacy COBOL data store and the new Java/relational DB simultaneously — ensuring consistency without two-phase commit?

**Q4.** How do you migrate Java 7 anonymous inner classes and verbose callback patterns to Java 8 lambdas and functional interfaces? What are the semantic differences to watch for during automated refactoring?

**Q5.** How do you migrate a Java 7 `for` loop with mutable accumulator to a Java 8 Stream pipeline? What are the edge cases — null elements, side effects inside the loop, early exit — that make the migration non-trivial?

**Q6.** How do you handle COBOL's `COMPUTATIONAL` (COMP) and `PACKED-DECIMAL` (COMP-3) numeric types when mapping to Java? What precision and overflow risks arise when using `int`, `long`, or `BigDecimal`?

**Q7.** How do you implement a comparison harness for a parallel run — capturing the COBOL system's output and the new Java system's output for each transaction, diffing them, and reporting discrepancies without affecting production latency?

**Q8.** How do you manage database schema evolution during an incremental migration — adding new columns for the Java service while keeping the COBOL system operational on the old schema — using Flyway or Liquibase?

**Q9.** How do you migrate a COBOL batch job that processes card reissue records from a sequential flat file to a Spring Batch job reading from a relational database — preserving processing order and idempotency guarantees?

**Q10.** How do you identify and catalogue all integration points of a legacy COBOL system before migration — file interfaces, database tables, MQ queues, CICS transaction codes — to ensure nothing is missed in the new design?

**Q11.** How do you handle date and time migration from COBOL's Julian date format and mainframe timezone conventions to Java's `java.time` API? What are the edge cases around leap years, DST transitions, and century rollover?

**Q12.** How do you prioritise which COBOL modules to migrate first — by business risk, code complexity, test coverage, or frequency of change? What framework guides your sequencing decision?

**Q13.** How do you implement a feature flag system to control which code path — legacy COBOL or new Java — handles each transaction during the migration, with per-issuer and per-card-type granularity?

---

## Advanced Questions (12)

**Q1.** How do you design a zero-downtime cutover from a COBOL card reissue system to a Java Spring Boot system for a 24/7 payment service with no maintenance window? Walk through the traffic shifting strategy, data synchronisation, and rollback trigger conditions.

**Q2.** How do you implement behavioural equivalence testing — a golden master test suite that replays 6 months of production COBOL inputs against the new Java system and asserts byte-level output equivalence — at scale across 50 million records?

**Q3.** How do you handle COBOL's implicit decimal point (`PIC 9(7)V9(2)`) in financial calculations when migrating to Java? Why is `double` unacceptable for monetary amounts, and how do you design a `Money` value type using `BigDecimal` with correct rounding semantics?

**Q4.** How do you migrate a COBOL system that uses implicit global state (WORKING-STORAGE variables shared across paragraphs) to a stateless Java service design? What refactoring patterns make implicit state explicit and testable?

**Q5.** How do you implement a continuous reconciliation process during the parallel run phase — comparing the COBOL system's end-of-day card reissue totals against the Java system's totals, alerting on divergence, and auto-pausing the Java rollout if drift exceeds a threshold?

**Q6.** How do you migrate a legacy Java 7 service that uses `synchronized` blocks and `wait()/notify()` concurrency primitives to Java 21 virtual threads and structured concurrency? What are the semantic differences and the risk of silent behavioural changes?

**Q7.** How do you handle COBOL's PERFORM...UNTIL loops with complex exit conditions when refactoring to Java streams or recursive functions? What are the stack overflow and infinite loop risks in the translated code?

**Q8.** How do you implement an automated COBOL-to-Java translation pipeline — parsing COBOL copybooks to generate Java POJOs, parsing PROCEDURE DIVISION logic to generate Java methods — and what are the hard limits of automation vs manual rewrite?

**Q9.** How do you design a migration safety net — a set of invariants that must hold true across both systems at all times during the migration (e.g., total authorised amount, card reissue count per day) — implemented as automated reconciliation checks running every 5 minutes?

**Q10.** How do you manage the organisational challenges of a multi-year COBOL migration — knowledge transfer from COBOL developers to Java developers, maintaining COBOL expertise for rollback, and managing dual-system operational overhead?

**Q11.** How do you implement a traffic shadowing approach — sending a copy of every live production request to the new Java system without affecting the live response — to validate the new system under real production load before cutover?

**Q12.** How do you handle COBOL's error handling model (condition codes, ON SIZE ERROR, file status codes) when migrating to Java's exception-based model? How do you ensure that COBOL's implicit error suppression behaviours are not silently replicated in the Java code?

---

## Scenario-Based Questions (11)

**Q1.** You are leading the migration of a COBOL card reissue system that processes 2 million cards nightly. The COBOL team has left the organisation and documentation is sparse. How do you approach understanding the system well enough to migrate it safely?

**Q2.** During parallel run, you discover that the new Java card reissue service produces different reissue dates for 0.3% of cards compared to the COBOL system. The COBOL system is considered the source of truth. How do you diagnose the discrepancy and decide whether to fix the Java system or accept the divergence?

**Q3.** Three months into the migration, the COBOL team reports that a business rule was silently changed in the COBOL system two years ago and never documented. The Java implementation replicates the old (incorrect) behaviour. How do you handle this — implement the old behaviour, the new behaviour, or make it configurable?

**Q4.** The business wants to add a new card reissue feature during the migration. Do you implement it in the COBOL system, the new Java system, or both? How do you manage feature development without destabilising the migration timeline?

**Q5.** Your migration cutover is scheduled for Saturday night. At T-2 hours, the reconciliation check shows a 0.01% discrepancy in reissue counts between the COBOL and Java systems. Do you proceed with cutover, delay, or roll back? Walk through your decision framework.

**Q6.** After cutover, a card issuer reports that 500 cardholders received incorrect expiry dates on their reissued cards. The COBOL system had a workaround for a specific card product type that was not captured in the migration requirements. How do you respond — emergency rollback, hotfix, or data correction?

**Q7.** The legacy Java 7 service you are migrating uses a third-party library that is incompatible with Java 21. The library is no longer maintained and the source is unavailable. How do you handle this blocker in the migration path?

**Q8.** During migration, you need to backfill 5 years of historical card reissue records from the COBOL system's flat-file archives into the new relational database. The flat files use a format that changed three times over 5 years. How do you design the backfill pipeline to handle all format versions?

**Q9.** Your Java migration introduces a new data model for card reissue records that is incompatible with the reporting queries used by the finance team's BI tools. How do you manage this breaking change without disrupting reporting during the migration?

**Q10.** A performance test of the new Java card reissue service shows it is 40% slower than the COBOL system for the nightly batch window. The COBOL system completes in 2 hours; the Java system takes 3.5 hours, missing the business deadline. How do you identify and fix the performance gap?

**Q11.** Six months after cutover, a compliance audit reveals that the new Java system does not produce the same audit trail format as the COBOL system, making year-over-year regulatory reports inconsistent. How do you retrofit the correct audit format without reprocessing historical records?

---

## Follow-up / Deep Dive Questions (12)

**Q1.** Walk me through the COBOL-to-Java migration you led for the card reissue system at UST — what was the scope, what were the biggest technical challenges, and how did you de-risk the cutover?

**Q2.** How did you handle the data model differences between the COBOL flat-file record layout and the relational schema you designed for the new Java system? Were there any fields that had no clean mapping?

**Q3.** How did you implement the Spring Boot pipeline to pre-load essential data models from the database — was this data previously embedded in COBOL WORKING-STORAGE, and how did you externalise it to a relational store?

**Q4.** How did you validate that the new Spring Batch jobs produced the same output as the COBOL batch processes? What was your test strategy for the 2 million card nightly batch?

**Q5.** How did you manage the migration alongside active feature development — was the COBOL system feature-frozen during the migration, or did you have to keep both systems in sync with ongoing business changes?

**Q6.** What was the rollback plan if the Java system failed after cutover? How quickly could you revert to COBOL, and what data synchronisation was needed to make the rollback safe?

**Q7.** How did you migrate Java 7 code at Cognizant — was this a full rewrite or a targeted refactoring of specific modules? What was the scope of the lambda and reactive migration?

**Q8.** What tools did you use to assist the Java 7 → Java 8 migration — IntelliJ inspections, SonarQube rules, custom AST-based refactoring, or manual review? What was the biggest source of migration bugs?

**Q9.** How did you handle the migration of `Date`/`Calendar` usage in legacy Java 7 code to `java.time`? Were there any timezone-related bugs introduced during the migration?

**Q10.** How did you measure the technical debt reduction achieved by the migration — lines of COBOL replaced, cyclomatic complexity reduction, test coverage increase, deployment frequency improvement?

**Q11.** What was the most surprising thing you discovered about the legacy COBOL system during the migration — an undocumented business rule, a hidden dependency, or a performance characteristic that the new system had to replicate?

**Q12.** How did you structure the migration project — was it a dedicated migration team, a parallel stream alongside BAU, or did the same engineers handle both? What organisational model worked best, and what would you change in hindsight?

---

*Topic 9 of 16 — Generated from work experience profile: Lead Software Engineer, UST Global / Cognizant / Solverminds*
