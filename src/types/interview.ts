export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export interface Topic {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  count?: number;
}

export interface Question {
  id: string;
  title: string;
  topic: string;
  difficulty: Difficulty;
  estimatedTime: number; // in minutes
  frequency: number; // 0 to 100 percentage
  companies: string[];
  tags: string[];
  problemStatement: string;
  expectation: string;
  explanation: string;
  bestAnswer: string;
  alternativeAnswer?: string;
  commonMistakes: string[];
  followUpQuestions: string[];
  realWorldUsage?: string;
  codeSnippet?: {
    language: string;
    code: string;
  };
  mcqs?: MCQType[];
}

export interface MCQType {
  id: string;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface FlashcardType {
  id: string;
  front: string;
  back: string;
  topic: string;
}

export interface UserStats {
  xp: number;
  streak: number;
  lastActive: string;
  completedQuestions: string[]; // array of question IDs
  bookmarkedQuestions: string[];
  topicMastery: Record<string, number>; // Topic ID -> 0-100%
  mcqScores: Record<string, number>; // MCQ ID -> Score
}

export interface InterviewSession {
  id: string;
  date: string;
  score: number;
  duration: number; // seconds
  questions: string[];
  feedback: string;
}
