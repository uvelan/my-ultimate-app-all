# Topic 4 of 16 — Spring WebFlux & Project Reactor

**Domain:** Spring Ecosystem / Reactive Programming
**Complexity:** Advanced
**Profile:** Senior/Lead Backend Engineer — Fintech/Payments

---

## Topic Overview

| Concept | Description |
|---------|-------------|
| Reactive Streams | Publisher/Subscriber specification — backpressure-aware async stream processing |
| Project Reactor | Spring's reactive library — `Mono<T>` (0–1 item) and `Flux<T>` (0–N items) |
| Spring WebFlux | Non-blocking web framework built on Reactor and Netty |
| Netty Event Loop | Single-threaded event loop model replacing thread-per-request |
| Backpressure | Consumer-driven flow control to prevent producer overwhelming consumer |
| Schedulers | Thread pool abstraction — `boundedElastic`, `parallel`, `single`, `immediate` |
| WebClient | Non-blocking HTTP client replacing `RestTemplate` in reactive stacks |
| R2DBC | Reactive relational database connectivity |
| StepVerifier | Reactor test utility for asserting reactive pipeline behavior |

---

## Basic Questions (13)

**Q1.** What is reactive programming? How does it differ from imperative programming in terms of execution model and thread usage?

**Q2.** What is the Reactive Streams specification? What are its four interfaces — `Publisher`, `Subscriber`, `Subscription`, `Processor` — and what contract does each define?

**Q3.** What is the difference between `Mono<T>` and `Flux<T>` in Project Reactor? When would you use each?

**Q4.** What does it mean for a reactive pipeline to be "lazy"? Why does nothing execute until you subscribe?

**Q5.** What is backpressure in reactive streams? How does a subscriber signal demand to a publisher using `request(n)`?

**Q6.** What is the difference between `map()` and `flatMap()` in Project Reactor? What type does each operator expect in the transformation function?

**Q7.** What is `subscribe()` in Reactor? What are its overloaded variants for handling `onNext`, `onError`, and `onComplete`?

**Q8.** What is Spring WebFlux? How does it differ from Spring MVC in terms of threading model and underlying server?

**Q9.** What is Netty? How does its event loop model differ from the thread-per-request model of Tomcat?

**Q10.** What is `WebClient`? Why is `RestTemplate` discouraged in reactive applications?

**Q11.** What are `Schedulers.boundedElastic()`, `Schedulers.parallel()`, and `Schedulers.single()`? When would you use each?

**Q12.** What is `StepVerifier`? How do you use it to test a `Mono` or `Flux` pipeline in a unit test?

**Q13.** What is the difference between `onErrorReturn()`, `onErrorResume()`, and `onErrorMap()` in Reactor? Give a use case for each.

---

## Intermediate Questions (13)

**Q1.** What is the difference between `flatMap()` and `concatMap()` in `Flux`? How does ordering and concurrency differ between them? When would `concatMap()` be preferred in a payment processing pipeline?

**Q2.** What is `switchIfEmpty()` vs `defaultIfEmpty()` in Reactor? How do you use them to handle empty upstream results in an authorization lookup?

**Q3.** How does `Mono.zip()` and `Flux.zip()` work? How would you use `Mono.zip()` to combine results from two parallel service calls — policy validation and fraud check — in an authorization flow?

**Q4.** How do you implement retry with exponential backoff in Project Reactor using `retryWhen(Retry.backoff(...))`? What are the parameters, and how do you limit retries for specific exception types only?

**Q5.** What is `publishOn()` vs `subscribeOn()` in Reactor? How do they affect which thread executes each operator in the pipeline?

**Q6.** How does `flatMap()` control concurrency in a `Flux`? What is the `concurrency` parameter, and how do you use it to limit parallel downstream service calls to avoid overloading a card network API?

**Q7.** How do you perform blocking operations (JDBC, legacy API calls) safely inside a reactive pipeline? Why is calling a blocking operation on an event loop thread dangerous, and how does `subscribeOn(Schedulers.boundedElastic())` help?

**Q8.** How does `WebClient` handle timeouts? What is the difference between `responseTimeout` on the client level and `.timeout()` operator in the pipeline?

**Q9.** What is `Flux.buffer()`, `Flux.window()`, and `Flux.groupBy()`? Give a real-world example of each in a high-volume transaction processing context.

**Q10.** How do you propagate context (e.g., trace ID, tenant ID) through a reactive pipeline using `Context` and `contextWrite()` in Reactor? Why can't you use `ThreadLocal` in reactive code?

**Q11.** What is the difference between hot and cold publishers in Reactor? Give an example of each and explain their subscription semantics.

**Q12.** How does `Mono.fromCallable()` differ from `Mono.just()`? When is `fromCallable()` essential for correctness in a reactive pipeline?

**Q13.** How do you implement request/response logging for a `WebClient` call in a reactive pipeline without breaking the reactive chain?

---

## Advanced Questions (12)

**Q1.** Explain the internal execution model of a Netty-based Spring WebFlux server. How many event loop threads are created by default, what do they do, and what happens to your application if you block one of them even for 1ms?

**Q2.** How does Project Reactor implement backpressure end-to-end — from the subscriber's `request(n)` signal through the operator chain back to the source? Walk through the `request()` propagation for a `Flux.range()` → `map()` → `filter()` → `flatMap()` chain.

**Q3.** What is `Sinks` in Reactor 3.4+? How does `Sinks.Many` replace the deprecated `FluxProcessor`/`EmitterProcessor`? How would you use `Sinks.Many.multicast()` to broadcast authorization events to multiple downstream consumers?

**Q4.** How do you implement exactly-once processing semantics in a reactive pipeline consuming from Kafka using `reactor-kafka`? What is the interaction between Kafka offset commits and Reactor backpressure?

**Q5.** How does R2DBC differ from JDBC in terms of connection pool model and thread usage? What are the limitations of R2DBC compared to JDBC in terms of feature support (stored procedures, batch inserts, transactions)?

**Q6.** How do you implement a reactive circuit breaker using Resilience4j's reactive operators (`CircuitBreakerOperator`)? How does it integrate with a `Mono`/`Flux` pipeline for downstream card network calls?

**Q7.** Explain operator fusion in Project Reactor. What is macro-fusion vs micro-fusion, and how does the Reactor assembly-time optimization pipeline reduce operator overhead in high-throughput financial stream processing?

**Q8.** How do you implement distributed tracing in a Spring WebFlux service? How does `traceId` propagate across reactive pipelines using Micrometer's `ObservationRegistry` and Reactor's `Context`?

**Q9.** How does Spring WebFlux handle SSE (Server-Sent Events) and WebSocket connections? How would you implement a real-time authorization status stream for the React.js policy dashboard using WebFlux SSE?

**Q10.** How do you test a full WebFlux controller end-to-end using `WebTestClient`? What is the difference between binding to the full application context vs. binding to a specific controller, and how do you mock reactive service dependencies?

**Q11.** What are the performance trade-offs between Spring WebFlux and Spring MVC + Virtual Threads (Java 21)? Under what workload profiles (CPU-bound, IO-bound, mixed) does each approach win, and how would you make this architectural decision for a new payment service?

**Q12.** How does Reactor's `ParallelFlux` work? How do you use `Flux.parallel()` + `runOn()` to distribute credit card record processing across multiple CPU cores while preserving per-partition ordering?

---

## Scenario-Based Questions (11)

**Q1.** Your Spring WebFlux authorization service suddenly shows high latency. A thread dump reveals all Netty event loop threads are in RUNNABLE state executing database calls. What is the root cause, and how do you fix it without switching to Spring MVC?

**Q2.** You need to call three downstream services in parallel — fraud check, policy validation, and account status — and combine their results into a single authorization decision. Design this using Reactor operators, handling the case where any one service fails.

**Q3.** A `Flux` pipeline processing 100,000 card records is causing `OutOfMemoryError` because the producer emits faster than the consumer can process. How do you apply backpressure to slow down the producer using `onBackpressureBuffer()`, `onBackpressureDrop()`, or `onBackpressureLatest()`?

**Q4.** Your `WebClient` call to a card network API returns a `5xx` error. You need to retry 3 times with exponential backoff, only for `503` errors, and fall back to a cached policy decision if all retries fail. Implement this pipeline.

**Q5.** You are migrating a Spring MVC controller that uses `RestTemplate` and `@Transactional` to Spring WebFlux. What are the specific blockers — `@Transactional` with R2DBC, `ThreadLocal`-based security context, blocking JDBC calls — and how do you resolve each?

**Q6.** A reactive pipeline processing authorization requests is dropping events silently when the downstream writer is slow. How do you detect this, add visibility into dropped events, and choose the right backpressure strategy for a financial system where dropping is unacceptable?

**Q7.** You need to implement a reactive rate limiter that allows at most 1,000 authorization requests per second per issuer, implemented reactively without blocking. Design this using Reactor operators and a token bucket backed by Redis reactive client.

**Q8.** Your WebFlux service uses `contextWrite()` to propagate a tenant ID through the pipeline. A junior engineer introduces a `Schedulers.boundedElastic()` hop in the middle of the chain, and the tenant ID is lost downstream. Explain why and fix it.

**Q9.** A `Flux` pipeline consuming from an SFTP file source emits records faster than the downstream DB writer can handle. The pipeline crashes with `reactor.core.Exceptions$OverflowException`. Design a bounded, backpressure-aware pipeline that handles this without data loss.

**Q10.** You need to implement request deduplication in your reactive authorization endpoint — if the same `requestId` is received within a 5-second window, return the cached result without reprocessing. Design this using Reactor and a reactive cache (Caffeine async or Redis reactive).

**Q11.** A Spring WebFlux service deployed in Kubernetes is intermittently returning empty responses with no error. Reactor's `switchIfEmpty()` is silently swallowing a lookup failure. How do you add reactive pipeline visibility using `log()`, `doOnNext()`, `doOnError()`, and `doOnSubscribe()` to diagnose this?

---

## Follow-up / Deep Dive Questions (12)

**Q1.** Walk me through your experience building reactive APIs at Cognizant — what was the business use case, what traffic volumes did you handle, and what were the most challenging reactive operator chains you had to design?

**Q2.** You migrated Java 7 imperative code to reactive with Project Reactor — what were the hardest imperative patterns to translate (loops, try-catch, conditional branching), and how did you handle them reactively?

**Q3.** How did you handle error propagation in your reactive pipelines — did you use `onErrorResume()` at each stage, a global `WebExceptionHandler`, or a hybrid approach?

**Q4.** How did you test your reactive APIs — did you use `StepVerifier` for unit tests and `WebTestClient` for integration tests? Walk through a complex test case you wrote.

**Q5.** Given your experience with both Spring WebFlux (Cognizant) and Spring MVC/Boot (UST), how do you decide which to use for a new service? What factors push you toward reactive?

**Q6.** How does `Flux.merge()` differ from `Flux.concat()` and `Flux.zip()`? In which parts of your reactive pipeline did you use merge semantics, and why?

**Q7.** How do you handle `@Transactional` in a reactive Spring application with R2DBC? What is `TransactionalOperator`, and how does it differ from the annotation-based approach?

**Q8.** What debugging tools and techniques do you use for reactive pipelines? How do you use `Hooks.onOperatorDebug()`, `checkpoint()`, and `log()` to get meaningful stack traces in Reactor?

**Q9.** How does `Mono.defer()` differ from `Mono.just()` and `Mono.fromSupplier()`? When is `defer()` critical for correctness in a reactive pipeline that constructs publishers dynamically?

**Q10.** How does Project Reactor handle thread safety for shared mutable state accessed inside operators like `flatMap()`? What reactive-safe alternatives exist to `AtomicReference` and `ConcurrentHashMap`?

**Q11.** How do you implement pagination in a reactive API returning a `Flux` of pages from a database? What is the keyset pagination pattern, and why is offset pagination dangerous in reactive systems under concurrent writes?

**Q12.** How did Netty's event loop model specifically help with the high-volume traffic you mentioned at Cognizant? Did you ever have to tune the event loop thread count or worker thread configuration, and what guided those decisions?

---

*Topic 4 of 16 — Generated from work experience profile: Lead Software Engineer, UST Global / Cognizant / Solverminds*
