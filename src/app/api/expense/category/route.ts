import { NextResponse } from 'next/server';
import { getCategories, addCategory } from '@/actions/category';

export async function GET() {
    try {
        const data = await getCategories();
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: error.message === 'Unauthorized' ? 401 : 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const data = await addCategory(body.name, body.color);
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json(
            { error: error.message || 'Internal Server Error' },
            { status: error.message === 'Unauthorized' ? 401 : 500 }
        );
    }
}
