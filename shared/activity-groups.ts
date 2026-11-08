export const activityGroups = ['PERSONAL', 'OFFICE', 'REMINDERS'] as const;
export type ActivityGroup = (typeof activityGroups)[number];

export const activityGroupLabels: Record<ActivityGroup, string> = {
    PERSONAL: 'Personal Activities',
    OFFICE: 'Office Activity',
    REMINDERS: 'Reminders',
};
