import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);
};

export const normalizeQuestionTitle = (title: string) => {
    if (!title) return '';
    return title
        .replace(/^(?:Q\d+|\d+)[.)]?\s*/i, '')
        .toLowerCase()
        .replace(/\?$/, '')
        .trim();
};
