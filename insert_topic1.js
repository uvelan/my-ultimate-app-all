const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  const filePath = path.join(__dirname, 'data', 'topic1_answers.json');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

  for (const item of data) {
    const existing = await prisma.interviewQuestion.findFirst({
      where: { problemStatement: item.problemStatement }
    });

    if (existing) {
      console.log(`Updating existing question: ${item.title}`);
      await prisma.interviewQuestion.update({
        where: { id: existing.id },
        data: {
          bestAnswer: item.bestAnswer,
          explanation: item.explanation,
          isAiGenerated: true
        }
      });
    } else {
      console.log(`Creating new question: ${item.title}`);
      await prisma.interviewQuestion.create({
        data: item
      });
    }
  }

  console.log('Done inserting answers into DB.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
