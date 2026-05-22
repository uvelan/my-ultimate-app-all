const fs = require('fs');

const authCheck = `\n  const { isAuthenticated, user } = await verifyAuth();\n  if (!isAuthenticated || !user) throw new Error('Unauthorized');\n`;

function secureFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    if (!content.includes('verifyAuth')) {
        content = content.replace(/(import { prisma } from '@\/lib\/prisma';?)/, `$1\nimport { verifyAuth } from '@/lib/auth-server';`);
    }

    content = content.replace(/export async function (\w+)\(([^)]*)\) {\s*try {/g, (match, p1, p2) => {
        return `export async function ${p1}(${p2}) {\n  const { isAuthenticated, user } = await verifyAuth();\n  if (!isAuthenticated || !user) throw new Error('Unauthorized');\n  try {`;
    });
    
    // For functions without try { directly
    content = content.replace(/export async function (\w+)\(([^)]*)\) {\n(?!\s*const { isAuthenticated)/g, (match, p1, p2) => {
        if (!content.includes(`export async function ${p1}`)) return match; // fallback
        return `${match}${authCheck}`;
    });

    fs.writeFileSync(filePath, content);
}

secureFile('src/actions/interview.ts');
secureFile('src/actions/ai.ts');
console.log('Secured actions');
