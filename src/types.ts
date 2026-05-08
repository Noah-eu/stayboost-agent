export type AccommodationType = 'Hotel' | 'Penzion' | 'Apartman' | 'Glamping' | 'Jine';

export type LeadStatus =
    | 'Novy'
    | 'Audit pripraven'
    | 'Osloveni pripravene'
    | 'Kontaktovan'
    | 'Follow-up'
    | 'Nabidka'
    | 'Uzavreno';

export type OfferAngle =
    | 'main-photo'
    | 'photo-order'
    | 'description'
    | 'reviews'
    | 'guest-communication'
    | 'guest-guide';

export type PublicProfileSourceType = 'booking' | 'airbnb' | 'google' | 'website' | 'other';

export type MainPhotoVerdict = 'strong' | 'average' | 'weak' | 'unknown';

export type SourceMaterialType = 'pasted-text' | 'screenshot-note' | 'manual-note' | 'website-extraction';

export type AgentLeadStatus = 'quick-discovery' | 'analyzed' | 'added-without-analysis' | 'manual';

export type EvidenceLevel = 'search-snippet-only' | 'website-snippet' | 'website-extracted' | 'pasted-public-text' | 'screenshot-analysis' | 'full-agent-analysis';

export type LeadScreenshotType = 'ota-profile-screenshot' | 'photo-gallery-screenshot' | 'review-screenshot' | 'website-screenshot' | 'other';

export type ExtractionStatus = 'idle' | 'ready' | 'running' | 'completed' | 'needs-more-input' | 'error';

export interface PublicProfileLink {
    id: string;
    sourceType: PublicProfileSourceType;
    url: string;
    label: string;
    notes: string;
}

export interface QuickWin {
    id: string;
    title: string;
    why: string;
    action: string;
    sourceEvidence: string;
}

export interface SourceMaterial {
    id: string;
    type: SourceMaterialType;
    sourceLinkId?: string;
    title: string;
    content: string;
    createdAt: string;
}

export interface LeadScreenshot {
    id: string;
    type: LeadScreenshotType;
    fileName: string;
    note: string;
    dataUrl: string;
    createdAt: string;
}

export interface ScreenshotQuickWin {
    title: string;
    why: string;
    action: string;
    sourceEvidence: string;
}

export interface ScreenshotAnalysisResult {
    photoFirstImpression: string;
    mainPhotoVerdict: MainPhotoVerdict;
    photoOrderSuggestions: string[];
    visibleStrengths: string[];
    visibleWeaknesses: string[];
    otaPresentationObservations: string[];
    reviewSignalsFromScreenshots: string[];
    guestFrictionVisible: string[];
    quickWins: ScreenshotQuickWin[];
    confidence: 'low' | 'medium' | 'high';
    evidenceLimits: string[];
}

export interface ScreenshotAnalysisDiagnostic {
    status: 'idle' | 'running' | 'completed' | 'needs-config' | 'error';
    provider?: 'openai' | 'fallback' | 'client';
    fallbackReason?: string;
    debugId?: string;
    userMessage?: string;
    model?: string | null;
    elapsedMs?: number;
    hasOpenAIKey?: boolean;
}

export interface WebsiteExtractedPage {
    url: string;
    title: string;
    textPreview: string;
    contentLength: number;
}

export interface WebsiteSkippedPage {
    url: string;
    title: string;
    reason: 'not_found_page' | 'empty_content' | 'invalid_content';
}

export interface WebsiteExtractionContact {
    emails: string[];
    phones: string[];
    contactPageUrl: string | null;
}

export interface WebsiteExtractionResult {
    provider: 'tavily-extract' | 'fallback' | 'error';
    status: 'completed' | 'partial' | 'unsupported' | 'error';
    websiteUrl: string;
    extractionStrategy?: 'homepage-first' | 'fallback-guesses' | 'legacy';
    discoveredInternalLinksCount?: number;
    guessedUrlsUsed?: string[];
    pagesExtracted: WebsiteExtractedPage[];
    skippedPages: WebsiteSkippedPage[];
    validPagesCount: number;
    invalidPagesCount: number;
    contact: WebsiteExtractionContact;
    websiteSignals: string[];
    arrivalSignals: string[];
    parkingSignals: string[];
    faqSignals: string[];
    guestGuideSignals: string[];
    automationSignals: string[];
    missingPublicInfoSignals: string[];
    likelyManualProcessSignals: string[];
    strengths: string[];
    risks: string[];
    setupOpportunitySignals: string[];
    fixOpportunitySignals: string[];
    evidenceLimits: string[];
    summary: string;
    debug: {
        debugId: string;
        elapsedMs: number;
        partial: boolean;
        reason: string | null;
    };
}

export interface AuditExtractionInput {
    leadName: string;
    publicLinks: PublicProfileLink[];
    sourceMaterials: SourceMaterial[];
}

export interface AuditExtractionDraft {
    firstImpression: string;
    strengths: string;
    reviewSignals: string;
    guestFrictionSignals: string;
    risks: string;
    businessOpportunity: string;
    mainPhotoVerdict: MainPhotoVerdict;
    mainPhotoObservation: string;
    checkInParkingInfo: string;
    guestConfusion: string;
    structuredQuickWins: QuickWin[];
    publicSignals: string[];
    selectedOfferAngle: OfferAngle;
}

export interface AuditExtractionResult {
    status: Extract<ExtractionStatus, 'completed' | 'needs-more-input' | 'error'>;
    message: string;
    draft?: AuditExtractionDraft;
    evidenceNotes: string[];
}

export interface LeadCandidate {
    id: string;
    name: string;
    city: string;
    accommodationType: AccommodationType;
    email: string;
    url: string;
    sourceNotes: string;
    reviewSnippets: string;
    signals: string[];
    score: number;
    recommendedOfferAngle: OfferAngle;
    addedLeadId?: string;
}

export interface LeadSearchSession {
    cityOrArea: string;
    accommodationType: AccommodationType | '';
    targetSegment: string;
    notes: string;
    sourceText: string;
    candidates: LeadCandidate[];
}

export interface Lead {
    id: string;
    name: string;
    accommodationType: AccommodationType;
    city: string;
    websiteOrOtaUrl: string;
    email: string;
    status: LeadStatus;
    notes: string;
    publicSignals: string[];
    quickWins: string[];
    leadScore: number;
    createdFromAgentAnalysis?: boolean;
    addedWithoutAgentAnalysis?: boolean;
    agentLeadStatus: AgentLeadStatus;
    evidenceLevel: EvidenceLevel;
    needsAgentAnalysis: boolean;
    sourceLimitations: string[];
    leadAgentRunId?: string;
    agentAnalysisProvider?: string;
    opportunityScore?: number;
    opportunityType?: string;
    fitVerdict?: string;
    confidence?: string;
    targetOffer?: string;
    qualificationReason?: string;
    offerHypothesis?: string;
    automationNeedScore?: number;
    reviewFrictionScore?: number;
    publicMaturityScore?: number;
    isDemoLead?: boolean;
    demoReason?: string;
    publicProfileUrl: string;
    publicLinks: PublicProfileLink[];
    sourceMaterials: SourceMaterial[];
    screenshots: LeadScreenshot[];
    screenshotAnalysis?: ScreenshotAnalysisResult;
    screenshotAnalysisDiagnostic?: ScreenshotAnalysisDiagnostic;
    websiteExtraction?: WebsiteExtractionResult;
    latestAnalysisDiagnostic?: unknown;
    websiteExtractionDiagnostic?: unknown;
    evidenceCanonicalizationDiagnostic?: {
        canonicalizationApplied: boolean;
        removedInvalidSignals: string[];
        removedInvalidPhones: string[];
        removedStaleSourceMaterials: number;
        staleSourceMaterialTitlesRemoved?: string[];
    };
    extractionStatus: ExtractionStatus;
    firstImpression: string;
    mainPhotoVerdict: MainPhotoVerdict;
    mainPhotoObservation: string;
    betterPhotoSuggestion: string;
    photoOrderObservation: string;
    descriptionObservation: string;
    checkInParkingInfo: string;
    reviewSignals: string;
    guestFrictionSignals: string;
    guestConfusion: string;
    strengths: string;
    risks: string;
    businessOpportunity: string;
    proposedQuickWins: string[];
    structuredQuickWins: QuickWin[];
    selectedOfferAngle: OfferAngle;
    internalAgentBrief: string;
    clientMiniAudit: string;
    generatedMiniAudit: string;
    generatedOutreach: string;
    generatedFollowUp: string;
    generatedOffer: string;
    freeIdeaTeaser?: string;
    freeIdeas?: QuickWin[];
    paidNextStep?: string;
    outreachIntent?: 'ask-permission-to-send-free-ideas';
    outreachTone?: 'humble-transparent-low-pressure';
    lastContactDate: string;
    nextFollowUpDate: string;
}

export const leadStatuses: LeadStatus[] = [
    'Novy',
    'Audit pripraven',
    'Osloveni pripravene',
    'Kontaktovan',
    'Follow-up',
    'Nabidka',
    'Uzavreno',
];

export const accommodationTypes: AccommodationType[] = [
    'Hotel',
    'Penzion',
    'Apartman',
    'Glamping',
    'Jine',
];

export const offerAngleLabels: Record<OfferAngle, string> = {
    'main-photo': 'Hlavni fotka',
    'photo-order': 'Poradi fotek',
    description: 'Popis nabidky',
    reviews: 'Recenze',
    'guest-communication': 'Komunikace s hostem',
    'guest-guide': 'Guest guide',
};

export const publicProfileSourceLabels: Record<PublicProfileSourceType, string> = {
    booking: 'Booking',
    airbnb: 'Airbnb',
    google: 'Google',
    website: 'Vlastni web',
    other: 'Jine',
};

export const mainPhotoVerdictLabels: Record<MainPhotoVerdict, string> = {
    strong: 'silna',
    average: 'prumerna',
    weak: 'slaba',
    unknown: 'nevim / nehodnoceno',
};

export const sourceMaterialTypeLabels: Record<SourceMaterialType, string> = {
    'pasted-text': 'zkopirovany verejny text',
    'screenshot-note': 'poznamka ze screenshotu',
    'manual-note': 'rucni poznamka',
    'website-extraction': 'extrakce vlastniho webu',
};

export const agentLeadStatusLabels: Record<AgentLeadStatus, string> = {
    'quick-discovery': 'Rychlý nález',
    analyzed: 'Analyzovaný lead',
    'added-without-analysis': 'Přidán bez analýzy',
    manual: 'Ruční lead',
};

export const evidenceLevelLabels: Record<EvidenceLevel, string> = {
    'search-snippet-only': 'Search snippet only',
    'website-snippet': 'Website evidence',
    'website-extracted': 'Web přečten',
    'pasted-public-text': 'Vložený veřejný text',
    'screenshot-analysis': 'Screenshot analyzed',
    'full-agent-analysis': 'Full agent analysis',
};

export const leadScreenshotTypeLabels: Record<LeadScreenshotType, string> = {
    'ota-profile-screenshot': 'OTA profile screenshot',
    'photo-gallery-screenshot': 'Photo gallery screenshot',
    'review-screenshot': 'Review screenshot',
    'website-screenshot': 'Website screenshot',
    other: 'Other',
};