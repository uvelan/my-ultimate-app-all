import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { NarrationCue } from '../lib/narration-sync';

interface Props {
    cues: NarrationCue[];
    activeCue: number;
    light: boolean;
    height: number;
    follow: boolean;
    scrollRef: React.RefObject<ScrollView | null>;
    onFollow(): void;
    onDrag(): void;
    onViewport(height: number): void;
    onCueLayout(index: number, text: string, y: number, height: number): void;
    onContentLayout?(): void;
}

/** Keep native scroll/row identities stable through highlights and chapter transitions. */
export function ListenTranscript({ cues, activeCue, light, height, follow, scrollRef, onFollow, onDrag, onViewport, onCueLayout, onContentLayout }: Props) {
    const ink = light ? '#171717' : '#e2e8f0';
    const muted = light ? '#666666' : '#a0aec0';
    const border = light ? '#e5e5e0' : '#4a5568';
    return <View testID="listen-transcript" collapsable={false} collapsableChildren={false}
        style={{ width: '100%', borderRadius: 12, borderWidth: 1, borderColor: border, backgroundColor: light ? '#f3f3f0' : '#2d3748', overflow: 'hidden' }}>
        <View collapsable={false} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: border }}>
            <Text style={{ color: ink, fontWeight: '700' }}>Chapter text</Text>
            <Pressable onPress={onFollow} hitSlop={8} accessibilityRole="switch" accessibilityState={{ checked: follow }} accessibilityLabel="Follow audio and keep screen awake">
                <Text style={{ color: follow ? muted : '#8b5cf6', fontWeight: follow ? '400' : '700' }}>{follow ? 'Following audio' : 'Follow audio'}</Text>
            </Pressable>
        </View>
        <ScrollView ref={scrollRef} nestedScrollEnabled removeClippedSubviews={false}
            style={{ height }} contentContainerStyle={{ padding: 12 }}
            onLayout={event => onViewport(event.nativeEvent.layout.height)}
            onContentSizeChange={onContentLayout} onScrollBeginDrag={onDrag}>
            <View collapsable={false} collapsableChildren={false}>
                {cues.map((cue, index) => <View key={index} collapsable={false}
                    onLayout={event => { const { y, height: rowHeight } = event.nativeEvent.layout; onCueLayout(index, cue.text, y, rowHeight); }}
                    style={{ borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4, backgroundColor: index === activeCue ? 'rgba(139,92,246,0.2)' : 'transparent' }}>
                    <Text accessibilityState={{ selected: index === activeCue }} style={{ fontSize: 16, lineHeight: 28, color: index === activeCue ? '#8b5cf6' : ink, fontWeight: index === activeCue ? '600' : '400' }}>{cue.text}</Text>
                </View>)}
                {!cues.length && <Text style={{ color: muted, padding: 12 }}>Chapter text is unavailable.</Text>}
            </View>
        </ScrollView>
    </View>;
}
