import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';
import { Prisma } from '@prisma/client';

export async function POST(req: Request) {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || auth.user?.role !== 'SUPERUSER') {
            return NextResponse.json({ error: 'Unauthorized. Superuser access required.' }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;
        const mode = formData.get('mode') as 'REPLACE' | 'UPDATE';

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const fileContent = await file.text();
        let dump: Record<string, any[]>;
        
        try {
            dump = JSON.parse(fileContent);
        } catch (e) {
            return NextResponse.json({ error: 'Invalid JSON file' }, { status: 400 });
        }

        const models = Prisma.dmmf.datamodel.models;

        // In REPLACE mode, we want to clear everything first
        if (mode === 'REPLACE') {
            // Delete in reverse order to potentially help with relation constraints if any existed, though Mongo doesn't strictly enforce them at DB level
            for (let i = models.length - 1; i >= 0; i--) {
                const modelName = models[i].name;
                const delegateName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
                try {
                    await (prisma as any)[delegateName].deleteMany({});
                } catch (e) {
                    console.error(`Failed to clear ${modelName}:`, e);
                }
            }
        }

        // Now import the data
        for (const model of models) {
            const modelName = model.name;
            const delegateName = modelName.charAt(0).toLowerCase() + modelName.slice(1);
            
            let records = dump[modelName];
            if (!records || !Array.isArray(records) || records.length === 0) continue;

            // Sort self-referencing records so parents are inserted before children
            // to avoid Prisma foreign key constraint errors
            if (modelName === 'Category') {
                records.sort((a, b) => {
                    if (a.parentId && !b.parentId) return 1;
                    if (!a.parentId && b.parentId) return -1;
                    return 0;
                });
            }

            if (mode === 'REPLACE') {
                // Bulk insert
                try {
                    await (prisma as any)[delegateName].createMany({
                        data: records
                    });
                } catch (e) {
                    console.error(`Failed to bulk insert ${modelName}:`, e);
                }
            } else if (mode === 'UPDATE') {
                // Upsert each record
                for (const record of records) {
                    try {
                        // All models in this schema have an 'id' field
                        if (record.id) {
                            await (prisma as any)[delegateName].upsert({
                                where: { id: record.id },
                                update: record,
                                create: record
                            });
                        } else {
                            // Fallback if no ID (unlikely in this schema)
                            await (prisma as any)[delegateName].create({ data: record });
                        }
                    } catch (e) {
                        console.error(`Failed to upsert record in ${modelName}:`, e);
                    }
                }
            }
        }

        return NextResponse.json({ message: 'Import successful' });
    } catch (error) {
        console.error('Import Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
