import { NextResponse } from 'next/server';
import { getExpenses, addExpense } from '@/actions/expense';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
        const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;

        const data = await getExpenses(startDate, endDate);
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: error.message === 'Unauthorized' ? 401 : 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const data = await addExpense(body);
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: error.message === 'Unauthorized' ? 401 : 500 });
    }
}
