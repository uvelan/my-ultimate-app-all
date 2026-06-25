const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/(protected)/books/[id]/read/page.tsx');

let content = fs.readFileSync(filePath, 'utf8');

if (!content.includes('import { useTheme } from "next-themes";')) {
    content = content.replace("import Link from 'next/link';", "import Link from 'next/link';\nimport { useTheme } from 'next-themes';");
}

const oldLogic = `    const [isLightMode, setIsLightMode] = useState(false);

    useEffect(() => {
        const storedTheme = localStorage.getItem('reader-theme');
        if (storedTheme === 'light') {
            setIsLightMode(true);
            document.documentElement.classList.add('theme-light');
        }
    }, []);

    const toggleTheme = () => {
        setIsLightMode(prev => {
            const next = !prev;
            if (next) {
                document.documentElement.classList.add('theme-light');
                localStorage.setItem('reader-theme', 'light');
            } else {
                document.documentElement.classList.remove('theme-light');
                localStorage.setItem('reader-theme', 'dark');
            }
            return next;
        });
    };`;

const newLogic = `    const { theme, setTheme } = useTheme();
    const isLightMode = theme === 'light';

    const toggleTheme = () => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    };`;

if (content.includes('const [isLightMode, setIsLightMode] = useState(false);')) {
    content = content.replace(oldLogic, newLogic);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("Fixed theme in reader page.");
} else {
    console.log("Could not find old logic block.");
}
