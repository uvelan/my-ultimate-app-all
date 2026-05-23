const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function findFiles(dir, filter) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    for (const file of list) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
            results = results.concat(findFiles(filePath, filter));
        } else if (filePath.endsWith(filter)) {
            results.push(filePath);
        }
    }
    return results;
}

const apiDirs = [
    'src/app/api/novelscraper',
    'src/app/api/tts'
];

let files = [];
apiDirs.forEach(dir => {
    files = files.concat(findFiles(dir, 'route.ts'));
});

const importStatement = `import { verifyAuth } from '@/lib/auth-server';\n`;
const authCheckCode = `
    const auth = await verifyAuth();
    if (!auth.isAuthenticated) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
`;

for (const file of files) {
    let content = fs.readFileSync(file, 'utf-8');
    let modified = false;

    // Check if NextResponse is imported, if not, skip or add it.
    // Actually, NextRequest/NextResponse is usually imported. 
    // If not, let's just make sure it's there.
    if (!content.includes('import {') || !content.includes('NextResponse')) {
        if (!content.includes('NextResponse')) {
            content = `import { NextResponse } from 'next/server';\n` + content;
            modified = true;
        }
    }

    if (!content.includes('verifyAuth')) {
        // Add import after first line (or top)
        if (content.startsWith('export const runtime')) {
            const parts = content.split('\n');
            parts.splice(1, 0, importStatement);
            content = parts.join('\n');
        } else {
            content = importStatement + content;
        }
        modified = true;
    }

    // Now find exported functions
    const regex = /export async function (GET|POST|PUT|PATCH|DELETE)\s*\([^)]*\)\s*\{/g;
    let match;
    let lastIndex = 0;
    let newContent = '';

    while ((match = regex.exec(content)) !== null) {
        newContent += content.substring(lastIndex, match.index + match[0].length);
        lastIndex = match.index + match[0].length;
        
        // check if verifyAuth is already in this function
        // look ahead a bit
        const lookAhead = content.substring(lastIndex, lastIndex + 200);
        if (!lookAhead.includes('await verifyAuth()')) {
            newContent += authCheckCode;
            modified = true;
        }
    }
    newContent += content.substring(lastIndex);
    content = newContent;

    if (modified) {
        fs.writeFileSync(file, content, 'utf-8');
        console.log('Fixed', file);
    }
}
console.log('Done!');
