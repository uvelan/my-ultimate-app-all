import DashboardLayout from '@/components/layout/DashboardLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import ActivityCalendar from './ActivityCalendar';

export const metadata = { title: 'Activity Tracker' };

export default function ActivitiesPage() {
    return <ProtectedRoute><DashboardLayout><ActivityCalendar /></DashboardLayout></ProtectedRoute>;
}
