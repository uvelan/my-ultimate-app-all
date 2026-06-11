import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';
import { Prisma } from '@prisma/client';

export async function GET() {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || auth.user?.role !== 'SUPERUSER') {
            return NextResponse.json({ error: 'Unauthorized. Superuser access required.' }, { status: 401 });
        }

        const models = Prisma.dmmf.datamodel.models;
        const dump: Record<string, any[]> = {};

        for (const model of models) {
            const modelName = model.name;
            
            // Exclude tables containing massive base64 binaries to prevent Out of Memory / V8 String Length crashes
            if (['ChapterAudio'].includes(modelName)) {
                continue;
            }

            // Lowercase the first letter to match the prisma delegate (e.g. User -> user, MyApp -> myApp)
            const delegateName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
            
            // Try fetching all records for this model
            try {
                const data = await (prisma as any)[delegateName].findMany();
                dump[modelName] = data;
            } catch (err) {
                console.error(`Failed to export model ${modelName}:`, err);
                dump[modelName] = [];
            }
        }

        const jsonString = JSON.stringify(dump);

        // Return as a downloadable file
        return new NextResponse(jsonString, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="ultimate-app-backup-${new Date().toISOString().split('T')[0]}.json"`
            }
        });
    } catch (error) {
        console.error('Export Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
