const fs = require('fs');
const path = require('path');

const dirs = [
  path.join(__dirname, '../src/components/resume-builder'),
  path.join(__dirname, '../src/app/resume-builder')
];

const replacements = [
  // Backgrounds
  { regex: /bg-white/g, replacement: 'bg-surface' },
  { regex: /bg-slate-50/g, replacement: 'bg-surface-2' },
  { regex: /bg-slate-100/g, replacement: 'bg-surface-3' },
  { regex: /bg-slate-800/g, replacement: 'bg-surface-3' },
  { regex: /bg-slate-900/g, replacement: 'bg-surface-2' },
  
  // Borders
  { regex: /border-slate-200/g, replacement: 'border-border' },
  { regex: /border-slate-300/g, replacement: 'border-border-hover' },
  { regex: /border-slate-700/g, replacement: 'border-border' },
  { regex: /border-slate-800/g, replacement: 'border-border' },
  
  // Text Colors
  { regex: /text-slate-900/g, replacement: 'text-text-primary' },
  { regex: /text-slate-800/g, replacement: 'text-text-primary' },
  { regex: /text-slate-700/g, replacement: 'text-text-secondary' },
  { regex: /text-slate-600/g, replacement: 'text-text-muted' },
  { regex: /text-slate-500/g, replacement: 'text-text-muted' },
  { regex: /text-slate-400/g, replacement: 'text-text-muted' },
  { regex: /text-gray-900/g, replacement: 'text-text-primary' },
  { regex: /text-gray-800/g, replacement: 'text-text-primary' },
  { regex: /text-gray-700/g, replacement: 'text-text-secondary' },
  { regex: /text-gray-600/g, replacement: 'text-text-muted' },
  { regex: /text-gray-500/g, replacement: 'text-text-muted' },
  { regex: /text-gray-400/g, replacement: 'text-text-muted' }
];

function processDirectory(directory) {
  if (!fs.existsSync(directory)) return;
  const files = fs.readdirSync(directory);
  for (const file of files) {
    const fullPath = path.join(directory, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let originalContent = content;
      for (const { regex, replacement } of replacements) {
        content = content.replace(regex, replacement);
      }
      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

for (const dir of dirs) {
    processDirectory(dir);
}
console.log("Resume Builder refactoring complete.");
