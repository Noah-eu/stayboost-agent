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
    publicProfileUrl: string;
    publicLinks: PublicProfileLink[];
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
    generatedMiniAudit: string;
    generatedOutreach: string;
    generatedFollowUp: string;
    generatedOffer: string;
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