# Topic 6 of 16 — Credit Card Authorization Systems

**Domain:** Financial Systems
**Complexity:** Advanced
**Profile:** Senior/Lead Backend Engineer — Fintech/Payments

---

## Topic Overview

| Concept | Description |
|---------|-------------|
| Authorization Lifecycle | Card present/not-present → issuer auth request → approve/decline → settlement |
| ISO 8583 | Financial transaction message format used in card networks |
| Auth vs Settlement | Authorization reserves funds; settlement moves them — they can differ |
| Idempotency | Preventing duplicate charges on network retries |
| Policy Engine | Rule evaluation determining approve/decline/referral per transaction |
| Fraud Signals | Velocity checks, geolocation, BIN analysis, device fingerprinting |
| PCI-DSS | Payment Card Industry Data Security Standard — compliance constraints |
| Distributed Transactions | Saga, Outbox pattern for multi-service auth workflows |
| Audit Trail | Immutable, tamper-evident log of every authorization decision |
| Circuit Breaker | Fault tolerance for downstream card network / fraud service calls |

---

## Basic Questions (13)

**Q1.** What is credit card authorization? What happens between a cardholder tapping their card and the merchant seeing "Approved"?

**Q2.** What is the difference between authorization, clearing, and settlement in a card payment lifecycle?

**Q3.** What are the key parties in a card transaction — cardholder, merchant, acquirer, card network, issuer — and what role does each play in the authorization flow?

**Q4.** What is ISO 8583? What are its key fields — MTI, bitmap, DE2 (PAN), DE4 (amount), DE7 (date/time), DE11 (STAN), DE39 (response code)?

**Q5.** What is a PAN (Primary Account Number)? What is PAN truncation and tokenization, and why are they required for PCI-DSS compliance?

**Q6.** What is CVV/CVC? What is the difference between CVV1 (magnetic stripe), CVV2 (printed), and iCVV (chip)? Why can't CVV2 be stored post-authorization?

**Q7.** What is the difference between an online authorization and an offline authorization? When does offline auth occur, and what are its risks?

**Q8.** What are common authorization response codes? What does response code `00` (approved), `51` (insufficient funds), `05` (do not honour), `14` (invalid card number), and `91` (issuer unavailable) mean?

**Q9.** What is a `STAN` (System Trace Audit Number)? What role does it play in transaction correlation and idempotency?

**Q10.** What is a velocity check in fraud detection? Give three examples of velocity rules relevant to credit card authorization.

**Q11.** What is 3D Secure (3DS)? How does it add an authentication layer on top of authorization for card-not-present transactions?

**Q12.** What is an authorization hold? What happens if the merchant never settles — how long does the hold last and what happens to the reserved funds?

**Q13.** What is the difference between a credit card and a debit card authorization flow at the network level? Where does the PIN verification step occur for debit?

---

## Intermediate Questions (13)

**Q1.** How do you design an authorization request handler in Spring Boot that receives an ISO 8583-like message, applies business rules, and returns a response within a 500ms SLA? What are the key components of this pipeline?

**Q2.** How do you implement idempotency in a card authorization endpoint? A card network may retry the same authorization request if it doesn't receive a response within its timeout. How do you detect and handle duplicate requests?

**Q3.** How do you model authorization policy rules in a Spring Boot backend — hardcoded conditions, a rules engine (Drools), a database-driven policy table, or a combination? What are the trade-offs?

**Q4.** How do you implement velocity checks in an authorization service? What data store (Redis, in-memory, DB) is appropriate for tracking per-card transaction counts within a rolling time window?

**Q5.** How does your authorization service handle the case where the fraud detection service is unavailable? What is the fail-open vs fail-closed strategy, and which is appropriate for a credit card issuer?

**Q6.** How do you implement PAN masking and tokenization in a Spring Boot authorization service? At which layer — controller, service, persistence — should the raw PAN be replaced with a token?

**Q7.** How do you design the audit trail for authorization decisions? What fields must be captured, how do you ensure immutability, and where do you store it — same DB, separate audit DB, or append-only log?

**Q8.** How do you handle partial approvals in a card authorization system? Not all issuers support them — how does your service signal a partial approval to the acquirer, and how do you handle the amount delta?

**Q9.** How do you implement authorization reversal? What triggers a reversal, how does it differ from a refund, and how do you ensure the reversal updates the authorization hold atomically?

**Q10.** How do you implement timeout handling for a downstream card network call in your authorization service? What response do you return to the acquirer when the network times out — decline, referral, or retry?

**Q11.** How does your authorization service handle currency conversion for cross-border transactions? Where does the FX rate come from, and how do you ensure the converted amount is consistent between authorization and settlement?

**Q12.** How do you implement a policy configuration API that allows issuers to update authorization rules (spending limits, blocked merchant categories, geographic restrictions) without restarting the service?

**Q13.** How do you ensure thread safety in an authorization service where policy rules are loaded into a shared in-memory cache and updated concurrently by an admin API?

---

## Advanced Questions (12)

**Q1.** Design a high-availability card authorization system that handles 10,000 TPS with p99 latency under 300ms. Walk through the full architecture — load balancer, stateless auth service, policy cache, fraud service, DB writes, and async audit logging.

**Q2.** How do you implement exactly-once authorization semantics in a distributed system where the auth service, fraud service, and ledger service are separate microservices? Which pattern — Saga, Outbox, or 2PC — is appropriate, and why?

**Q3.** How do you implement the Outbox pattern for authorization event publishing? Walk through the DB transaction, outbox table write, Debezium CDC capture, and Kafka publish sequence — and how you guarantee at-least-once delivery with idempotent consumers.

**Q4.** How do you design a real-time fraud scoring pipeline that runs in parallel with authorization, completes within 200ms, and feeds a score into the authorization decision without blocking the critical path if it's slow?

**Q5.** How do you implement a distributed authorization lock to prevent two simultaneous authorization requests on the same card from both being approved when only one should succeed (e.g., concurrent spend at two terminals exceeding the credit limit)?

**Q6.** How does EMV chip authorization differ from magnetic stripe authorization at the protocol level? What cryptographic verification (ARQC, ARPC, TC) occurs, and what does the issuer host need to validate?

**Q7.** How do you implement authorization routing — deciding whether to route a transaction to Visa, Mastercard, or a domestic network — based on BIN range, card product, merchant category, and least-cost routing rules?

**Q8.** How do you design a policy versioning system for authorization rules? An issuer updates a policy mid-day — how do you ensure in-flight transactions use the policy version that was active at the time of the request?

**Q9.** How do you implement a shadow mode for a new authorization policy — running both the old and new policy engines in parallel, logging divergences, without affecting live decisions — before promoting the new policy to production?

**Q10.** How do you handle split-brain scenarios in a distributed authorization service where two nodes have inconsistent views of a cardholder's available credit due to a network partition?

**Q11.** How do you design the data model for an authorization event store that supports: point-in-time reconstruction of any card's authorization state, audit queries by merchant/amount/date, and regulatory reporting — at scale?

**Q12.** How do you implement a canary deployment strategy for an authorization policy change — rolling out a new decline rule to 1% of transactions, measuring false positive rate, and rolling back automatically if it exceeds a threshold?

---

## Scenario-Based Questions (11)

**Q1.** A cardholder is being declined for a legitimate transaction because a velocity rule is incorrectly counting a previously reversed transaction against their limit. How do you diagnose this in your authorization service, and how do you fix the velocity counter logic?

**Q2.** Your authorization service is approving transactions 50ms before the fraud score arrives because the fraud service is slow. You need to make fraud scoring synchronous on the critical path without exceeding your 300ms SLA. How do you redesign the integration?

**Q3.** A card network is sending duplicate authorization requests because your response is not reaching them within their 3-second timeout. Your service processes the transaction successfully but the network retries, causing double-debit risk. How do you implement end-to-end deduplication?

**Q4.** An issuer wants to block all transactions from a specific merchant category code (MCC) for cardholders under 18. This rule needs to be configurable per issuer without code changes. Design the policy configuration model and the runtime evaluation logic.

**Q5.** Your authorization service needs to enforce a real-time spending limit of $5,000/day per card. The limit must be enforced accurately even when 50 concurrent authorization requests arrive for the same card within 1 second. How do you implement atomic limit enforcement?

**Q6.** A PCI audit finds that raw PAN values are appearing in application logs due to a `toString()` call on a transaction DTO. How do you systematically find and eliminate all PAN leakage points across a large Spring Boot codebase?

**Q7.** Your authorization service receives a request for a card that was reported stolen 10 minutes ago. The card status update is propagated via an async event and hasn't reached your in-memory cache yet. How do you handle this race condition without making every auth a DB read?

**Q8.** An authorization response with code `91` (issuer unavailable) is being returned to the acquirer because your downstream ledger service has a 5-second GC pause. The acquirer's SLA requires a response in 2 seconds. How do you prevent GC pauses from breaching the SLA?

**Q9.** You need to migrate the authorization policy rules from a hardcoded `if-else` tree (500 lines) to a database-driven rules engine, with zero downtime and the ability to roll back instantly if the new engine produces different decisions. Design the migration strategy.

**Q10.** Your authorization audit log is stored in the same database as the transaction data. A storage incident causes both the transaction and audit records to be lost for a 2-hour window. How do you redesign the audit architecture to be resilient to primary DB failures?

**Q11.** A regulatory requirement mandates that all declined authorization decisions include a machine-readable decline reason code that maps to a human-readable explanation for the cardholder. How do you implement a structured decline reason taxonomy in your authorization service?

---

## Follow-up / Deep Dive Questions (12)

**Q1.** Walk me through the end-to-end authorization flow you built at UST — what were the input message fields, what business rules did you apply, what did you write to the database, and what did the response look like?

**Q2.** How did you model the policy validation rules in your Spring Boot backend — were they hardcoded, database-driven, or externalized? How did you handle rule updates without service restarts?

**Q3.** How did you ensure the authorization service met its latency SLA in production? What was the p99 latency, and what were the main sources of latency you had to optimize?

**Q4.** How did you implement the audit trail for authorization decisions in your system? Was it synchronous or asynchronous, and how did you balance auditability with performance?

**Q5.** How did you handle the case where multiple downstream services (fraud check, policy validation, account status) needed to be called per authorization request? Were they called sequentially or in parallel?

**Q6.** What was the most complex authorization business rule you implemented? Walk through the logic, the edge cases it had to handle, and how you tested it.

**Q7.** How did you handle authorization failures in your Spring Boot service — did the transaction roll back entirely, or was there partial state written? How did you ensure consistency between the auth decision and the audit record?

**Q8.** How did you implement the React.js policy configuration dashboard — what authorization rules could issuers configure through it, and how were those configurations propagated to the backend authorization engine in real time?

**Q9.** How did you handle PCI-DSS compliance requirements in your authorization codebase — data masking, secure logging, key management, and access controls?

**Q10.** How did your authorization service handle high-availability — what happened if one instance crashed mid-authorization? Were requests stateless enough to be retried on another instance?

**Q11.** How did you test authorization edge cases — insufficient funds, expired cards, blocked merchants, concurrent spend — and what was your test strategy (unit, integration, end-to-end)?

**Q12.** What observability did you build into the authorization service — what metrics, logs, and traces did you instrument, and how did you use them to diagnose production incidents?

---

*Topic 6 of 16 — Generated from work experience profile: Lead Software Engineer, UST Global / Cognizant / Solverminds*
