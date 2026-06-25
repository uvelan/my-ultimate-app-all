const fs = require('fs');
const path = require('path');

const files = [
  'src/components/resume-builder/steps/Step3Experience.tsx',
  'src/components/resume-builder/steps/Step4Education.tsx',
  'src/components/resume-builder/steps/Step6Projects.tsx',
  'src/components/resume-builder/steps/Step7Certifications.tsx',
  'src/components/resume-builder/steps/Step8Awards.tsx',
  'src/components/resume-builder/steps/Step9Publications.tsx',
];

for (const file of files) {
  const fullPath = path.join(__dirname, '..', file);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Add style={provided.draggableProps.style as React.CSSProperties} if not exists
    if (!content.includes('style={provided.draggableProps.style as React.CSSProperties}')) {
        content = content.replace(/\{\.\.\.provided\.draggableProps\}/g, '{...provided.draggableProps}\n                        style={provided.draggableProps.style as React.CSSProperties}');
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Fixed ${file}`);
    }
  }
}

// Special case for TaskBoard.tsx
const tbPath = path.join(__dirname, '../src/components/tasks/TaskBoard.tsx');
if (fs.existsSync(tbPath)) {
    let tbContent = fs.readFileSync(tbPath, 'utf8');
    if (!tbContent.includes('as React.CSSProperties')) {
        tbContent = tbContent.replace(/style=\{getItemStyle\(/g, 'style={getItemStyle(');
        // Let's just cast the return type of getItemStyle
        tbContent = tbContent.replace(/const getItemStyle = \([^)]+\) => \(\{/g, 'const getItemStyle = (isDragging: boolean, draggableStyle: any): React.CSSProperties => ({');
        fs.writeFileSync(tbPath, tbContent, 'utf8');
        console.log('Fixed TaskBoard.tsx');
    }
}
