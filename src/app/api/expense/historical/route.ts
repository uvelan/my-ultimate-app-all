import { NextResponse } from 'next/server';
import { getHistoricalStats } from '@/actions/stats';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const grouping = (searchParams.get('grouping') as any) || 'month';
        const groupBy = (searchParams.get('groupBy') as any) || 'category';

        const data = await getHistoricalStats(grouping, groupBy);
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: error.message === 'Unauthorized' ? 401 : 500 });
    }
}
