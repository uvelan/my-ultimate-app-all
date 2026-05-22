# Topic 14 of 16 — Data Pipeline & Analytics API Design

**Domain:** Data Layer / System Design
**Complexity:** Intermediate
**Profile:** Senior/Lead Backend Engineer — Fintech/Payments / Data Engineering

---

## Topic Overview

| Concept | Description |
|---------|-------------|
| Data Pipeline | Sequence of data processing stages — ingest, transform, validate, load |
| ETL vs ELT | Extract-Transform-Load vs Extract-Load-Transform — when each applies |
| Batch vs Streaming | Scheduled bulk processing vs real-time event-driven processing |
| Aggregation API | REST endpoints that compute and serve summarised business metrics |
| Chart Data API | Backend that shapes raw data into chart-ready formats (series, labels, values) |
| Time-Series Data | Append-only data ordered by timestamp — query and storage patterns |
| Data Partitioning | Organising large datasets for efficient analytical queries |
| AutoML Pipeline | Automated feature engineering, model selection, and evaluation |
| Checkpointing | Fault-tolerant pipeline progress tracking for restart/resume |
| Data Validation | Schema checks, referential integrity, business rule validation on ingested data |
| Caching | Pre-computed aggregations, TTL-based freshness for dashboard APIs |
| Observability | Pipeline metrics — records processed, error rates, lag, throughput |

---

## Basic Questions (13)

**Q1.** What is a data pipeline? What are the typical stages — ingestion, transformation, validation, loading, and serving — and how do they apply to a card transaction analytics system?

**Q2.** What is the difference between ETL (Extract-Transform-Load) and ELT (Extract-Load-Transform)? When is ELT preferred over ETL for financial analytics?

**Q3.** What is the difference between batch processing and stream processing? Give a concrete example of when you would use each for card transaction data.

**Q4.** What is a time-series dataset? What makes it different from a standard relational table, and what are the key query patterns (range scan, aggregation, downsampling) it must support?

**Q5.** What is a REST API aggregation endpoint? How does it differ from a raw CRUD endpoint in terms of query complexity, caching strategy, and response shape?

**Q6.** What is data validation in a pipeline context? What is the difference between schema validation, referential integrity validation, and business rule validation?

**Q7.** What is checkpointing in a data pipeline? Why is it essential for long-running batch jobs, and how does it enable restart-from-failure without full reprocessing?

**Q8.** What is a data partition? How does partitioning by date improve query performance for a card transaction analytics API serving date-range queries?

**Q9.** What is a data aggregation? What is the difference between pre-computed aggregation (materialised view, summary table) and on-demand aggregation (query-time GROUP BY)?

**Q10.** What is idempotency in a data pipeline? Why is it critical that a pipeline stage can be safely re-executed after a failure without producing duplicate records?

**Q11.** What is the difference between a fact table and a dimension table in a star schema? Give an example from a card payment analytics model.

**Q12.** What is data lineage? Why is it important for financial reporting and regulatory compliance to know exactly which source data produced a given analytical output?

**Q13.** What is a dead letter queue in a pipeline context? How do you handle records that consistently fail validation or transformation without halting the entire pipeline?

---

## Intermediate Questions (13)

**Q1.** How do you design a chart data API in Spring Boot that returns time-series authorization approval rates — aggregated by hour, day, or week — shaped as `{ labels: [...], series: [...] }` for direct consumption by a React chart component?

**Q2.** How do you implement a pre-aggregation strategy for a card transaction analytics dashboard — computing hourly and daily summaries in a background job and serving them from a summary table — to avoid expensive real-time GROUP BY queries on 500-million-row tables?

**Q3.** How do you design a flexible aggregation API that supports multiple grouping dimensions (by issuer, by merchant category, by card product, by date) and multiple metrics (approval rate, avg amount, transaction count) with a single endpoint?

**Q4.** How do you implement caching for an analytics API that returns card authorization metrics — what is the TTL strategy, how do you handle cache invalidation when new transaction data arrives, and how do you serve stale-while-revalidate for high-availability?

**Q5.** How do you implement a data validation pipeline in Spring Boot that validates incoming card transaction records against: (1) schema constraints, (2) referential integrity (valid card, valid merchant), and (3) business rules (amount > 0, valid currency code) — and routes invalid records to a dead letter store?

**Q6.** How do you implement checkpointing for a batch data pipeline that processes daily card transaction files — persisting the last successfully processed record ID so the pipeline can resume from that point after a failure?

**Q7.** How do you design an API that returns the top 10 merchants by transaction volume for a given issuer and date range — optimised for a dashboard that refreshes every 30 seconds? How do you balance freshness and query cost?

**Q8.** How do you implement a streaming data pipeline using Spring WebFlux and `Flux` to process card authorization events from Kafka in real time — computing a rolling 5-minute approval rate and publishing updates to a Server-Sent Events endpoint?

**Q9.** How do you implement a multi-stage data transformation pipeline in Java — cleaning raw card transaction data (normalizing merchant names, correcting currency codes, enriching with BIN metadata) — as a chain of composable transformation functions?

**Q10.** How do you implement data downsampling for a time-series card transaction dashboard — storing per-minute data for the last 24 hours, per-hour data for the last 30 days, and per-day data for the last 2 years — with an automatic rollup job?

**Q11.** How do you design an analytics API that must serve both real-time data (last 1 hour, from Kafka/Redis) and historical data (older than 1 hour, from the data warehouse) — with a single endpoint that transparently merges both sources?

**Q12.** How do you implement pagination for an analytics API that returns large result sets — for example, all card transactions for an issuer over a 6-month period — using cursor-based pagination to ensure consistent results under concurrent inserts?

**Q13.** How do you implement data quality monitoring for a card analytics pipeline — tracking metrics like null rate per column, value distribution drift, record count vs expected count — and alerting when quality thresholds are breached?

---

## Advanced Questions (12)

**Q1.** How do you design a lambda architecture for a card payment analytics platform — combining a batch layer (daily Spark jobs over historical data), a speed layer (Kafka Streams for real-time metrics), and a serving layer (query API merging both) — and what are its operational trade-offs vs a Kappa architecture?

**Q2.** How do you implement a real-time fraud analytics pipeline that computes per-card feature vectors (transaction velocity, avg amount, geo-spread) in a 5-minute rolling window — using Kafka Streams or Flink — and serves them to the authorization service with sub-10ms lookup latency?

**Q3.** How do you design a multi-tenant analytics API for a card payment platform — where each issuer can only query their own transaction data — with row-level security at the API layer, the query layer, and the storage layer, without duplicating data per tenant?

**Q4.** How do you implement an AutoML pipeline for card transaction classification — automated feature selection, model training (decision tree, gradient boosting), hyperparameter tuning, cross-validation, and model versioning — with minimal manual intervention?

**Q5.** How do you implement a columnar storage strategy for card transaction analytics — using Apache Parquet on S3 with partition pruning by date and issuer — and serve it via a query engine (Athena, Trino, DuckDB) exposed through a Spring Boot analytics API?

**Q6.** How do you implement a change data capture (CDC) pipeline using Debezium to stream card transaction inserts and updates from PostgreSQL to a downstream analytics store — ensuring exactly-once delivery and handling schema changes in the source table?

**Q7.** How do you implement a data mesh architecture for a card payment platform — where the authorization team, the fraud team, and the risk team each own and publish their own data products — with discoverability, contract versioning, and cross-domain querying?

**Q8.** How do you implement a backfill pipeline for a new analytics metric — computing a historical fraud score for 3 years of card transactions — while the live pipeline continues processing new transactions, without resource contention or data inconsistency?

**Q9.** How do you implement a sampling strategy for a high-volume analytics API — returning a statistically representative sample of card transactions for a large date range — ensuring the sample is deterministic, reproducible, and unbiased across issuers?

**Q10.** How do you implement schema evolution in a data pipeline — handling changes to the card transaction event schema (new fields, renamed fields, type changes) — without breaking downstream consumers using Avro Schema Registry or JSON Schema versioning?

**Q11.** How do you implement a cost-optimised tiered storage strategy for card transaction analytics data — hot tier (PostgreSQL, last 30 days), warm tier (Parquet on S3, last 2 years), cold tier (Glacier, older) — with a query federation layer that transparently routes queries to the correct tier?

**Q12.** How do you implement a real-time dashboard backend that serves 10,000 concurrent dashboard users — each polling for their issuer's authorization metrics every 5 seconds — without hammering the database? Design the caching, push vs pull strategy, and connection management.

---

## Scenario-Based Questions (11)

**Q1.** The card authorization metrics dashboard is showing data that is 3 hours stale because the pre-aggregation job is failing silently. How do you implement pipeline health monitoring — detecting stale data, alerting on lag, and surfacing pipeline status to the dashboard — so stale data never reaches the issuer without a warning?

**Q2.** A new issuer requests a custom analytics report — daily authorization volume by merchant category, with a 12-month trend line and a peer comparison against industry benchmarks. Design the API, the data model, and the aggregation pipeline to support this report.

**Q3.** Your card analytics pipeline ingests 10GB of transaction data daily from an SFTP source. The ingestion job is taking 6 hours, causing the dashboard to show yesterday's data all day. How do you redesign the pipeline for incremental ingestion — processing only new records since the last run?

**Q4.** A data quality check finds that 0.5% of card transaction records have negative amounts due to a bug in an upstream system. These records are corrupting the daily revenue aggregations. How do you implement a validation gate that quarantines invalid records without halting the pipeline or losing data?

**Q5.** The analytics API serving the card dashboard is being hit by 500 concurrent requests every minute, each triggering a full GROUP BY query on a 200-million-row table. DB CPU is at 95%. Design an immediate mitigation and a long-term architecture fix.

**Q6.** An issuer's compliance team requests a point-in-time reconstruction of all authorization decisions made on a specific date 18 months ago, including the policy rule versions active at that time. How do you design your analytics data model and pipeline to support this historical reconstruction?

**Q7.** Your pipeline processes card transaction files from 50 different issuers, each with a slightly different CSV format. A new issuer sends a file with an unexpected encoding (UTF-16), causing the pipeline to fail silently and drop all their records. How do you make the ingestion stage format-agnostic and resilient to encoding variations?

**Q8.** The automated ML pipeline for card fraud prediction is producing model outputs that don't match the training-time metrics in production — a training-serving skew. How do you instrument the pipeline to detect feature distribution drift between training data and live prediction inputs?

**Q9.** An analytics API endpoint that returns a merchant-level breakdown of authorization declines is being used by an issuer to reverse-engineer another issuer's transaction patterns through careful comparison of shared merchant data. How do you implement differential privacy or data aggregation thresholds to prevent cross-issuer data leakage?

**Q10.** Your card analytics pipeline is writing to both a PostgreSQL OLTP database and an S3-based data lake simultaneously. A partial failure causes the OLTP write to succeed but the S3 write to fail for 10,000 records. How do you detect and reconcile this inconsistency without reprocessing the entire day's data?

**Q11.** A real-time card dashboard is fetching data via polling every 5 seconds per widget, with 20 widgets per dashboard and 1,000 concurrent dashboard users — generating 4,000 requests/second against your analytics API. Redesign the data delivery model to eliminate polling without sacrificing data freshness.

---

## Follow-up / Deep Dive Questions (12)

**Q1.** Walk me through the APIs you built at Solverminds for the Automated Prediction tool — what chart types did you serve, how did you shape the data for the frontend, and what aggregation logic lived in the backend vs the database?

**Q2.** How did you design the data pipeline for the Vessel Scorecard system — what were the data sources, the transformation steps, the output format, and how did you handle data quality issues in the source data?

**Q3.** How did you implement the automated ML pipeline for the Automated Prediction tool — what was the level of user intervention required, what models did you evaluate, and how did you expose the prediction results via REST API?

**Q4.** How did you design the chart data API responses — did you return raw data and let the frontend aggregate, or did you pre-shape the response for specific chart types? What drove that decision?

**Q5.** How did you handle large analytical queries in your Spring Boot APIs — did you paginate results, stream them, or cache pre-computed summaries? What was the largest dataset you served via a REST API?

**Q6.** How did you implement data validation for the transaction data in your analytics pipeline — what validation rules did you apply, how did you handle invalid records, and how did you report validation failures?

**Q7.** How did you implement checkpointing in your data processing pipelines — was this Spring Batch's `JobRepository`, a custom checkpoint table, or a file-based approach? How did you test restart-from-checkpoint behaviour?

**Q8.** How did you ensure the analytics API performed well under concurrent dashboard load — what caching strategy did you use, and how did you measure and tune API response times?

**Q9.** How did you model time-series transaction data in your relational database — what was the schema, what indexes did you create for time-range queries, and did you use any partitioning?

**Q10.** How did you handle the integration between the data pipeline and the frontend chart components — was there a fixed API contract, and how did you manage changes to the chart data format without breaking the frontend?

**Q11.** If you were to redesign the Automated Prediction tool's backend today using modern tooling — Apache Kafka for streaming, Apache Spark for batch processing, Parquet on S3 for storage, and Trino for query federation — what would the architecture look like?

**Q12.** How did you manage pipeline failures in production — what alerting did you set up, how did you implement retry logic, and how did you communicate data freshness status to the frontend so users knew when data was stale?

---

*Topic 14 of 16 — Generated from work experience profile: Lead Software Engineer, UST Global / Cognizant / Solverminds*
