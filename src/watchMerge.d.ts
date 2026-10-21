export interface WatchEntry { week: number; at: number; removed?: true }
export type WatchSet = Record<string, WatchEntry>;
export const MAX_WATCH: number;
export const MAX_BYTES: number;
export const FIRST_WEEK: number;
export const LAST_WEEK: number;
export function cleanEntry(e: unknown): WatchEntry | null;
export function parseWatch(v: unknown): WatchSet | null;
export function looseWatch(v: unknown): WatchSet;
export function migrateWatch(old: unknown): WatchSet;
export function mergeWatch(...sets: (WatchSet | null | undefined)[]): WatchSet;
export function pruneWatch(set: WatchSet, now?: number): WatchSet;
export function liveWatch(set: WatchSet | null | undefined): Record<string, number>;
export function editWatch(set: WatchSet, next: Record<string, number>, now?: number): WatchSet;
export function sameWatch(a: WatchSet | null | undefined, b: WatchSet | null | undefined): boolean;
