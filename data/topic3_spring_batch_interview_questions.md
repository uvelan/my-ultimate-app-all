# Topic 3 of 16 — Spring Batch — Batch Job Architecture

**Domain:** Spring Ecosystem
**Complexity:** Advanced
**Profile:** Senior/Lead Backend Engineer — Fintech/Payments

---

## Topic Overview

| Concept | Description |
|---------|-------------|
| Job / Step | Top-level execution unit / individual phase of a job |
| Chunk Model | Read → Process → Write in configurable chunk sizes |
| ItemReader / Processor / Writer | Core SPI for data pipeline stages |
| JobRepository | Metadata store for job execution state |
| Retry / Skip | Fault-tolerance policies per step |
| Partitioning | Parallel step execution across data partitions |
| Scheduling | Triggering jobs via Spring Scheduler, Quartz, or external triggers |

---

## Basic Questions (13)

**Q1.** What is Spring Batch? How is it different from a regular scheduled task (`@Scheduled`)?

**Q2.** What are the core components of Spring Batch — `Job`, `Step`, `JobInstance`, `JobExecution`, `StepExecution`? How do they relate to each other?

**Q3.** What is the chunk-oriented processing model in Spring Batch? What are the three phases in each chunk?

**Q4.** What is a `JobRepository`? What does it store, and why is it essential for restartability?

**Q5.** What is the difference between `JobInstance` and `JobExecution`? Can a single `JobInstance` have multiple `JobExecutions`?

**Q6.** What are `ItemReader`, `ItemProcessor`, and `ItemWriter`? What does each return, and what does returning `null` from `ItemProcessor` mean?

**Q7.** What is `JobParameters`? How do you make a job uniquely identifiable across runs using parameters?

**Q8.** What is `StepExecutionContext` vs `JobExecutionContext`? What kind of data would you store in each?

**Q9.** What are the built-in `ItemReader` implementations in Spring Batch? Name at least four with their use cases.

**Q10.** What is `chunk size` (commit interval)? How does it affect memory usage and transaction behaviour?

**Q11.** What does `@EnableBatchProcessing` do in Spring Boot? What changes in Spring Boot 3.x regarding this annotation?

**Q12.** What is a `Tasklet`? When would you use a `Tasklet` instead of a chunk-oriented step?

**Q13.** What are exit statuses and batch statuses in Spring Batch? What is the difference between `COMPLETED`, `FAILED`, and `STOPPED`?

---

## Intermediate Questions (13)

**Q1.** How does Spring Batch implement restartability? What configuration is required on the `Job` and `Step` to allow a failed job to resume from where it left off?

**Q2.** How do you implement skip logic in Spring Batch? What is the difference between `skipLimit`, `noSkip`, and `skipPolicy`? How do you log skipped records without failing the job?

**Q3.** How do you implement retry logic in Spring Batch? What is the difference between `retryLimit`, `noRetry`, and `retryPolicy`? How does retry interact with chunk transaction rollback?

**Q4.** Explain the `FlatFileItemReader` configuration — how do you map a CSV to a domain object using `DefaultLineMapper`, `DelimitedLineTokenizer`, and `BeanWrapperFieldSetMapper`?

**Q5.** How do you implement a `JdbcCursorItemReader` vs `JdbcPagingItemReader`? What are the concurrency and memory implications of each approach?

**Q6.** How does Spring Batch handle transactions in chunk processing? What happens if the `ItemWriter` throws an exception mid-chunk? Is the entire chunk rolled back?

**Q7.** How do you pass data between steps in Spring Batch? Explain `ExecutionContext` promotion via `ExecutionContextPromotionListener`.

**Q8.** How do you implement conditional step flow in Spring Batch using `on()`, `to()`, and `from()` in the `JobBuilder` DSL? Give a real-world example for a card reissue pipeline.

**Q9.** How do you implement a `CompositeItemProcessor`? When is this preferable over a single processor with multiple responsibilities?

**Q10.** How does `JobOperator` differ from `JobLauncher`? How would you use `JobOperator` to stop, restart, or abandon a running job programmatically?

**Q11.** How do you implement a multi-step job where one step's output is the next step's input — without persisting intermediate results to a database?

**Q12.** How do you unit test a Spring Batch `Step` in isolation using `StepScopeTestExecutionListener` and `JobScopeTestExecutionListener`?

**Q13.** How does `@StepScope` work in Spring Batch? Why is it needed for `ItemReader` beans that use `JobParameters` at runtime, and what is the proxy mechanism behind it?

---

## Advanced Questions (12)

**Q1.** How does Spring Batch partitioning work? Explain the `Partitioner` → `PartitionHandler` → `StepExecutionSplitter` flow. What is the difference between local and remote partitioning?

**Q2.** How do you implement parallel steps in Spring Batch using `SimpleAsyncTaskExecutor` vs `ThreadPoolTaskExecutor`? What shared state issues can arise, and how do you make `ItemReader` thread-safe?

**Q3.** You have a card reissue batch job processing 10 million records. How do you design the partitioning strategy — by account range, by issuer, or by modulo hashing — to ensure balanced partition sizes and avoid hotspots?

**Q4.** How does Spring Batch integrate with Spring Integration or Kafka for event-driven job triggering? Walk through a design where a card batch job is triggered by an S3 file arrival event.

**Q5.** How do you implement a `ClassifierCompositeItemWriter` to route processed records to different writers based on record type (e.g., approved reissues to DB, rejected records to a dead-letter file)?

**Q6.** Explain the internal lifecycle of a chunk transaction in Spring Batch — from `doRead()` through `doProcess()` to `doWrite()`. At what point is the transaction committed, and how does the `TransactionAttribute` on the step affect this?

**Q7.** How do you implement fault-tolerant batch processing where a single bad record in a 10,000-record chunk doesn't roll back the entire chunk? Explain the `fault-tolerant()` step configuration and the scan/re-process mechanism Spring Batch uses.

**Q8.** How do you implement a dynamic `ItemReader` that queries different database partitions or tables based on a runtime parameter (e.g., processing card records per issuer bank)?

**Q9.** How do you monitor and observe Spring Batch jobs in production? What metrics does Spring Batch expose via Micrometer, and how do you build alerting around job failures and step duration SLAs?

**Q10.** How does Spring Batch 5.x (Spring Boot 3.x) differ from Spring Batch 4.x? What are the breaking changes around `@EnableBatchProcessing`, the `JobRepository` configuration, and Jakarta EE migration?

**Q11.** How do you implement an idempotent Spring Batch job that can be safely re-triggered without reprocessing already-completed records? Discuss watermarking, processed-flag columns, and `JobInstanceAlreadyCompleteException` handling.

**Q12.** How do you tune chunk size dynamically based on system load or record complexity? Is there a Spring Batch mechanism for adaptive chunking, or does this require a custom implementation?

---

## Scenario-Based Questions (11)

**Q1.** Your card reissue batch job processes 5 million records nightly. It fails at record 3.2 million due to a downstream service timeout. How do you configure the job to resume from record 3.2 million the next morning without reprocessing completed records?

**Q2.** A batch job writing card account updates to the database is causing table-level lock contention during peak hours. How do you redesign the job to reduce locking — batch insert size, isolation level, or write ordering?

**Q3.** You need to process card reissue records and simultaneously write approved records to the core banking DB and rejected records to an audit CSV file. How do you implement this with a single pass through the data?

**Q4.** A compliance requirement mandates that every card reissue batch run produces an immutable audit trail of all processed records with their outcomes. How do you implement this without impacting job throughput?

**Q5.** Your Spring Batch job is running sequentially and taking 6 hours to process monthly card statements. Leadership wants it under 1 hour. Walk through your partitioning and parallelization strategy end-to-end.

**Q6.** A batch job is skipping records silently due to a misconfigured `skipLimit`. In production, 10,000 records were silently dropped without alerting. How do you retrofit proper skip auditing and alerting into the existing job?

**Q7.** Your batch job reads from a `JdbcCursorItemReader` over a large card transaction table. After running for 2 hours, the DB connection times out mid-job. How do you make the reader resilient to connection drops?

**Q8.** A new business rule requires that card reissue records be processed in strict account-number order within each issuer group. How do you enforce ordering guarantees in a partitioned, parallel Spring Batch job?

**Q9.** You need to trigger a Spring Batch card reissue job automatically when a file is dropped into an SFTP location, without polling every minute. Design the event-driven trigger mechanism.

**Q10.** Your batch job uses `@StepScope` readers that depend on `JobParameters`. During parallel partitioned execution, you observe that all partitions are reading the same data subset. Diagnose the cause and fix the scoping issue.

**Q11.** A batch job that pre-loads card policy data (`ApplicationRunner`) is being executed multiple times due to Kubernetes pod restarts, causing duplicate data in the policy cache. How do you make the pre-load step idempotent and safe for concurrent pod startup?

---

## Follow-up / Deep Dive Questions (12)

**Q1.** Walk me through your Spring Batch pipeline for the card reissue workflow — what were the steps, what did each reader/processor/writer do, and how did you handle failures mid-job?

**Q2.** You mentioned pre-loading data models via a Spring Boot pipeline — was this a Spring Batch job or an `ApplicationRunner`? How did you handle the case where the pre-load itself fails on startup?

**Q3.** How did you configure the `JobRepository` datasource in your project — did you use an in-memory H2 for dev and a production PostgreSQL/Oracle schema? How did you manage schema migrations for batch metadata tables?

**Q4.** What was your chunk size for the card reissue job, and how did you arrive at that number? Did you benchmark different sizes, and what metrics guided the decision?

**Q5.** How did you handle the case where your `ItemWriter` (writing to core banking DB) was slower than your `ItemReader` (reading from staging DB)? Did backpressure become an issue?

**Q6.** How does Spring Batch's `RepeatTemplate` underpin the chunk read loop? What is the relationship between `CompletionPolicy`, `ExceptionHandler`, and the chunk iteration cycle?

**Q7.** What is the difference between `SimpleJobLauncher` running synchronously vs asynchronously? How do you expose a REST endpoint to trigger a batch job asynchronously and poll for its completion status?

**Q8.** How do you implement a "dry run" mode for a Spring Batch job where all processing logic executes but no writes are committed — for pre-production validation of a card reissue batch?

**Q9.** How do you handle `OutOfMemoryError` in a Spring Batch job that reads large BLOBs or XML payloads per record? What streaming strategies do you apply in the reader and processor?

**Q10.** How does Spring Batch's `ItemStream` interface work? What is the contract of `open()`, `update()`, and `close()`, and why is it critical for restartable cursor-based readers?

**Q11.** How would you implement a Spring Batch job that processes records from a Kafka topic instead of a database — using a custom `KafkaItemReader`? What are the offset management and exactly-once challenges?

**Q12.** How do you implement a master-worker Spring Batch architecture across multiple JVM instances (remote partitioning) using Spring Integration message channels? What coordination mechanism ensures each partition is processed exactly once?

---

*Topic 3 of 16 — Generated from work experience profile: Lead Software Engineer, UST Global / Cognizant / Solverminds*
