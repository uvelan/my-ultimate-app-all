# Topic 10 of 16 — Microservices Architecture

**Domain:** System Design
**Complexity:** Advanced
**Profile:** Senior/Lead Backend Engineer — Fintech/Payments

---

## Topic Overview

| Concept | Description |
|---------|-------------|
| Service Decomposition | Identifying service boundaries using Domain-Driven Design (DDD) |
| API Gateway | Single entry point — routing, auth, rate limiting, SSL termination |
| Service Discovery | Dynamic registration and lookup — Eureka, Consul, Kubernetes DNS |
| Inter-Service Communication | Synchronous (REST/gRPC) vs asynchronous (Kafka/RabbitMQ) |
| Saga Pattern | Distributed transaction coordination without 2PC |
| Outbox Pattern | Reliable event publishing via transactional outbox table |
| Circuit Breaker | Resilience4j — preventing cascade failures across services |
| Distributed Tracing | TraceId/SpanId propagation — Micrometer, Zipkin, Jaeger |
| Service Mesh | Istio/Linkerd — cross-cutting concerns at infrastructure level |
| CQRS | Command Query Responsibility Segregation — separate read/write models |
| Event Sourcing | Storing state as an immutable sequence of events |
| Bulkhead | Isolating failure domains to prevent resource starvation |
| Idempotency | Safe retry semantics for inter-service calls |
| Deployment | Docker, Kubernetes, Helm, rolling updates, blue-green, canary |

---

## Basic Questions (13)

**Q1.** What is a microservice? How does it differ from a monolith in terms of deployment, data ownership, and team structure?

**Q2.** What are the key principles of microservices architecture — single responsibility, loose coupling, high cohesion, independent deployability? Give a concrete example of each in a card payment system.

**Q3.** What is an API Gateway? What responsibilities does it take on that individual microservices should not handle themselves?

**Q4.** What is service discovery? What is the difference between client-side discovery (Ribbon/Eureka) and server-side discovery (load balancer/Kubernetes)?

**Q5.** What is the difference between synchronous and asynchronous inter-service communication? When would you choose REST over Kafka for a call between an authorization service and a fraud service?

**Q6.** What is the Saga pattern? What problem does it solve compared to a distributed two-phase commit (2PC)?

**Q7.** What is a circuit breaker in a microservices context? What are its three states, and what triggers each transition?

**Q8.** What is distributed tracing? What is a `traceId` and a `spanId`, and how do they correlate a request across multiple microservices?

**Q9.** What is the difference between orchestration and choreography in a Saga? Give an example of each for a card reissue workflow.

**Q10.** What is the Bulkhead pattern? How does it prevent a slow downstream service from exhausting shared resources in a calling service?

**Q11.** What is the difference between eventual consistency and strong consistency? Which is acceptable for a card reissue notification service, and which is required for a credit limit enforcement service?

**Q12.** What is the Outbox pattern? What problem does it solve when a microservice needs to update its database and publish an event atomically?

**Q13.** What is CQRS (Command Query Responsibility Segregation)? How does it apply to a card authorization system with high read and write loads?

---

## Intermediate Questions (13)

**Q1.** How do you identify microservice boundaries using Domain-Driven Design — bounded contexts, aggregates, and domain events? Walk through how you would decompose a card payment platform into microservices.

**Q2.** How do you implement the Saga pattern using choreography for a card reissue workflow — card request received → account validated → card manufactured → notification sent — where each step is a separate microservice emitting events?

**Q3.** How do you implement the Outbox pattern in a Spring Boot service? Walk through the DB transaction, the outbox table write, the polling/CDC mechanism, and the Kafka publish — ensuring at-least-once delivery with idempotent consumers.

**Q4.** How do you implement distributed tracing in a Spring Boot 3.x microservices system using Micrometer Tracing + Zipkin? How does `traceId` propagate across REST calls and Kafka messages?

**Q5.** How do you implement Resilience4j's circuit breaker, retry, and bulkhead in a Spring Boot authorization service that calls a downstream fraud detection service? What are the configuration parameters for each pattern?

**Q6.** How do you design a shared-nothing microservices architecture for a card payment platform — ensuring each service owns its own database, with no direct DB-to-DB joins across service boundaries?

**Q7.** How do you implement API versioning across multiple microservices — ensuring that a breaking change in the authorization service contract doesn't force simultaneous updates to the policy service, reissue service, and API gateway?

**Q8.** How do you implement service-to-service authentication in a microservices architecture — mutual TLS (mTLS), JWT service tokens, or OAuth2 client credentials? What are the trade-offs for a fintech platform?

**Q9.** How do you implement an idempotent Kafka consumer in a card authorization event processing service — ensuring that replayed events (due to at-least-once delivery) don't cause duplicate state changes?

**Q10.** How do you design a health check strategy for microservices in Kubernetes — liveness, readiness, and startup probes — for a card reissue service that depends on a database connection and a policy cache being loaded?

**Q11.** How do you implement a dead-letter queue (DLQ) strategy for failed Kafka messages in a card event processing pipeline? What information do you capture in the DLQ, and how do you implement reprocessing?

**Q12.** How do you manage distributed configuration across 15 microservices — using Spring Cloud Config Server, Kubernetes ConfigMaps, or AWS Parameter Store? What is the hot-reload strategy when a config changes?

**Q13.** How do you implement a rate limiter at the API Gateway level for a card authorization platform — enforcing per-issuer TPS limits — using a token bucket backed by Redis?

---

## Advanced Questions (12)

**Q1.** Design the microservices architecture for a card payment platform handling 20,000 TPS — covering service decomposition, API gateway, event bus, data stores per service, observability stack, and failure isolation. Walk through the full architecture diagram.

**Q2.** How do you implement the Saga orchestration pattern using a dedicated orchestrator service for a card reissue workflow — where the orchestrator calls each participant service, handles compensation on failure, and maintains saga state? Compare this to choreography trade-offs.

**Q3.** How do you implement Event Sourcing for a card authorization service — storing every authorization attempt, approval, decline, and reversal as an immutable event, and reconstructing current card state by replaying the event log? What are the projection and snapshot strategies?

**Q4.** How do you implement CQRS in a card authorization platform — separating the authorization command model (write-optimised, strongly consistent) from the query model (read-optimised, eventually consistent) — with event-driven synchronisation between them?

**Q5.** How do you design a service mesh architecture using Istio for a card payment platform — what cross-cutting concerns (mTLS, retries, circuit breaking, tracing) does the mesh handle vs. what remains in application code?

**Q6.** How do you implement a distributed lock across microservices using Redis (Redlock algorithm) to prevent two service instances from concurrently processing the same card reissue request? What are Redlock's known limitations?

**Q7.** How do you handle the dual-write problem — a service that must write to its own DB and publish a Kafka event atomically without 2PC? Compare Outbox + CDC (Debezium), transactional messaging, and application-level retry strategies.

**Q8.** How do you implement a canary deployment for a microservice in a Kubernetes environment — routing 5% of traffic to the new version, measuring error rate and latency, and automatically rolling back if thresholds are breached?

**Q9.** How do you design a microservices observability stack for a card payment platform — covering structured logging (ELK), metrics (Prometheus/Grafana), distributed tracing (Jaeger), and alerting — with correlation across all three signals?

**Q10.** How do you handle partial failure in a synchronous microservice call chain — authorization service → policy service → fraud service → ledger service — where any service can fail? Design the timeout, retry, circuit breaker, and fallback strategy for each hop.

**Q11.** How do you implement schema evolution for Kafka messages in a microservices platform using Avro and Schema Registry — ensuring backward and forward compatibility as the card event schema evolves across services?

**Q12.** How do you implement a multi-region microservices deployment for a card payment platform — active-active across Asia and Europe — handling data residency requirements, inter-region latency, and conflict resolution for shared card state?

---

## Scenario-Based Questions (11)

**Q1.** Your card authorization microservice is healthy, but the downstream policy service is timing out for 20% of requests. The circuit breaker is not opening because the error rate threshold is set to 50%. Authorization decisions are degraded. What is your immediate response, and how do you tune the circuit breaker to catch this earlier?

**Q2.** A Kafka consumer in your card reissue notification service is lagging 2 million messages behind the producer. The consumer is processing 500 messages/second but the producer is generating 2,000/second. How do you scale the consumer and design a long-term fix without message loss or duplicates?

**Q3.** After deploying a new version of the card reissue service, you notice that some reissue events are being processed twice — the old and new service instances are both consuming from the same Kafka partition during the rolling update. How do you prevent this?

**Q4.** The Saga orchestrator for your card reissue workflow is stuck in a COMPENSATING state for 500 reissue requests after a downstream card manufacturing service failure. How do you diagnose the stuck sagas, complete the compensation, and prevent recurrence?

**Q5.** Your API Gateway is a single point of failure — a misconfigured rate limit rule blocks all issuer traffic for 3 minutes. How do you redesign the gateway layer for higher availability, and what safeguards prevent a misconfiguration from having global blast radius?

**Q6.** A new microservice team is sharing the same Kafka cluster as your authorization service. Their consumer group is accidentally subscribed to your authorization events topic and is affecting partition offset management. How do you enforce topic isolation and access control?

**Q7.** Your card authorization service needs to call both the policy service (50ms p99) and the fraud service (200ms p99) per transaction. Calling them sequentially exceeds your 300ms SLA. Calling them in parallel reduces latency but doubles the failure surface. Design the optimal parallel call strategy with fallback.

**Q8.** A distributed tracing investigation reveals that 30% of your authorization requests have broken trace chains — the `traceId` is not propagating from the REST call into the Kafka message headers. How do you diagnose and fix the propagation gap across the async boundary?

**Q9.** The Outbox table in your card event service is growing unboundedly — events are being inserted but the CDC mechanism (Debezium) has been lagging due to a connector failure. How do you recover, prevent data loss, and implement a retention policy for the outbox table?

**Q10.** A compliance requirement mandates that all inter-service communication in your card payment platform be encrypted and mutually authenticated. You have 15 services currently using plain HTTP internally. Design the migration path to mTLS with zero downtime.

**Q11.** Your card reissue microservice is deployed across 3 Kubernetes clusters in different regions. A network partition isolates one cluster, and the service in that cluster continues processing reissue requests against a stale policy cache. How do you detect the partition, halt unsafe processing, and reconcile state when connectivity is restored?

---

## Follow-up / Deep Dive Questions (12)

**Q1.** Walk me through the microservices architecture of the card reissue and authorization system you built at UST — how many services were involved, how did they communicate, and how did you handle failures across service boundaries?

**Q2.** How did you implement inter-service communication between the authorization service and the policy validation service — synchronous REST or asynchronous events? What drove that decision?

**Q3.** How did you handle distributed transaction consistency in your card reissue workflow — for example, ensuring that a card is marked as reissued in the core banking system and the notification is sent to the cardholder atomically?

**Q4.** How did you implement observability across your microservices — what tracing, logging, and metrics tooling did you use, and how did you correlate a single authorization request across multiple service hops?

**Q5.** How did you manage service-to-service authentication in your payment platform — were internal calls trusted by network boundary, or did you implement token-based auth between services?

**Q6.** How did you handle schema evolution for the API contracts between your microservices — did you use OpenAPI, Avro, Protobuf, or plain JSON? How did you prevent breaking changes from causing cascading failures?

**Q7.** How did you implement the Resilience4j circuit breaker configuration for your downstream service calls — what thresholds did you set for failure rate, slow call rate, and wait duration in OPEN state?

**Q8.** How did you test inter-service interactions in your microservices — did you use contract tests (Pact), integration tests with real service instances, or WireMock stubs? What was the trade-off?

**Q9.** How did you handle the operational complexity of running multiple microservices — deployment coordination, config management, log aggregation, and on-call runbooks — in your team?

**Q10.** How did you implement idempotency for the card reissue workflow across service boundaries — ensuring that a reissue request retried by the client or by a Saga compensation step did not result in a second physical card being produced?

**Q11.** If you were redesigning your card payment platform today as a greenfield project, what microservices architecture decisions would you make differently — service boundaries, communication patterns, data stores, or deployment strategy?

**Q12.** How do you decide when NOT to use microservices — what are the signals that a monolith or a modular monolith is the right choice for a fintech team, and how do you make that case to stakeholders who assume microservices is always the answer?

---

*Topic 10 of 16 — Generated from work experience profile: Lead Software Engineer, UST Global / Cognizant / Solverminds*
