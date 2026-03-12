import { NextResponse } from 'next/server';
import { deleteExpense } from '@/actions/expense';

export async function DELETE(
    request: Request,
    { params }: { params: { id: string } }
) {
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
