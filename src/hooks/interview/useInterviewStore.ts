import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserStats } from '@/types/interview';

interface InterviewStore {
  stats: UserStats;
  addXP: (amount: number) => void;
  markQuestionCompleted: (questionId: string) => void;
  toggleBookmark: (questionId: string) => void;
  updateTopicMastery: (topicId: string, value: number) => void;
  saveMCQScore: (mcqId: string, score: number) => void;
  updateStreak: () => void;
}

const initialState: UserStats = {
  xp: 0,
  streak: 0,
  lastActive: new Date().toISOString(),
  completedQuestions: [],
  bookmarkedQuestions: [],
  topicMastery: {},
  mcqScores: {}
};

export const useInterviewStore = create<InterviewStore>()(
  persist(
    (set, get) => ({
      stats: initialState,
      
      addXP: (amount) => set((state) => ({
        stats: { ...state.stats, xp: state.stats.xp + amount }
      })),

      markQuestionCompleted: (questionId) => set((state) => {
        if (state.stats.completedQuestions.includes(questionId)) return state;
        return {
          stats: {
            ...state.stats,
            completedQuestions: [...state.stats.completedQuestions, questionId]
          }
        };
      }),

      toggleBookmark: (questionId) => set((state) => {
        const isBookmarked = state.stats.bookmarkedQuestions.includes(questionId);
        return {
          stats: {
            ...state.stats,
            bookmarkedQuestions: isBookmarked 
              ? state.stats.bookmarkedQuestions.filter(id => id !== questionId)
              : [...state.stats.bookmarkedQuestions, questionId]
          }
        };
      }),

      updateTopicMastery: (topicId, value) => set((state) => ({
        stats: {
          ...state.stats,
          topicMastery: {
            ...state.stats.topicMastery,
            [topicId]: value
          }
        }
      })),

      saveMCQScore: (mcqId, score) => set((state) => ({
        stats: {
          ...state.stats,
          mcqScores: {
            ...state.stats.mcqScores,
            [mcqId]: score
          }
        }
      })),

      updateStreak: () => set((state) => {
        const lastActiveDate = new Date(state.stats.lastActive);
        const today = new Date();
        const diffDays = Math.floor((today.getTime() - lastActiveDate.getTime()) / (1000 * 3600 * 24));
        
        let newStreak = state.stats.streak;
        if (diffDays === 1) {
          newStreak += 1;
        } else if (diffDays > 1) {
          newStreak = 0; // reset streak if missed a day
        } else if (state.stats.streak === 0) {
          newStreak = 1; // first day
        }

        return {
          stats: {
            ...state.stats,
            streak: newStreak,
            lastActive: today.toISOString()
          }
        };
      })
    }),
    {
      name: 'interview-progress-storage',
    }
  )
);
