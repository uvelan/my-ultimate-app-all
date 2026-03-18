import { NextResponse } from 'next/server';
import { deleteExpense, updateExpense } from '@/actions/expense';

export async function PUT(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const params = await context.params;
    try {
        const body = await request.json();
        const data = await updateExpense(params.id, body);
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: error.message === 'Unauthorized' ? 401 : 500 }
        );
    }
}

export async function DELETE(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const params = await context.params;
    try {
        await deleteExpense(params.id);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: error.message === 'Unauthorized' ? 401 : 500 }
        );
    }
}
