import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuth } from "@/lib/auth-server";

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> } // Note: Route params are async in Next 15+
) {
    try {
        const auth = await verifyAuth();
        if (!auth.isAuthenticated) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id } = await params;
        const body = await req.json();
        const { content } = body;

        if (!content || !Array.isArray(content)) {
            return NextResponse.json({ error: "Valid content array is required" }, { status: 400 });
        }

        const updatedChapter = await prisma.chapter.update({
            where: { id },
            data: { content },
        });

        return NextResponse.json({
            message: "Chapter content updated successfully",
            chapter: updatedChapter
        });
    } catch (error: any) {
        console.error("Update chapter error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
