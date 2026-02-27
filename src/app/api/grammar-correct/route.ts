import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth-server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { chapterId, modelId = "gemini-2.5-flash" } = body;

        if (!chapterId) {
            return NextResponse.json({ error: "chapterId is required" }, { status: 400 });
        }

        const chapter = await prisma.chapter.findUnique({
            where: { id: chapterId },
        });

        if (!chapter) {
            return NextResponse.json({ error: "Chapter not found" }, { status: 404 });
        }

        let responseText = "";

        // Common instructions for all models
        const systemPrompt = `You are a professional book editor. Please correct the grammar, punctuation, and spelling for the following paragraphs from a chapter of a book.
Your output MUST be a valid JSON array of strings, where each string corresponds to the exact original paragraph, but with corrected grammar and improved readability.
CRITICAL INSTRUCTIONS:
- You MUST return an array of strings of the exact same length as the input array.
- Do NOT combine paragraphs.
- Do NOT split paragraphs.
- Keep the original tone and meaning.
- Return ONLY the JSON array elements. For models enforcing JSON objects, wrap the array in a "correctedContent" key like: { "correctedContent": ["para1", "para2"] }`;

        const userPrompt = `Original paragraphs (JSON Array):
${JSON.stringify(chapter.content)}`;

        if (modelId === "gemini-2.5-flash") {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) {
                return NextResponse.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });
            }

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                generationConfig: {
                    responseMimeType: "application/json",
                }
            });

            const prompt = `${systemPrompt}\n\n${userPrompt}`;
            const result = await model.generateContent(prompt);
            responseText = result.response.text();

        } else if (modelId === "gpt-4o-mini") {
            const apiKey = process.env.OPENAI_API_KEY;
            if (!apiKey) {
                return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
            }

            const openai = new OpenAI({ apiKey });
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                response_format: { type: "json_object" },
            });

            responseText = completion.choices[0].message.content || "{}";

        } else if (modelId === "pollinations") {
            // Pollinations AI - Free text generation, OpenAI compatible
            const openai = new OpenAI({
                baseURL: "https://text.pollinations.ai/openai",
                apiKey: "dummy-key-not-needed", // Required by SDK but not validated by Pollinations for free tier
            });

            const completion = await openai.chat.completions.create({
                model: "openai", // They use this or direct model names, 'openai' usually maps to a default good model
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
            });

            responseText = completion.choices[0].message.content || "{}";

        } else if (modelId === "ollama") {
            const ollamaModel = process.env.OLLAMA_MODEL || "llama3";
            const openai = new OpenAI({
                baseURL: "http://localhost:11434/v1",
                apiKey: "ollama", // Required by SDK but unused by Ollama
            });

            const completion = await openai.chat.completions.create({
                model: ollamaModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                // temperature: 0.2, // Lower temp is often better for grammar strictness
            });

            responseText = completion.choices[0].message.content || "{}";

        } else {
            return NextResponse.json({ error: "Invalid model selected" }, { status: 400 });
        }


        let correctedContent;
        try {
            let cleanedText = responseText.trim();

            // Remove markdown code blocks if present
            const match = cleanedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
            if (match) {
                cleanedText = match[1].trim();
            } else {
                // Fallback: try to find the start and end of the JSON array or object
                const firstBracket = cleanedText.indexOf('[');
                const lastBracket = cleanedText.lastIndexOf(']');
                const firstBrace = cleanedText.indexOf('{');
                const lastBrace = cleanedText.lastIndexOf('}');

                const isArray = firstBracket !== -1 && lastBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace);
                const isObject = firstBrace !== -1 && lastBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket);

                if (isArray) {
                    cleanedText = cleanedText.substring(firstBracket, lastBracket + 1);
                } else if (isObject) {
                    cleanedText = cleanedText.substring(firstBrace, lastBrace + 1);
                }
            }

            let parsed = JSON.parse(cleanedText);

            // Handle if the model returned { "correctedContent": [...] } due to JSON object enforcement
            if (!Array.isArray(parsed) && parsed.correctedContent && Array.isArray(parsed.correctedContent)) {
                correctedContent = parsed.correctedContent;
            } else if (Array.isArray(parsed)) {
                correctedContent = parsed;
            } else {
                throw new Error("Response is not a JSON array or valid object wrapper");
            }

            // Content from Prisma is JsonValue which might not be an array, but we assume it is since we saved it as string[]
            const originalContentLength = Array.isArray(chapter.content) ? chapter.content.length : 0;
            if (correctedContent.length !== originalContentLength) {
                console.warn("Length mismatch. Original:", originalContentLength, "Corrected:", correctedContent.length);
                // We still return it, the user can verify in the Diff UI
            }

        } catch (e: any) {
            console.error("Failed to parse AI response:", responseText);
            console.error("Parse Error details:", e);
            return NextResponse.json({
                error: "Failed to parse grammar correction response from AI.",
                details: e.message,
                rawResponse: responseText.substring(0, 500) // Return some of the raw response for debugging
            }, { status: 500 });
        }

        return NextResponse.json({ correctedContent });
    } catch (error: any) {
        console.error("Grammar correction error:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}
