import { redirect } from 'next/navigation';

export default async function DrivePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    redirect(`/books/${encodeURIComponent(id)}/listen?source=drive`);
}
