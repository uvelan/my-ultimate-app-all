import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { cssInterop } from 'nativewind';
import { Card } from './Card';
import { Download, RefreshCw, CheckCircle2 } from 'lucide-react-native';
import clsx from 'clsx';

cssInterop(Image, { className: 'style' });

interface AppCardProps {
    name: string;
    description: string;
    image: string;
    onPress?: () => void;
    onDownload?: () => void;
    onSync?: () => void;
    syncing?: boolean;
    synced?: boolean;
}

export function AppCard({ 
    name, 
    description, 
    image, 
    onPress, 
    onDownload,
    onSync,
    syncing,
    synced
}: AppCardProps) {
    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
            <Card className="p-3 bg-background-surface border border-border rounded-radius-xl overflow-hidden shadow-shadow-md mb-4 relative">
                <View className="aspect-square rounded-radius-md overflow-hidden mb-3 bg-background relative">
                    {image ? (
                        <Image
                            source={{ uri: image }}
                            className="w-full h-full"
                            contentFit="cover"
                        />
                    ) : (
                        <View className="w-full h-full items-center justify-center">
                            <Text className="text-text-muted text-4xl font-bold">A</Text>
                        </View>
                    )}
                    
                    <View className="absolute bottom-2 right-2 flex-row gap-2">
                        {onSync && (
                            <TouchableOpacity
                                onPress={(e) => {
                                    e.stopPropagation();
                                    onSync();
                                }}
                                disabled={syncing || synced}
                                className={clsx(
                                    "p-2 rounded-radius-full shadow-shadow-md border border-border",
                                    synced ? "bg-green-500/20" : "bg-background-surface"
                                )}
                            >
                                {syncing ? (
                                    <ActivityIndicator size="small" color="#8b5cf6" />
                                ) : synced ? (
                                    <CheckCircle2 size={16} color="#10b981" />
                                ) : (
                                    <RefreshCw size={16} color="#8b5cf6" />
                                )}
                            </TouchableOpacity>
                        )}

                        {onDownload && (
                            <TouchableOpacity
                                onPress={(e) => {
                                    e.stopPropagation();
                                    onDownload();
                                }}
                                className="bg-background-surface p-2 rounded-radius-full shadow-shadow-md border border-border"
                            >
                                <Download size={16} color="#8b5cf6" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
                <Text className="text-text-primary font-bold text-small text-center line-clamp-1 mb-1">
                    {name}
                </Text>
                <Text className="text-text-secondary text-caption text-center line-clamp-2">
                    {description}
                </Text>
            </Card>
        </TouchableOpacity>
    );
}
