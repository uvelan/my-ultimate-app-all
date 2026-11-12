import React, { type ReactNode, useMemo } from 'react';
import { Linking, useWindowDimensions } from 'react-native';
import MarkdownIt from 'markdown-it';
import {
    HTMLContentModel, HTMLElementModel, RenderHTMLConfigProvider, RenderHTMLSource, TRenderEngineProvider,
} from '@native-html/render';

const markdown = new MarkdownIt({ html: true, breaks: true });
const ignoredDomTags = [
    'script', 'style', 'head', 'link', 'iframe', 'object', 'embed', 'svg', 'img', 'video', 'audio', 'input', 'form',
];
const tableModels = Object.fromEntries(
    ['table', 'thead', 'tbody', 'tr', 'th', 'td'].map(tag => [
        tag, HTMLElementModel.fromCustomModel({ tagName: tag, contentModel: HTMLContentModel.block }),
    ]),
);
const textProps = { selectable: true };
const baseStyle = { color: '#eeeaf3', fontSize: 16, lineHeight: 25 };
const headingStyle = { color: '#f5f3ff', marginTop: 18, marginBottom: 8, fontSize: 18 };
const tableCell = { flexBasis: 0, flexGrow: 1, padding: 8, borderColor: '#4c405b', borderWidth: 1 };
const tagsStyles = {
    h1: headingStyle, h2: headingStyle, h3: headingStyle, h4: headingStyle,
    p: { marginTop: 0, marginBottom: 12 },
    ol: { paddingLeft: 20, marginTop: 0, marginBottom: 12 },
    ul: { paddingLeft: 20, marginTop: 0, marginBottom: 12 },
    li: { marginBottom: 5 },
    a: { color: '#c4b5fd' },
    blockquote: { borderLeftWidth: 3, borderColor: '#a78bfa', paddingLeft: 12, marginHorizontal: 0 },
    code: { color: '#ddd6fe', backgroundColor: '#2f263a' },
    pre: { backgroundColor: '#17131e', padding: 12, borderRadius: 8 },
    table: { marginBottom: 12 },
    tr: { flexDirection: 'row' as const },
    th: { ...tableCell, backgroundColor: '#332b3e', fontWeight: '700' as const },
    td: tableCell,
};
const renderersProps = {
    a: {
        onPress: (_event: unknown, url: string) => {
            if (/^https?:\/\//i.test(url)) void Linking.openURL(url).catch(() => {});
        },
    },
};

export function InterviewMarkupProvider({ children }: { children: ReactNode }) {
    return (
        <TRenderEngineProvider
            baseStyle={baseStyle}
            tagsStyles={tagsStyles}
            customHTMLElementModels={tableModels}
            enableCSSInlineProcessing={false}
            ignoredDomTags={ignoredDomTags}
        >
            <RenderHTMLConfigProvider defaultTextProps={textProps} renderersProps={renderersProps}>
                {children}
            </RenderHTMLConfigProvider>
        </TRenderEngineProvider>
    );
}

export function InterviewMarkup({ content }: { content?: string | string[] | null }) {
    const { width } = useWindowDimensions();
    const source = useMemo(() => {
        if (Array.isArray(content)) {
            const items = content.filter(item => typeof item === 'string' && item.trim());
            return items.length ? { html: '<ul>' + items.map(item => '<li>' + markdown.render(item) + '</li>').join('') + '</ul>' } : null;
        }
        return typeof content === 'string' && content.trim() ? { html: markdown.render(content) } : null;
    }, [content]);

    if (!source) return null;
    return <RenderHTMLSource contentWidth={Math.max(1, Math.min(width, 760) - 64)} source={source} />;
}
