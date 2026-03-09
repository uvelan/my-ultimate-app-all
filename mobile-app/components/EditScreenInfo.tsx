import React from 'react';
import { StyleSheet, View, Text } from 'react-native';

export default function EditScreenInfo({ path }: { path: string }) {
    return (
        <View style={styles.container}>
            <Text style={styles.text}>Path: {path}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        marginHorizontal: 50,
        marginVertical: 20,
    },
    text: {
        fontSize: 14,
        textAlign: 'center',
    },
});
