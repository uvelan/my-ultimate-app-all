const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '../data');
const outputFile = path.join(__dirname, '../data/parsed_questions.json');

const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.md') && file.includes('interview_questions'));

const allQuestions = [];

function parseFile(filePath, fileName) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  let currentQuestion = null;
  let topic = 'backend'; // default
  let difficulty = 'Medium';

  // Try to infer topic from filename
  if (fileName.includes('react') || fileName.includes('frontend')) topic = 'frontend';
  if (fileName.includes('sql') || fileName.includes('data')) topic = 'database';
  if (fileName.includes('system_design') || fileName.includes('architecture')) topic = 'system-design';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for difficulty headers
    if (line.match(/^##\s+Basic Questions/i)) difficulty = 'Easy';
    else if (line.match(/^##\s+Intermediate Questions/i)) difficulty = 'Medium';
    else if (line.match(/^##\s+Advanced Questions/i) || line.match(/^##\s+Scenario-Based/i)) difficulty = 'Hard';

    // Check for new question
    const qMatch = line.match(/^\*\*Q\d+\.\*\*\s+(.*)/);
    if (qMatch) {
      if (currentQuestion) {
        allQuestions.push(currentQuestion);
      }
      currentQuestion = {
        title: qMatch[1].substring(0, 80) + (qMatch[1].length > 80 ? '...' : ''),
        topic: topic,
        difficulty: difficulty,
        estimatedTime: difficulty === 'Hard' ? 15 : (difficulty === 'Medium' ? 10 : 5),
        frequency: Math.floor(Math.random() * 40) + 60, // random 60-99
        companies: [],
        tags: [],
        problemStatement: qMatch[1],
        expectation: "Interviewer Expectation: (Please update via UI)",
        explanation: "Detailed Explanation: (Please update via UI)",
        bestAnswer: "Ideal Answer Outline: (Please update via UI)",
        commonMistakes: [],
        followUpQuestions: [],
        codeSnippet: null,
        mcqs: []
      };
    } else if (currentQuestion && line.length > 0) {
      // Append extra lines to problem statement if it doesn't look like a new section
      if (!line.startsWith('## ') && !line.startsWith('---')) {
         currentQuestion.problemStatement += '\n' + line;
      }
    }
  }

  if (currentQuestion) {
    allQuestions.push(currentQuestion);
  }
}

files.forEach(file => {
  parseFile(path.join(dataDir, file), file);
});

fs.writeFileSync(outputFile, JSON.stringify(allQuestions, null, 2));
console.log(`Parsed ${allQuestions.length} questions into ${outputFile}`);
