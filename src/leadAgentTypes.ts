import type { AccommodationType, OfferAngle, QuickWin } from './types';

export type LeadAgentRunStatus = 'idle' | 'searching' | 'found' | 'analyzing' | 'completed' | 'error' | 'needs-config';
export type LeadAgentConfidence = 'low' | 'medium' | 'high';

export interface LeadAgentSearchRequest {
    location: string;
    accommodationType: string;
    segment: string;
    maxResults: number;
    notes: string;
}

export interface LeadAgentCandidate {
    id: string;
    name: string;
    location: string;
    type: AccommodationType;
    websiteUrl: string;
    sourceUrls: string[];
    sourceSnippets: string[];
    possibleEmail: string;
    signals: string[];
    risks: string[];
    leadScore: number;
    recommendedAngle: OfferAngle;
    evidenceSummary: string;
    isMock: boolean;
    addedLeadId?: string;
    rejected?: boolean;
}

export interface LeadAgentAnalysis {
    firstImpression: string;
    strengths: string[];
    risks: string[];
    guestFrictionSignals: string[];
    quickWins: QuickWin[];
    miniAudit: string;
    outreachEmail: string;
    followUp: string;
    offerRecommendation: string;
    confidence: LeadAgentConfidence;
    evidenceLimits: string[];
    isMock: boolean;
}

export interface LeadAgentDiscoverResponse {
    status: LeadAgentRunStatus;
    message: string;
    isMock: boolean;
    candidates: LeadAgentCandidate[];
}

export interface LeadAgentAnalyzeResponse {
    status: LeadAgentRunStatus;
    message: string;
    isMock: boolean;
    analysis?: LeadAgentAnalysis;
}

export interface LeadAgentSession {
    request: LeadAgentSearchRequest;
    status: LeadAgentRunStatus;
    message: string;
    isMock: boolean;
    candidates: LeadAgentCandidate[];
    analyses: Record<string, LeadAgentAnalysis>;
}
