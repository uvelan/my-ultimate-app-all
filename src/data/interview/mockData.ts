import { Question, Topic, FlashcardType } from '@/types/interview';

export const mockTopics: Topic[] = [
  { id: 'frontend', name: 'Frontend', count: 45, icon: 'Layout' },
  { id: 'backend', name: 'Backend', count: 32, icon: 'Server' },
  { id: 'database', name: 'Database', count: 28, icon: 'Database' },
  { id: 'system-design', name: 'System Design', count: 15, icon: 'Network' },
  { id: 'devops', name: 'DevOps & Cloud', count: 20, icon: 'Cloud' },
  { id: 'dsa', name: 'DSA', count: 50, icon: 'Code' },
];

export const mockQuestions: Question[] = [
  {
    id: 'q1',
    title: 'Explain React Server Components (RSC)',
    topic: 'frontend',
    difficulty: 'Hard',
    estimatedTime: 15,
    frequency: 85,
    companies: ['Vercel', 'Meta', 'Netflix'],
    tags: ['React', 'Next.js', 'SSR'],
    problemStatement: 'What are React Server Components, and how do they differ from Server-Side Rendering (SSR)?',
    expectation: 'Candidate should explain that RSCs run exclusively on the server, send zero JS to the client, and seamlessly integrate with Client Components. They should distinguish it from SSR which sends HTML first but still requires hydration and sends the JS bundle.',
    explanation: 'React Server Components (RSCs) allow you to write UI that renders and optionally caches on the server. Unlike SSR (where the component is rendered to HTML on the server but still ships its JS to the client to be hydrated), Server Components never ship their code to the client. This reduces bundle size drastically and allows direct access to backend resources like databases without building an API.',
    bestAnswer: 'React Server Components execute entirely on the server. They let you access backend resources directly and pass serialized data as props to Client Components. They differ from traditional SSR because traditional SSR hydrates the entire app on the client, meaning the component code must still be downloaded. RSCs do not require hydration, sending only the UI payload (a special JSON format) to the client.',
    commonMistakes: [
      'Confusing RSCs with SSR (Next.js pages/ router SSR).',
      'Thinking RSCs cannot have state (they cannot, but the distinction with Client Components is key).'
    ],
    followUpQuestions: [
      'How do you pass data from a Server Component to a Client Component?',
      'Can a Client Component import a Server Component?'
    ],
    realWorldUsage: 'Fetching data from a database directly inside the component without creating a REST API endpoint.',
    codeSnippet: {
      language: 'tsx',
      code: `// Server Component (app/page.tsx)
import db from './db';
import ClientInteractiveButton from './ClientInteractiveButton';

export default async function Page() {
  const users = await db.user.findMany(); // Direct DB access
  
  return (
    <div>
      <h1>Users</h1>
      {users.map(u => <div key={u.id}>{u.name}</div>)}
      <ClientInteractiveButton /> 
    </div>
  );
}`
    },
    mcqs: [
      {
        id: 'm1',
        question: 'Can a React Server Component use React hooks like useState?',
        options: [
          'Yes, it can use all hooks.',
          'No, because it does not run in the browser.',
          'Only useEffect is allowed.',
          'Yes, if marked with "use server".'
        ],
        correctAnswerIndex: 1,
        explanation: 'RSCs run only on the server and do not re-render like client components, so state and lifecycle hooks (useState, useEffect) are not supported.'
      }
    ]
  },
  {
    id: 'q2',
    title: 'Difference between == and .equals() in Java',
    topic: 'backend',
    difficulty: 'Easy',
    estimatedTime: 5,
    frequency: 95,
    companies: ['Amazon', 'JP Morgan', 'Google'],
    tags: ['Java', 'Core Java'],
    problemStatement: 'What is the difference between `==` and `.equals()` in Java, and how does autoboxing affect `==` comparisons with Integer objects?',
    expectation: 'Candidate must explain reference equality vs logical equality and mention the Integer cache (-128 to 127).',
    explanation: 'The `==` operator compares object references (memory addresses), while `.equals()` compares the logical value of the objects (if overridden). For Integer wrapper classes, Java caches values from -128 to 127. So `Integer a = 100; Integer b = 100; a == b` is true, but `Integer x = 200; Integer y = 200; x == y` is false.',
    bestAnswer: '`==` checks if both references point to the exact same object in memory. `.equals()` is a method that can be overridden to check if the state/content of two objects is logically equivalent. For primitive wrappers like `Integer`, `==` can yield unexpected results due to the Integer pool (caching values between -128 and 127).',
    commonMistakes: [
      'Assuming `==` works for all numbers even if they are wrapper objects.',
      'Forgetting that `.equals()` is defined in `Object` and defaults to `==` unless overridden.'
    ],
    followUpQuestions: [
      'What happens if you do not override hashCode() when overriding equals()?',
      'How does String intern pool affect == comparisons?'
    ],
    codeSnippet: {
      language: 'java',
      code: `Integer a = 100;
Integer b = 100;
System.out.println(a == b); // true (cached)

Integer x = 200;
Integer y = 200;
System.out.println(x == y); // false (different objects)
System.out.println(x.equals(y)); // true`
    }
  },
  {
    id: 'q3',
    title: 'Design a URL Shortener (System Design)',
    topic: 'system-design',
    difficulty: 'Hard',
    estimatedTime: 45,
    frequency: 90,
    companies: ['Google', 'Meta', 'Microsoft'],
    tags: ['System Design', 'Scalability'],
    problemStatement: 'Design a highly scalable URL shortening service like bit.ly. What is the database schema, how do you generate the short URL, and how do you handle high read traffic?',
    expectation: 'Candidate should discuss Base62 encoding, database indexing, caching strategies (Redis), and load balancing.',
    explanation: 'A URL shortener requires generating a unique short alias for a long URL. Using Base62 (a-z, A-Z, 0-9), a 7-character string can represent 62^7 = 3.5 trillion URLs. A relational DB or NoSQL DB can store the mapping. Since reads heavily outnumber writes (e.g., 100:1), caching the short->long mapping in Redis is crucial.',
    bestAnswer: '1. API: `shorten(long_url)` and `redirect(short_url)`. 2. Core Logic: Use a unique ID generator (like Snowflake) or auto-incrementing DB ID, then convert the ID to Base62 to get the short code. 3. DB: Table `urls(id, short_url, long_url, created_at)`. 4. Read Path: Check Redis cache for short_url. If miss, fetch from DB, update cache, and return 301/302 redirect.',
    commonMistakes: [
      'Using a hashing algorithm (like MD5) and taking the first 7 characters (leads to collisions).',
      'Ignoring read-heavy traffic caching.'
    ],
    followUpQuestions: [
      'Difference between HTTP 301 and 302 redirects?',
      'How do you handle generating unique IDs in a distributed system?'
    ]
  }
];

export const mockFlashcards: FlashcardType[] = [
  { id: 'f1', topic: 'frontend', front: 'What does CSS stand for?', back: 'Cascading Style Sheets' },
  { id: 'f2', topic: 'backend', front: 'What is a JWT?', back: 'JSON Web Token. A compact, URL-safe means of representing claims to be transferred between two parties.' },
  { id: 'f3', topic: 'database', front: 'What is an Index?', back: 'A database data structure that improves the speed of data retrieval operations at the cost of slower writes.' },
];
