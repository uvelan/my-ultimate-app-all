const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../src/components/interview');

const replacements = [
  { regex: /bg-white dark:bg-gray-900/g, replacement: 'bg-surface' },
  { regex: /bg-white\/60 dark:bg-gray-900\/60/g, replacement: 'bg-surface/60' },
  { regex: /bg-white dark:bg-gray-800\/60/g, replacement: 'bg-surface' },
  { regex: /bg-white dark:bg-gray-800/g, replacement: 'bg-surface' },
  { regex: /bg-gray-50 dark:bg-gray-800\/50/g, replacement: 'bg-surface-2' },
  { regex: /bg-gray-50 dark:bg-gray-800/g, replacement: 'bg-surface-2' },
  { regex: /bg-gray-50 dark:bg-gray-900/g, replacement: 'bg-surface-2' },
  { regex: /bg-gray-100 dark:bg-gray-800/g, replacement: 'bg-surface-2' },
  { regex: /border-gray-200 dark:border-gray-800/g, replacement: 'border-border' },
  { regex: /border-gray-200 dark:border-gray-700/g, replacement: 'border-border' },
  { regex: /border-gray-200\/60 dark:border-gray-700\/50/g, replacement: 'border-border/60' },
  { regex: /border-gray-100 dark:border-gray-800/g, replacement: 'border-border' },
  { regex: /text-gray-900 dark:text-white/g, replacement: 'text-text-primary' },
  { regex: /text-gray-800 dark:text-gray-200/g, replacement: 'text-text-primary' },
  { regex: /text-gray-700 dark:text-gray-300/g, replacement: 'text-text-secondary' },
  { regex: /text-gray-700 dark:text-gray-200/g, replacement: 'text-text-secondary' },
  { regex: /text-gray-600 dark:text-gray-400/g, replacement: 'text-text-muted' },
  { regex: /text-gray-600 dark:text-gray-300/g, replacement: 'text-text-muted' },
  { regex: /text-gray-500 dark:text-gray-400/g, replacement: 'text-text-muted' },
  { regex: /dark:text-white/g, replacement: 'text-text-primary' },
  { regex: /dark:bg-gray-900/g, replacement: 'bg-surface' },
  { regex: /dark:bg-gray-800/g, replacement: 'bg-surface-2' },
  { regex: /dark:border-gray-800/g, replacement: 'border-border' },
  { regex: /dark:border-gray-700/g, replacement: 'border-border' }
];

function processDirectory(directory) {
  const files = fs.readdirSync(directory);
  for (const file of files) {
    const fullPath = path.join(directory, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
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

processDirectory(dir);
console.log("Refactoring complete.");
