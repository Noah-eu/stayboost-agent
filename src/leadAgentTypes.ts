import type { AccommodationType, LeadPlaybook, OfferAngle, QuickWin, WebsiteExtractionResult } from './types';

export type LeadAgentRunStatus = 'idle' | 'searching' | 'found' | 'analyzing' | 'completed' | 'error' | 'needs-config';
export type LeadAgentConfidence = 'low' | 'medium' | 'high';
export type LeadAgentDiagnosticMode = 'real-api' | 'demo-fallback' | 'error';
export type LeadAgentResultSource = 'real API' | 'demo fallback' | 'error';
export type LeadAgentFitVerdict = 'strong-opportunity' | 'moderate-opportunity' | 'weak-opportunity' | 'not-enough-evidence' | 'skip';
export type LeadAgentTargetOffer = 'guest-communication-fix' | 'guest-guide' | 'simple-website' | 'ota-profile-audit' | 'review-response-improvement' | 'self-checkin-setup' | 'skip';
export type LeadAgentOpportunityType = 'fix-existing-process' | 'setup-automation' | 'ota-profile-audit' | 'benchmark' | 'skip';
export type LeadAgentCandidateFilter = 'all' | 'fix-leads' | 'setup-leads' | 'with-contact' | 'without-contact' | 'benchmark-or-skip' | 'hidden' | 'good-leads' | 'pain-signals' | 'no-pain-or-skip' | 'benchmark-solved' | 'weak-or-skip' | 'website-extracted' | 'setup-opportunity' | 'fix-opportunity' | 'without-own-website';
export type LeadAgentCandidateSort = 'opportunityScore' | 'automationNeedScore' | 'reviewFrictionScore' | 'leadScore' | 'newest' | 'websiteExtracted' | 'contactFirst' | 'setupOpportunity' | 'fixOpportunity';

export interface LeadAgentDiagnostic {
    mode: LeadAgentDiagnosticMode;
    discoverProvider?: 'tavily' | 'demo' | 'error' | 'unknown';
    analyzeProvider?: 'openai' | 'demo-fallback' | 'unknown';
    source?: LeadAgentResultSource;
    fallbackReason?: string;
    httpStatus?: number;
    debugId?: string;
    userMessage: string;
    runtime?: string;
    hasOpenAIKey?: boolean;
    model?: string | null;
    elapsedMs?: number;
    partial?: boolean;
    queriesAttempted?: number;
    queriesSucceeded?: number;
    queriesTimedOut?: number;
    timeoutBudgetMs?: number;
    skippedHeavyEnrichment?: boolean;
    sanitizedSample?: string;
    sanitizedOutputSample?: string;
    rawOutputKind?: 'output_text' | 'output_message_content' | 'unknown';
}

export interface LeadAgentHealth {
    ok: boolean;
    runtime: string;
    hasTavilyKey: boolean;
    hasOpenAIKey: boolean;
    openAIModel: string | null;
    timestamp: string;
}

export interface LeadAgentSearchRequest {
    location: string;
    accommodationType: string;
    segment: string;
    maxResults: number;
    notes: string;
    knownTargetName?: string;
    knownTargetCity?: string;
    knownTargetWebsiteUrl?: string;
    knownTargetNote?: string;
    knownTargetEmail?: string;
}

export interface LeadAgentCandidate {
    id: string;
    runId: string;
    createdAt: string;
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
    opportunityScore: number;
    opportunityType: LeadAgentOpportunityType;
    automationNeedScore: number;
    publicMaturityScore: number;
    reviewFrictionScore: number;
    fitVerdict: LeadAgentFitVerdict;
    confidence: LeadAgentConfidence;
    contactMissing: boolean;
    painSignals: string[];
    positiveSolvedSignals: string[];
    noPainReason?: string;
    targetOffer: LeadAgentTargetOffer;
    offerHypothesis: string;
    websiteSignals: string[];
    contactSignals: string[];
    missingAutomationSignals: string[];
    likelyManualProcessSignals: string[];
    qualificationReason: string;
    alreadySolvedSignals: string[];
    missingEvidence: string[];
    contradictionWarnings: string[];
    recommendedAngle: OfferAngle;
    evidenceSummary: string;
    websiteExtraction?: WebsiteExtractionResult;
    isMock: boolean;
    isLegacy?: boolean;
    addedLeadId?: string;
    rejected?: boolean;
}

export interface LeadAgentAnalysis {
    runId: string;
    analyzedAt: string;
    provider: 'openai' | 'demo-fallback' | 'legacy';
    model: string | null;
    leadDisplayName?: string;
    firstImpression: string;
    strengths: string[];
    risks: string[];
    guestFrictionSignals: string[];
    quickWins: QuickWin[];
    leadPlaybook?: LeadPlaybook;
    leadPlaybookReason?: string;
    playbookSignals?: string[];
    freeIdeasDiversityScore?: number;
    repeatedConceptWarning?: boolean;
    miniAudit: string;
    outreachEmail: string;
    followUp: string;
    offerRecommendation: string;
    confidence: LeadAgentConfidence;
    fitVerdict: LeadAgentFitVerdict;
    opportunityScore: number;
    opportunityType: LeadAgentOpportunityType;
    automationNeedScore: number;
    publicMaturityScore: number;
    reviewFrictionScore: number;
    painSignals: string[];
    positiveSolvedSignals: string[];
    noPainReason?: string;
    targetOffer: LeadAgentTargetOffer;
    offerHypothesis: string;
    websiteSignals: string[];
    contactSignals: string[];
    missingAutomationSignals: string[];
    likelyManualProcessSignals: string[];
    qualificationReason: string;
    alreadySolvedSignals: string[];
    missingEvidence: string[];
    contradictionWarnings: string[];
    evidenceLimits: string[];
    isMock: boolean;
    isLegacy?: boolean;
}

export interface LeadAgentDiscoverResponse {
    status: LeadAgentRunStatus;
    message: string;
    isMock: boolean;
    candidates: LeadAgentCandidate[];
    diagnostic?: LeadAgentDiagnostic;
}

export interface LeadAgentAnalyzeResponse {
    status: LeadAgentRunStatus;
    message: string;
    isMock: boolean;
    analysis?: LeadAgentAnalysis;
    diagnostic?: LeadAgentDiagnostic;
}

export interface LeadAgentSession {
    runId: string;
    createdAt: string;
    request: LeadAgentSearchRequest;
    status: LeadAgentRunStatus;
    message: string;
    isMock: boolean;
    candidates: LeadAgentCandidate[];
    analyses: Record<string, LeadAgentAnalysis>;
    dismissedCandidateIds: string[];
    candidateFilter: LeadAgentCandidateFilter;
    candidateSort: LeadAgentCandidateSort;
    loadedFromStorage: boolean;
    storedBannerDismissed: boolean;
    diagnostic?: LeadAgentDiagnostic;
    health?: LeadAgentHealth;
    healthMessage?: string;
}
