/* Local-only import: node scripts/backfill-interview-answers.cjs --input=FILE [--apply]
 * No external generation provider is called. Dry-run by default. Backups and
 * complete prompt/module records are saved beneath .codex-remote-attachments/.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.local', quiet: true });
require('dotenv').config({ quiet: true });

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const input = args.find(a => a.startsWith('--input='))?.slice('--input='.length);
const directory = path.join(root, '.codex-remote-attachments', 'interview-backfill');
const placeholder = value => !value?.trim() || /Please update via UI|Please provide|^\s*(?:TODO|TBD|mock answer|dummy answer)\s*$/i.test(value);

// Reuse the actual application prompt and mapper, with no copied prompt to drift.
function loadGenerationContract() {
  const source = fs.readFileSync(path.join(root, 'src/actions/ai.ts'), 'utf8');
  const ast = ts.createSourceFile('ai.ts', source, ts.ScriptTarget.Latest, true);
  const declarations = ast.statements.filter(s =>
    (ts.isVariableStatement(s) && s.declarationList.declarations.some(d => d.name.getText(ast) === 'SYSTEM_PROMPT')) ||
    (ts.isFunctionDeclaration(s) && s.name?.text === 'normalizeAIResponse'));
  if (declarations.length !== 2) throw new Error('Application generation contract changed; review the backfill.');
  const javascript = ts.transpileModule(declarations.map(s => s.getText(ast)).join('\n') +
    '\nmodule.exports = { SYSTEM_PROMPT, normalizeAIResponse };',
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { module: { exports: {} } };
  vm.runInNewContext(javascript, context);
  return context.module.exports;
}

const words = value => typeof value === 'string' ? value.trim().split(/\s+/).length : 0;
function validate(module) {
  const errors = [];
  const text = (value, name, min = 1) => {
    if (typeof value !== 'string' || words(value) < min || placeholder(value)) errors.push(name);
  };
  const list = (value, name, min, exact) => {
    if (!Array.isArray(value) || value.length < min || (exact && value.length !== min)) errors.push(name);
    else value.forEach((item, i) => text(item, `${name}[${i}]`));
  };
  for (const key of ['title','topic','difficulty','problemStatement','expectation','bestAnswer','realWorldUsage']) text(module[key], key);
  for (const key of ['estimatedTime','frequency']) if (!Number.isFinite(module[key])) errors.push(key);
  // Imported question metadata may legitimately have no company attribution.
  list(module.companies, 'companies', 0);
  list(module.tags, 'tags', 1);
  for (const key of ['whatIsBeingTested','whyItMatters','seniorLevelDirection']) text(module.questionBreakdown?.[key], `questionBreakdown.${key}`);
  for (const [key, min] of Object.entries({ beginner: 20, intermediate: 40, senior: 65, staffArchitect: 90 })) text(module.answerEvolution?.[key], `answerEvolution.${key}`, min);
  const sentences = value => typeof value === 'string' ? value.split(/[.!?](?:\s|$)/).filter(s=>s.trim()).length : 0;
  for (const [name,value,min,max] of [
    ['expectation',module.expectation,2,3],['bestAnswer',module.bestAnswer,3,5],['realWorldUsage',module.realWorldUsage,2,3],
    ...Object.entries({beginner:[2,4],intermediate:[4,6],senior:[6,10],staffArchitect:[8,12]})
      .map(([key,[min,max]])=>[`answerEvolution.${key}`,module.answerEvolution?.[key],min,max])
  ]) if (sentences(value)<min || sentences(value)>max) errors.push(`${name} sentence count`);
  for (const [key, min, max] of [['inDepthExplanation',300,500],['productionScenario',150,250],['performanceOptimization',100,200],['systemDesignConnection',100,200]]) {
    text(module[key], key, min);
    if (words(module[key]) > max) errors.push(`${key} exceeds ${max} words`);
  }
  list(module.internalFlow, 'internalFlow', 5);
  for (const key of ['language','beginner','production','antiPattern']) text(module.codeExamples?.[key], `codeExamples.${key}`);
  if (/^(system[- ]design|backend|microservices|java|spring boot)$/i.test(module.topic) &&
      module.codeExamples?.language?.toLowerCase() !== 'java') errors.push('codeExamples.language must be java for Java-focused preparation');
  for (const key of ['basic','advanced','trap']) list(module.followUpQuestions?.[key], `followUpQuestions.${key}`, 2);
  if (!Array.isArray(module.comparison) || module.comparison.length < 2) errors.push('comparison');
  else module.comparison.forEach((row, i) => ['feature','optionA','optionB'].forEach(k => text(row[k], `comparison[${i}].${k}`)));
  if (!Array.isArray(module.commonBugs) || module.commonBugs.length < 2) errors.push('commonBugs');
  else module.commonBugs.forEach((bug, i) => ['bug','cause','fix','tool'].forEach(k => text(bug[k], `commonBugs[${i}].${k}`)));
  list(module.commonMistakes, 'commonMistakes', 3);
  list(module.bestPractices, 'bestPractices', 5);
  list(module.edgeCases, 'edgeCases', 3);
  list(module.revisionSummary?.keyTakeaways, 'revisionSummary.keyTakeaways', 5, true);
  for (const key of ['seniorOneLiner','architectOneLiner']) text(module.revisionSummary?.[key], `revisionSummary.${key}`);
  if (!Array.isArray(module.mcqs) || module.mcqs.length !== 2) errors.push('mcqs');
  else module.mcqs.forEach((mcq, i) => {
    text(mcq.question, `mcqs[${i}].question`);
    text(mcq.explanation, `mcqs[${i}].explanation`);
    list(mcq.options, `mcqs[${i}].options`, 4, true);
    if (!Number.isInteger(mcq.correctAnswerIndex) || mcq.correctAnswerIndex < 0 || mcq.correctAnswerIndex > 3) errors.push(`mcqs[${i}].correctAnswerIndex`);
  });
  return errors;
}

function toDatabase(module, normalizeAIResponse) {
  const normalized = normalizeAIResponse(module);
  const extra = [
    ['Question Breakdown',Object.entries(module.questionBreakdown).map(([k,v])=>`**${k}:** ${v}`).join('\n\n')],
    ['Beginner Answer',module.answerEvolution.beginner],
    ['Comparison',module.comparison.map(r=>`- **${r.feature}:** A: ${r.optionA}; B: ${r.optionB}`).join('\n')],
    ['Common Production Bugs',module.commonBugs.map(b=>`- **${b.bug}** Cause: ${b.cause}. Fix: ${b.fix}. Tool: ${b.tool}.`).join('\n')],
    ['Best Practices',module.bestPractices.map(v=>`- ${v}`).join('\n')],
    ['Edge Cases',module.edgeCases.map(v=>`- ${v}`).join('\n')],
    ['Revision Summary',module.revisionSummary.keyTakeaways.map(v=>`- ${v}`).join('\n')+`\n\n**Senior:** ${module.revisionSummary.seniorOneLiner}\n\n**Architect:** ${module.revisionSummary.architectOneLiner}`]
  ].map(([h,v])=>`\n\n### ${h}\n${v}`).join('');
  const data = Object.fromEntries(['expectation','explanation','bestAnswer','alternativeAnswer','commonMistakes','followUpQuestions','realWorldUsage','codeSnippet','mcqs','isAiGenerated'].map(k=>[k,normalized[k]]));
  data.explanation += extra;
  return data;
}

async function main() {
  const prisma = new PrismaClient();
  const { SYSTEM_PROMPT, normalizeAIResponse } = loadGenerationContract();
  const promptHash = crypto.createHash('sha256').update(SYSTEM_PROMPT).digest('hex');
  fs.mkdirSync(directory, { recursive: true });
  const log = event => {
    const line = JSON.stringify({time:new Date().toISOString(),...event});
    fs.appendFileSync(path.join(directory,'progress.jsonl'),line+'\n');
    console.log(line);
  };
  try {
    const questions = await prisma.interviewQuestion.findMany({orderBy:[{createdAt:'asc'},{id:'asc'}]});
    log({event:'scan',total:questions.length,placeholders:questions.filter(q=>placeholder(q.bestAnswer)).length,apply,promptHash});
    if (!input) {
      if (apply) throw new Error('--apply requires a local --input JSON file');
      return;
    }
    const modules = JSON.parse(fs.readFileSync(path.resolve(root,input),'utf8'));
    if (!Array.isArray(modules)) throw new Error('Input must be an array of {questionId, module}');
    if (new Set(modules.map(entry=>entry.questionId)).size !== modules.length) throw new Error('Duplicate question IDs in input');
    // Validate the entire input before writing any database record.
    const prepared = modules.map(entry => {
      const question = questions.find(q=>q.id===entry.questionId);
      if (!question) throw new Error(`Unknown question: ${entry.questionId}`);
      if (entry.module.problemStatement !== question.problemStatement) throw new Error(`Question scope mismatch: ${question.id}`);
      const errors = validate(entry.module);
      if (errors.length) throw new Error(`${question.id}: ${errors.join(', ')}`);
      return {question,module:entry.module,data:toDatabase(entry.module,normalizeAIResponse)};
    });
    for (const {question,module,data} of prepared) {
      if (!placeholder(question.bestAnswer)) {log({event:'skipCompleted',id:question.id});continue;}
      if (!apply) {log({event:'validated',id:question.id,title:question.title});continue;}
      const file = path.join(directory,question.id+'.json');
      if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file,'utf8')).status === 'saved') throw new Error(`Previously saved record unexpectedly has a placeholder: ${question.id}`);
      const record = {status:'validated',id:question.id,source:'locally-authored',promptHash,systemPrompt:SYSTEM_PROMPT,prompt:question.problemStatement,before:question,generated:module,data};
      fs.writeFileSync(file,JSON.stringify(record,null,2));
      const result = await prisma.interviewQuestion.updateMany({where:{id:question.id,updatedAt:question.updatedAt,bestAnswer:question.bestAnswer},data});
      if (result.count !== 1) throw new Error(`Concurrent edit detected: ${question.id}`);
      const saved = await prisma.interviewQuestion.findUnique({where:{id:question.id}});
      for (const [key,value] of Object.entries(data)) if (JSON.stringify(saved[key]) !== JSON.stringify(value)) throw new Error(`Read-back mismatch: ${question.id}.${key}`);
      for (const key of ['title','topic','difficulty','estimatedTime','frequency','companies','tags','problemStatement','createdAt']) {
        if (JSON.stringify(saved[key]) !== JSON.stringify(question[key])) throw new Error(`Metadata mismatch: ${question.id}.${key}`);
      }
      record.status='saved';record.savedAt=new Date().toISOString();
      fs.writeFileSync(file,JSON.stringify(record,null,2));
      log({event:'saved',id:question.id,title:question.title});
    }
    log({event:'finished',remaining:(await prisma.interviewQuestion.findMany({select:{bestAnswer:true}})).filter(q=>placeholder(q.bestAnswer)).length});
  } finally {await prisma.$disconnect();}
}
if (require.main === module) main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={placeholder,validate,loadGenerationContract,toDatabase};
