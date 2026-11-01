import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

export async function shareFinanceCsv(csv: string, filename: string) {
    if (Platform.OS === 'web' || !await Sharing.isAvailableAsync()) {
        await Share.share({ title: filename, message: csv });
        return;
    }
    const directory = FileSystem.cacheDirectory;
    if (!directory) throw new Error('File storage is unavailable. Please try again.');
    const uri = directory + filename;
    await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
    await Sharing.shareAsync(uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Export finance CSV' });
}

export async function shareFinanceImage(base64: string, filename: string) {
    if (!await Sharing.isAvailableAsync()) throw new Error('Image sharing is unavailable on this device.');
    if (!FileSystem.cacheDirectory) throw new Error('File storage is unavailable. Please try again.');
    const uri = FileSystem.cacheDirectory + filename;
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
    await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Export breakdown image' });
}
