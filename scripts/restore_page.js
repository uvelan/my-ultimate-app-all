const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/(protected)/books/[id]/read/page.tsx');

let content = fs.readFileSync(filePath, 'utf8');

const missingBlock = `
import { useTheme } from 'next-themes';
import { saveBookToCache, getBookFromCache, deleteBookFromCache, Book as DBBook } from '@/lib/book-db';

interface Chapter {
    id: string;
    title: string;
    content: string[];
}

interface Book {
    id: string;
    title: string;
    cover?: string;
    chapters: Chapter[];
}

export default function ReadBookPage() {
    const params = useParams();
    const router = useRouter();
    const [book, setBook] = useState<Book | null>(null);
    const [loading, setLoading] = useState(true);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
    const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
    const [selectedVoice, setSelectedVoice] = useState('Microsoft Neerja Online (Natural) - English (India)');
    const [fontSize, setFontSize] = useState(20);
    const [replacementRules, setReplacementRules] = useState<any[]>([]);
    const [showReplacementModal, setShowReplacementModal] = useState(false);

    const { theme, setTheme } = useTheme();
    const isLightMode = theme === 'light';

    const toggleTheme = () => {
        setTheme(theme === 'dark' ? 'light' : 'dark');
    };

    const [isCorrectingGrammar, setIsCorrectingGrammar] = useState(false);
    const [showDiffModal, setShowDiffModal] = useState(false);
    const [correctedContent, setCorrectedContent] = useState<string[] | null>(null);
    const [aiModel, setAiModel] = useState('OFF');
    const correctedChaptersRef = useRef<Set<string>>(new Set());
    const [processedContent, setProcessedContent] = useState<string[]>([]);
`;

// Insert the missing block right after "import Link from 'next/link';"
const anchor = "import Link from 'next/link';";
if (content.includes(anchor)) {
    content = content.replace(anchor, anchor + missingBlock);
    
    // Check if there is an extra 'use client' and imports at the top
    const lines = content.split('\\n');
    let outputLines = [];
    let insideDuplicate = false;
    
    // We already removed the duplicate in a previous step, but let's just write the content out directly.
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("File restored successfully.");
} else {
    console.log("Could not find anchor to restore file.");
}
