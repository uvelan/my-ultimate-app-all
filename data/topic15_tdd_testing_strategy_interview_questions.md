# Topic 15 of 16 — TDD & Testing Strategy

**Domain:** Engineering Practices
**Complexity:** Intermediate–Advanced
**Profile:** Senior/Lead Backend Engineer — Fintech/Payments

---

## Topic Overview

| Concept | Description |
|---------|-------------|
| TDD | Red-Green-Refactor cycle — test first, make it pass, clean it up |
| Test Pyramid | Unit → Integration → E2E — proportion and purpose of each layer |
| Unit Testing | Isolated, fast, deterministic — JUnit 5, Mockito, AssertJ |
| Integration Testing | Real dependencies — @SpringBootTest, Testcontainers, @DataJpaTest |
| Contract Testing | Consumer-driven contracts — Pact, Spring Cloud Contract |
| Mutation Testing | Validating test quality — PIT (PITest) mutation coverage |
| Test Doubles | Mock, Stub, Spy, Fake, Dummy — correct usage per scenario |
| BDD | Behaviour-Driven Development — Cucumber, Gherkin scenarios |
| Performance Testing | Load, stress, soak testing — JMeter, Gatling, k6 |
| Testcontainers | Docker-based integration testing — real DB, Kafka, Redis in tests |
| WireMock | HTTP stub server for testing external service integrations |
| Test Data Management | Builders, fixtures, factories — maintaining test data consistency |
| Shift-Left Testing | Moving testing earlier in the development lifecycle |
| Code Coverage | Line, branch, mutation coverage — meaningful vs vanity metrics |

---

## Basic Questions (13)

**Q1.** What is Test-Driven Development (TDD)? Describe the Red-Green-Refactor cycle with a concrete example from a card authorization validation rule.

**Q2.** What is the test pyramid? What are the three layers, what is the recommended proportion of each, and why does inverting the pyramid (many E2E, few unit tests) cause problems?

**Q3.** What is the difference between a Mock, a Stub, a Spy, a Fake, and a Dummy? Give a concrete example of each in the context of testing a card authorization service.

**Q4.** What is the difference between `@Mock` and `@InjectMocks` in Mockito? How does `@ExtendWith(MockitoExtension.class)` wire them together in a JUnit 5 test?

**Q5.** What is the difference between `@SpringBootTest` and `@WebMvcTest` and `@DataJpaTest`? When would you use each for testing a card reissue REST controller?

**Q6.** What is `verify()` in Mockito? What is the difference between `verify(mock).method()`, `verify(mock, times(2)).method()`, and `verifyNoInteractions(mock)`?

**Q7.** What is `@ParameterizedTest` in JUnit 5? How do you use `@MethodSource`, `@CsvSource`, and `@ValueSource` to test a policy validation rule against multiple input combinations?

**Q8.** What is `AssertJ`? What advantages does it provide over JUnit's `assertEquals` for asserting complex objects like authorization response DTOs?

**Q9.** What is the difference between integration testing and unit testing? Why can't unit tests alone give you confidence that a Spring Boot authorization service is correct?

**Q10.** What is a test fixture? What problems arise when tests share mutable fixtures, and how do `@BeforeEach` and `@AfterEach` manage fixture lifecycle?

**Q11.** What is code coverage? What is the difference between line coverage, branch coverage, and mutation coverage — and why can 100% line coverage still leave bugs undetected?

**Q12.** What is `@TestPropertySource` and `@ActiveProfiles` in Spring Boot tests? How do you use them to configure test-specific properties for an authorization service test?

**Q13.** What is a flaky test? What are the most common causes of test flakiness in a Spring Boot microservices test suite, and how do you systematically eliminate them?

---

## Intermediate Questions (13)

**Q1.** How do you implement TDD for a card authorization policy rule — "decline any transaction above $10,000 from a new card (< 90 days old)"? Walk through the full Red-Green-Refactor cycle, including the edge cases you would write tests for before writing any production code.

**Q2.** How do you use Testcontainers in a Spring Boot integration test to spin up a real PostgreSQL database and a real Redis instance for testing the card policy cache and authorization persistence layer?

**Q3.** How do you implement consumer-driven contract testing between a React frontend and a Spring Boot authorization API using Pact or Spring Cloud Contract? Walk through the contract definition, verification, and CI integration.

**Q4.** How do you test a Spring Batch card reissue job end-to-end using `JobLauncherTestUtils` — asserting on `JobExecution` exit status, step execution counts, and the database state after the job completes?

**Q5.** How do you use WireMock to stub a downstream fraud detection service in an integration test for the authorization service — simulating both success responses and timeout/error scenarios?

**Q6.** How do you implement mutation testing using PITest (PIT) in a Spring Boot project? What is a mutation, what is a survived mutation, and how do you interpret the mutation coverage report for a policy validation module?

**Q7.** How do you test a Spring WebFlux reactive endpoint using `WebTestClient` — asserting on response status, body content, and headers — and how do you use `StepVerifier` to test the underlying `Mono`/`Flux` pipeline in isolation?

**Q8.** How do you implement a test data builder (also known as the Object Mother or Test Builder pattern) for a `CardAuthorizationRequest` object — providing sensible defaults and fluent overrides — to reduce test setup boilerplate across 200 test cases?

**Q9.** How do you test `@Async` methods in Spring Boot — ensuring that the async execution completes before your test assertions run — without introducing `Thread.sleep()` or brittle polling loops?

**Q10.** How do you implement `@DataJpaTest` for a Spring Data JPA repository that queries card authorization records — configuring an in-memory H2 database, loading test data via SQL scripts, and asserting on query results?

**Q11.** How do you test a Kafka consumer in a Spring Boot service using an embedded Kafka broker (`@EmbeddedKafka`) — publishing a card authorization event and asserting that the consumer processes it correctly and updates the database?

**Q12.** How do you implement BDD-style tests using Cucumber for a card reissue workflow — writing Gherkin scenarios for business-readable test cases and wiring them to Spring Boot step definitions?

**Q13.** How do you implement a performance test for a card authorization API using Gatling or k6 — defining a load profile (ramp-up, steady-state, peak), asserting on p99 latency and error rate, and integrating it into the CI pipeline?

---

## Advanced Questions (12)

**Q1.** How do you design a testing strategy for a card payment microservices platform — covering unit, integration, contract, component, and E2E tests — specifying what each layer tests, what it mocks, and what confidence it provides? How do you balance test coverage with build time?

**Q2.** How do you implement property-based testing in Java using jqwik or QuickCheck-style libraries for a card authorization policy engine — generating thousands of random transaction inputs and asserting invariants (e.g., "a transaction above the limit is never approved") rather than specific input-output pairs?

**Q3.** How do you implement a test isolation strategy for a microservices integration test suite — ensuring that tests running in parallel don't share database state, Kafka topics, or Redis keys — using Testcontainers, database-per-test, or transaction rollback?

**Q4.** How do you implement a chaos engineering test harness for a card authorization service — injecting latency, errors, and resource exhaustion in a controlled test environment — and asserting that the service meets its resilience requirements (circuit breaker trips, fallback activates, SLA degrades gracefully)?

**Q5.** How do you implement a golden master (approval testing) strategy for a card reissue batch job — capturing the output of the current implementation as the approved baseline and asserting that future runs produce byte-identical output — detecting any behavioural regression automatically?

**Q6.** How do you implement a test pyramid enforcement mechanism in a CI pipeline — measuring the ratio of unit to integration to E2E tests, failing the build if the ratio inverts, and generating a test type distribution report per module?

**Q7.** How do you implement a database migration test — verifying that each Flyway migration script produces the correct schema state, is idempotent, and can be rolled back — using Testcontainers with a real PostgreSQL instance in a dedicated migration test suite?

**Q8.** How do you implement observability-driven testing — using production metrics (error rate, p99 latency, cache hit rate) as test assertions in a staging environment — to validate that a new deployment meets production SLOs before traffic is shifted?

**Q9.** How do you implement test sharding and parallelisation in a large Spring Boot test suite (5,000+ tests) — distributing tests across multiple CI agents, managing shared Testcontainer resources, and aggregating coverage reports — to keep build time under 10 minutes?

**Q10.** How do you implement a security testing layer — OWASP ZAP for DAST, dependency vulnerability scanning (OWASP Dependency-Check, Snyk), and static analysis (SpotBugs, SonarQube) — integrated into the CI pipeline for a PCI-DSS compliant card payment service?

**Q11.** How do you implement a canary analysis testing framework — automatically comparing error rates, latency distributions, and business metrics between the canary and the baseline using statistical significance tests — before promoting a new authorization service version to production?

**Q12.** How do you implement test-driven API design — writing consumer tests before implementing the Spring Boot REST endpoint — using Spring Cloud Contract to generate server-side tests and client-side stubs simultaneously from a single contract definition?

---

## Scenario-Based Questions (11)

**Q1.** A production bug is found in the card authorization policy engine — a transaction is approved when it should be declined because a compound rule condition has an off-by-one error in the daily spend calculation. Walk through how you use TDD to reproduce the bug with a failing test, fix it, and prevent regression.

**Q2.** Your card reissue test suite has 3,000 unit tests and 50 integration tests. The integration tests take 45 minutes to run, blocking CI for every merge request. How do you restructure the test suite to reduce total CI time to under 10 minutes without reducing confidence?

**Q3.** A senior engineer argues that TDD slows down development and proposes removing the test-first requirement for the authorization policy module. How do you make the case for TDD — referencing specific defect types it prevents in a financial rules engine?

**Q4.** Your team's test coverage is 85% line coverage, but a critical authorization bug slips through to production. A post-mortem reveals the bug was in an untested branch of a compound conditional. How do you use branch coverage and mutation testing to identify and close this coverage gap?

**Q5.** A Testcontainers-based integration test is starting a new PostgreSQL container for every test class — 200 containers over the test run — causing the CI server to OOM. How do you implement container reuse across test classes using the singleton container pattern?

**Q6.** Your card authorization service has a `@Scheduled` job that expires stale authorization holds every hour. How do you write a deterministic test for this job without waiting a real hour — using `@MockBean` for the clock, `Clock.fixed()`, and testing the expiry logic in isolation?

**Q7.** A WireMock stub for the fraud detection service is returning a hardcoded 200ms delay in tests. When the real fraud service starts taking 2 seconds in production, the tests still pass because the stub doesn't reflect reality. How do you make your WireMock stubs more realistic and contract-aligned?

**Q8.** After a library upgrade, 500 tests fail with `NullPointerException` in Mockito because `@MockBean` reset behaviour changed. How do you diagnose the root cause, fix the tests systematically without touching each one individually, and prevent this class of breakage in future upgrades?

**Q9.** A new compliance requirement mandates that all card authorization business rules must have 100% branch coverage. The policy engine has 150 rules, each with 3–5 branches. How do you design a scalable, maintainable test suite that achieves this coverage without writing 750 individual test methods?

**Q10.** Your team is building a new card fraud detection microservice. The service has no existing tests, and the deadline is in 3 weeks. How do you prioritise which tests to write first — using risk-based testing to identify the highest-value test cases that give the most confidence with the least effort?

**Q11.** A performance test reveals that the card authorization API handles 2,000 TPS in the test environment but only 800 TPS in production under the same load. The test environment uses an H2 in-memory database while production uses PostgreSQL. How do you redesign your performance test environment to produce results that accurately predict production behaviour?

---

## Follow-up / Deep Dive Questions (12)

**Q1.** How did you apply TDD in your card authorization or reissue project at UST — did you write tests before production code, or did you write tests alongside? Walk through a specific feature where TDD shaped the design.

**Q2.** What was your testing strategy for the policy validation engine — how did you cover the rule combinations, and how did you ensure that a new rule didn't break existing rules' behaviour?

**Q3.** How did you test the Spring Batch card reissue jobs — did you use `JobLauncherTestUtils`, Testcontainers, or a separate test database? What was the most challenging batch job scenario to test?

**Q4.** How did you handle test data management across a large test suite — did you use a shared test database, per-test transaction rollback, or Testcontainers with a fresh DB per test class? What were the trade-offs?

**Q5.** How did you integrate testing into your CI/CD pipeline — what stages ran unit tests, integration tests, and performance tests, and what were the gates that blocked a merge or deployment?

**Q6.** Walk me through the most complex test you wrote in your career — what was the system under test, what made it hard to test, and how did you design the test to be reliable and maintainable?

**Q7.** How did you use Mockito in your Spring Boot projects — what did you mock, what did you prefer to test with real implementations, and did you ever overuse mocking in a way that led to tests that didn't catch real bugs?

**Q8.** How did you measure and improve test quality in your team — did you use mutation testing, code coverage gates, or peer review of tests? What was the culture around testing, and how did you influence it as a lead engineer?

**Q9.** How did you test the React.js policy configuration dashboard — did you use React Testing Library, Cypress, or Storybook? How did you handle testing components that depended on real API calls?

**Q10.** How did you handle testing across the boundary between the React frontend and the Spring Boot backend — did you use contract tests, end-to-end tests with a running backend, or WireMock stubs? What gave you the most confidence?

**Q11.** How do you write tests for code that is hard to test — static methods, final classes, time-dependent logic, random number generation — without refactoring the production code? When is refactoring for testability justified?

**Q12.** As a lead engineer, how do you establish and enforce testing standards across a team of 6–8 engineers — code review checklists, pair programming on test design, automated coverage gates, or team-level testing workshops?

---

*Topic 15 of 16 — Generated from work experience profile: Lead Software Engineer, UST Global / Cognizant / Solverminds*
