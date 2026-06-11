'use server';

import { getAiModels } from './ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3, baseDelay = 5000) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      
      // Do not retry on 4xx client errors, except 429 Too Many Requests
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        throw new Error(`API error: ${res.status} ${res.statusText}`);
      }
      
      throw new Error(`API error: ${res.status} ${res.statusText}`);
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) {
        throw error;
      }
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.warn(`Fetch failed: ${error}. Retrying in ${delay}ms... (Attempt ${attempt} of ${maxRetries - 1})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries reached');
}


export async function generateResumeSummaryWithAI(
  targetRole: string,
  resumeContext: any,
  modelId?: string
) {
  if (!GEMINI_API_KEY) {
    return { success: false, error: 'API key is missing' };
  }

  let selectedModel = modelId || 'gemini-2.5-flash';
  if (!modelId) {
    const models = await getAiModels();
    const activeModels = models.filter((m: any) => m.isActive);
    if (activeModels.length > 0) {
      selectedModel = activeModels[0].modelId;
    }
  }

  // Extract useful context from the resume without sending the entire object if it's too huge
  const contextText = `
Name: ${resumeContext?.personalInfo?.fullName || 'Not provided'}
Experience: ${resumeContext?.experience?.map((e: any) => `${e.position} at ${e.company} (${e.startDate} - ${e.endDate || 'Present'})`).join(', ') || 'None provided'}
Education: ${resumeContext?.education?.map((e: any) => `${e.degree} at ${e.institution}`).join(', ') || 'None provided'}
Skills: ${[
    ...(resumeContext?.skills?.technical || []),
    ...(resumeContext?.skills?.soft || []),
    ...(resumeContext?.skills?.tools || [])
  ].join(', ') || 'None provided'}
  `.trim();

  const prompt = `You are an expert career coach, recruiter, and technical resume writer for top-tier companies.
I need a professional summary for my resume.

Target Role: ${targetRole || 'Software Professional'}

My Background Context:
${contextText}

Generate a highly professional, impactful 2-3 sentence summary emphasizing my key strengths, experience, and value proposition specifically tailored for the "${targetRole}" role. 
Do NOT include any introductory or concluding remarks. Just return the pure summary text. Make it sound extremely premium and polished. Avoid cliches.`;

  try {
    const res = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
        }
      })
    });

    const data = await res.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      return { success: false, error: 'Empty response from AI' };
    }

    return { success: true, summary: textResponse.trim() };
  } catch (error: any) {
    console.error('Error generating summary:', error);
    return { success: false, error: error.message || 'Failed to generate summary' };
  }
}

export async function reviewResumeWithAI(
  resumeContext: any,
  modelId?: string
) {
  if (!GEMINI_API_KEY) {
    return { success: false, error: 'API key is missing' };
  }

  let selectedModel = modelId || 'gemini-2.5-flash';
  if (!modelId) {
    const models = await getAiModels();
    const activeModels = models.filter((m: any) => m.isActive);
    if (activeModels.length > 0) {
      selectedModel = activeModels[0].modelId;
    }
  }

  // MASK PII before sending to AI
  const safeContext = {
    summary: resumeContext?.summary || '',
    experience: resumeContext?.experience?.map((e: any) => ({
      position: e.position,
      company: e.company, // Optional: mask company if strictly required, but usually okay for ATS context
      duration: `${e.startDate} to ${e.endDate || 'Present'}`,
      achievements: e.achievements
    })) || [],
    education: resumeContext?.education?.map((e: any) => ({
      degree: e.degree,
      institution: 'MASKED_INSTITUTION', // Masked to be safe
      graduationDate: e.graduationDate
    })) || [],
    skills: resumeContext?.skills || {},
    projects: resumeContext?.projects || []
  };

  const prompt = `You are an expert technical recruiter and Applicant Tracking System (ATS) algorithm.
Review the following anonymized resume data.
Data:
${JSON.stringify(safeContext, null, 2)}

Analyze this data and return ONLY a strict JSON object with exactly the following structure (no markdown, no backticks, just raw JSON):
{
  "overall": number (0-100 ATS score),
  "readabilityGrade": string ("A", "B", "C", "D"),
  "keywordCoveragePct": number (0-100),
  "recruiterReadiness": number (0-100),
  "missingKeywords": array of strings (top 3-5 important missing industry keywords),
  "sectionCompleteness": { "personal": 100, "experience": number (0-100), "education": number (0-100) },
  "suggestions": [
    { "severity": "error"|"warning"|"info", "section": string, "message": string, "actionLabel": string (optional short label) }
  ]
}
Provide exactly 3-5 actionable suggestions to improve the resume. Be highly critical but constructive.`;

  try {
    const res = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2, // Low temperature for more analytical/consistent JSON
        }
      })
    });

    const data = await res.json();
    let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      return { success: false, error: 'Empty response from AI' };
    }

    // Clean up markdown block if Gemini wraps it
    textResponse = textResponse.replace(/^```json/g, '').replace(/```$/g, '').trim();

    try {
      const parsedJson = JSON.parse(textResponse);
      return { success: true, score: parsedJson };
    } catch (parseError) {
      console.error("Failed to parse JSON from AI:", textResponse);
      return { success: false, error: 'AI returned invalid JSON format.' };
    }
    
  } catch (error: any) {
    console.error('Error reviewing resume:', error);
    return { success: false, error: error.message || 'Failed to review resume' };
  }
}

export async function enrichResumeBulletWithAI(
  bulletPoint: string,
  position: string,
  company: string,
  modelId?: string
) {
  if (!GEMINI_API_KEY) {
    return { success: false, error: 'API key is missing' };
  }

  let selectedModel = modelId || 'gemini-2.5-flash';
  if (!modelId) {
    const models = await getAiModels();
    const activeModels = models.filter((m: any) => m.isActive);
    if (activeModels.length > 0) {
      selectedModel = activeModels[0].modelId;
    }
  }

  const prompt = `You are an expert technical resume writer and career coach.
I have drafted a bullet point for my work experience section. I need you to rewrite it to be highly professional, impactful, and action-oriented.

Role Context:
- Position: ${position || 'Not specified'}
- Company: ${company || 'Not specified'}

Original Draft:
"${bulletPoint}"

Rewrite the bullet point to be exactly 1-2 sentences. Use strong action verbs. Quantify impact where implied or create a placeholder like "[X]%" if it makes sense. Do NOT include any introductory or concluding text, just return the pure rewritten bullet point string.`;

  try {
    const res = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
        }
      })
    });

    const data = await res.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      return { success: false, error: 'Empty response from AI' };
    }

    // Clean up any bullet dashes if the AI added them
    let cleanedResponse = textResponse.trim();
    if (cleanedResponse.startsWith('- ') || cleanedResponse.startsWith('• ')) {
      cleanedResponse = cleanedResponse.substring(2);
    }

    return { success: true, enrichedBullet: cleanedResponse.trim() };
  } catch (error: any) {
    console.error('Error enriching bullet:', error);
    return { success: false, error: error.message || 'Failed to enrich bullet point' };
  }
}

export async function suggestMissingSkillsWithAI(
  resumeContext: any,
  optionalJobRole: string,
  optionalJobDescription: string,
  modelId?: string
) {
  if (!GEMINI_API_KEY) {
    return { success: false, error: 'API key is missing' };
  }

  let selectedModel = modelId || 'gemini-2.5-flash';
  if (!modelId) {
    const models = await getAiModels();
    const activeModels = models.filter((m: any) => m.isActive);
    if (activeModels.length > 0) {
      selectedModel = activeModels[0].modelId;
    }
  }

  // Extract current context
  const professionalTitle = resumeContext?.personalInfo?.professionalTitle || 'Not specified';
  const summary = resumeContext?.summary || 'Not specified';
  
  const currentSkills = [
    ...(resumeContext?.skills?.technical || []),
    ...(resumeContext?.skills?.soft || []),
    ...(resumeContext?.skills?.tools || []),
    ...(resumeContext?.skills?.frameworks || []),
    ...(resumeContext?.skills?.platforms || []),
    ...(resumeContext?.skills?.languages || [])
  ];

  const prompt = `You are an expert technical recruiter and career coach.
I need a list of highly-demanded skills I should add to my resume.

My Current Profile:
- Professional Title: ${professionalTitle}
- Summary: ${summary}
- Currently Listed Skills: ${currentSkills.length > 0 ? currentSkills.join(', ') : 'None'}

Target Role Context (Optional):
- Target Job Role: ${optionalJobRole || 'Not provided'}
- Job Description: ${optionalJobDescription || 'Not provided'}

Based on my title, summary, and the target role/description (if provided), suggest 5 to 8 highly relevant, missing skills that would make my profile stronger. 
Exclude any skills I already have in my "Currently Listed Skills".
Return ONLY a strict JSON array of strings. Do not include markdown formatting or backticks. Example: ["GraphQL", "Docker", "CI/CD"]`;

  try {
    const res = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3, // Lower temperature for JSON output
        }
      })
    });

    const data = await res.json();
    let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      return { success: false, error: 'Empty response from AI' };
    }

    // Clean up markdown block if Gemini wraps it
    textResponse = textResponse.replace(/^```json/g, '').replace(/```$/g, '').trim();

    try {
      const parsedJson = JSON.parse(textResponse);
      if (Array.isArray(parsedJson)) {
        return { success: true, skills: parsedJson };
      }
      return { success: false, error: 'AI returned invalid JSON format (not an array).' };
    } catch (parseError) {
      console.error("Failed to parse JSON from AI:", textResponse);
      return { success: false, error: 'AI returned invalid JSON format.' };
    }
  } catch (error: any) {
    console.error('Error suggesting missing skills:', error);
    return { success: false, error: error.message || 'Failed to suggest missing skills' };
  }
}

export async function validateAndOrganizeSkillsWithAI(
  currentSkills: any,
  modelId?: string
) {
  if (!GEMINI_API_KEY) {
    return { success: false, error: 'API key is missing' };
  }

  let selectedModel = modelId || 'gemini-2.5-flash';
  if (!modelId) {
    const models = await getAiModels();
    const activeModels = models.filter((m: any) => m.isActive);
    if (activeModels.length > 0) {
      selectedModel = activeModels[0].modelId;
    }
  }

  const prompt = `You are an expert technical recruiter. I have a list of skills categorized into technical, soft, tools, frameworks, platforms, and languages.
Note: "languages" refers to Programming Languages (e.g. Java, Python), NOT spoken languages.
Some skills might have typos, incorrect capitalization (e.g., 'java' instead of 'Java', 'Communiation' instead of 'Communication', 'react.js' instead of 'React.js'), or they might be in the wrong category (e.g., 'Git' in technical instead of tools).

Please fix all spelling, capitalization, and re-categorize the skills correctly.
Here are the current skills:
${JSON.stringify(currentSkills, null, 2)}

Return ONLY a strictly valid JSON object with the exact same 6 keys (technical, soft, tools, frameworks, platforms, languages), where each key maps to an array of strings representing the corrected skills.
Do not include markdown formatting or backticks. Return raw JSON.`;

  try {
    const res = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2, // Lower temperature for JSON output
        }
      })
    });

    const data = await res.json();
    let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      return { success: false, error: 'Empty response from AI' };
    }

    // Clean up markdown block if Gemini wraps it
    textResponse = textResponse.replace(/^```json/g, '').replace(/```$/g, '').trim();

    try {
      const parsedJson = JSON.parse(textResponse);
      
      // Ensure all keys exist
      const fixedSkills = {
        technical: Array.isArray(parsedJson.technical) ? parsedJson.technical : [],
        soft: Array.isArray(parsedJson.soft) ? parsedJson.soft : [],
        tools: Array.isArray(parsedJson.tools) ? parsedJson.tools : [],
        frameworks: Array.isArray(parsedJson.frameworks) ? parsedJson.frameworks : [],
        platforms: Array.isArray(parsedJson.platforms) ? parsedJson.platforms : [],
        languages: Array.isArray(parsedJson.languages) ? parsedJson.languages : []
      };

      return { success: true, skills: fixedSkills };
    } catch (parseError) {
      console.error("Failed to parse JSON from AI:", textResponse);
      return { success: false, error: 'AI returned invalid JSON format.' };
    }
  } catch (error: any) {
    console.error('Error validating skills:', error);
    return { success: false, error: error.message || 'Failed to validate skills' };
  }
}

export async function suggestOverallImprovementsWithAI(
  resumeContext: any,
  modelId?: string
) {
  if (!GEMINI_API_KEY) {
    return { success: false, error: 'API key is missing' };
  }

  let selectedModel = modelId || 'gemini-2.5-flash';
  if (!modelId) {
    const models = await getAiModels();
    const activeModels = models.filter((m: any) => m.isActive);
    if (activeModels.length > 0) {
      selectedModel = activeModels[0].modelId;
    }
  }

  // MASK PII before sending to AI
  const safeContext = {
    summary: resumeContext?.summary || '',
    experience: resumeContext?.experience?.map((e: any) => ({
      position: e.position,
      company: e.company,
      duration: `${e.startDate} to ${e.endDate || 'Present'}`,
      achievements: e.achievements
    })) || [],
    education: resumeContext?.education?.map((e: any) => ({
      degree: e.degree,
      institution: 'MASKED_INSTITUTION', // Masked to be safe
      graduationDate: e.graduationDate
    })) || [],
    skills: resumeContext?.skills || {},
    projects: resumeContext?.projects || []
  };

  const prompt = `You are an expert technical recruiter and resume writer.
Review the following anonymized resume data.
Data:
${JSON.stringify(safeContext, null, 2)}

Analyze this data and return ONLY a strict JSON array of objects representing areas for improvement. Give equal weight to all sections.
Each object must have exactly the following structure (no markdown, no backticks, just raw JSON array):
[
  { 
    "section": "string", 
    "advice": "string (clear, actionable advice on what to improve and how)", 
    "priority": "High" | "Medium" | "Low" 
  }
]
Provide 3-6 actionable suggestions to improve the resume. Be highly critical but constructive.`;

  try {
    const res = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
        }
      })
    });

    const data = await res.json();
    let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      return { success: false, error: 'Empty response from AI' };
    }

    textResponse = textResponse.replace(/^```json/g, '').replace(/```$/g, '').trim();

    try {
      const parsedJson = JSON.parse(textResponse);
      return { success: true, suggestions: parsedJson };
    } catch (parseError) {
      console.error("Failed to parse JSON from AI:", textResponse);
      return { success: false, error: 'AI returned invalid JSON format.' };
    }
  } catch (error: any) {
    console.error('Error getting improvements:', error);
    return { success: false, error: error.message || 'Failed to get improvements' };
  }
}

