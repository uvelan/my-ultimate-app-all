import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
    const cookieStore = await cookies();
    cookieStore.delete('accessToken');
    cookieStore.delete('refreshToken');
    cookieStore.set('ultimate-drive-session', '', { path: '/api/drive', maxAge: 0, httpOnly: true, sameSite: 'strict' });

    return NextResponse.json({ message: 'Logged out successfully' });
}
