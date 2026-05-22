import { PrismaClient } from '@prisma/client';
import { POST } from './src/app/api/novelscraper/scrape-link/route';
import fs from 'fs';

const prisma = new PrismaClient();

async function runTest() {
    let output = "Fetching sites...\n";
    let site = await prisma.sourceWebsite.findFirst({ where: { url: { contains: 'novelfull' } } });
    
    if (!site) {
        output += "No novelfull site found in DB, creating one...\n";
        site = await prisma.sourceWebsite.create({
            data: {
                name: 'NovelFull Test',
                url: 'novelfull.com',
                tagsToExtract: {
                    title: 'h3.title',
                    description: '.desc-text',
                    image: '.info-holder .book img',
                    chapters: '#list-chapter a'
                }
            }
        });
    }

    const testUrl = "https://novelfull.net/the-kings-avatar.html";
    output += `Testing scraper with site: ${site.id}\n`;
    output += `Site URL: ${site.url}\n`;
    output += `Target URL: ${testUrl}\n`;

    const reqMock = new Request('http://localhost:3000/api/novelscraper/scrape-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            siteId: site.id,
            sourceUrl: testUrl
        })
    });

    const res = await POST(reqMock as any);
    const json = await res.json();

    output += "--- RESULT ---\n";
    output += "Status: " + res.status + "\n";
    output += "Response Body (Truncated chapters array):\n";
    
    if (json.allChapters && Array.isArray(json.allChapters)) {
        output += `Extracted total chapters: ${json.allChapters.length}\n`;
        json.allChapters = json.allChapters.slice(0, 3).concat([{ title: "... truncated ..." } as any]);
    }
    
    if (json.imageLink && json.imageLink.length > 100) {
        json.imageLink = json.imageLink.substring(0, 80) + '... (base64 truncated)';
    }

    output += JSON.stringify(json, null, 2);
    fs.writeFileSync('test-output.txt', output);
}

runTest()
    .catch(err => fs.writeFileSync('test-output.txt', err.message))
    .finally(() => prisma.$disconnect());
