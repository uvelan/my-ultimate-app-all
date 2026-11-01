import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
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

export async function shareFinancePdf(html: string, filename: string) {
    if (!await Sharing.isAvailableAsync()) throw new Error('PDF sharing is unavailable on this device.');
    if (!FileSystem.cacheDirectory) throw new Error('File storage is unavailable. Please try again.');
    const file = await Print.printToFileAsync({ html });
    const uri = FileSystem.cacheDirectory + filename;
    try {
        await FileSystem.copyAsync({ from: file.uri, to: uri });
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Export full breakdown PDF' });
    } finally { await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => {}); }
}
