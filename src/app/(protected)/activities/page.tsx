import DashboardLayout from '@/components/layout/DashboardLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import ActivityTracker from './ActivityTracker';

export const metadata = { title: 'Activity Tracker' };

export default function ActivitiesPage() {
    return <ProtectedRoute><DashboardLayout><ActivityTracker /></DashboardLayout></ProtectedRoute>;
}
