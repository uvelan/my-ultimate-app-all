'use server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';

import { createQuestion, updateQuestion, getQuestionById } from './interview';
import { normalizeQuestionTitle } from '@/lib/utils';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_PROMPT = `You are a Senior Staff Engineer, System Architect, Tech Lead, and FAANG-level Interviewer.

Your task is to generate a DEEPLY DETAILED interview learning module for the question or topic provided by the user.

You MUST respond with ONLY a valid JSON object. No markdown wrapper, no explanation outside the JSON.

The JSON MUST follow this EXACT schema:

{
  "title": "A concise, clear question title (e.g. 'How does the Java JVM Garbage Collector work?')",
  "topic": "One of: Java, Spring Boot, React, Next.js, Node.js, Microservices, Kafka, Redis, SQL, MongoDB, Docker, Kubernetes, AWS, System Design, DSA, TypeScript, JavaScript, Python, GraphQL, REST API, Security, Performance",
  "difficulty": "Easy | Medium | Hard",
  "estimatedTime": 20,
  "frequency": 85,
  "companies": ["Google", "Amazon", "Meta", "Netflix"],
  "tags": ["jvm", "garbage-collection", "memory-management", "performance"],
  "problemStatement": "The exact question as it would be asked in a real interview. Should be 1-3 sentences.",
  "expectation": "2-3 sentences describing what a strong senior candidate should cover in their answer.",
  "questionBreakdown": {
    "whatIsBeingTested": "What specific skill or knowledge the interviewer is evaluating",
    "whyItMatters": "Why this concept matters in real production systems",
    "seniorLevelDirection": "The angle a senior engineer should take when answering"
  },
  "answerEvolution": {
    "beginner": "A basic, surface-level answer a junior dev might give (2-4 sentences)",
    "intermediate": "A practical, project-oriented answer a mid-level dev gives (4-6 sentences)",
    "senior": "A production-aware answer a senior engineer gives (6-10 sentences with tradeoffs)",
    "staffArchitect": "An architectural, systems-thinking answer covering scalability, ops, tradeoffs (8-12 sentences)"
  },
  "inDepthExplanation": "A comprehensive 300-500 word markdown explanation covering: core theory, internal working, architecture-level understanding, lifecycle, performance implications, memory/threading/concurrency, scalability, security implications, and production tradeoffs. Use ### subheadings within this string.",
  "productionScenario": "A 150-250 word realistic enterprise story (Fintech/E-commerce/Healthcare/SaaS) describing where this concept caused a real problem, what the failure looked like, how it was debugged, and what the fix was.",
  "internalFlow": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
  "codeExamples": {
    "language": "java | javascript | typescript | python | sql",
    "beginner": "// Simple beginner code example\\ncode here",
    "production": "// Production-ready code with logging, exception handling, validation\\ncode here",
    "antiPattern": "// What NOT to do and why\\nbad code here"
  },
  "followUpQuestions": {
    "basic": ["Simple follow-up question 1", "Simple follow-up question 2"],
    "advanced": ["Advanced follow-up 1", "Advanced follow-up 2"],
    "trap": ["Tricky question that catches candidates off guard 1"]
  },
  "comparison": [
    {
      "feature": "Performance",
      "optionA": "Option A behavior",
      "optionB": "Option B behavior"
    },
    {
      "feature": "Scalability",
      "optionA": "Option A behavior",
      "optionB": "Option B behavior"
    }
  ],
  "performanceOptimization": "100-200 word explanation of bottlenecks, optimization strategies, caching, connection pooling, batching, indexing, async processing etc.",
  "commonBugs": [
    {
      "bug": "Description of a common production bug",
      "cause": "Root cause",
      "fix": "How to fix it",
      "tool": "Grafana/Kibana/Chrome DevTools/JVM tools etc."
    }
  ],
  "systemDesignConnection": "100-200 word explanation of how this topic connects to microservices, distributed systems, CQRS, caching layers, API gateway, Kubernetes, observability.",
  "bestAnswer": "The ideal concise answer a senior engineer would give in 3-5 sentences. This is the 'model answer' for quick revision.",
  "commonMistakes": ["Common mistake candidates make 1", "Common mistake 2", "Common mistake 3"],
  "bestPractices": ["Production best practice 1", "Best practice 2", "Best practice 3"],
  "edgeCases": ["Race condition scenario", "Edge case 2", "Edge case 3"],
  "revisionSummary": {
    "keyTakeaways": ["Takeaway 1", "Takeaway 2", "Takeaway 3", "Takeaway 4", "Takeaway 5"],
    "seniorOneLiner": "One sentence a senior engineer would say to nail this question",
    "architectOneLiner": "One sentence an architect would say about the systems impact"
  },
  "realWorldUsage": "2-3 sentences describing where this is used in production systems.",
  "mcqs": [
    {
      "id": "mcq-1",
      "question": "A specific conceptual question about this topic",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswerIndex": 0,
      "explanation": "Why this answer is correct and why others are wrong"
    },
    {
      "id": "mcq-2",
      "question": "Another MCQ question testing a different aspect",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswerIndex": 2,
      "explanation": "Explanation for MCQ 2"
    }
  ]
}

IMPORTANT RULES:
- Output ONLY the JSON. No text before or after.
- Every field MUST be filled. Do NOT leave any field empty or null.
- internalFlow must have at least 5 detailed steps.
- followUpQuestions.trap must have at least 2 questions.
- commonBugs must have at least 2 bugs.
- bestPractices must have at least 5 items.
- edgeCases must have at least 3 items.
- revisionSummary.keyTakeaways must have exactly 5 items.
- mcqs must have exactly 2 multiple choice questions.
- codeExamples must use the most relevant language for the topic.
- Treat this as a FAANG-level preparation resource for Senior/Lead/Staff role candidates.
`;

function normalizeAIResponse(parsedJson: any): any {
  // Normalize the AI response into a shape that matches the DB schema
  const explanation = [
    parsedJson.inDepthExplanation || '',
    parsedJson.productionScenario ? `\n\n### Production Scenario\n${parsedJson.productionScenario}` : '',
    parsedJson.internalFlow?.length ? `\n\n### Internal Flow\n${(parsedJson.internalFlow as string[]).map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '',
    parsedJson.systemDesignConnection ? `\n\n### System Design Connection\n${parsedJson.systemDesignConnection}` : '',
    parsedJson.performanceOptimization ? `\n\n### Performance Optimization\n${parsedJson.performanceOptimization}` : '',
  ].filter(Boolean).join('');

  const answerEvolution = parsedJson.answerEvolution || {};
  const bestAnswer = [
    parsedJson.bestAnswer || '',
    answerEvolution.senior ? `\n\n**Senior Engineer Answer:**\n${answerEvolution.senior}` : '',
    answerEvolution.staffArchitect ? `\n\n**Staff/Architect Answer:**\n${answerEvolution.staffArchitect}` : '',
  ].filter(Boolean).join('');

  // Build followUpQuestions as a flat array for DB storage
  const followUps: string[] = [
    ...(parsedJson.followUpQuestions?.basic || []),
    ...(parsedJson.followUpQuestions?.advanced || []),
    ...(parsedJson.followUpQuestions?.trap || []),
  ];

  // Build codeSnippet JSON field
  const codeSnippet = parsedJson.codeExamples ? {
    language: parsedJson.codeExamples.language || 'javascript',
    beginner: parsedJson.codeExamples.beginner || '',
    production: parsedJson.codeExamples.production || '',
    antiPattern: parsedJson.codeExamples.antiPattern || '',
    // backward compat
    code: parsedJson.codeExamples.production || parsedJson.codeExamples.beginner || '',
  } : null;

  // Common bugs → merge into explanation or store as commonMistakes
  const commonMistakes = [
    ...(parsedJson.commonMistakes || []),
    ...(parsedJson.commonBugs?.map((b: any) => `${b.bug} — Fix: ${b.fix}`) || []),
  ];

  const mcqs = (parsedJson.mcqs || []).map((m: any, i: number) => ({
    id: m.id || `mcq-${i + 1}`,
    question: m.question || '',
    options: m.options || [],
    correctAnswerIndex: m.correctAnswerIndex ?? 0,
    explanation: m.explanation || '',
  }));

  const revisionSummary = parsedJson.revisionSummary || {};
  const bestPractices = parsedJson.bestPractices || [];
  const edgeCases = parsedJson.edgeCases || [];

  return {
    title: parsedJson.title || 'Untitled Question',
    topic: parsedJson.topic || 'General',
    difficulty: parsedJson.difficulty || 'Medium',
    estimatedTime: Number(parsedJson.estimatedTime) || 15,
    frequency: Number(parsedJson.frequency) || 70,
    companies: parsedJson.companies || [],
    tags: parsedJson.tags || [],
    problemStatement: parsedJson.problemStatement || parsedJson.title || '',
    expectation: parsedJson.expectation || '',
    explanation,
    bestAnswer,
    alternativeAnswer: answerEvolution.intermediate || null,
    commonMistakes,
    followUpQuestions: followUps,
    realWorldUsage: parsedJson.realWorldUsage || null,
    codeSnippet,
    mcqs: mcqs.length > 0 ? mcqs : null,
    isAiGenerated: true
  };
}

export async function generateQuestionWithAI(prompt: string, updateId?: string, modelName: string = 'gemini-2.5-flash'): Promise<{success: boolean, jobId?: string, error?: string}> {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) return { success: false, error: 'Unauthorized' };
  
  let finalPromptTitle = prompt;
  if (!finalPromptTitle && updateId) {
    const existing = await getQuestionById(updateId);
    finalPromptTitle = existing ? `Regenerate: ${existing.title}` : 'Regenerate Question';
  }

  const job = await prisma.aIGenerationJob.create({
    data: {
      userId: user.id,
      prompt: finalPromptTitle || 'Random Topic',
      modelName,
      status: 'PENDING',
      questionId: updateId || null,
    }
  });

  // Fire and forget
  processBackgroundAIJob(job.id, prompt, updateId, modelName, user.id).catch(console.error);

  return { success: true, jobId: job.id };
}

async function processBackgroundAIJob(jobId: string, prompt: string, updateId: string | undefined, modelName: string, userId: string) {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 minutes timeout

  try {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is missing in environment variables.');
    }
    let finalPrompt = prompt;
    
    if (updateId) {
      const existing = await getQuestionById(updateId);
      if (!existing) return { success: false, error: 'Question not found' };
      finalPrompt = `Generate a deep-dive module for this interview question: "${existing.title}"\n\nProblem Statement: ${existing.problemStatement}`;
    }

    const MAX_RETRIES = 3;
    let res: Response | null = null;
    let data: any = null;

    const makeRequest = async (promptText: string) => {
      return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: promptText }] }],
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.4,
            maxOutputTokens: 65536,
          }
        })
      });
    };

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      res = await makeRequest(finalPrompt);
      
      if (res.status === 429 || res.status >= 500) {
        if (attempt === MAX_RETRIES) {
          if (res.status === 429) throw new Error('API quota exhausted after retries. Please try again later.');
          break;
        }
        const waitTime = (res.status === 429 ? 15000 : 5000) * Math.pow(2, attempt - 1);
        console.warn(`Gemini API ${res.status} error. Retrying in ${waitTime/1000}s... (Attempt ${attempt}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      data = await res.json();
      break;
    }

    if (!res || !res.ok) {
      console.error('Gemini API Error:', data || res?.statusText);
      throw new Error(data?.error?.message || 'Failed to generate AI response. Server may be unavailable.');
    }

    let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
      const blockReason = data.promptFeedback?.blockReason;
      throw new Error(blockReason ? `Blocked by safety filter: ${blockReason}` : 'Empty response from AI.');
    }

    const finishReason = data.candidates?.[0]?.finishReason;
    
    // Intelligent prompt continuation for partial responses
    if (finishReason === 'MAX_TOKENS') {
      console.warn('Response was truncated by MAX_TOKENS — attempting intelligent continuation...');
      const anchor = textResponse.slice(-100);
      const continuationPrompt = `You were generating a JSON object but ran out of tokens. Continue generating the raw string exactly where you left off. DO NOT wrap your response in markdown code blocks (\`\`\`json). Start outputting exactly continuing from the end of this string snippet: "${anchor}"`;
      
      let contRes: Response | null = null;
      let contData: any = null;
      
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        contRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              { role: 'user', parts: [{ text: finalPrompt }] },
              { role: 'model', parts: [{ text: textResponse }] },
              { role: 'user', parts: [{ text: continuationPrompt }] }
            ],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 65536,
            }
          })
        });

        if (contRes.status === 429 || contRes.status >= 500) {
          if (attempt === MAX_RETRIES) {
            if (contRes.status === 429) throw new Error('API quota exhausted.');
            break;
          }
          const waitTime = (contRes.status === 429 ? 15000 : 5000) * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
        contData = await contRes.json();
        break;
      }

      if (contRes && contRes.ok && contData?.candidates?.[0]?.content?.parts?.[0]?.text) {
         let continuedText = contData.candidates[0].content.parts[0].text.trim();
         if (continuedText.startsWith('```json')) {
           continuedText = continuedText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
         }
         textResponse += continuedText;
      }
    }

    let parsedJson: any;
    try {
      let cleanedText = textResponse
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      try {
        parsedJson = JSON.parse(cleanedText);
      } catch {
        cleanedText = repairTruncatedJson(cleanedText);
        try {
          parsedJson = JSON.parse(cleanedText);
        } catch (repairError: any) {
          console.warn('Local JSON repair failed. Asking AI to fix the JSON formatting...');
          
          let fixData: any = null;
          let fixRes: Response | null = null;
          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            fixRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`, {
              method: 'POST',
              signal: controller.signal,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: "The following JSON string is invalid or truncated. Please fix it, close any open brackets/strings, escape quotes properly, and return ONLY a valid JSON object. Do not wrap in markdown code blocks.\n\n" + cleanedText.substring(0, 25000) }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 65536 }
              })
            });
            if (!fixRes || fixRes.status === 429 || fixRes.status >= 500) {
               await new Promise(r => setTimeout(r, (fixRes?.status === 429 ? 15000 : 5000) * attempt));
               continue;
            }
            fixData = await fixRes.json();
            break;
          }
          
          let fixedText = fixData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!fixedText) throw new Error("AI failed to fix JSON");
          
          fixedText = fixedText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
          parsedJson = JSON.parse(fixedText);
        }
      }
    } catch (e: any) {
      throw new Error(`The AI produced an invalid response format that could not be repaired. Try a more specific prompt.`);
    }

    const normalized = normalizeAIResponse(parsedJson);

    let finalQuestionId = updateId;

    if (updateId) {
      await updateQuestion(updateId, normalized);
    } else {
      // Check if a question with the same title already exists
      const allTitlesDB = await prisma.interviewQuestion.findMany({ select: { id: true, title: true } });
      const qNormalized = normalizeQuestionTitle(normalized.title);
      const existingMatch = allTitlesDB.find(t => normalizeQuestionTitle(t.title) === qNormalized);
      
      let existing = null;
      if (existingMatch) {
        existing = await prisma.interviewQuestion.findUnique({ where: { id: existingMatch.id } });
      }
      
      if (existing) {
        await updateQuestion(existing.id, normalized);
        finalQuestionId = existing.id;
      } else {
        const res = await createQuestion(normalized);
        if (res.success && res.id) {
          finalQuestionId = res.id;
        }
      }
    }

    await prisma.aIGenerationJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        timeTakenMs: Date.now() - startTime,
        questionId: finalQuestionId || null
      }
    });

    clearTimeout(timeoutId);
    return { success: true };
  } catch (error: any) {
    clearTimeout(timeoutId);
    console.error('AI Generation error:', error);
    
    const isTimeout = error.name === 'AbortError' || (error.message && error.message.includes('aborted'));
    const errorMessage = isTimeout ? 'Job cancelled: Exceeded 5 minutes time limit.' : error.message || 'An unexpected error occurred during AI generation';
    
    await prisma.aIGenerationJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorReason: errorMessage,
        timeTakenMs: Date.now() - startTime
      }
    });
    return { success: false, error: errorMessage };
  }
}

/**
 * Attempts to repair a truncated JSON string by closing all open structures.
 * Handles truncated strings, arrays, and objects.
 */
function repairTruncatedJson(raw: string): string {
  // Find the last position of a complete value by scanning for the last
  // successfully closed }, ], or quoted string before the truncation.
  let repaired = raw;

  // Step 1: If the string ends mid-value inside a string (unterminated string),
  // find the last complete key-value pair and cut there.
  // Remove any trailing incomplete key-value pair like: , "key": "incomplete...
  repaired = repaired
    // Remove trailing comma + incomplete key string
    .replace(/,\s*"[^"]*":\s*"[^"]*$/, '')
    // Remove trailing comma + incomplete key (no value yet)
    .replace(/,\s*"[^"]*":\s*$/, '')
    // Remove trailing comma + incomplete key with no colon
    .replace(/,\s*"[^"]*$/, '')
    // Remove trailing comma + incomplete array value
    .replace(/,\s*"[^"]*$/, '')
    // Remove any trailing comma
    .replace(/,\s*$/, '')
    .trimEnd();

  // Step 2: Count open brackets and close them
  const opens: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') opens.push('}');
    else if (ch === '[') opens.push(']');
    else if (ch === '}' || ch === ']') opens.pop();
  }

  // If we're still inside a string, close it first
  if (inString) repaired += '"';

  // Close all open structures in reverse order
  repaired += opens.reverse().join('');

  return repaired;
}

export async function getSchemaTemplate(): Promise<string> {
  const { isAuthenticated } = await verifyAuth();
  if (!isAuthenticated) throw new Error('Unauthorized');

  try {
    const latestAiQuestion = await prisma.interviewQuestion.findFirst({
      where: { isAiGenerated: true },
      orderBy: { updatedAt: 'desc' }
    });

    if (latestAiQuestion) {
      const template = {
        title: latestAiQuestion.title,
        topic: latestAiQuestion.topic,
        difficulty: latestAiQuestion.difficulty,
        estimatedTime: latestAiQuestion.estimatedTime,
        frequency: latestAiQuestion.frequency,
        companies: latestAiQuestion.companies || [],
        tags: latestAiQuestion.tags || [],
        problemStatement: latestAiQuestion.problemStatement,
        expectation: latestAiQuestion.expectation,
        explanation: latestAiQuestion.explanation,
        bestAnswer: latestAiQuestion.bestAnswer,
        alternativeAnswer: latestAiQuestion.alternativeAnswer,
        realWorldUsage: latestAiQuestion.realWorldUsage,
        followUpQuestions: latestAiQuestion.followUpQuestions || [],
        commonMistakes: latestAiQuestion.commonMistakes || [],
        codeSnippet: latestAiQuestion.codeSnippet || null,
        mcqs: latestAiQuestion.mcqs || null
      };
      return JSON.stringify([template], null, 2);
    }
  } catch (error) {
    console.error('Failed to fetch latest AI question for schema:', error);
  }

  const template = {
    title: "How does React Reconciliation work?",
    topic: "React",
    difficulty: "Hard",
    estimatedTime: 20,
    frequency: 90,
    companies: ["Meta", "Netflix", "Airbnb"],
    tags: ["react", "virtual-dom", "reconciliation", "performance"],
    problemStatement: "Explain how React's reconciliation algorithm works and how the Virtual DOM diffing process determines what to re-render.",
    expectation: "Candidate should explain the Virtual DOM, the Fiber architecture, diffing algorithm (same-level, key-based), and know when to use keys/memo.",
    questionBreakdown: {
      whatIsBeingTested: "Understanding of React's core rendering mechanism",
      whyItMatters: "Directly impacts application performance at scale",
      seniorLevelDirection: "Talk about Fiber, concurrent mode, batching, and optimization patterns"
    },
    answerEvolution: {
      beginner: "React uses a Virtual DOM to compare changes and only update what changed in the real DOM.",
      intermediate: "React creates a virtual representation of the DOM. On state change, it diffs the old and new virtual tree and applies minimal changes to the real DOM.",
      senior: "React's reconciler uses the Fiber architecture. Each fiber is a unit of work. During the render phase, React traverses the fiber tree building a work-in-progress tree. The commit phase applies only the minimal set of mutations. Keys are critical for list reconciliation.",
      staffArchitect: "React 18's concurrent renderer allows priority-based interruption of render work. Time-slicing enables yielding to the browser. Suspense boundaries enable streaming SSR. At scale, component memoization strategies, state co-location, and selective context splits become architectural decisions."
    },
    inDepthExplanation: "### Virtual DOM\nThe Virtual DOM is a lightweight JS object tree...\n\n### Fiber Architecture\nReact Fiber is a complete rewrite of the reconciler...\n\n### Diffing Algorithm\nReact uses two heuristics...",
    productionScenario: "At a high-traffic e-commerce site, a product listing page with 500 items was re-rendering entirely on every filter change. Investigation revealed no keys on list items and a large context at the app root...",
    internalFlow: [
      "Step 1: setState() or prop change triggers a render schedule",
      "Step 2: React creates a work-in-progress fiber tree",
      "Step 3: Render phase traverses tree, calling render functions",
      "Step 4: Diff algorithm compares old vs new fiber nodes",
      "Step 5: Effect list is built with DOM mutations needed",
      "Step 6: Commit phase applies mutations synchronously to real DOM",
      "Step 7: useLayoutEffect fires synchronously after mutations",
      "Step 8: Browser paints, then useEffect fires asynchronously"
    ],
    codeExamples: {
      language: "javascript",
      beginner: "// Beginner: No optimization\nfunction List({ items }) {\n  return items.map(item => <div>{item.name}</div>);\n}",
      production: "// Production: Keys + Memo\nconst ListItem = React.memo(({ item }) => <div key={item.id}>{item.name}</div>);\n\nfunction List({ items }) {\n  return items.map(item => <ListItem key={item.id} item={item} />);\n}",
      antiPattern: "// Anti-pattern: Index as key (breaks reconciliation on reorder/insert)\nitems.map((item, index) => <div key={index}>{item.name}</div>)"
    },
    followUpQuestions: {
      basic: ["What is the Virtual DOM?", "Why do we need keys in lists?"],
      advanced: ["How does React 18 Concurrent Mode change reconciliation?", "How does Suspense affect the render tree?"],
      trap: ["If you use Math.random() as a key, what happens?", "Does React re-render if setState is called with the same value?"]
    },
    comparison: [
      { feature: "Rendering", optionA: "React (Virtual DOM diffing)", optionB: "Svelte (compile-time, no VDOM)" },
      { feature: "Performance", optionA: "Good with memo/keys", optionB: "Svelte faster for simple UIs" }
    ],
    performanceOptimization: "Use React.memo for expensive components. Use useMemo/useCallback to stabilize references. Co-locate state close to where it's used to reduce re-render scope...",
    commonBugs: [
      { bug: "Entire list re-renders on every keystroke", cause: "Missing keys or unstable references in props", fix: "Add stable unique keys and memoize list items", tool: "React DevTools Profiler" },
      { bug: "Stale closure in useEffect", cause: "Missing dependency array entries", fix: "Add all dependencies or use useCallback", tool: "ESLint react-hooks plugin" }
    ],
    systemDesignConnection: "In micro-frontend architectures, each module's reconciler runs independently. Poor re-render strategies can cause layout thrashing. React Server Components eliminate client-side reconciliation for static parts...",
    bestAnswer: "React uses the Fiber reconciler to diff a virtual DOM tree and apply minimal real DOM mutations. Key concepts: same-level diffing, key-based list reconciliation, and the Fiber unit-of-work model enabling interruptible rendering in React 18.",
    commonMistakes: [
      "Using array index as key for dynamic lists",
      "Not memoizing expensive child components",
      "Putting too much state in context causing app-wide re-renders"
    ],
    bestPractices: [
      "Always use stable unique IDs as keys in lists",
      "Use React.memo for components with expensive renders",
      "Co-locate state close to where it's consumed",
      "Use React DevTools Profiler to identify render bottlenecks",
      "Split large contexts into smaller, more focused ones"
    ],
    edgeCases: [
      "Using Math.random() as key causes remounts on every render",
      "Changing element type (div→span) always triggers full unmount/remount",
      "Portals render outside the parent DOM but inside the React tree"
    ],
    revisionSummary: {
      keyTakeaways: [
        "React diffs virtual DOM trees level-by-level using heuristics",
        "Fiber enables interruptible, priority-based rendering in React 18",
        "Keys are essential for list reconciliation — use stable IDs",
        "React.memo + useMemo prevent unnecessary re-renders",
        "Commit phase is synchronous; render phase can be paused"
      ],
      seniorOneLiner: "React's Fiber reconciler builds a work-in-progress tree, diffs it against the current tree, then commits minimal DOM mutations in a synchronous commit phase.",
      architectOneLiner: "Reconciliation strategy directly impacts UX at scale — micro-frontend isolation, streaming SSR with Suspense, and Concurrent Mode's priority scheduler are the architectural levers."
    },
    realWorldUsage: "Used in every React application. Critical knowledge for optimizing dashboards, data tables, and real-time feeds at companies like Meta, Netflix, and Airbnb.",
    mcqs: [
      {
        id: "mcq-1",
        question: "What happens when you use an array index as a key in React?",
        options: [
          "React optimizes rendering using the index",
          "React may incorrectly reuse component state when items are reordered or deleted",
          "Nothing, keys don't matter for static lists",
          "React throws an error"
        ],
        correctAnswerIndex: 1,
        explanation: "Using index as key causes React to reuse DOM nodes for wrong items when the list order changes, leading to incorrect state and visual bugs."
      },
      {
        id: "mcq-2",
        question: "In React 18, what enables rendering work to be interrupted?",
        options: [
          "Virtual DOM batching",
          "useTransition and Concurrent Mode",
          "React.memo",
          "Error Boundaries"
        ],
        correctAnswerIndex: 1,
        explanation: "React 18's Concurrent Mode with useTransition and useDeferredValue allows React to pause, resume, or abandon render work, enabling time-slicing."
      }
    ]
  };

  return JSON.stringify([template], null, 2);
}

// ==========================================
// AI Model Manager Actions
// ==========================================

const DEFAULT_MODELS = [
  { modelId: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
  { modelId: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
  { modelId: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
  { modelId: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite' }
];

export async function getAiModels() {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');
  try {
    let models = await prisma.aiModel.findMany({
      orderBy: { createdAt: 'asc' }
    });

    // Auto-seed default models if the table is empty
    if (models.length === 0) {
      await prisma.aiModel.createMany({
        data: DEFAULT_MODELS.map(m => ({
          modelId: m.modelId,
          name: m.name,
          isActive: true
        }))
      });
      models = await prisma.aiModel.findMany({
        orderBy: { createdAt: 'asc' }
      });
    }

    return models;
  } catch (error) {
    console.error('Error fetching AI models:', error);
    return [];
  }
}

export async function addAiModel(modelId: string, name: string) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');
  try {
    const existing = await prisma.aiModel.findUnique({ where: { modelId } });
    if (existing) {
      return { success: false, error: 'A model with this ID already exists.' };
    }
    await prisma.aiModel.create({
      data: { modelId, name, isActive: true }
    });
    return { success: true };
  } catch (error: any) {
    console.error('Error adding AI model:', error);
    return { success: false, error: error.message || 'Failed to add model' };
  }
}

export async function updateAiModel(id: string, data: { modelId: string, name: string, isActive: boolean }) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');
  try {
    // Check if updating modelId conflicts with another record
    const existing = await prisma.aiModel.findUnique({ where: { modelId: data.modelId } });
    if (existing && existing.id !== id) {
      return { success: false, error: 'Another model with this ID already exists.' };
    }
    
    await prisma.aiModel.update({
      where: { id },
      data: {
        modelId: data.modelId,
        name: data.name,
        isActive: data.isActive
      }
    });
    return { success: true };
  } catch (error: any) {
    console.error('Error updating AI model:', error);
    return { success: false, error: error.message || 'Failed to update model' };
  }
}

export async function deleteAiModel(id: string) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');
  try {
    await prisma.aiModel.delete({ where: { id } });
    return { success: true };
  } catch (error: any) {
    console.error('Error deleting AI model:', error);
    return { success: false, error: error.message || 'Failed to delete model' };
  }
}

export async function getAIJobs() {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');
  try {
    return await prisma.aIGenerationJob.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' }
    });
  } catch (error) {
    console.error('Failed to get AI jobs:', error);
    return [];
  }
}

export async function deleteAIJob(id: string) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');
  try {
    await prisma.aIGenerationJob.delete({
      where: { id, userId: user.id }
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to delete job' };
  }
}

export async function cancelAIJob(id: string) {
  const { isAuthenticated, user } = await verifyAuth();
  if (!isAuthenticated || !user) throw new Error('Unauthorized');
  try {
    const job = await prisma.aIGenerationJob.findUnique({ where: { id, userId: user.id } });
    if (!job) return { success: false, error: 'Job not found' };
    if (job.status !== 'PENDING') return { success: false, error: 'Job is not pending' };
    
    await prisma.aIGenerationJob.update({
      where: { id },
      data: {
        status: 'FAILED',
        errorReason: 'Manually cancelled by user'
      }
    });
    return { success: true };
  } catch (error: any) {
    console.error('Failed to cancel AI job:', error);
    return { success: false, error: 'Failed to cancel job' };
  }
}
