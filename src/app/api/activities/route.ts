import type { NextRequest } from 'next/server';
import { readActivities, writeActivities } from '@/lib/activity-tracker-api';

export const runtime = 'nodejs';

export const GET = (request: NextRequest) => readActivities(request);
export const POST = (request: NextRequest) => writeActivities(request);
