const fs = require('fs');

const file = 'k:/Projects/my-ultimate-app-all/src/app/(protected)/interview/manage/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Imports
content = content.replace(
  `import { generateQuestionWithAI, getSchemaTemplate } from '@/actions/ai';`,
  `import { generateQuestionWithAI, getSchemaTemplate, getAiModels, addAiModel, updateAiModel, deleteAiModel } from '@/actions/ai';`
);

content = content.replace(
  `import { Settings, Upload, Trash2, Sparkles, Loader2, X, Download, Search, Filter, ArrowUpDown } from 'lucide-react';`,
  `import { Settings, Upload, Trash2, Sparkles, Loader2, X, Download, Search, Filter, ArrowUpDown, LayoutGrid, Cpu, Edit2, Plus, Check } from 'lucide-react';`
);

// 2. States and fetching
content = content.replace(
  `  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash');
  const [isDownloading, setIsDownloading] = useState(false);

  // Sorting, Filtering, Selection State
  const [searchQuery, setSearchQuery] = useState('');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'title' | 'topic' | 'difficulty' | 'createdAt'>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const models = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
    { id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
    { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite' }
  ];
  
  const fetchQuestions = async () => {
    setLoading(true);
    const data = await getQuestions();
    setQuestions(data);
    setLoading(false);
  };`,
  `  const [selectedModel, setSelectedModel] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Tabs & Models State
  const [activeTab, setActiveTab] = useState<'questions' | 'models'>('questions');
  const [aiModels, setAiModels] = useState<any[]>([]);
  const [editingModel, setEditingModel] = useState<any>(null);
  const [modelForm, setModelForm] = useState({ modelId: '', name: '', isActive: true });

  // Sorting, Filtering, Selection State
  const [searchQuery, setSearchQuery] = useState('');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'title' | 'topic' | 'difficulty' | 'createdAt'>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchQuestions = async () => {
    setLoading(true);
    const [qData, mData] = await Promise.all([getQuestions(), getAiModels()]);
    setQuestions(qData);
    setAiModels(mData);
    if (mData.length > 0 && !selectedModel) {
      setSelectedModel(mData[0].modelId);
    }
    setLoading(false);
  };

  const handleModelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelForm.modelId.trim() || !modelForm.name.trim()) return toast.error('Fields are required');
    if (editingModel) {
      const res = await updateAiModel(editingModel.id, modelForm);
      if (res.success) { toast.success('Model updated'); setEditingModel(null); setModelForm({modelId:'', name:'', isActive:true}); fetchQuestions(); }
      else toast.error(res.error);
    } else {
      const res = await addAiModel(modelForm.modelId, modelForm.name);
      if (res.success) { toast.success('Model added'); setModelForm({modelId:'', name:'', isActive:true}); fetchQuestions(); }
      else toast.error(res.error);
    }
  };

  const handleModelDelete = async (id: string) => {
    if (confirm('Delete this AI model?')) {
      const res = await deleteAiModel(id);
      if (res.success) { toast.success('Deleted'); fetchQuestions(); }
      else toast.error(res.error);
    }
  };`
);

// 3. Dropdown map
content = content.replace(
  `              {models.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}`,
  `              {aiModels.map((m: any) => (
                <option key={m.modelId} value={m.modelId}>{m.name}</option>
              ))}`
);

// 4. Header layout and Tabs wrapper
const oldHeader = `<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 bg-white border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800 rounded-2xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
            <Settings className="w-6 h-6" /> Management Console
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage your interview database. Total Questions: {questions.length}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">`;

const newHeader = `<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 bg-white border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800 rounded-2xl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
            <Settings className="w-6 h-6" /> Management Console
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage your interview database and AI models.
          </p>
        </div>
        
        {/* Tabs */}
        <div className="flex items-center p-1 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 w-full md:w-auto">
          <button 
            onClick={() => setActiveTab('questions')}
            className={\`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2 text-sm font-semibold rounded-lg transition-all \${activeTab === 'questions' ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}\`}
          >
            <LayoutGrid className="w-4 h-4" /> Questions
          </button>
          <button 
            onClick={() => setActiveTab('models')}
            className={\`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2 text-sm font-semibold rounded-lg transition-all \${activeTab === 'models' ? 'bg-white dark:bg-gray-700 text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}\`}
          >
            <Cpu className="w-4 h-4" /> AI Models
          </button>
        </div>
      </div>

      {activeTab === 'models' && (
        <div className="bg-white border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800 rounded-2xl p-6">
          <div className="mb-6 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">AI Models Manager</h2>
          </div>
          
          <form onSubmit={handleModelSubmit} className="flex flex-col md:flex-row gap-4 mb-8 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Model ID (e.g. gemini-2.5-flash)</label>
              <input required type="text" value={modelForm.modelId} onChange={e=>setModelForm({...modelForm, modelId:e.target.value})} className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">Display Name</label>
              <input required type="text" value={modelForm.name} onChange={e=>setModelForm({...modelForm, name:e.target.value})} className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500" />
            </div>
            <div className="flex items-end">
              <button type="submit" className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2">
                {editingModel ? <><Check className="w-4 h-4"/> Update</> : <><Plus className="w-4 h-4"/> Add Model</>}
              </button>
              {editingModel && (
                <button type="button" onClick={() => {setEditingModel(null); setModelForm({modelId:'', name:'', isActive:true})}} className="ml-2 px-5 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors">
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 text-sm text-gray-500">
                  <th className="pb-3 font-medium">Model Name</th>
                  <th className="pb-3 font-medium">Model ID</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50 text-sm">
                {aiModels.map((model: any) => (
                  <tr key={model.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="py-4 font-medium text-gray-900 dark:text-white">{model.name}</td>
                    <td className="py-4 text-gray-500">{model.modelId}</td>
                    <td className="py-4">
                      <span className={\`px-2.5 py-1 text-xs font-medium rounded-full \${model.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}\`}>
                        {model.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-4 text-right">
                      <button onClick={() => { setEditingModel(model); setModelForm({modelId: model.modelId, name: model.name, isActive: model.isActive}); }} className="p-2 text-gray-400 hover:text-blue-600 transition-colors inline-block"><Edit2 className="w-4 h-4"/></button>
                      <button onClick={() => handleModelDelete(model.id)} className="p-2 text-gray-400 hover:text-red-600 transition-colors inline-block ml-1"><Trash2 className="w-4 h-4"/></button>
                    </td>
                  </tr>
                ))}
                {aiModels.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-gray-500">No models found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'questions' && (
        <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-end gap-3 p-4 bg-white border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800 rounded-2xl">
          <div className="flex items-center gap-3 w-full justify-between">
            <span className="text-sm font-medium text-gray-500">Total: {questions.length}</span>
            <div className="flex items-center gap-3 flex-wrap">`;

content = content.replace(oldHeader, newHeader);

// Now close the activeTab div before the modal opens.
// We search for "{/* Ask AI Modal */}"
content = content.replace(
  `{/* Ask AI Modal */}`,
  `</div>\n      )} {/* End activeTab === 'questions' */}\n\n      {/* Ask AI Modal */}`
);

fs.writeFileSync(file, content);
console.log("Refactoring complete");
