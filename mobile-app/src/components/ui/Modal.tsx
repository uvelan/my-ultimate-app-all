import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { X } from 'lucide-react-native';
import { BlurView } from 'expo-blur';

interface MobileModalProps {
    visible: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

export function MobileModal({ visible, onClose, title, children }: MobileModalProps) {
    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View className="flex-1 justify-end bg-black/60">
                    <TouchableWithoutFeedback>
                        <View className="bg-[#1a110d] rounded-t-[32px] border-t border-[#5c4033] p-6 pb-12 shadow-2xl">
                            <View className="flex-row justify-between items-center mb-6">
                                <Text className="text-2xl font-bold text-[#e6dccf] font-serif">{title}</Text>
                                <Pressable onPress={onClose} className="p-2 bg-[#2e1d15] rounded-full">
                                    <X size={20} color="#d4c5b0" />
                                </Pressable>
                            </View>
                            {children}
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}
