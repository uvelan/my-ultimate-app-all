import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const NOVELS_FILE = path.join(DATA_DIR, 'scraped-novels.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'scraper-settings.json');

export function readNovels(): ScrapedNovel[] {
    try {
        if (!fs.existsSync(NOVELS_FILE)) return [];
        const raw = fs.readFileSync(NOVELS_FILE, 'utf-8');
        return JSON.parse(raw) as ScrapedNovel[];
    } catch {
        return [];
    }
}

export function writeNovels(novels: ScrapedNovel[]) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(NOVELS_FILE, JSON.stringify(novels, null, 2));
}

export function readSettings(): ScraperSettings {
    try {
        if (!fs.existsSync(SETTINGS_FILE)) return {};
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        return JSON.parse(raw) as ScraperSettings;
    } catch {
        return {};
    }
}

export function writeSettings(settings: ScraperSettings) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

export interface ScrapedNovel {
    id: string;
    title: string;
    cover?: string;
    site: string;
    sourceUrl: string;
    chaptersScraped: number;
    totalChapters?: number;
    fromChapter?: number;
    toChapter?: number;
    status: 'pending' | 'scraping' | 'done' | 'error';
    epubPath?: string;
    createdAt: string;
    updatedAt: string;
    error?: string;
}

export type WordReplacement = { from: string; to: string };

export type ScraperSettings = {
    [siteId: string]: {
        replacements: WordReplacement[];
    };
};

export const SUPPORTED_SITES = [
    { id: 'royalroad', name: 'Royal Road', url: 'royalroad.com' },
    { id: 'novelupdates', name: 'Novel Updates', url: 'novelupdates.com' },
    { id: 'wuxiaworld', name: 'Wuxia World', url: 'wuxiaworld.com' },
    { id: 'scribblehub', name: 'Scribble Hub', url: 'scribblehub.com' },
    { id: 'lightnovelworld', name: 'Light Novel World', url: 'lightnovelworld.com' },
];
