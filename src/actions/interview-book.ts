'use server';

import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';
import { revalidatePath } from 'next/cache';

function isDummyAnswer(answer: string | null | undefined): boolean {
    if (!answer) return true;
    if (answer.includes('Please update via UI') || answer.includes('Please provide')) return true;
    
    // Count sentences roughly by looking for punctuation
    const sentences = answer.split(/[.?!]/).filter(s => s.trim().length > 0);
    if (sentences.length <= 3) return true;

    return false;
}

export async function syncInterviewBook() {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || !auth.user) {
            return { success: false, error: 'Unauthorized' };
        }

        // Fetch all questions
        const questions = await prisma.interviewQuestion.findMany({
            orderBy: { createdAt: 'asc' }
        });

        const validQuestions = questions.filter(q => !isDummyAnswer(q.bestAnswer));

        if (validQuestions.length === 0) {
            return { success: false, error: 'No valid questions found to generate a book.' };
        }

        const bookTitle = "Interview Preparation";
        const bookFileName = "interview_preparation_auto_generated";

        // Check if book exists
        const existingBook = await prisma.book.findFirst({
            where: {
                userName: auth.user.email,
                fileName: bookFileName
            }
        });

        let book;
        if (existingBook) {
            book = await prisma.book.update({
                where: { id: existingBook.id },
                data: {
                    updatedAt: new Date()
                }
            });
            // Delete old chapters
            await prisma.chapter.deleteMany({
                where: { bookId: book.id }
            });
        } else {
            book = await prisma.book.create({
                data: {
                    title: bookTitle,
                    description: "An auto-generated book for interview preparation based on your questions.",
                    userName: auth.user.email,
                    fileName: bookFileName,
                    cover: ""
                }
            });
        }

        const chapterData = validQuestions.map((q, index) => {
            const contentLines: string[] = [];
            
            const addContent = (heading: string, text: string | null | undefined) => {
                if (!text) return;
                contentLines.push(`### ${heading}`);
                
                // Split by double newlines to create separate paragraphs for TTS stability
                const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
                paragraphs.forEach(p => contentLines.push(p.trim()));
                contentLines.push("");
            };

            addContent("Problem Statement", q.problemStatement);
            addContent("Expectation", q.expectation);
            addContent("Explanation", q.explanation);
            addContent("Best Answer", q.bestAnswer);
            addContent("Alternative Answer", q.alternativeAnswer);
            
            if (q.commonMistakes && Array.isArray(q.commonMistakes) && q.commonMistakes.length > 0) {
                contentLines.push("### Common Mistakes");
                // Lists are fine as one block for TTS, or we can push each item separately. 
                // Let's keep it simple: push each mistake as a markdown list item in one block so ReactMarkdown renders a <ul>.
                const listText = q.commonMistakes.map((m: string) => `- ${m}`).join('\n');
                contentLines.push(listText);
                contentLines.push("");
            }
            
            addContent("Real World Usage", q.realWorldUsage);

            return {
                bookId: book.id,
                title: q.title,
                content: contentLines,
                order: index
            };
        });

        // Prisma createMany for chapters
        await prisma.chapter.createMany({
            data: chapterData
        });

        revalidatePath('/dashboard');
        revalidatePath('/books');
        
        return { success: true, message: `Successfully synced ${validQuestions.length} chapters to book.` };
    } catch (error) {
        console.error('Error in syncInterviewBook:', error);
        return { success: false, error: 'Failed to sync interview book.' };
    }
}
