import { Text, TouchableOpacity, View } from 'react-native';
import { calendarTitle } from '@shared/calendar';

export function CalendarGrid({ weekdays, days, countForDay, isSelected, onSelect, itemLabel }: {
    weekdays: string[];
    days: (Date | null)[];
    countForDay: (day: Date) => number;
    isSelected: (day: Date) => boolean;
    onSelect: (day: Date) => void;
    itemLabel: string;
}) {
    return <>
        <View className="flex-row">{weekdays.map(day => <Text key={day} className="flex-1 text-center text-xs text-text-secondary">{day}</Text>)}</View>
        {Array.from({ length: Math.ceil(days.length / 7) }, (_, row) => <View key={row} className="flex-row">
            {days.slice(row * 7, row * 7 + 7).map((day, column) => {
                if (!day) return <View key={column} className="flex-1" />;
                const count = countForDay(day);
                const selected = isSelected(day);
                return <TouchableOpacity key={day.getTime()} accessibilityRole="button" accessibilityState={{ selected }}
                    accessibilityLabel={`${calendarTitle(day, 'day')}, ${count} ${itemLabel}`}
                    className={`min-h-12 flex-1 items-center justify-center gap-1 rounded-md py-1 ${selected ? 'bg-accent' : ''}`}
                    onPress={() => onSelect(day)}>
                    <Text className="text-text-primary">{day.getDate()}</Text>
                    <View className="min-h-5 max-w-full items-center justify-center">
                        {count > 0 && <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
                            className="min-w-5 rounded-full border border-[#64748b] bg-white px-1 text-center text-xs font-bold leading-4 text-[#141414]">
                            {count}
                        </Text>}
                    </View>
                </TouchableOpacity>;
            })}
        </View>)}
    </>;
}
