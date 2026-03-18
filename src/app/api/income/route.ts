import { NextResponse } from 'next/server';
import { getIncomes, addIncome } from '@/actions/income';
import { verifyAuth } from '@/lib/auth-server';

export async function GET(request: Request) {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || !auth.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined;
        const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined;

        const data = await getIncomes(startDate, endDate);
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[API Income GET]', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated || !auth.user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        // Convert date string to Date object
        if (body.date) {
            body.date = new Date(body.date);
        }
        
        const data = await addIncome(body);
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('[API Income POST]', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
