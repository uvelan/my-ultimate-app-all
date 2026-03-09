import { NextResponse } from 'next/server';
import { getDashboardStats } from '@/actions/stats';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
        const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;

        const data = await getDashboardStats(startDate, endDate);
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: error.message === 'Unauthorized' ? 401 : 500 });
    }
}
