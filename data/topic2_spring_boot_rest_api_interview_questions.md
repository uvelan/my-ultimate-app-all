# Topic 2 of 16 — Spring Boot Core & REST API Design

**Domain:** Spring Ecosystem
**Complexity:** Advanced
**Profile:** Senior/Lead Backend Engineer — Fintech/Payments

---

## Topic Overview

| Concept | Description |
|---------|-------------|
| Auto-Configuration | Conditional bean registration driven by classpath and properties |
| Bean Lifecycle | Instantiation → Dependency Injection → PostConstruct → Destroy |
| REST Semantics | HTTP verbs, status codes, idempotency, versioning, error envelopes |
| Validation | JSR-380 Bean Validation, `@Valid`, custom `ConstraintValidator` |
| Exception Handling | `@ControllerAdvice`, `@ExceptionHandler`, centralized error responses |
| Spring Actuator | Production-ready health, metrics, and management endpoints |
| Security | Filter chain, JWT, OAuth2, method-level authorization |
| Observability | Distributed tracing, Micrometer, Zipkin/Jaeger integration |

---

## Basic Questions (13)

**Q1.** What is Spring Boot auto-configuration? How does `@EnableAutoConfiguration` decide which beans to create?

**Q2.** What is the difference between `@Component`, `@Service`, `@Repository`, and `@Controller`? Are they interchangeable?

**Q3.** What is the role of `application.properties` vs `application.yml`? How does Spring Boot resolve property conflicts across multiple sources?

**Q4.** What does `@SpringBootApplication` do? Which three annotations does it combine?

**Q5.** What is the difference between `@RequestParam`, `@PathVariable`, and `@RequestBody`?

**Q6.** What HTTP status codes should be returned for: successful creation, resource not found, validation failure, unauthorized access, and internal server error?

**Q7.** What is the difference between `@RestController` and `@Controller`? When would you use `@Controller` in a REST API project?

**Q8.** What is `ResponseEntity<T>`? Why would you use it over simply returning a POJO from a controller method?

**Q9.** What is `@ControllerAdvice` / `@RestControllerAdvice`? How does it enable centralized exception handling?

**Q10.** What is the difference between `@Bean` and `@Component`? When must you use `@Bean`?

**Q11.** What is Spring Boot's embedded server? Which servers are supported, and how do you switch from Tomcat to Undertow?

**Q12.** What is `@Value`? How do you inject a list or map from properties using `@Value`?

**Q13.** What is `@ConfigurationProperties`? How does it differ from `@Value` for structured config binding?

---

## Intermediate Questions (13)

**Q1.** Explain the Spring Boot auto-configuration mechanism in detail. How does `spring.factories` / `AutoConfiguration.imports` (Boot 3.x) work, and how would you write a custom auto-configuration?

**Q2.** What is the difference between `@Scope("singleton")`, `@Scope("prototype")`, `request`, and `session` scopes? What happens when a prototype bean is injected into a singleton bean?

**Q3.** How does Spring Boot externalized configuration work across profiles (`@Profile`, `application-{profile}.yml`)? What is the property source priority order?

**Q4.** How do you design a REST API error response envelope? What fields should a standardized error body contain for a financial API (status, code, message, traceId, timestamp)?

**Q5.** What is idempotency in REST APIs? How do you implement idempotency for a card reissue POST endpoint to prevent duplicate processing on client retry?

**Q6.** How do you implement API versioning in Spring Boot? Compare URI versioning (`/v1/cards`), header versioning (`X-API-Version`), and content negotiation — with trade-offs for each.

**Q7.** How does `@Transactional` work in Spring? What is the default propagation and isolation level, and what is the self-invocation problem?

**Q8.** How do you implement request validation in Spring Boot using `@Valid`, `@Validated`, Bean Validation (JSR-380) annotations, and custom `ConstraintValidator`?

**Q9.** How does Spring Boot's `Actuator` work? Which endpoints are most useful for a production payment service, and how do you secure them?

**Q10.** What is the difference between `FilterChain` (Servlet Filter) and `HandlerInterceptor` in Spring MVC? When would you use each for cross-cutting concerns like request logging or auth token validation?

**Q11.** How do you implement pagination and sorting in a Spring Boot REST API? What is `Pageable`, and how do you expose it cleanly in a controller without leaking Spring internals into your API contract?

**Q12.** How does Spring Boot handle content negotiation? How do you configure an endpoint to serve both `application/json` and `application/xml` responses?

**Q13.** What is `@Async` in Spring Boot? How does it work, what executor does it use by default, and what are its failure modes when exceptions are thrown?

---

## Advanced Questions (12)

**Q1.** Explain the Spring Boot startup sequence in detail: `SpringApplication.run()` → `ApplicationContext` refresh → bean instantiation → `ApplicationRunner` execution. At which phase do auto-configurations apply?

**Q2.** How does Spring's `BeanPostProcessor` and `BeanFactoryPostProcessor` differ? Give a real-world example of each in a Spring Boot financial application.

**Q3.** How do you design a REST API for high-volume credit card authorization that guarantees exactly-once processing semantics? Discuss idempotency keys, distributed locks, and database-level deduplication.

**Q4.** What is the difference between optimistic and pessimistic locking in a Spring Boot + JPA context? How would you apply optimistic locking (`@Version`) to prevent concurrent updates to a card policy configuration?

**Q5.** How does Spring Security integrate with a REST API? Walk through the filter chain for a JWT-secured endpoint — from request entry to method-level authorization (`@PreAuthorize`).

**Q6.** How do you implement a rate limiter for a REST API in Spring Boot without an API gateway? Compare bucket4j, Resilience4j `RateLimiter`, and Redis-based token bucket implementations.

**Q7.** You need to support partial updates in your card configuration API. How do you implement `PATCH` semantics in Spring Boot with JSON Merge Patch (RFC 7396) vs JSON Patch (RFC 6902)?

**Q8.** How do you implement circuit breaking for downstream service calls in Spring Boot using Resilience4j? What are the state transitions (CLOSED → OPEN → HALF_OPEN), and how do you configure thresholds for a payment authorization service?

**Q9.** How does `@ConditionalOnProperty`, `@ConditionalOnClass`, and `@ConditionalOnMissingBean` work? Design a multi-tenant auto-configuration that activates different policy engines based on a tenant identifier.

**Q10.** How do you implement distributed tracing in a Spring Boot microservices system? How do `traceId` and `spanId` propagate across service calls using Micrometer + Zipkin/Jaeger in Spring Boot 3.x?

**Q11.** How does Spring Boot 3.x differ from Spring Boot 2.x in terms of baseline (Jakarta EE 10 vs javax), observability (Micrometer), AOT compilation, and virtual thread support?

**Q12.** How would you design a Spring Boot REST API that serves 50,000 requests/second for card authorization decisions with p99 latency under 50ms? Discuss thread model, connection pooling, caching, and async patterns.

---

## Scenario-Based Questions (11)

**Q1.** A card reissue POST endpoint is being called twice due to a client timeout and retry. The second call creates a duplicate reissue record. How do you retrofit idempotency into this endpoint without changing the client contract?

**Q2.** Your Spring Boot application starts fine locally but fails in production with `NoSuchBeanDefinitionException`. The missing bean is in a separate JAR. How do you diagnose and fix this auto-configuration loading issue?

**Q3.** A `@Transactional` method in your authorization service calls another `@Transactional` method in the same class. The inner transaction is not rolling back independently as expected. Explain why, and fix it without restructuring the entire class.

**Q4.** Your REST API is returning 200 OK even for validation failures because a junior engineer returned the error inside the response body without setting the status code. How do you enforce consistent error response standards across the team?

**Q5.** A downstream card network service occasionally takes 10+ seconds to respond, blocking your thread pool and causing cascading failures in the authorization flow. Design a fault-tolerant solution using timeouts, circuit breakers, and fallback responses.

**Q6.** You need to expose a single `/authorize` endpoint that behaves differently based on card type (credit, debit, prepaid) without `if-else` chains in the controller. Design a strategy-pattern based dispatcher in Spring Boot.

**Q7.** Your card policy configuration API needs to support multi-tenancy — each issuer has its own policy rules stored in separate DB schemas. How do you implement dynamic datasource routing in Spring Boot per request?

**Q8.** A new compliance requirement mandates that all inbound and outbound payloads for authorization APIs be logged, masked (PAN, CVV), and stored for audit. How do you implement this as a cross-cutting concern without modifying each controller?

**Q9.** Your API version `/v1/cards/reissue` is deprecated. You need to sunset it in 90 days while routing existing clients to `/v2/cards/reissue` with a different response structure. How do you manage this migration in Spring Boot with minimal client disruption?

**Q10.** A Spring Boot service deployed in Kubernetes is receiving requests before it has finished loading its card policy data (from the `ApplicationRunner`). Health checks are passing too early. How do you fix the readiness probe integration?

**Q11.** Your authorization service's `@Async` method is silently swallowing exceptions — failed transactions are not being flagged. How do you implement proper async exception handling and ensure failures surface to the caller or a monitoring system?

---

## Follow-up / Deep Dive Questions (12)

**Q1.** Walk me through how you designed the Spring Boot REST APIs for the card reissue workflow — what was the endpoint structure, how did you handle idempotency, and what validation logic lived in the controller vs. service layer?

**Q2.** You mentioned cross-team collaboration for low-latency financial APIs — how did you define and enforce the API contract between UI and backend? Did you use OpenAPI/Swagger, contract testing (Pact), or something else?

**Q3.** In your authorization backend, how did you structure `@ControllerAdvice` to distinguish between validation errors, business rule violations, downstream service failures, and unexpected system errors?

**Q4.** How did you handle backward compatibility when evolving your card reissue API across releases? Did any breaking changes require versioning, and how did you manage the transition?

**Q5.** Explain how you configured `@Transactional` boundaries in your batch pipeline vs. your REST API layer — were the propagation levels different, and why?

**Q6.** How does Spring Boot's `WebMvcConfigurer` allow you to customize the MVC framework? What customizations have you applied — CORS, message converters, argument resolvers?

**Q7.** How do you manage secrets (DB passwords, API keys, JWT signing keys) in your Spring Boot services in production? Walk through the approach — env vars, Vault, AWS Secrets Manager, or Kubernetes secrets?

**Q8.** How do you write integration tests for a Spring Boot REST controller? What is the difference between `@SpringBootTest` + `MockMvc`, `@WebMvcTest`, and `RestAssured` — and when do you use each?

**Q9.** How does Spring Boot's condition evaluation order work when multiple `@Conditional` annotations are applied to the same bean? What happens if conditions conflict?

**Q10.** In your payment authorization service, how do you ensure that your REST API degrades gracefully when a downstream policy service is unavailable — returning a safe default decision vs. failing hard?

**Q11.** How do you tune the embedded Tomcat thread pool in Spring Boot for a high-concurrency authorization API? What are the key properties (`max-threads`, `accept-count`, `connection-timeout`), and how do you size them?

**Q12.** Walk through a performance bottleneck you diagnosed and fixed in one of your Spring Boot APIs — what was the symptom, how did you profile it, and what was the root cause?

---

*Topic 2 of 16 — Generated from work experience profile: Lead Software Engineer, UST Global / Cognizant / Solverminds*
