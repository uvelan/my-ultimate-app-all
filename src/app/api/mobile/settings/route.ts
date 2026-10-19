import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/lib/auth-server';
import { getAiModels, addAiModel, updateAiModel, deleteAiModel } from '@/actions/ai';

const modelSchema = z.object({ modelId: z.string().trim().min(1).max(150).regex(/^[\w./:-]+$/), name: z.string().trim().min(1).max(100), isActive: z.boolean().default(true) });
export async function GET() {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated || !auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const canManageModels = ['ADMIN', 'SUPERUSER'].includes(auth.user.role);
        const models = await getAiModels();
        return NextResponse.json({ models: canManageModels ? models : models.filter(model => model.isActive), canManageModels });
    } catch { return NextResponse.json({ error: 'Unable to load settings' }, { status: 500 }); }
}
async function mutate(req: NextRequest) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated || !auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['ADMIN', 'SUPERUSER'].includes(auth.user.role)) return NextResponse.json({ error: 'Administrator access required' }, { status: 403 });
    try {
        const body = await req.json();
        const id = req.method === 'POST' ? undefined : z.string().regex(/^[a-f\d]{24}$/i).parse(body.id);
        let result;
        if (req.method === 'DELETE') result = await deleteAiModel(id!);
        else {
            const data = modelSchema.parse(body.data);
            if (id) result = await updateAiModel(id, data);
            else result = await addAiModel(data.modelId, data.name);
        }
        return NextResponse.json(result.success ? result : { error: result.error }, { status: result.success ? 200 : 400 });
    } catch (error) {
        if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid model details' }, { status: 400 });
        return NextResponse.json({ error: 'Unable to update settings' }, { status: 500 });
    }
}
export const POST = mutate;
export const PATCH = mutate;
export const DELETE = mutate;
