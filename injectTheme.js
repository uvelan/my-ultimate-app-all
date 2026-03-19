const fs = require('fs');
const path = require('path');

const file = path.join('k:', 'Projects', 'my-ultimate-app-all', 'mobile-app', 'app', 'reader', '[id].tsx');
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('Sun, Moon,')) {
    code = code.replace(
        'Settings, Headphones, CloudOff,',
        'Settings, Headphones, CloudOff, Sun, Moon,'
    );
}

if (!code.includes('isLightMode')) {
    code = code.replace(
        'const [replacementsEnabled, setReplacementsEnabled] = useState(true);',
        `const [replacementsEnabled, setReplacementsEnabled] = useState(true);
    const [isLightMode, setIsLightMode] = useState(false);

    useEffect(() => {
        const theme = cacheService.get('reader-theme');
        if (theme === 'light') setIsLightMode(true);
    }, []);

    const toggleTheme = () => {
        setIsLightMode(p => {
            const next = !p;
            cacheService.set('reader-theme', next ? 'light' : 'dark');
            return next;
        });
    };`
    );
}

const helpers = `
    const th = {
        bg: isLightMode ? 'bg-[#fdfdfc]' : 'bg-background',
        surface: isLightMode ? 'bg-[#f3f3f0]' : 'bg-background-surface',
        text: isLightMode ? 'text-[#171717]' : 'text-text-primary',
        textMuted: isLightMode ? 'text-[#666666]' : 'text-text-muted',
        textSec: isLightMode ? 'text-[#444444]' : 'text-text-secondary',
        border: isLightMode ? 'border-[#e5e5e0]' : 'border-border',
        icon: isLightMode ? '#666666' : '#a39b98',
    };
`;

if (!code.includes('const th = {')) {
    code = code.replace(
        'const currentChapterNum = parseInt(chapterId);',
        helpers + '\n    const currentChapterNum = parseInt(chapterId);'
    );
}

// Ensure toggleTheme is inserted only once
if (!code.includes('<Sun size={18}')) {
    code = code.replace(
        '<Pressable onPress={() => setIsSettingsOpen(true)} className="p-1.5">',
        `<Pressable onPress={toggleTheme} className="p-1.5">
                        {isLightMode ? <Moon size={18} color="#666" /> : <Sun size={18} color={th.icon} />}
                    </Pressable>
                    <Pressable onPress={() => setIsSettingsOpen(true)} className="p-1.5">`
    );
}

const replacements = [
    { from: 'className="flex-1 bg-background"', to: 'className={`flex-1 ${th.bg}`}' },
    { from: 'className="px-4 py-3 flex-row justify-between items-center bg-background-surface border-b border-border"', to: 'className={`px-4 py-3 flex-row justify-between items-center ${th.surface} border-b ${th.border}`}' },
    { from: 'color="#a39b98"', to: 'color={th.icon}' },
    { from: 'className="text-text-primary font-bold font-serif text-sm"', to: 'className={`${th.text} font-bold font-serif text-sm`}' },
    { from: 'className="text-text-primary font-serif leading-8 text-center"', to: 'className={`${th.text} font-serif leading-8 text-center`}' },
    { from: 'className="text-text-primary font-serif leading-8"', to: 'className={`${th.text} font-serif leading-8`}' },
    { from: 'className="absolute bottom-0 left-0 right-0 bg-background-surface border-t border-border px-6 py-4 flex-row justify-between items-center"', to: 'className={`absolute bottom-0 left-0 right-0 ${th.surface} border-t ${th.border} px-6 py-4 flex-row justify-between items-center`}' },
    { from: 'className={`ml-1 font-bold ${currentChapterNum <= 0 ? \\\'text-border\\\' : \\\'text-accent\\\'}`}', to: 'className={`ml-1 font-bold ${currentChapterNum <= 0 ? th.border : \\\'text-accent\\\'}`}' },
    { from: 'className={`mr-1 font-bold ${totalChapters > 0 && currentChapterNum >= totalChapters - 1 ? \\\'text-border\\\' : \\\'text-accent\\\'}`}', to: 'className={`mr-1 font-bold ${totalChapters > 0 && currentChapterNum >= totalChapters - 1 ? th.border : \\\'text-accent\\\'}`}' },
    { from: 'className="text-text-primary text-base font-bold font-serif"', to: 'className={`${th.text} text-base font-bold font-serif`}' },
    { from: 'className={`px-4 py-3 border-b border-border/20 ${isActive ? \\\'bg-accent/20 border-l-2 border-l-accent pl-3\\\' : \\\'\\\'}`}', to: 'className={`px-4 py-3 border-b ${th.border}/20 ${isActive ? \\\'bg-accent/20 border-l-2 border-l-accent pl-3\\\' : \\\'\\\'}`}' },
    { from: 'className={`text-sm font-serif ${isActive ? \\\'text-accent font-bold\\\' : \\\'text-text-secondary\\\'}`}', to: 'className={`text-sm font-serif ${isActive ? \\\'text-accent font-bold\\\' : th.textSec}`}' },
    { from: 'className="px-4 pb-4 border-b border-border/50 flex-row items-center justify-between"', to: 'className={`px-4 pb-4 border-b ${th.border}/50 flex-row items-center justify-between`}' },
    { from: 'className="flex-row items-center justify-between bg-background p-3 rounded-xl border border-border mb-6"', to: 'className={`flex-row items-center justify-between ${th.bg} p-3 rounded-xl border ${th.border} mb-6`}' },
    { from: 'className={`px-4 py-2 rounded-lg border ${rate === r ? \\\'bg-accent border-accent\\\' : \\\'bg-background border-border\\\'}`}', to: 'className={`px-4 py-2 rounded-lg border ${rate === r ? \\\'bg-accent border-accent\\\' : \`\${th.bg} \${th.border}\`}`}' },
    { from: 'className={`font-bold ${rate === r ? \\\'text-white\\\' : \\\'text-text-secondary\\\'}`}', to: 'className={`font-bold ${rate === r ? \\\'text-white\\\' : th.textSec}`}' },
    { from: 'className="bg-background-surface rounded-t-3xl p-6 min-h-[40%] border-t border-border"', to: 'className={`${th.surface} rounded-t-3xl p-6 min-h-[40%] border-t ${th.border}`}' },
    { from: 'className="text-2xl font-bold text-text-primary font-serif"', to: 'className={`text-2xl font-bold ${th.text} font-serif`}' },
    { from: 'className="text-text-secondary font-bold mb-3"', to: 'className={`${th.textSec} font-bold mb-3`}' },
    { from: 'className="text-text-secondary font-bold"', to: 'className={`${th.textSec} font-bold`}' },
    { from: 'className="text-text-muted text-xs"', to: 'className={`${th.textMuted} text-xs`}' },
    { from: 'className="text-xl font-bold text-text-primary font-serif mb-4"', to: 'className={`text-xl font-bold ${th.text} font-serif mb-4`}' },
    { from: 'className={`flex-1 px-4 py-3 rounded-xl border items-center ${selectedTimerMinutes === m ? \\\'bg-accent border-accent\\\' : \\\'bg-background border-border\\\'}`}', to: 'className={`flex-1 px-4 py-3 rounded-xl border items-center ${selectedTimerMinutes === m ? \\\'bg-accent border-accent\\\' : \`\${th.bg} \${th.border}\`}`}' },
    { from: 'className={`font-bold ${selectedTimerMinutes === m ? \\\'text-white\\\' : \\\'text-text-secondary\\\'}`}', to: 'className={`font-bold ${selectedTimerMinutes === m ? \\\'text-white\\\' : th.textSec}`}' },
    { from: 'className="text-text-muted text-xs italic"', to: 'className={`${th.textMuted} text-xs italic`}' },
];

for (const r of replacements) {
    code = code.split(r.from).join(r.to);
}

code = code.replace(
    /backgroundColor: '#1a1412'/g,
    'backgroundColor: isLightMode ? "#f3f3f0" : "#1a1412"'
);

code = code.replace(
    /className="text-text-primary font-bold text-lg"/g,
    'className={`${th.text} font-bold text-lg`}'
);

fs.writeFileSync(file, code);
console.log('Done!');
