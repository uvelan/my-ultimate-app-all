# Topic 1 of 16 — Java Evolution (7 → 8 → 11 → 17 → 21)

**Domain:** Java Platform
**Complexity:** Advanced
**Profile:** Senior/Lead Backend Engineer — Fintech/Payments

---

## Topic Overview

| Version | Key Features |
|---------|-------------|
| Java 8  | Lambdas, Streams, Optional, CompletableFuture, Date/Time API |
| Java 11 | Local-var in lambdas, HTTP Client, String API additions, removal of EE modules |
| Java 17 | Sealed classes, Pattern matching (instanceof), Records, strong encapsulation |
| Java 21 | Virtual Threads (Project Loom), Record Patterns, Pattern matching for switch, Sequenced Collections, Structured Concurrency (Preview), String Templates (Preview), Generational ZGC |

---

## Basic Questions (14)

**Q1.** What is the difference between `==` and `.equals()` in Java, and how does autoboxing affect `==` comparisons with Integer objects?

**Q2.** What are the four functional interfaces introduced in Java 8 — `Function`, `Predicate`, `Consumer`, `Supplier` — and what is the signature of each?

**Q3.** What is the difference between `map()` and `flatMap()` in the Stream API?

**Q4.** What does `Optional.orElse()` vs `Optional.orElseGet()` do differently? When does the difference matter in terms of performance?

**Q5.** What is a default method in an interface? Why was it introduced in Java 8?

**Q6.** What is a Record in Java 17? What methods does the compiler auto-generate for a record?

**Q7.** What is a sealed class? How does `permits` work, and what constraint does it impose on subclasses?

**Q8.** What is the `var` keyword introduced in Java 10? What are its limitations?

**Q9.** What is the new HTTP Client introduced in Java 11, and what are its advantages over the legacy `HttpURLConnection`?

**Q10.** What is `instanceof` pattern matching (Java 16+)? How does it simplify traditional casting?

**Q11.** What are Text Blocks (Java 15)? How do they differ from regular string literals in terms of indentation handling?

**Q12.** What are Sequenced Collections in Java 21? Which interfaces were introduced, and what gap did they fill?

**Q13.** What is the difference between `Iterable`, `Collection`, `List`, and `SequencedCollection` in the Java 21 type hierarchy?

**Q14.** What were the module system (JPMS) goals introduced in Java 9, and what problem does `module-info.java` solve?

---

## Intermediate Questions (13)

**Q1.** You have a list of transactions. Using Java 8 Streams, how would you group them by currency, filter only those above a threshold, and collect the sum per group — all in one pipeline?

**Q2.** Explain the difference between `parallelStream()` and a sequential stream. What are the hidden dangers of using `parallelStream()` in a Spring Boot service layer?

**Q3.** How does `CompletableFuture.thenCompose()` differ from `thenApply()`? Give a use case where composing is necessary.

**Q4.** Java 17 introduced strong encapsulation of JDK internals. How does this affect libraries that use reflection (e.g., Hibernate, Spring)? How do you resolve `InaccessibleObjectException`?

**Q5.** What is the difference between a `record` and a `final class` with all-args constructor + `equals`/`hashCode`? When would you NOT use a record?

**Q6.** Explain sealed interfaces used as result types. How does exhaustive `switch` pattern matching over a sealed type improve safety vs. traditional `if-instanceof` chains?

**Q7.** How do you migrate a Java 8 `Date`/`Calendar` codebase to `java.time`? What are the key mappings (`Date` → `Instant`, `Calendar` → `ZonedDateTime`, etc.)?

**Q8.** What is the difference between `Stream.collect(Collectors.toList())` and `Stream.toList()` introduced in Java 16? Is the result mutable?

**Q9.** How does the Java 11 HTTP Client handle asynchronous requests? Write a sketch of a non-blocking call using `sendAsync()` and `CompletableFuture`.

**Q10.** What is the difference between `Collectors.groupingBy()` and `Collectors.partitioningBy()`? Give a financial domain use case for each.

**Q11.** How do `switch` expressions (Java 14+) differ from `switch` statements? What is arrow-case syntax, and how does `yield` work inside a block?

**Q12.** What are the implications of removing `PermGen` space (Java 8 → Metaspace) for a Spring Boot application with heavy use of dynamic class loading?

**Q13.** How does `Optional` interact with serialization? Why is `Optional` not `Serializable`, and what is the recommended pattern when you need optional fields in a serializable DTO?

---

## Advanced Questions (12)

**Q1.** Java 21 introduced Virtual Threads (Project Loom). Explain the difference between platform threads and virtual threads at the JVM scheduling level. How does the JVM mount/unmount virtual threads on carrier threads?

**Q2.** Your Spring Boot 3.x application uses virtual threads via `spring.threads.virtual.enabled=true`. You observe that a downstream JDBC call is blocking a carrier thread. What is "thread pinning" in Loom, and how do you detect and resolve it?

**Q3.** How does Structured Concurrency (JEP 428/453 — Preview in Java 21) differ from using `ExecutorService` with `CompletableFuture`? What problem does `StructuredTaskScope` solve in terms of cancellation and error propagation?

**Q4.** Explain Generational ZGC introduced as default in Java 21. How does separating young/old generations improve GC pause times compared to non-generational ZGC in Java 15?

**Q5.** With Java 17 sealed classes and Java 21 pattern matching for switch, how would you model a credit card authorization result type that can be `Approved`, `Declined(reason)`, `Referral(agent)`, or `Error(code, message)` — and exhaustively handle all cases without `default`?

**Q6.** What are the performance implications of using Records as keys in a `HashMap`? How does the auto-generated `hashCode()` for records compare to a hand-tuned implementation for high-throughput maps?

**Q7.** Explain the JVM's string interning and `String.intern()` behavior across Java versions. How did compact strings (Java 9) change memory layout for ASCII-heavy workloads like financial transaction codes?

**Q8.** What are the trade-offs of adopting virtual threads vs. continuing with WebFlux/Project Reactor in a high-concurrency payment processing service? Under what conditions does WebFlux still win?

**Q9.** Describe the GraalVM Native Image compilation model. What Java features are problematic for ahead-of-time compilation (reflection, dynamic proxies, serialization), and how does Spring Boot 3's AOT engine address this?

**Q10.** How does the Java Memory Model (JMM) define happens-before relationships for `volatile` fields and `synchronized` blocks? How does this affect double-checked locking patterns — and is the Java 5+ fix correct on all JVMs?

**Q11.** How do Record Patterns (Java 21) extend destructuring? Give an example of nested record pattern matching in a switch expression for a payment event hierarchy.

**Q12.** Explain `invokedynamic` bytecode instruction introduced in Java 7 and how it underpins lambdas (Java 8), string concatenation optimization (Java 9), and the future of value types (Project Valhalla).

---

## Scenario-Based Questions (11)

**Q1.** You're migrating a payment processing service from Java 8 to Java 21. The service uses raw `Thread` pools, `synchronized` blocks, and legacy `Date`/`Calendar`. Describe your migration strategy — what do you modernize first, and what are the regression risks?

**Q2.** A Spring Batch job running on Java 21 suddenly shows degraded throughput after you enabled virtual threads. Profiling shows high "pinning" events. What could cause this, and how do you fix it without reverting to platform threads?

**Q3.** Your team proposes replacing all DTOs with Records. A junior engineer objects that "records can't be used as JPA entities." Explain why, and propose a clean architecture that uses records at the API boundary and JPA entities internally.

**Q4.** You need to represent all possible outcomes of a credit card authorization (approved, declined, error, referral, timeout) in a type-safe way that forces callers to handle every case at compile time. Design this using sealed interfaces and Java 21 pattern matching.

**Q5.** During a Java 17 migration, `sun.misc.Unsafe` usages in a third-party library throw `InaccessibleObjectException` at runtime. How do you diagnose this, apply a short-term fix via JVM flags, and plan a long-term resolution?

**Q6.** You observe that a `parallelStream()` on a large card transaction batch is causing unpredictable latency spikes. Describe how you'd diagnose whether ForkJoinPool thread starvation is the cause and how you'd fix it with a custom pool.

**Q7.** A downstream authorization service returns different response shapes depending on the transaction type. Using Java 21 pattern matching for switch and sealed types, how would you write a clean response handler without `instanceof` chains?

**Q8.** Your team uses `Optional` heavily in service return types. A new engineer starts chaining `.get()` calls without checks, causing `NoSuchElementException` in production. How do you enforce safe `Optional` usage at the team level — code review, static analysis, or API redesign?

**Q9.** You need to process 100,000 card records concurrently using Java 21 virtual threads with structured concurrency. How would you implement this using `StructuredTaskScope.ShutdownOnFailure()` ensuring that if any record fails, remaining tasks are cancelled and a meaningful error is surfaced?

**Q10.** A legacy service uses `java.util.Date` throughout its domain model. These dates are serialized to JSON via Jackson and stored in MongoDB. After upgrading to Java 21 and Spring Boot 3, you see timezone-related bugs in date comparisons. Trace the full cause and fix.

**Q11.** Your team disagrees on whether to use `var` in the codebase. Half the team says it reduces boilerplate; the other half says it hurts readability. Define clear team guidelines for when `var` is and isn't appropriate.

---

## Follow-up / Deep Dive Questions (12)

**Q1.** You mentioned migrating to Java 15 — what specific Java 8 patterns did you encounter that needed the most rework, and which Java 15 feature had the biggest impact on your codebase?

**Q2.** If you were to now target Java 21, which features would give you the most benefit in your current payment authorization system, and why?

**Q3.** How do virtual threads change the way you think about the thread-per-request model in Spring MVC vs. the event-loop model in WebFlux? Would you migrate your WebFlux services back to MVC given Java 21?

**Q4.** You used sealed classes in your authorization result types — walk me through how you structured the type hierarchy and how pattern matching eliminated defensive null/type checks in your service layer.

**Q5.** What JVM flags do you use in production for your Java 21 services? Walk through your GC configuration choices (ZGC vs G1) and the reasoning behind them for a latency-sensitive payment service.

**Q6.** How does `CompletableFuture` behave when exceptions occur inside `thenApply()` vs `handle()` vs `exceptionally()`? What happens if an exception is thrown in a stage and no handler is registered — is it silently swallowed?

**Q7.** You use `Stream.collect()` heavily. Explain how a custom `Collector` works — what are the four functions (`supplier`, `accumulator`, `combiner`, `finisher`) and how does `combiner` behave in a parallel stream context?

**Q8.** Explain the interplay between Java's type inference (`var`, generics, lambdas) and the compiler's ability to optimize at the bytecode level. How does type erasure affect generics at runtime, and where does it cause real bugs?

**Q9.** What is the internal representation of a lambda in bytecode? How does the JVM use `invokedynamic` + `LambdaMetafactory` to avoid generating anonymous class files — and what are the performance implications?

**Q10.** How would you benchmark the throughput difference between virtual threads and a fixed thread pool for a JDBC-heavy batch operation in your Spring Batch jobs? What JMH setup would you use, and what metrics would you track?

**Q11.** Records in Java are shallowly immutable — their fields are final, but if a field is a `List`, the list itself is mutable. How do you enforce deep immutability in a Record used as a value object in your domain model?

**Q12.** Walk through the Java 21 `SequencedCollection` API — which existing types now implement it, what was the design problem it solved, and how does it interact with `Collections.unmodifiableList()`?

---

*Topic 1 of 16 — Generated from work experience profile: Lead Software Engineer, UST Global / Cognizant / Solverminds*
