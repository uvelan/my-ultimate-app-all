import { NextResponse } from 'next/server';
import { deleteIncome } from '@/actions/income';

export async function DELETE(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const params = await context.params;
    try {
        await deleteIncome(params.id);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[API Income DELETE]', error);
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: error.message === 'Unauthorized' ? 401 : 500 }
        );
    }
}
