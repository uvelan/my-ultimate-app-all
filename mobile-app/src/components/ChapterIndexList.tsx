import React, { useCallback, useEffect, useRef } from 'react';
import { FlatList, InteractionManager, ListRenderItem, View } from 'react-native';

const ROW_HEIGHT = 64;

export function ChapterIndexList<T>({ data, selectedIndex, open, keyExtractor, renderItem }: {
    data: T[];
    selectedIndex: number;
    open: boolean;
    keyExtractor: (item: T, index: number) => string;
    renderItem: ListRenderItem<T>;
}) {
    const list = useRef<FlatList<T>>(null);
    const laidOut = useRef(false);
    const index = Math.max(0, Math.min(data.length - 1, Number.isFinite(selectedIndex) ? selectedIndex : 0));
    const focusSelected = useCallback(() => {
        if (!open || !laidOut.current || !data.length) return;
        list.current?.scrollToIndex({ index, animated: false, viewPosition: 0.35 });
    }, [open, index, data.length]);

    useEffect(() => {
        if (!open) return;
        const task = InteractionManager.runAfterInteractions(focusSelected);
        return () => task.cancel();
    }, [open, focusSelected]);

    return <FlatList<T>
        ref={list}
        data={data}
        extraData={selectedIndex}
        keyExtractor={keyExtractor}
        style={{ flex: 1 }}
        removeClippedSubviews={false}
        getItemLayout={(_, itemIndex) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * itemIndex, index: itemIndex })}
        onLayout={event => { laidOut.current = event.nativeEvent.layout.height > 0; focusSelected(); }}
        onContentSizeChange={focusSelected}
        onScrollToIndexFailed={() => {
            if (open && data.length) list.current?.scrollToOffset({ offset: index * ROW_HEIGHT, animated: false });
        }}
        renderItem={info => <View style={{ height: ROW_HEIGHT }}>{renderItem(info)}</View>}
    />;
}
