# Topic 16 of 16 — Maven, Git & Engineering Practices

**Domain:** Engineering Practices
**Complexity:** Basic–Intermediate
**Profile:** Senior/Lead Backend Engineer — Fintech/Payments

---

## Topic Overview

| Concept | Description |
|---------|-------------|
| Maven | Build lifecycle, dependency management, plugin ecosystem, multi-module projects |
| Git | Distributed version control — branching, merging, rebasing, history management |
| Branching Strategy | GitFlow, trunk-based development, feature flags — team workflow models |
| CI/CD | Continuous Integration and Delivery — pipeline design, quality gates, deployment automation |
| Code Review | Pull request culture, review standards, constructive feedback, approval workflows |
| Static Analysis | SonarQube, SpotBugs, Checkstyle, PMD — automated code quality enforcement |
| Dependency Management | Version conflict resolution, BOM (Bill of Materials), dependency convergence |
| Release Management | Versioning (SemVer), release branches, hotfix strategy, changelog management |
| Agile / Scrum | Sprint ceremonies, backlog management, estimation, velocity, retrospectives |
| Technical Debt | Identification, quantification, prioritisation, and systematic reduction |
| Documentation | ADRs (Architecture Decision Records), API docs, runbooks, onboarding guides |
| Inner Source | Sharing code across teams — shared libraries, contribution models |

---

## Basic Questions (13)

**Q1.** What are the three phases of the Maven build lifecycle — `default`, `clean`, and `site`? What are the key phases within the `default` lifecycle in order?

**Q2.** What is the difference between `mvn compile`, `mvn test`, `mvn package`, `mvn install`, and `mvn deploy`? What does each produce and where does it go?

**Q3.** What is the difference between `<dependencies>` and `<dependencyManagement>` in a Maven POM? When do you use `<dependencyManagement>` in a parent POM?

**Q4.** What is a Maven BOM (Bill of Materials)? How does Spring Boot use a BOM to manage dependency versions, and how do you import a BOM into your POM?

**Q5.** What is the difference between `git merge` and `git rebase`? When would you prefer rebase over merge, and what is the golden rule of rebasing?

**Q6.** What is the difference between `git reset`, `git revert`, and `git restore`? When is each appropriate for undoing changes?

**Q7.** What is `git stash`? How do you stash, list, apply, and drop stashes, and what are the risks of leaving stashes for extended periods?

**Q8.** What is a Git tag? What is the difference between a lightweight tag and an annotated tag, and how are tags used in a release workflow?

**Q9.** What is the difference between `git fetch` and `git pull`? Why is `git fetch` + `git merge` safer than a direct `git pull` in a shared branch workflow?

**Q10.** What is a Maven plugin? What is the difference between a goal and a phase, and how do you bind a plugin goal to a specific lifecycle phase?

**Q11.** What is `git cherry-pick`? Give a real-world example of when you would use it in a financial payment service hotfix workflow.

**Q12.** What is Semantic Versioning (SemVer)? What do the MAJOR, MINOR, and PATCH version components represent, and when do you increment each for a card authorization service library?

**Q13.** What is a `.gitignore` file? What should always be excluded from a Spring Boot project repository, and what are the risks of accidentally committing secrets or compiled artefacts?

---

## Intermediate Questions (13)

**Q1.** How do you design a CI/CD pipeline for a Spring Boot card authorization service — covering stages for build, unit test, integration test, static analysis, Docker image build, staging deployment, smoke test, and production deployment with a manual approval gate?

**Q2.** How do you implement a multi-module Maven project for a card payment platform — with a parent POM, a `common` module, an `authorization-service` module, and a `reissue-service` module? How do you manage shared dependencies and avoid version conflicts across modules?

**Q3.** How do you resolve a Maven dependency conflict — two transitive dependencies pulling in different versions of the same library? What is the nearest-wins rule, how do you use `mvn dependency:tree` to diagnose, and how do you use `<exclusions>` and `<dependencyManagement>` to enforce the correct version?

**Q4.** How do you implement GitFlow for a card payment platform with multiple concurrent release streams — what are the `main`, `develop`, `feature/*`, `release/*`, and `hotfix/*` branch roles, and how does a hotfix flow from `main` back to `develop`?

**Q5.** How do you implement trunk-based development for a card authorization team — using feature flags to decouple deployment from release, keeping the main branch always deployable, and managing short-lived feature branches that merge within a day?

**Q6.** How do you implement SonarQube quality gates in a CI pipeline for a Spring Boot card service — what metrics do you enforce (coverage threshold, code smells, security hotspots, duplication), and how do you handle legacy code that already fails the gate?

**Q7.** How do you implement a Maven release plugin workflow — bumping version numbers, creating a release tag, deploying to Nexus/Artifactory, and preparing the next SNAPSHOT version — in a CI pipeline without manual intervention?

**Q8.** How do you implement a Git branching strategy for a team of 8 engineers working on a card authorization service, with two-week sprints, monthly releases, and occasional emergency hotfixes — balancing stability, velocity, and isolation?

**Q9.** How do you implement a code review standard for a fintech team — what are your mandatory review checklist items for a Spring Boot card authorization PR (correctness, security, test coverage, performance, backward compatibility)?

**Q10.** How do you manage secrets (database passwords, API keys, JWT signing keys) in a CI/CD pipeline — ensuring they are never committed to Git, injected safely at build or runtime, and rotated without redeployment?

**Q11.** How do you implement an Architecture Decision Record (ADR) process for a card payment platform — what format do you use, when is an ADR required, how is it reviewed and approved, and where is it stored relative to the codebase?

**Q12.** How do you implement dependency vulnerability scanning in a Maven CI pipeline — using OWASP Dependency-Check, Snyk, or GitHub Dependabot — and how do you handle a critical CVE found in a transitive dependency of your Spring Boot authorization service?

**Q13.** How do you implement a Maven wrapper (`mvnw`) in a Spring Boot project? What problem does it solve for cross-environment build reproducibility, and how do you enforce its use in the CI pipeline?

---

## Advanced Questions (12)

**Q1.** How do you design a monorepo build strategy for a card payment platform with 15 microservices in a single Git repository — using Maven reactor build ordering, incremental builds (only rebuilding changed modules), and parallel module builds — to keep CI build time under 5 minutes?

**Q2.** How do you implement a blue-green deployment pipeline for a card authorization service in Kubernetes — building the new image, deploying to the blue environment, running smoke tests, switching the load balancer, and keeping the green environment on standby for instant rollback?

**Q3.** How do you implement a canary release pipeline for a card authorization service — routing 5% of production traffic to the new version using Kubernetes traffic splitting (Argo Rollouts or Istio weighted routing), measuring error rate and latency, and automating promotion or rollback based on thresholds?

**Q4.** How do you implement GitOps for a card payment platform — using a separate Git repository as the source of truth for Kubernetes manifests, with ArgoCD or Flux syncing cluster state to the repository, and all environment changes made via pull requests?

**Q5.** How do you implement a Maven custom plugin to enforce team coding standards — for example, failing the build if any class in the `authorization` module has more than 300 lines, or if a `@Transactional` annotation is placed on a private method?

**Q6.** How do you implement a software supply chain security strategy for a card payment platform — SBOM (Software Bill of Materials) generation, artefact signing (Sigstore/Cosign), provenance attestation, and dependency pinning — to meet PCI-DSS software security requirements?

**Q7.** How do you implement a feature flag lifecycle management process — creating, rolling out, monitoring, and retiring feature flags for the card authorization policy engine — ensuring that stale flags don't accumulate as permanent technical debt?

**Q8.** How do you implement a Git history hygiene strategy for a long-lived card payment repository — enforcing commit message conventions (Conventional Commits), squashing fixup commits before merge, protecting main branch history, and generating automated changelogs from commit messages?

**Q9.** How do you implement a developer productivity metrics programme for a card payment engineering team — measuring DORA metrics (deployment frequency, lead time, change failure rate, MTTR) and using them to identify and address bottlenecks in the CI/CD pipeline?

**Q10.** How do you implement a shared library strategy for a card payment microservices platform — packaging common DTOs, exception types, authentication utilities, and logging configuration as versioned Maven artefacts — and managing the upgrade coordination challenge across 15 consuming services?

**Q11.** How do you implement a dependency update automation strategy — using Renovate Bot or Dependabot to automatically raise PRs for dependency updates, with auto-merge for patch updates, human review for minor updates, and manual approval for major updates — in a PCI-DSS compliant pipeline?

**Q12.** How do you implement an inner source model for a card payment platform — where the authorization team's policy engine library is consumed by 5 other teams — defining contribution guidelines, versioning contracts, deprecation policies, and a governance model that doesn't create a bottleneck for the owning team?

---

## Scenario-Based Questions (11)

**Q1.** A developer accidentally commits a database password to the Git repository for the card authorization service and pushes it to the remote. The secret has been in the repository for 3 hours. Walk through your incident response — rotating the secret, purging it from Git history, auditing access logs, and preventing recurrence.

**Q2.** Your Maven build is non-deterministic — it succeeds on a developer's machine but fails in CI with a different version of a transitive dependency. How do you diagnose the dependency resolution difference, enforce version pinning, and make the build hermetically reproducible?

**Q3.** A hotfix is needed for a critical authorization bug in production. The main branch already has 2 weeks of unreleased feature work. Walk through the complete Git workflow — branching from the release tag, applying the fix, testing, deploying, and merging back to main — without including unreleased features.

**Q4.** Your CI pipeline for the card authorization service takes 55 minutes end-to-end, blocking developer feedback loops. Walk through your systematic approach to identifying the slowest stages, parallelising test execution, caching Maven dependencies, and reducing total pipeline time to under 15 minutes.

**Q5.** SonarQube reports 450 code smells and 12 security hotspots in the card authorization codebase after a new quality gate is introduced. The team has a 2-week sprint with feature commitments. How do you prioritise and plan the remediation without disrupting the sprint?

**Q6.** A merge conflict arises between two feature branches for the card authorization service — one refactors the policy evaluation engine, the other adds a new rule type. Both touch the same 500-line class. How do you manage the conflict resolution — who resolves it, what process do you follow, and how do you verify correctness after resolution?

**Q7.** Your card payment platform has 15 microservices each with their own Git repository and Maven POM. Upgrading a shared `card-common` library from 1.2.0 to 2.0.0 (breaking change) requires coordinated updates across all 15 services. Design the upgrade coordination process — sequencing, testing, and rollout strategy.

**Q8.** A junior engineer on your team is consistently pushing large, multi-concern commits with messages like "fix stuff" and "WIP". Their PRs take 3 hours to review and frequently need to be split. How do you coach them on commit hygiene, PR sizing, and branch discipline without demotivating them?

**Q9.** Your CI pipeline deploys to production automatically on every merge to main. A bad merge introduces a null pointer exception that reaches 5% of authorization requests before being caught. How do you redesign the pipeline to add safety gates — automated rollback triggers, canary analysis, and minimum bake time — that would have caught this before full rollout?

**Q10.** The card authorization service has 8 years of Git history with 50,000 commits, many with no useful messages, large binary files accidentally committed, and secrets that were rotated but never purged. How do you clean up the repository history — using `git filter-repo` — while preserving meaningful history and coordinating the force-push with the team?

**Q11.** Your Agile team is consistently failing to complete sprint commitments for the card authorization service — velocity is unpredictable, stories are poorly estimated, and technical debt keeps resurfacing as unplanned work. As lead engineer, how do you diagnose the root causes and redesign the sprint planning and execution process?

---

## Follow-up / Deep Dive Questions (12)

**Q1.** Walk me through your typical Git workflow on the card authorization project at UST — what branching strategy did you use, how did PRs flow through review and merge, and how did you handle releases and hotfixes?

**Q2.** How did you structure the Maven build for your Spring Boot card payment projects — single-module or multi-module, what plugins did you configure, and how did you manage shared dependencies across services?

**Q3.** How did you implement CI/CD for your card authorization service — what pipeline tool (Jenkins, GitHub Actions, GitLab CI, Azure DevOps) did you use, what stages did the pipeline include, and what quality gates blocked a bad deployment?

**Q4.** How did you manage technical debt in the card reissue or authorization project — did you allocate sprint capacity for debt reduction, use a technical debt backlog, or address it opportunistically? What was the most impactful debt reduction you led?

**Q5.** How did you enforce code quality standards across the team — what static analysis tools did you use, what SonarQube gates did you enforce, and how did you handle disagreements about code style or architecture in code review?

**Q6.** How did you manage the Agile/Scrum ceremonies on your team — who ran the sprint planning, retrospectives, and daily standups, and what was your role as lead engineer in shaping the backlog and protecting the team from scope creep?

**Q7.** How did you handle dependency upgrades in your Spring Boot projects — were you proactive about keeping dependencies current, and how did you manage the risk of a Spring Boot major version upgrade (2.x → 3.x) in a live payment service?

**Q8.** How did you onboard new engineers to the card authorization codebase — did you have architecture documentation, ADRs, runbooks, or pairing sessions? What did you wish you had documented better?

**Q9.** How did you manage the release process for the card authorization service — what was the release cadence, how did you coordinate between backend and frontend teams, and how did you handle the case where a feature wasn't ready for the planned release date?

**Q10.** How did you use Git history and `git blame` / `git bisect` as diagnostic tools when debugging a production issue in the card authorization service? Walk through a specific incident where Git history helped you find the root cause.

**Q11.** What is your approach to writing commit messages — do you follow Conventional Commits, a team-specific convention, or write freeform? How do you enforce commit message standards across a team without being overly bureaucratic?

**Q12.** As a lead engineer, how do you balance engineering excellence — clean code, high test coverage, proper documentation, CI/CD hygiene — with business delivery pressure to ship features faster? Where do you draw the line, and how do you communicate trade-offs to non-technical stakeholders?

---

*Topic 16 of 16 — Generated from work experience profile: Lead Software Engineer, UST Global / Cognizant / Solverminds*
