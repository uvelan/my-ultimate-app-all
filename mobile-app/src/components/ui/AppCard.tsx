import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Card } from './Card';

interface AppCardProps {
    name: string;
    description: string;
    image: string;
    onPress?: () => void;
}

export function AppCard({ name, description, image, onPress }: AppCardProps) {
    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
            <Card className="p-3 bg-[#1a110d] border-[#5c4033] rounded-2xl overflow-hidden shadow-lg mb-4">
                <View className="aspect-square rounded-xl overflow-hidden mb-3 bg-[#2e1d15]">
                    {image ? (
                        <Image
                            source={{ uri: image }}
                            className="w-full h-full"
                            resizeMode="cover"
                        />
                    ) : (
                        <View className="w-full h-full items-center justify-center">
                            <Text className="text-[#8b4513] text-4xl font-serif">A</Text>
                        </View>
                    )}
                </View>
                <Text className="text-[#e6dccf] font-bold text-base text-center line-clamp-1 mb-1">
                    {name}
                </Text>
                <Text className="text-[#d4c5b0]/60 text-xs text-center line-clamp-2">
                    {description}
                </Text>
            </Card>
        </TouchableOpacity>
    );
}
