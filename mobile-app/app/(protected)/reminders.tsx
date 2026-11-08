import { Redirect } from 'expo-router';

export default function LegacyRemindersScreen() {
    return <Redirect href={'/activities' as never} />;
}
