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

export const formatMonthYear = (dateString?: string) => {
    if (!dateString) return 'Present';
    if (dateString.toLowerCase() === 'present') return 'Present';
    try {
        const [year, month] = dateString.split('-');
        if (!year || !month) return dateString; // Fallback to raw string
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(date);
    } catch {
        return dateString;
    }
};

export const normalizeQuestionTitle = (title: string) => {
    if (!title) return '';
    return title
        .replace(/^(?:Q\d+|\d+)[.)]?\s*/i, '')
        .toLowerCase()
        .replace(/\?$/, '')
        .trim();
};

export const calculateAtsScore = (data: any): number => {
    let score = 0;
    if (data.personalInfo?.fullName) score += 10;
    if (data.personalInfo?.email) score += 5;
    if (data.personalInfo?.phone) score += 5;
    if (data.summary?.length > 50) score += 15;
    if (data.experience?.length > 0) score += 25;
    if (data.education?.length > 0) score += 15;
    if (data.skills?.technical?.length > 0) score += 15;
    if (data.projects?.length > 0) score += 10;
    return Math.min(score, 100) || 12; // Start with a base of 12 so it's never 0
};
