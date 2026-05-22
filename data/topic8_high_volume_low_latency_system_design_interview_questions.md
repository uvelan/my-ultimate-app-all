# Topic 8 of 16 — High-Volume & Low Latency System Design

**Domain:** System Design
**Complexity:** Advanced
**Profile:** Senior/Lead Backend Engineer — Fintech/Payments

---

## Topic Overview

| Concept | Description |
|---------|-------------|
| Throughput vs Latency | Competing forces — optimizing one often degrades the other |
| Thread Model | Thread-per-request vs event-loop vs virtual threads — impact on concurrency |
| Connection Pooling | HikariCP, HTTP connection pools — sizing for high-concurrency workloads |
| Caching Strategies | L1 (in-process), L2 (Redis/Memcached) — cache-aside, write-through, TTL |
| Async Processing | Decoupling slow operations from the critical path using queues and async handlers |
| Load Balancing | Round-robin, least-connections, consistent hashing for stateful services |
| Circuit Breaker | Resilience4j — preventing cascade failures under load |
| Backpressure | Controlled flow between producer and consumer to prevent overload |
| Observability | Latency percentiles (p50/p95/p99), throughput metrics, tracing, alerting |
| Database Optimization | Index design, read replicas, connection pool tuning, query optimization |
| Horizontal Scaling | Stateless service design, shared-nothing architecture, sharding |
| SLA / SLO / SLI | Defining, measuring, and enforcing service level objectives |

---

## Basic Questions (13)

**Q1.** What is the difference between throughput and latency? Why do they often trade off against each other in high-volume systems?

**Q2.** What is p99 latency? Why is it more meaningful than average latency for a financial transaction system?

**Q3.** What is a connection pool? Why is creating a new DB connection per request expensive, and what does HikariCP do to address this?

**Q4.** What is the difference between horizontal scaling and vertical scaling? Which is preferred for a stateless authorization service, and why?

**Q5.** What is caching? What is the difference between cache-aside, write-through, and write-behind caching strategies?

**Q6.** What is a circuit breaker? What problem does it solve in a microservices architecture under high load?

**Q7.** What is an SLA, SLO, and SLI? Give a concrete example of each for a card authorization service.

**Q8.** What is backpressure? Why is it important in a high-volume event processing system?

**Q9.** What is the difference between synchronous and asynchronous processing? When do you offload work to an async queue in a payment system?

**Q10.** What is a load balancer? What is the difference between L4 (transport layer) and L7 (application layer) load balancing?

**Q11.** What is the difference between a read replica and a primary database node? When do you route authorization reads to a replica vs the primary?

**Q12.** What is a hot spot in a distributed system? Give two examples specific to a high-volume card authorization system.

**Q13.** What is tail latency amplification in a microservices call chain? How does calling three services sequentially vs in parallel affect p99 end-to-end latency?

---

## Intermediate Questions (13)

**Q1.** How do you size a HikariCP connection pool for a Spring Boot authorization service handling 5,000 TPS? What formula guides pool sizing, and what happens when the pool is exhausted — does the request fail or queue?

**Q2.** How do you implement a multi-level cache for card policy data — L1 in-process Caffeine cache with a short TTL, backed by L2 Redis with a longer TTL, backed by the database? Walk through the read and invalidation paths.

**Q3.** How do you design a stateless authorization service that can scale horizontally to 20 instances without any shared in-process state? What data must be externalized, and what consistency guarantees are acceptable?

**Q4.** How do you implement async audit logging in a high-volume authorization service — decoupling the audit write from the critical path using an in-memory queue, with a background writer flushing to the database in batches?

**Q5.** How do you implement bulkhead isolation in a Spring Boot service that calls both a fraud service and a policy service? How does Resilience4j's `Bulkhead` prevent a slow fraud service from exhausting the thread pool and starving policy service calls?

**Q6.** How do you tune the Tomcat thread pool (or virtual thread executor) for a Spring Boot authorization service to handle 10,000 concurrent requests without OOM or request queuing?

**Q7.** How do you implement request coalescing — batching multiple individual authorization lookups into a single DB query when they arrive within a short time window — to reduce DB round trips under high load?

**Q8.** How do you design a read-heavy card policy lookup service that serves 50,000 reads/second with sub-10ms p99 latency? What caching, data structure, and deployment topology do you use?

**Q9.** How do you implement graceful degradation in an authorization service when a non-critical dependency (e.g., real-time fraud score) is slow or unavailable — returning a default decision vs failing the transaction?

**Q10.** How do you implement distributed rate limiting for a card authorization API — enforcing a per-issuer request rate limit of 1,000 TPS across 10 service instances using a centralized Redis counter?

**Q11.** How do you detect and eliminate N+1 query problems in a Spring Boot service that loads card authorization context (card details, account status, policy rules) for each transaction?

**Q12.** How do you implement an in-memory BIN table lookup — given a 16-digit card number, return the issuer, card network, and product type within 1ms — for 10 million BIN entries?

**Q13.** How do you implement back-of-envelope capacity planning for a card authorization service? Given 10,000 TPS, 5ms avg DB query time, 10ms avg downstream call, what thread pool size and connection pool size do you need?

---

## Advanced Questions (12)

**Q1.** Design a card authorization system that handles 50,000 TPS globally with p99 latency under 100ms. Walk through: global load balancing (anycast/GeoDNS), regional service topology, caching layers, DB write strategy, async audit, and failure isolation — end to end.

**Q2.** How do you implement a low-latency in-memory policy evaluation engine in Java that evaluates 200 rules against a transaction object in under 5ms? Discuss data structure choices, object allocation minimization, GC pressure, and JIT warm-up strategies.

**Q3.** How does LMAX Disruptor differ from a standard `BlockingQueue` for inter-thread communication in a high-throughput authorization pipeline? What is the mechanical sympathy principle, and how does the Disruptor exploit CPU cache lines?

**Q4.** How do you implement a zero-copy network path for authorization messages in a Netty-based Spring WebFlux service? What is `DirectByteBuf` vs `HeapByteBuf`, and when does zero-copy matter for financial message throughput?

**Q5.** How do you implement a token bucket rate limiter in Java that is accurate under high concurrency without using synchronized blocks — using `AtomicLong` and CAS operations — and explain the ABA problem and why it doesn't apply here?

**Q6.** How do you design a sharded authorization state store where each shard owns a range of card numbers — ensuring that concurrent authorization requests for the same card always route to the same shard for linearizable limit enforcement?

**Q7.** How do you implement speculative execution for authorization — sending the same request to two backend instances simultaneously and using whichever responds first — to reduce tail latency at the cost of increased load?

**Q8.** How do you implement a write-ahead log (WAL) pattern in a Spring Boot authorization service to guarantee that every authorization decision is durably recorded before the response is sent, even if the primary DB write is deferred?

**Q9.** How do you perform continuous latency profiling of a live production authorization service using async-profiler or JFR (Java Flight Recorder) without impacting p99 latency by more than 1ms?

**Q10.** How do you design a multi-region active-active authorization architecture where cardholders in Asia and Europe are served by their nearest region, but credit limit enforcement must be globally consistent? How do you handle the CAP theorem trade-off?

**Q11.** How do you implement adaptive timeout management in an authorization service — dynamically adjusting downstream call timeouts based on real-time p99 latency measurements to avoid cascading failures during degraded periods?

**Q12.** How do you implement a high-performance idempotency store for authorization requests — storing request fingerprints with sub-millisecond lookup — using a Bloom filter as a fast pre-check before a Redis or DB lookup?

---

## Scenario-Based Questions (11)

**Q1.** Your authorization service handles 8,000 TPS normally but a Black Friday surge pushes it to 25,000 TPS. DB connection pool exhaustion causes requests to queue, and p99 latency spikes from 80ms to 4 seconds. Walk through your immediate incident response and the architectural changes you make afterward.

**Q2.** A downstream fraud service degrades and starts responding in 800ms instead of 50ms. Your authorization service's thread pool fills up waiting for fraud responses, causing unrelated transactions that don't need fraud checks to also time out. How do you isolate this failure?

**Q3.** You observe that your authorization service's p99 latency is 250ms but p50 is 15ms. The tail latency is caused by GC pauses from a G1 collector doing mixed collections. Walk through your GC tuning strategy to bring p99 under 100ms without switching collectors.

**Q4.** Your Redis cache for card policy data is evicting entries under high load because `maxmemory` is set too low. Some authorization requests are hitting the database 100% of the time, causing DB CPU to spike to 95%. Design a permanent fix and an immediate mitigation.

**Q5.** A single card is being used in a fraud attack — 500 authorization attempts per second from different terminals. Your velocity check relies on a Redis counter with a 1-second TTL. Under this attack pattern, the counter is being reset before it reaches the block threshold. Redesign the velocity check to be resistant to this timing attack.

**Q6.** Your authorization service is deployed in 3 regions. A network partition isolates the Asia region from the global credit limit store. Should the Asia region continue authorizing transactions (AP) or halt until connectivity is restored (CP)? Design the policy and the reconciliation process when the partition heals.

**Q7.** You need to add a new enrichment step to the authorization pipeline — fetching the cardholder's loyalty tier from a slow CRM service (avg 200ms) — without increasing authorization latency. How do you integrate this without impacting the critical path?

**Q8.** Your authorization service is consuming 40GB of heap because the in-memory policy cache stores full rule objects for 5,000 issuers. Memory pressure is causing frequent full GCs. How do you reduce the cache footprint by 80% without losing lookup performance?

**Q9.** A misconfigured load balancer is sending 80% of traffic to one of your five authorization service instances, causing it to hit CPU limits while the other four are idle. How do you detect this, fix the immediate imbalance, and prevent recurrence?

**Q10.** Your authorization service must process end-of-day settlement files — 10 million records — within a 2-hour batch window, while simultaneously serving 3,000 TPS of real-time authorizations. How do you design resource isolation between the batch job and the online service to prevent interference?

**Q11.** After a deployment, your authorization service p99 latency doubles from 80ms to 160ms. There are no errors, just slower responses. How do you systematically diagnose the regression — profiling, tracing, DB query analysis, GC logs — and identify the root cause?

---

## Follow-up / Deep Dive Questions (12)

**Q1.** You mentioned ensuring low latency and compliance for high-volume financial transactions at UST — what was the peak TPS your authorization service handled, and what was the p99 latency target?

**Q2.** How did you architect the integration between the frontend React.js dashboard and the backend authorization service to ensure low latency for real-time policy updates without polling?

**Q3.** What caching strategy did you use for card policy data in your authorization service — in-process, distributed, or both? How did you handle cache invalidation when a policy was updated via the dashboard?

**Q4.** How did you measure and monitor latency in your authorization service in production — what metrics did you instrument, what dashboards did you build, and how did you define and alert on SLA breaches?

**Q5.** What was the most significant latency bottleneck you identified and fixed in your authorization or reissue system? Walk through the diagnosis, the fix, and the before/after metrics.

**Q6.** How did you handle the concurrency requirements for the card reissue batch job running alongside the real-time authorization service on the same infrastructure — did they share resources or were they isolated?

**Q7.** How do you implement exponential backoff with jitter for retrying a failed downstream call in an authorization service? Why is jitter important under thundering herd conditions?

**Q8.** How do you implement a latency budget tracker in a Spring Boot service — allocating a portion of the total SLA to each stage (validation, policy evaluation, DB write, audit) and aborting the request if any stage exceeds its budget?

**Q9.** How does the choice of serialization format (JSON vs Protobuf vs Avro vs MessagePack) affect latency and throughput in a high-volume authorization service? Which would you choose and why?

**Q10.** How do you implement warm-up logic for a newly deployed authorization service instance — pre-populating caches, JIT-warming hot code paths, and establishing DB connections — before the load balancer sends it live traffic?

**Q11.** How do you design a chaos engineering experiment for your authorization service — what failure scenarios would you inject (latency, error rates, resource exhaustion), how do you measure blast radius, and what is your abort criteria?

**Q12.** How does the thread model choice (Spring MVC + virtual threads vs Spring WebFlux) affect your authorization service's behavior under slow downstream calls? Walk through what happens to throughput and latency in each model when the fraud service takes 500ms to respond at 10,000 TPS.

---

*Topic 8 of 16 — Generated from work experience profile: Lead Software Engineer, UST Global / Cognizant / Solverminds*
