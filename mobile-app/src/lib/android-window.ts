import { Platform, useWindowDimensions } from 'react-native';

export const desktopRailWidth = 236;
export const desktopContentMax = 1440;

export function useAndroidWindow() {
    const { width, height } = useWindowDimensions();
    const desktop = Platform.OS === 'android' && width >= 960;
    const contentWidth = Math.min(width - (desktop ? desktopRailWidth : 0), desktopContentMax);
    return { width, height, desktop, contentWidth };
}
