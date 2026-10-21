import type { SentOffer } from "./sentOffers";

export interface OfferSet { offers: SentOffer[]; gone: Record<string, number> }
export const MAX_BYTES: number;
export const MAX_OFFERS: number;
export const MAX_GONE: number;
export function stampOf(o: Partial<SentOffer> | null | undefined): number;
export function cleanOffer(o: unknown, leagueId?: string): SentOffer | null;
export function mergeOffers(...sets: (Partial<OfferSet> | null | undefined)[]): OfferSet;
export function prune(set: OfferSet, now?: number): OfferSet;
