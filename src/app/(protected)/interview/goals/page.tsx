'use client';

import React, { useState, useEffect } from 'react';
import { Target, Plus, Trash2, Edit2, TrendingUp, BookOpen, Compass } from 'lucide-react';
import { getGoals, addGoal, deleteGoal } from '@/actions/goal';
import { getQuestions } from '@/actions/interview';
import { useInterviewStore } from '@/hooks/interview/useInterviewStore';
import toast from 'react-hot-toast';

export default function GoalsPage() {
  const [goals, setGoals] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { stats } = useInterviewStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    targetCount: 10,
    topic: '',
    difficulty: '',
    company: ''
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [fetchedGoals, fetchedQuestions] = await Promise.all([
        getGoals(),
        getQuestions()
      ]);
      setGoals(fetchedGoals);
      setQuestions(fetchedQuestions);
    } catch (err) {
      toast.error("Failed to load goals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const computeProgress = (goal: any) => {
    const relevantQuestions = questions.filter(q => {
      let matches = true;
      if (goal.topic && q.topic !== goal.topic) matches = false;
      if (goal.difficulty && q.difficulty !== goal.difficulty) matches = false;
      if (goal.company && !q.companies.includes(goal.company)) matches = false;
      return matches;
    });

    const completedRelevant = relevantQuestions.filter(q => stats.completedQuestions.includes(q.id));
    return {
      completed: completedRelevant.length,
      target: goal.targetCount,
      percentage: Math.min(100, Math.round((completedRelevant.length / goal.targetCount) * 100))
    };
  };

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addGoal({
        title: formData.title,
        targetCount: Number(formData.targetCount),
        topic: formData.topic || undefined,
        difficulty: formData.difficulty || undefined,
        company: formData.company || undefined,
      });
      toast.success("Goal created!");
      setIsModalOpen(false);
      loadData();
    } catch (err) {
      toast.error("Failed to create goal");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this goal?')) return;
    try {
      await deleteGoal(id);
      toast.success("Goal deleted");
      loadData();
    } catch (err) {
      toast.error("Failed to delete goal");
    }
  };

  const uniqueTopics = Array.from(new Set(questions.map(q => q.topic)));
  const uniqueCompanies = Array.from(new Set(questions.flatMap(q => q.companies)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Target className="w-6 h-6 text-blue-500" />
            Goal Manager
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Track your interview preparation progress by setting custom targets.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> New Goal
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : goals.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl">
          <Target className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">No goals yet</h3>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Create your first goal to start tracking progress.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {goals.map(goal => {
            const progress = computeProgress(goal);
            return (
              <div key={goal.id} className="p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm hover:shadow-md transition-shadow relative group">
                <button 
                  onClick={() => handleDelete(goal.id)}
                  className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 pr-8">{goal.title}</h3>
                
                <div className="flex flex-wrap gap-2 mb-4">
                  {goal.topic && (
                    <span className="px-2 py-1 text-xs font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 rounded-md">
                      {goal.topic.replace('-', ' ')}
                    </span>
                  )}
                  {goal.difficulty && (
                    <span className="px-2 py-1 text-xs font-medium bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400 rounded-md">
                      {goal.difficulty}
                    </span>
                  )}
                  {goal.company && (
                    <span className="px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-md">
                      🏢 {goal.company}
                    </span>
                  )}
                  {!goal.topic && !goal.difficulty && !goal.company && (
                    <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 rounded-md">
                      All Questions
                    </span>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">Progress</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {progress.completed} / {progress.target}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        progress.percentage === 100 ? 'bg-green-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${progress.percentage}%` }}
                    />
                  </div>
                  <div className="text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                    {progress.percentage}% completed
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md border border-gray-200 dark:border-gray-800 shadow-xl">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Create New Goal</h2>
            <form onSubmit={handleAddGoal} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Goal Title</label>
                <input 
                  required
                  type="text" 
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white"
                  placeholder="e.g. Master React Hooks"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Target Questions</label>
                  <input 
                    required
                    type="number" 
                    min="1"
                    value={formData.targetCount}
                    onChange={e => setFormData({...formData, targetCount: Number(e.target.value)})}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Difficulty (Optional)</label>
                  <select 
                    value={formData.difficulty}
                    onChange={e => setFormData({...formData, difficulty: e.target.value})}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white"
                  >
                    <option value="">Any</option>
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Topic (Optional)</label>
                <select 
                  value={formData.topic}
                  onChange={e => setFormData({...formData, topic: e.target.value})}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white"
                >
                  <option value="">Any Topic</option>
                  {uniqueTopics.map(t => (
                    <option key={t} value={t}>{t.replace('-', ' ')}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Company (Optional)</label>
                <select 
                  value={formData.company}
                  onChange={e => setFormData({...formData, company: e.target.value})}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white"
                >
                  <option value="">Any Company</option>
                  {uniqueCompanies.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  Save Goal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
