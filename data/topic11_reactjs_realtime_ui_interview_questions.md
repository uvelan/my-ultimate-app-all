# Topic 11 of 16 — React.js Architecture & Real-Time UI

**Domain:** Frontend
**Complexity:** Intermediate
**Profile:** Senior/Lead Full-Stack Engineer — Fintech/Payments

---

## Topic Overview

| Concept | Description |
|---------|-------------|
| Component Architecture | Functional components, composition, props/state boundaries |
| State Management | useState, useReducer, Context API, Redux, Zustand |
| Side Effects | useEffect, data fetching, subscriptions, cleanup |
| API Integration | Axios/Fetch, error handling, loading states, optimistic updates |
| Real-Time Updates | WebSocket, Server-Sent Events (SSE), polling strategies |
| Form Handling | Controlled components, validation, React Hook Form |
| Performance Optimisation | useMemo, useCallback, React.memo, lazy loading, virtualisation |
| Role-Based UI | Conditional rendering based on user roles and permissions |
| TypeScript Integration | Typed props, hooks, API responses, discriminated unions |
| Testing | React Testing Library, Jest, Cypress for E2E |
| Dashboard Design | Data visualisation, chart libraries, responsive layouts |
| Backend Integration | REST consumption, contract alignment, CORS, auth headers |

---

## Basic Questions (13)

**Q1.** What is the difference between a controlled and an uncontrolled component in React? Give an example of each in a form for configuring card authorization limits.

**Q2.** What is the difference between `useState` and `useReducer`? When would you choose `useReducer` for managing the state of a policy configuration form with multiple interdependent fields?

**Q3.** What is `useEffect`? What is the dependency array, and what happens when it is empty (`[]`) vs omitted vs populated?

**Q4.** What is prop drilling? What problems does it cause in a large dashboard application, and what are the solutions?

**Q5.** What is the React Context API? When is it appropriate, and when does it become a performance problem?

**Q6.** What is `React.memo`? How does it differ from `useMemo` and `useCallback`? When does memoisation actually improve performance vs add unnecessary complexity?

**Q7.** What is the virtual DOM in React? How does the reconciliation algorithm determine what needs to be re-rendered?

**Q8.** What is a React key? Why is using array index as a key problematic in a sortable list of authorization policy rules?

**Q9.** What is lazy loading in React? How do `React.lazy` and `Suspense` work together to code-split a large policy dashboard?

**Q10.** What is the difference between `useEffect` and `useLayoutEffect`? Give a use case where `useLayoutEffect` is necessary.

**Q11.** What is an error boundary in React? How do you implement one, and where would you place error boundaries in a card issuer dashboard?

**Q12.** What is the difference between `fetch` and `axios` for making API calls in React? What does `axios` provide that `fetch` does not natively?

**Q13.** What is CORS? How does it affect a React frontend calling a Spring Boot backend on a different origin, and how do you configure CORS in Spring Boot?

---

## Intermediate Questions (13)

**Q1.** How do you implement a real-time authorization rule status dashboard using Server-Sent Events (SSE) from a Spring Boot WebFlux backend? Walk through the SSE endpoint on the server and the `EventSource` connection on the React client.

**Q2.** How do you implement optimistic UI updates in a React policy configuration form — immediately reflecting a rule change in the UI before the backend confirms it — and how do you roll back if the API call fails?

**Q3.** How do you manage global authentication state (JWT token, user role, issuer ID) in a React dashboard application? Compare Context + useReducer vs Redux Toolkit vs Zustand for this use case.

**Q4.** How do you implement role-based UI rendering in a React card issuer dashboard — showing different policy controls to a read-only auditor vs a full-access issuer admin — without leaking restricted UI elements into the DOM?

**Q5.** How do you implement pagination in a React table displaying 100,000 card reissue records — server-side pagination vs client-side pagination — and how do you handle URL-driven page state for shareable links?

**Q6.** How do you debounce a search input in a React policy search component to avoid firing an API call on every keystroke? Implement this with `useEffect` + `setTimeout` and explain why a custom `useDebounce` hook is cleaner.

**Q7.** How do you handle API errors consistently across a React dashboard — distinguishing between network errors, 4xx client errors, and 5xx server errors — and display meaningful feedback to the issuer without exposing internal error details?

**Q8.** How do you implement a data visualisation dashboard in React for card authorization metrics (approval rate, decline rate, fraud rate by MCC) using a chart library like Recharts or Chart.js? What are the performance considerations for real-time chart updates?

**Q9.** How do you implement form validation in a React policy configuration form using React Hook Form + Zod (or Yup) — including async validation that checks for rule conflicts against the backend before submission?

**Q10.** How do you implement WebSocket-based real-time updates in a React dashboard — connecting to a Spring Boot WebSocket endpoint, handling reconnection on disconnect, and updating a live authorization event feed?

**Q11.** How do you implement infinite scroll in a React card transaction feed — loading the next page as the user scrolls near the bottom — using `IntersectionObserver` and managing the accumulated data set?

**Q12.** How do you code-split a large React dashboard with 20+ routes using `React.lazy` and `Suspense`, and how do you implement a loading skeleton that matches the expected layout of each page to reduce perceived latency?

**Q13.** How do you implement a multi-step wizard in React for the card reissue configuration workflow — managing step state, validation per step, back-navigation without losing data, and final submission — using a single form state object?

---

## Advanced Questions (12)

**Q1.** How do you design a React component architecture for a large card issuer dashboard with 20+ features — distinguishing between container components, presentational components, feature modules, and shared UI primitives — to support independent team development without merge conflicts?

**Q2.** How does React's concurrent rendering model (React 18) differ from the legacy synchronous rendering model? How do `useTransition` and `useDeferredValue` help keep the policy configuration UI responsive during expensive re-renders?

**Q3.** How do you implement a real-time collaborative policy editor in React — where two issuer admins can edit the same rule set simultaneously — with conflict detection, last-write-wins, or operational transform semantics backed by a WebSocket server?

**Q4.** How do you implement a micro-frontend architecture for a card payment platform — where the authorization dashboard, reissue management, and fraud monitoring are independently deployable React applications composed at runtime — using Module Federation (Webpack 5)?

**Q5.** How do you design a performant React data grid that renders 10,000 card transaction rows with sorting, filtering, and inline editing — using virtualisation (`react-window` or `TanStack Virtual`) to maintain 60fps scrolling?

**Q6.** How do you implement a Redux Toolkit slice for authorization policy state — with async thunks for CRUD operations, optimistic updates, rollback on failure, and derived selectors using `createSelector` (Reselect) for memoised computed state?

**Q7.** How do you implement a WebSocket connection manager in React that handles: initial connection, authentication via JWT header, heartbeat/ping-pong, exponential backoff reconnection, and graceful cleanup on component unmount — as a reusable custom hook?

**Q8.** How do you implement end-to-end type safety between a Spring Boot REST API and a React TypeScript frontend — generating TypeScript types from OpenAPI spec using `openapi-typescript`, and validating runtime API responses with Zod?

**Q9.** How do you implement a React query layer using TanStack Query (React Query) for the policy configuration dashboard — covering cache invalidation, background refetching, stale-while-revalidate, and mutation with optimistic updates?

**Q10.** How do you implement Content Security Policy (CSP), XSS prevention, CSRF protection, and secure JWT storage in a React financial dashboard? What are the trade-offs between storing JWT in `localStorage`, `sessionStorage`, and `httpOnly` cookies?

**Q11.** How do you implement a feature flag system in a React dashboard — allowing individual UI features (new policy controls, experimental rule editor) to be toggled per issuer or per user without a deployment — using a LaunchDarkly-style client or a custom backend-driven flag API?

**Q12.** How do you implement server-side rendering (SSR) or static generation (SSG) for a React card issuer dashboard using Next.js — and when does SSR make sense for a financial dashboard that requires authentication and serves personalised, real-time data?

---

## Scenario-Based Questions (11)

**Q1.** Your React policy configuration dashboard re-renders the entire rule table every time any single rule is edited, causing a 500ms freeze on large rule sets. Walk through your diagnosis using React DevTools Profiler and your optimisation strategy — memoisation, virtualisation, or state restructuring.

**Q2.** An issuer admin submits a policy rule change through the dashboard. The API call succeeds but the table doesn't reflect the update because the local state wasn't refreshed. How do you implement a reliable state synchronisation strategy without full page reload?

**Q3.** Your real-time authorization event feed (SSE) disconnects after 30 seconds due to a proxy timeout in the production environment. The `EventSource` API doesn't automatically reconnect with the last event ID. How do you implement resilient SSE reconnection with event replay from the last received ID?

**Q4.** The card issuer dashboard loads 50 API calls on initial render — one per dashboard widget — causing a waterfall of requests and a 6-second time-to-interactive. How do you redesign the data fetching strategy to reduce initial load time to under 1 second?

**Q5.** A security audit finds that your React dashboard stores the issuer's JWT in `localStorage`, making it vulnerable to XSS attacks. How do you migrate to `httpOnly` cookie-based token storage without disrupting the current user session management flow?

**Q6.** Your policy rule editor allows issuers to input JavaScript-like expressions for custom rule conditions. A penetration test finds that these expressions are being `eval()`'d on the client side, creating an XSS vector. How do you redesign the expression evaluation safely?

**Q7.** The React dashboard is served from a CDN, but issuer-specific policy data (fetched from the Spring Boot backend) is being cached at the CDN layer, causing one issuer to see another issuer's policy rules. How do you fix the CDN caching configuration and prevent data leakage?

**Q8.** An issuer reports that the real-time authorization metric charts on their dashboard are showing stale data — the SSE connection is open but the chart isn't updating. Diagnose the possible causes (stale closure in `useEffect`, missing state update, memoised component not re-rendering) and fix them.

**Q9.** Your React dashboard needs to support 5 languages for international card issuers. How do you implement internationalisation (i18n) using `react-i18next` — covering dynamic string loading, number/currency formatting, RTL layout support, and date localisation?

**Q10.** A card issuer's compliance team requires that every policy rule change made through the dashboard produce an immutable audit log entry showing: who changed it, what changed (diff), when, and from which IP address. How do you implement this audit capture across the React frontend and Spring Boot backend?

**Q11.** Your React policy dashboard has grown to 150 components across 6 feature areas developed by 3 teams. Build times are 4 minutes, and a change in a shared utility breaks unrelated features. How do you restructure the repository — monorepo with Nx/Turborepo, component library extraction, or micro-frontends — to restore development velocity?

---

## Follow-up / Deep Dive Questions (12)

**Q1.** Walk me through the React.js policy configuration dashboard you built at UST — what were the key features, how did you structure the component tree, and how did you integrate it with the Spring Boot backend?

**Q2.** How did you implement real-time updates in the authorization monitoring dashboard — SSE, WebSocket, or polling — and what drove that technology choice?

**Q3.** How did you handle state management for the policy configuration forms — local component state, Context, or a global store? What was the complexity of the form state, and did you use a form library?

**Q4.** How did you implement role-based access control in the React dashboard — which roles existed, what UI differences existed between them, and how did you prevent privilege escalation on the client side?

**Q5.** How did you ensure seamless integration between the React frontend and Spring Boot backend — what was the API contract, how did you handle versioning, and what happened when the backend contract changed?

**Q6.** How did you handle loading states, error states, and empty states in the dashboard — did you have a design system or shared component library for these states, or were they handled ad hoc per feature?

**Q7.** What was the most complex React component you built for the dashboard? Walk through its state shape, the side effects it managed, and the performance challenges you faced.

**Q8.** How did you test the React components in the dashboard — React Testing Library unit tests, Storybook for visual testing, or Cypress for E2E? What was your testing strategy for a form that calls a live API?

**Q9.** How did you handle the UX for concurrent issuer admins — if two admins were editing the same policy rule simultaneously, how did the UI communicate the conflict and resolve it?

**Q10.** How did you manage API authentication from the React dashboard to the Spring Boot backend — JWT in headers, cookie-based sessions, or OAuth2 PKCE flow? How did you handle token refresh without interrupting the user?

**Q11.** How did you optimise the initial load performance of the React dashboard — what bundle size did you achieve, what code splitting did you apply, and what Lighthouse score did you target?

**Q12.** If you were to rebuild the policy dashboard today using the latest React ecosystem — React 18, TanStack Query, Zustand, TypeScript strict mode, Vite — what would you change from your current implementation, and why?

---

*Topic 11 of 16 — Generated from work experience profile: Lead Software Engineer, UST Global / Cognizant / Solverminds*
