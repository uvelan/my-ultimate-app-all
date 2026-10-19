import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { verifyAuth } from '@/lib/auth-server';
import { prisma } from '@/lib/prisma';
import { createTaskSchema, updateTaskSchema, projectSchema, tagSchema } from '@/lib/tasks/task-schema';
import { getTasks, getProjects, getTags, createTask, updateTask, deleteTask, bulkDeleteTasks } from '@/lib/tasks/task-service';

export const runtime = 'nodejs';
const idSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ID');
const statusSchema = z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'ARCHIVED']);
const dateSchema = z.string().datetime({ offset: true }).transform(value => new Date(value));
function failure(error: unknown) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || 'Invalid input' }, { status: 400 });
    if ((error as any)?.code === 'P2025') return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    if ((error as any)?.code === 'P2002') return NextResponse.json({ error: 'This name already exists' }, { status: 409 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    console.error('Mobile tasks request failed', error instanceof Error ? error.name : 'Unknown');
    return NextResponse.json({ error: 'Unable to complete task request' }, { status: 500 });
}
export async function GET() {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated || !auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    try {
        const [tasks, projects, tags] = await Promise.all([getTasks(auth.user.id), getProjects(auth.user.id), getTags(auth.user.id)]);
        return NextResponse.json({ tasks, projects, tags });
    } catch (error) { return failure(error); }
}
async function mutate(req: NextRequest) {
    const auth = await verifyAuth();
    if (!auth.isAuthenticated || !auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const userId = auth.user.id;
    try {
        const body = z.object({ resource: z.enum(['tasks', 'projects', 'tags', 'bulk']), id: idSchema.optional(), data: z.record(z.string(), z.unknown()).default({}) }).parse(await req.json());
        const { resource, id } = body;
        const raw: Record<string, any> = { ...body.data };
        if (resource === 'bulk') {
            const taskIds = z.array(idSchema).min(1).max(200).parse(raw.taskIds);
            const owned = await prisma.task.findMany({ where: { id: { in: taskIds }, userId } });
            if (owned.length !== new Set(taskIds).size) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
            if (req.method === 'DELETE') await bulkDeleteTasks(userId, { taskIds });
            else {
                const status = statusSchema.parse(raw.status);
                // Use the same completion helper as individual changes so recurring tasks spawn their next occurrence.
                for (const task of owned) if (task.status !== status) await updateTask(userId, { id: task.id, status });
            }
            revalidatePath('/tasks');
            return NextResponse.json({ success: true });
        }
        if (req.method !== 'POST' && !id) return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        const delegates = { tasks: prisma.task, projects: prisma.project, tags: prisma.tag };
        let existing: any;
        if (id) {
            existing = await (delegates[resource] as any).findFirst({ where: { id, userId } });
            if (!existing) return NextResponse.json({ error: 'Record not found' }, { status: 404 });
        }
        if (req.method === 'DELETE') {
            if (resource === 'tasks') await deleteTask(userId, id!);
            if (resource === 'projects') {
                await prisma.task.updateMany({ where: { userId, projectId: id }, data: { projectId: null } });
                await prisma.project.delete({ where: { id: id!, userId } });
            }
            if (resource === 'tags') {
                const affected = await prisma.task.findMany({ where: { userId, tagIds: { has: id! } }, select: { id: true, tagIds: true } });
                await prisma.$transaction(affected.map(task => prisma.task.update({ where: { id: task.id, userId }, data: { tagIds: task.tagIds.filter(tagId => tagId !== id) } })));
                await prisma.tag.delete({ where: { id: id!, userId } });
            }
            revalidatePath('/tasks');
            return NextResponse.json({ success: true });
        }
        let result;
        if (resource === 'tasks') {
            for (const field of ['startDate', 'dueDate']) if (raw[field] !== undefined && raw[field] !== null) raw[field] = dateSchema.parse(raw[field]);
            if (raw.projectId) {
                const projectId = idSchema.parse(raw.projectId);
                if (!await prisma.project.findFirst({ where: { id: projectId, userId } })) return NextResponse.json({ error: 'Invalid project' }, { status: 400 });
            }
            if (raw.tagIds) {
                const tagIds = z.array(idSchema).max(50).parse(raw.tagIds);
                if (await prisma.tag.count({ where: { id: { in: tagIds }, userId } }) !== new Set(tagIds).size) return NextResponse.json({ error: 'Invalid tags' }, { status: 400 });
            }
            if (id) {
                const parsed = updateTaskSchema.parse({ ...raw, id });
                const start = parsed.startDate === undefined ? existing.startDate : parsed.startDate;
                const due = parsed.dueDate === undefined ? existing.dueDate : parsed.dueDate;
                if (start && due && start > due) return NextResponse.json({ error: 'Start date must precede due date' }, { status: 400 });
                if (existing.status === 'DONE' && parsed.status === 'DONE') delete parsed.status;
                result = await updateTask(userId, parsed);
            } else result = await createTask(userId, { ...createTaskSchema.parse(raw), tagIds: raw.tagIds || [] });
        } else {
            const parsed = (resource === 'projects' ? projectSchema : tagSchema).parse(raw);
            result = id ? await (delegates[resource] as any).update({ where: { id, userId }, data: parsed }) : await (delegates[resource] as any).create({ data: { ...parsed, userId } });
        }
        revalidatePath('/tasks');
        return NextResponse.json({ success: true, data: result }, { status: req.method === 'POST' ? 201 : 200 });
    } catch (error) { return failure(error); }
}
export const POST = mutate;
export const PATCH = mutate;
export const DELETE = mutate;
