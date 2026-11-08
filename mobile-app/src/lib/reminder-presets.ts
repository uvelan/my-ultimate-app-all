export type ReminderPresetFields = {
    title: string;
    message: string;
    durationMinutes: number;
    extensionMinutes: number;
    intervalMinutes: number;
    routineEnabled: boolean;
};

export type ReminderPresetRecord = ReminderPresetFields & {
    id: string;
    version: number;
    deleted: boolean;
    operationId: string;
};

export type ReminderPresetMutation = ReminderPresetFields & {
    id: string;
    expectedVersion: number;
    operationId: string;
    deleted: boolean;
};

export type ReminderCatalogSync = {
    reminders: ReminderPresetRecord[];
    outcomes: { id: string; operationId: string; status: 'applied' | 'conflict' }[];
};
