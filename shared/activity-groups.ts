export const activityAreas = ['PERSONAL', 'OFFICE', 'HEALTH', 'CAREER'] as const;
export const activityGroups = [...activityAreas, 'REMINDERS'] as const;
export const trackerTabs = ['Dashboard', 'Details', 'New Activity', 'Tasks', 'Calendar'] as const;
export type TrackerTab = (typeof trackerTabs)[number];
export type ActivityGroup = (typeof activityGroups)[number];

export const activityGroupLabels: Record<ActivityGroup, string> = {
    PERSONAL: 'Personal',
    OFFICE: 'Office',
    HEALTH: 'Health',
    CAREER: 'Career',
    REMINDERS: 'Reminders',
};
