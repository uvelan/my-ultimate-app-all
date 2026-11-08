import DashboardLayout from '@/components/layout/DashboardLayout';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import ReminderCalendar from './ReminderCalendar';

export const metadata = { title: 'Reminder history' };

export default function RemindersPage() {
    return <ProtectedRoute><DashboardLayout><ReminderCalendar /></DashboardLayout></ProtectedRoute>;
}
