const fs = require('fs');
const path = require('path');

const file = path.join('k:', 'Projects', 'my-ultimate-app-all', 'mobile-app', 'app', 'reader', '[id].tsx');
let code = fs.readFileSync(file, 'utf8');

// Imports
code = code.replace(
    'Modal, Switch, Animated, Dimensions, Platform, TouchableOpacity, FlatList,',
    'Modal, Switch, Animated, Dimensions, Platform, TouchableOpacity, FlatList, TextInput, Alert,'
);
if (!code.includes('Trash2')) {
    code = code.replace(
        'SkipBack, SkipForward, Play, Pause as PauseIcon,',
        'SkipBack, SkipForward, Play, Pause as PauseIcon, Trash2,'
    );
}

// State
if (!code.includes('const [aiModel, setAiModel]')) {
    code = code.replace(
        'const [replacementsEnabled, setReplacementsEnabled] = useState(true);',
        `const [replacementsEnabled, setReplacementsEnabled] = useState(true);
    const [aiModel, setAiModel] = useState('OFF');
    const [searchWord, setSearchWord] = useState('');
    const [replaceWord, setReplaceWord] = useState('');
    const [isRegexRule, setIsRegexRule] = useState(false);`
    );
    
    // Add initialization from cache
    code = code.replace(
        `const theme = cacheService.get('reader-theme');`,
        `const theme = cacheService.get('reader-theme');
        const savedModel = cacheService.get('reader-ai-model');
        if (savedModel) setAiModel(savedModel);`
    );
}

// Handlers
const handlers = `
    const changeAiModel = (m: string) => {
        setAiModel(m);
        cacheService.set('reader-ai-model', m);
    };

    const handleAddReplacement = async () => {
        if (!searchWord.trim()) return;
        try {
            await replacementService.addReplacement({ bookId: id, search: searchWord, replace: replaceWord, isRegex: isRegexRule });
            setSearchWord('');
            setReplaceWord('');
            fetchReplacements();
        } catch (e) { Alert.alert('Error', 'Failed to add rule'); }
    };

    const handleRemoveReplacement = async (ruleId: string) => {
        try {
            await replacementService.deleteReplacement(ruleId);
            fetchReplacements();
        } catch (e) { Alert.alert('Error', 'Failed to remove rule'); }
    };
`;

if (!code.includes('const changeAiModel')) {
    code = code.replace(
        'const toggleTheme = () => {',
        handlers + '\n    const toggleTheme = () => {'
    );
}

// Grammar Fix logic
code = code.split(`const res = await bookService.proposeGrammarCorrection(id as string, chapterId, 'gemini-2.5-flash');`).join(`if (aiModel === 'OFF') return;
            const res = await bookService.proposeGrammarCorrection(id as string, chapterId, aiModel);`);

code = code.split(`<Pressable onPress={handleGrammarCorrection} disabled={isCorrecting} className={\`bg-accent/10 p-1.5 rounded-full \${isCorrecting ? 'opacity-50' : ''}\`}>`).join(`<Pressable onPress={() => aiModel === 'OFF' ? setIsSettingsOpen(true) : handleGrammarCorrection()} disabled={isCorrecting} className={\`bg-accent/10 p-1.5 rounded-full \${(isCorrecting || aiModel === 'OFF') ? 'opacity-50' : ''}\`}>`);

// Settings UI 
const replacementUI = `
                        <View className="flex-row items-center justify-between mb-2">
                            <View>
                                <Text className={\`\${th.textSec} font-bold\`}>Custom Replacements</Text>
                                <Text className={\`\${th.textMuted} text-xs\`}>Apply {replacements.length} custom text rules</Text>
                            </View>
                            <Switch
                                value={replacementsEnabled}
                                onValueChange={setReplacementsEnabled}
                                trackColor={{ false: '#2a2a2a', true: '#6d28d9' }}
                                thumbColor="#8b5cf6"
                            />
                        </View>
                        
                        {replacementsEnabled && (
                            <View className="mb-6">
                                <View className={\`flex-row items-center gap-2 mb-3 \${th.bg} p-2 rounded-lg border \${th.border}\`}>
                                    <TextInput 
                                        className={\`flex-1 \${th.text} p-2\`}
                                        placeholder="Search..."
                                        placeholderTextColor={th.icon}
                                        value={searchWord}
                                        onChangeText={setSearchWord}
                                    />
                                    <TextInput 
                                        className={\`flex-1 \${th.text} p-2 border-l \${th.border}\`}
                                        placeholder="Replace..."
                                        placeholderTextColor={th.icon}
                                        value={replaceWord}
                                        onChangeText={setReplaceWord}
                                    />
                                    <TouchableOpacity onPress={handleAddReplacement} className="p-2 bg-accent rounded-lg">
                                        <Plus size={20} color="#fff" />
                                    </TouchableOpacity>
                                </View>
                                {replacements.map(rule => (
                                    <View key={rule._id || rule.id} className={\`flex-row justify-between items-center p-3 mb-2 rounded-lg border \${th.border}\`}>
                                        <View className="flex-1">
                                            <Text className={\`\${th.text} font-bold\`} numberOfLines={1}>{rule.search} <Text className="text-accent">→</Text> {rule.replace}</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => handleRemoveReplacement(rule._id || rule.id)} className="p-2">
                                            <Trash2 size={18} color="#ef4444" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}
                        
                        <View className="border-t border-border/30 pt-4 mb-6">
                            <Text className={\`text-xl font-bold \${th.text} font-serif mb-4\`}>AI Model</Text>
                            <View className="flex-row flex-wrap gap-2">
                                {['OFF', 'gemini-2.5-flash', 'gpt-4o-mini', 'ollama'].map(m => (
                                    <TouchableOpacity 
                                        key={m}
                                        onPress={() => changeAiModel(m)}
                                        className={\`px-3 py-2 rounded-lg border \${aiModel === m ? 'bg-accent border-accent' : \`\${th.bg} \${th.border}\`}\`}
                                    >
                                        <Text className={\`font-bold \${aiModel === m ? 'text-white' : th.textSec}\`}>{m === 'OFF' ? 'Disabled' : m.replace('gemini-2.5-flash', 'Gemini Flash').replace('gpt-4o-mini', 'GPT-4o Mini').replace('ollama', 'Local (Ollama)')}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
`;

const fromUI = `<View className="flex-row items-center justify-between mb-6">
                            <View>
                                <Text className={\`\${th.textSec} font-bold\`}>Custom Replacements</Text>
                                <Text className={\`\${th.textMuted} text-xs\`}>Apply {replacements.length} custom text rules</Text>
                            </View>
                            <Switch
                                value={replacementsEnabled}
                                onValueChange={setReplacementsEnabled}
                                trackColor={{ false: '#2a2a2a', true: '#6d28d9' }}
                                thumbColor="#8b5cf6"
                            />
                        </View>`;

code = code.replace(fromUI, replacementUI);

fs.writeFileSync(file, code);
console.log('Script injection complete');
