import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';

export async function GET(req: Request) {
  try {
    const auth = await verifyAuth();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    // If SUPERUSER provides a userId in query string (or wants all), handle it here
    let whereClause = {};
    if (auth.isAuthenticated && auth.user?.role === 'SUPERUSER') {
      if (userId) {
        whereClause = { userId };
      }
    } else {
      if (!auth.isAuthenticated) {
        // Return 401 or empty array for anonymous users querying the dashboard
        return NextResponse.json([]);
      }
      whereClause = { userId: auth.user.id };
    }

    const resumes = await prisma.resume.findMany({
      where: whereClause,
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, updatedAt: true, userId: true },
    });

    return NextResponse.json(resumes);
  } catch (error) {
    console.error('Error fetching resumes:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch resumes' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await verifyAuth();
    const body = await req.json();
    
    const userId = auth.isAuthenticated ? auth.user.id : null; 

    // Extract title dynamically from the content
    let title = 'Untitled Resume';
    if (body.personalInfo?.fullName) {
      title = `${body.personalInfo.fullName}'s Resume`;
    }

    const newResume = await prisma.resume.create({
      data: {
        title,
        content: body,
        userId: userId
      },
    });

    return NextResponse.json({ success: true, id: newResume.id }, { status: 201 });
  } catch (error) {
    console.error('Error saving resume:', error);
    return NextResponse.json({ success: false, error: 'Failed to save resume' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await verifyAuth();
    const { id, content, userId: assignUserId } = await req.json();

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing resume id' }, { status: 400 });
    }

    // Verify ownership or superuser status
    const existing = await prisma.resume.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Resume not found' }, { status: 404 });
    }

    if (existing.userId && (!auth.isAuthenticated || (auth.user.id !== existing.userId && auth.user.role !== 'SUPERUSER'))) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    let title = 'Untitled Resume';
    if (content.personalInfo?.fullName) {
      title = `${content.personalInfo.fullName}'s Resume`;
    }

    // Allow SUPERUSER to assign to another user
    const dataToUpdate: any = { title, content };
    if (auth.isAuthenticated && auth.user.role === 'SUPERUSER' && assignUserId !== undefined) {
      dataToUpdate.userId = assignUserId;
    } else if (auth.isAuthenticated && !existing.userId) {
      // Claim anonymous resume if saving while logged in
      dataToUpdate.userId = auth.user.id;
    }

    const updatedResume = await prisma.resume.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json({ success: true, id: updatedResume.id }, { status: 200 });
  } catch (error) {
    console.error('Error updating resume:', error);
    return NextResponse.json({ success: false, error: 'Failed to update resume' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await verifyAuth();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ success: false, error: 'Missing resume id' }, { status: 400 });

    const existing = await prisma.resume.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: 'Resume not found' }, { status: 404 });

    if (existing.userId && (!auth.isAuthenticated || (auth.user.id !== existing.userId && auth.user.role !== 'SUPERUSER'))) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
    }

    await prisma.resume.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting resume:', error);
    return NextResponse.json({ success: false, error: 'Failed to delete resume' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await verifyAuth();
    const { id, userId, title } = await req.json();

    if (!id || (userId === undefined && title === undefined)) {
      return NextResponse.json({ success: false, error: 'Missing id, userId, or title' }, { status: 400 });
    }

    const existing = await prisma.resume.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ success: false, error: 'Resume not found' }, { status: 404 });

    const dataToUpdate: any = {};

    if (userId !== undefined) {
      // Only SUPERUSER can arbitrarily assign resumes
      if (!auth.isAuthenticated || auth.user.role !== 'SUPERUSER') {
        return NextResponse.json({ success: false, error: 'Unauthorized. Only superusers can reassign resumes.' }, { status: 403 });
      }
      dataToUpdate.userId = userId;
    }

    if (title !== undefined) {
      // Owner or SUPERUSER can rename
      if (existing.userId && (!auth.isAuthenticated || (auth.user.id !== existing.userId && auth.user.role !== 'SUPERUSER'))) {
        return NextResponse.json({ success: false, error: 'Unauthorized. You do not own this resume.' }, { status: 403 });
      }
      dataToUpdate.title = title;
    }

    const updatedResume = await prisma.resume.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json({ success: true, id: updatedResume.id });
  } catch (error) {
    console.error('Error updating resume:', error);
    return NextResponse.json({ success: false, error: 'Failed to update resume' }, { status: 500 });
  }
}

