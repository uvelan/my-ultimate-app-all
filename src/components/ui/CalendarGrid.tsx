import { Fragment, type ReactNode } from 'react';

export function CalendarGrid({ weekdays, days, renderDay, headerClassName, dayClassName, renderWeekday }: {
    weekdays: string[];
    days: Date[];
    renderDay: (day: Date) => ReactNode;
    headerClassName?: string;
    dayClassName?: string;
    renderWeekday: (weekday: string) => ReactNode;
}) {
    return <>
        <div className={`grid grid-cols-7 ${headerClassName ?? ''}`}>
            {weekdays.map(weekday => <Fragment key={weekday}>{renderWeekday(weekday)}</Fragment>)}
        </div>
        <div className={`grid grid-cols-7 ${dayClassName ?? ''}`}>
            {days.map(day => <Fragment key={day.getTime()}>{renderDay(day)}</Fragment>)}
        </div>
    </>;
}
