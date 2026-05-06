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
    mainPhotoObservation: string;
    betterPhotoSuggestion: string;
    photoOrderObservation: string;
    descriptionObservation: string;
    reviewSignals: string;
    guestFrictionSignals: string;
    strengths: string;
    risks: string;
    proposedQuickWins: string[];
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