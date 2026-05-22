const fs = require('fs');

let schema = fs.readFileSync('prisma/schema.prisma', 'utf8');

if (!schema.includes('InterviewGoal')) {
    schema += `
model InterviewGoal {
  id          String   @id @default(auto()) @map("_id") @db.ObjectId
  userId      String   @db.ObjectId
  title       String
  topic       String?
  company     String?
  difficulty  String?
  targetCount Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  user        User     @relation(fields: [userId], references: [id])
}

model InterviewProgress {
  id           String   @id @default(auto()) @map("_id") @db.ObjectId
  userId       String   @db.ObjectId
  questionId   String   @db.ObjectId
  completedAt  DateTime @default(now())

  user         User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  question     InterviewQuestion @relation(fields: [questionId], references: [id], onDelete: Cascade)

  @@unique([userId, questionId])
}
`;

    // Add relations to User
    schema = schema.replace(
        /(model User \{[\s\S]*?)(^\})/m,
        `$1  interviewGoals     InterviewGoal[]
  interviewProgress  InterviewProgress[]
$2`
    );

    // Add relation to InterviewQuestion
    schema = schema.replace(
        /(model InterviewQuestion \{[\s\S]*?)(^\})/m,
        `$1  progress           InterviewProgress[]
$2`
    );

    fs.writeFileSync('prisma/schema.prisma', schema);
    console.log("Schema updated successfully.");
} else {
    console.log("Schema already updated.");
}
