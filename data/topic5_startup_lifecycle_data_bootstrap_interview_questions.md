# Topic 5 of 16 — Application Startup Lifecycle & Data Bootstrap

**Domain:** Spring Ecosystem
**Complexity:** Intermediate
**Profile:** Senior/Lead Backend Engineer — Fintech/Payments

---

## Topic Overview

| Concept | Description |
|---------|-------------|
| SpringApplication.run() | Entry point — bootstraps context, triggers lifecycle phases |
| ApplicationContext Refresh | Bean definition loading → post-processing → instantiation → initialization |
| ApplicationRunner / CommandLineRunner | Hooks executed after context is fully refreshed — ideal for data bootstrap |
| @PostConstruct | Bean-level initialization hook — runs after dependency injection |
| ApplicationEvents | Lifecycle events: `ContextRefreshedEvent`, `ApplicationReadyEvent`, `ApplicationStartedEvent` |
| Data Preloading | Eagerly loading reference data (card policies, config) into memory/cache on startup |
| HikariCP | Default Spring Boot connection pool — startup validation and pool sizing |
| Readiness vs Liveness | Kubernetes probe alignment with Spring Boot startup state |
| Startup Failure Safety | Idempotent bootstrap, failure isolation, graceful degradation |

---

## Basic Questions (12)

**Q1.** What is the difference between `ApplicationRunner` and `CommandLineRunner` in Spring Boot? Which would you prefer for a data preloading task, and why?

**Q2.** What is `@PostConstruct`? At what point in the bean lifecycle does it execute relative to constructor injection and `@Autowired` field injection?

**Q3.** What is the Spring Boot application startup sequence from `SpringApplication.run()` to the first request being served? Name the key phases in order.

**Q4.** What is `ApplicationReadyEvent`? How does it differ from `ContextRefreshedEvent`, and which is the safer hook for triggering post-startup data loading?

**Q5.** What is `@Order` in Spring Boot? How does it control the execution order of multiple `ApplicationRunner` beans?

**Q6.** What is the difference between eager and lazy bean initialization in Spring Boot? How does `spring.main.lazy-initialization=true` affect startup time and first-request latency?

**Q7.** What is `SmartLifecycle`? How does it differ from `ApplicationRunner` for managing startup and shutdown ordering of components?

**Q8.** What is HikariCP? What are the key connection pool properties (`maximum-pool-size`, `minimum-idle`, `connection-timeout`) and their defaults in Spring Boot?

**Q9.** What is `@DependsOn`? When would you use it to enforce bean initialization ordering?

**Q10.** What is the difference between Spring Boot's liveness probe and readiness probe? Which one should reflect whether the data bootstrap has completed?

**Q11.** What is `ApplicationContext.getBean()` called programmatically at startup? What are the risks of pulling beans manually vs. relying on injection?

**Q12.** What is `InitializingBean`? How does it compare to `@PostConstruct`, and which is preferred in modern Spring Boot applications?

---

## Intermediate Questions (13)

**Q1.** You need to preload 500,000 card policy records from the database into an in-memory cache on startup. Where in the startup lifecycle do you trigger this, and how do you ensure the DB connection pool is ready before the load begins?

**Q2.** How does `ApplicationReadyEvent` vs `ApplicationStartedEvent` differ in terms of when they fire relative to `ApplicationRunner` execution? Which event is safe to use for triggering async background tasks?

**Q3.** How do you implement ordered, multi-phase data bootstrap in Spring Boot — for example, load reference data first, then load dependent policy rules that reference that data?

**Q4.** How do you make a data bootstrap step idempotent so that Kubernetes pod restarts or rolling deployments don't corrupt shared state (e.g., duplicate records in a policy cache)?

**Q5.** How does Spring Boot's `ApplicationContext` refresh differ between a standard web application context (`AnnotationConfigServletWebServerApplicationContext`) and a reactive context (`AnnotationConfigReactiveWebServerApplicationContext`)?

**Q6.** How do you implement a startup health indicator that keeps the readiness probe `OUT_OF_SERVICE` until the data bootstrap completes, preventing traffic from being routed to a pod that isn't ready?

**Q7.** What is `BeanDefinitionRegistryPostProcessor`? How does it differ from `BeanFactoryPostProcessor`, and when would you use it to dynamically register bean definitions based on database configuration at startup?

**Q8.** How do you handle startup failures in an `ApplicationRunner`? If the preload fails, should the application context fail to start entirely, or should the service start in a degraded mode with a fallback?

**Q9.** How does Spring Boot's auto-configuration for `DataSource` work at startup? What happens if the database is unavailable when the application starts — does HikariCP fail fast or retry?

**Q10.** How do you implement a startup cache warm-up that loads data from both a database and a remote config service in parallel, combining results before the service accepts traffic?

**Q11.** How does `@Lazy` on a bean definition interact with `ApplicationRunner`? If an `ApplicationRunner` depends on a `@Lazy` bean, when is that bean actually instantiated?

**Q12.** How do you expose startup progress metrics — number of records loaded, time taken per phase, errors encountered — via Spring Boot Actuator for operational visibility?

**Q13.** How does Spring Boot 3.x's startup actuator endpoint (`/actuator/startup`) work? What does it report, and how do you use it to diagnose slow startup phases in a payment service?

---

## Advanced Questions (11)

**Q1.** Your card authorization service preloads 2 million policy rules at startup. The preload takes 45 seconds, during which Kubernetes kills the pod because the liveness probe times out. Design a startup architecture that keeps the liveness probe healthy during preload while keeping the readiness probe `DOWN` until data is fully loaded.

**Q2.** How does Spring Boot's `AbstractApplicationContext.refresh()` coordinate bean post-processors, auto-configurations, and event publishing? Walk through the internal call sequence from `invokeBeanFactoryPostProcessors()` to `finishRefresh()`.

**Q3.** How do you implement a multi-tier startup sequence: (1) load static reference data, (2) validate against a remote service, (3) build an in-memory index — where each phase must complete successfully before the next begins, with rollback on failure?

**Q4.** How does `SmartLifecycle.getPhase()` control the ordering of component startup and shutdown across multiple beans? What is the significance of `DEFAULT_PHASE`, and how would you design phase ordering for a payment service with a cache, a Kafka consumer, and an HTTP server?

**Q5.** How do you implement zero-downtime data bootstrap refresh — updating the in-memory policy cache while the service continues serving requests — using a read-write lock or copy-on-write strategy?

**Q6.** How does GraalVM Native Image affect Spring Boot's startup lifecycle? What startup optimizations does AOT compilation provide, and what constraints does it impose on dynamic bean registration and reflection-based bootstrap logic?

**Q7.** How do you implement a distributed startup lock using Redis or a database-backed mutex to ensure that only one pod in a multi-instance deployment executes the data bootstrap, with other pods waiting and then reading the bootstrapped data?

**Q8.** What is the interaction between Spring Boot's `DataSourceInitializer` (schema/data SQL execution), Flyway/Liquibase migrations, and `ApplicationRunner` data loading? What is the correct ordering, and how do you enforce it?

**Q9.** How does `SpringApplication.setDefaultProperties()` vs `SpringApplicationBuilder.properties()` vs environment variables affect the property resolution order at startup? What is the full `PropertySource` priority chain in Spring Boot?

**Q10.** How do you implement a startup self-test in a payment service — verifying DB connectivity, cache reachability, downstream service availability, and data integrity — before marking the service as ready, with structured pass/fail reporting?

**Q11.** How does HikariCP's connection validation at startup (`connectionTestQuery` vs `connectionInitSql` vs JDBC4 `isValid()`) affect startup time? What is the safest configuration for a payment service connecting to a high-availability DB cluster?

---

## Scenario-Based Questions (11)

**Q1.** Your Spring Boot payment service starts successfully but processes the first few authorization requests with stale policy data because the `ApplicationRunner` bootstrap hasn't finished yet. How do you gate request processing until bootstrap is complete?

**Q2.** A Kubernetes rolling deployment causes 3 new pods to start simultaneously. Each pod's `ApplicationRunner` tries to insert bootstrap reference data, causing duplicate key violations. How do you make the bootstrap idempotent and safe for concurrent pod startup?

**Q3.** Your data bootstrap `ApplicationRunner` loads from a remote config service that is temporarily unavailable at startup. The application fails to start entirely. Redesign the bootstrap to start in degraded mode with cached/fallback data and retry in the background.

**Q4.** The card policy preload takes 3 minutes at startup. Your Kubernetes `initialDelaySeconds` is set to 30 seconds, so the liveness probe kills the pod repeatedly. What is the correct probe configuration strategy, and how do you signal Kubernetes that the slow startup is expected?

**Q5.** After a code deployment, you notice that the new pod's `ApplicationRunner` is executing twice — once on startup and once when a `ContextRefreshedEvent` fires due to a child context refresh (e.g., Spring Security). How do you prevent double execution?

**Q6.** Your bootstrap loads 1 million records sequentially. It works in dev (small dataset) but takes 8 minutes in production. How do you parallelize the bootstrap load using `CompletableFuture` or a thread pool while maintaining data consistency in the final in-memory structure?

**Q7.** A memory leak is observed after each deployment — the old bootstrap data isn't being garbage collected because a static `Map` holds strong references. How do you redesign the cache structure to support hot-reload without memory leaks?

**Q8.** Your service uses an `ApplicationRunner` to pre-validate all card BIN ranges against a checksum algorithm at startup. The validation is CPU-intensive and blocks the startup thread for 2 minutes. How do you move this off the main startup thread without losing the readiness gate?

**Q9.** In a multi-module Spring Boot application, two `ApplicationRunner` beans in different modules both try to initialize the same shared cache. The order of execution is non-deterministic, causing race conditions. How do you enforce safe, ordered, single-execution bootstrap across modules?

**Q10.** Your preloaded card policy cache becomes stale 30 minutes after startup because policies are updated in the database by an admin UI. How do you implement a background refresh mechanism that reloads only changed policies without a full restart?

**Q11.** During startup, your `ApplicationRunner` performs a schema validation check against the database. In a blue-green deployment, the new version's schema check fails against the old database schema that hasn't been migrated yet. How do you decouple schema migration timing from application startup?

---

## Follow-up / Deep Dive Questions (12)

**Q1.** Walk me through the Spring Boot pipeline you designed to pre-load essential data models for the card reissue workflow — what data was loaded, how was it structured in memory, and how did you handle partial load failures?

**Q2.** How did you ensure the preloaded data was consistent with the database state at the moment of load — did you use a transaction, a snapshot isolation level, or a version/timestamp check?

**Q3.** How did you test the startup bootstrap in isolation — did you write integration tests that verify the in-memory state after `ApplicationRunner` execution?

**Q4.** If the preloaded card policy data were to grow 10x, how would you redesign the bootstrap to avoid loading everything into heap memory — would you use an off-heap cache, a distributed cache, or a lazy-loading strategy?

**Q5.** How does the `ApplicationRunner` interact with Spring Batch in your project — did the preload runner execute before or after batch job initialization, and was ordering ever a problem?

**Q6.** How does `@PostConstruct` interact with Spring's proxy mechanism — if a bean is proxied (e.g., for `@Transactional`), does `@PostConstruct` execute on the proxy or the raw bean, and what are the implications?

**Q7.** What happens to in-flight requests when your service shuts down? How do you implement graceful shutdown — draining in-flight requests, completing the current batch chunk, and flushing the cache — using `SmartLifecycle` and `server.shutdown=graceful`?

**Q8.** How does Spring Boot's `ApplicationContext` handle circular dependencies during startup? When does it fail fast vs. resolve via proxy, and have you encountered circular dependency issues in your payment service startup?

**Q9.** How do you implement startup performance profiling in a Spring Boot application? What tools (`spring.jmx.enabled`, `-XX:+PrintGCDetails`, startup actuator, async profiler) help you identify which bean or phase is causing slow startup?

**Q10.** How does `SpringApplication.setBannerMode(OFF)` and other `SpringApplication` customizations affect startup behaviour? What other startup customizations have you applied in your production services?

**Q11.** How do you handle environment-specific bootstrap behaviour — loading a small synthetic dataset in dev/test, a subset in staging, and the full production dataset — using Spring profiles and `@ConditionalOnProfile`?

**Q12.** How does the startup lifecycle differ between a monolithic Spring Boot application and a microservice that depends on other services being available? How do you implement health-check-based startup ordering in a Docker Compose or Kubernetes environment?

---

*Topic 5 of 16 — Generated from work experience profile: Lead Software Engineer, UST Global / Cognizant / Solverminds*
