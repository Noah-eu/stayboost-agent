import type { GuestGuidePreview, Lead, QuickWin } from './types';

export interface EvidenceClaimDiagnostics {
    unsupportedClientClaims: string[];
    unsupportedSignalClaims: string[];
    evidenceClaimReady: boolean;
}

const normalize = (value = '') => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

const claimGroups = [
    { label: 'tramvaj / městská doprava', claim: /\b(tramvaj|tram|metro|mhd|městsk[aá]\s+doprava|mestska\s+doprava|public\s+transport)\b/i, evidence: /\b(tramvaj|tram|metro|mhd|městsk[aá]\s+doprava|mestska\s+doprava|public\s+transport)\b/i },
    { label: 'restaurace', claim: /\b(restaurace|restaurant|bistro|bar|menu)\b/i, evidence: /\b(restaurace|restaurant|bistro|bar|menu|snídaně|snidane)\b/i },
    { label: 'wellness / relax', claim: /\b(wellness|relax|spa|sauna|v[ií]řivka|virivka|mas[aá]ž|masaz|baz[eé]n|bazen|l[aá]zeňsk[yý]|lazensky|koupelov[yý])\b/i, evidence: /\b(wellness|spa|sauna|v[ií]řivka|virivka|mas[aá]ž|masaz|baz[eé]n|bazen|relax\s+centrum|relaxačn[ií]\s+centrum|relaxacni\s+centrum|l[aá]zeňsk[yý]|lazensky|koupelov[yý])\b/i },
    { label: 'parkoviště', claim: /\b(parkoviště|parkoviste|parkov[aá]n[ií]|parking|gar[aá]ž|garaz)\b/i, evidence: /\b(parkoviště|parkoviste|parkov[aá]n[ií]|parking|gar[aá]ž|garaz)\b/i },
    { label: 'snídaně', claim: /\b(sn[ií]daně|snidane|breakfast)\b/i, evidence: /\b(sn[ií]daně|snidane|breakfast)\b/i },
    { label: 'svatby', claim: /\b(svatba|svatby|svatebn[ií]|wedding)\b/i, evidence: /\b(svatba|svatby|svatebn[ií]|wedding)\b/i },
    { label: 'konference', claim: /\b(konference|konferenčn[ií]|konferencni|firemn[ií]\s+akce|školen[ií]|skoleni|conference)\b/i, evidence: /\b(konference|konferenčn[ií]|konferencni|firemn[ií]\s+akce|školen[ií]|skoleni|conference)\b/i },
];

const previewText = (preview?: GuestGuidePreview) => preview ? [
    preview.propertyName,
    preview.city,
    preview.address,
    preview.sourceEvidence.join('\n'),
    preview.limitations.join('\n'),
    preview.sections.map((section) => [
        section.title,
        section.headline,
        section.overview,
        section.sourceEvidence.join('\n'),
        section.groups.map((group) => [group.title, ...group.items].join('\n')).join('\n'),
    ].join('\n')).join('\n'),
].join('\n') : '';

const quickWinText = (wins?: QuickWin[]) => (wins ?? []).map((win) => [
    win.title,
    win.why,
    win.action,
    win.sourceEvidence,
    win.uniqueBusinessAngle,
    ...(win.usedSignals ?? []),
].join('\n')).join('\n');

export const evidenceTextForLead = (lead: Partial<Lead> & { confirmedSignals?: string[] }) => [
    lead.websiteExtraction?.summary,
    ...(lead.websiteExtraction?.pagesExtracted ?? []).flatMap((page) => [page.title, page.textPreview, page.url]),
    ...(lead.sourceMaterials ?? []).flatMap((material) => [material.title, material.content]),
    ...(lead.confirmedSignals ?? []),
].filter(Boolean).join('\n');

export const clientClaimTextForLead = (lead: Partial<Lead>) => [
    quickWinText(lead.freeIdeas),
    lead.clientMiniAudit,
    lead.generatedMiniAudit,
    lead.freeIdeaPurpose,
    lead.paidNextStep,
    lead.generatedOutreach,
    lead.generatedOffer,
    lead.guestGuideSecondEmail,
    previewText(lead.guestGuidePreview),
].filter(Boolean).join('\n');

const signalClaimTextForLead = (lead: Partial<Lead>) => [
    ...(lead.playbookSignals ?? []),
    ...(lead.productRecommendationSignals ?? []),
    ...(lead.publicSignals ?? []),
    quickWinText(lead.freeIdeas),
].filter(Boolean).join('\n');

const unsupportedClaimsInText = (text: string, evidenceText: string) => {
    const normalizedText = normalize(text);
    const normalizedEvidence = normalize(evidenceText);

    return claimGroups
        .filter((group) => group.claim.test(normalizedText) && !group.evidence.test(normalizedEvidence))
        .map((group) => group.label);
};

export const validateEvidenceClaims = (lead: Partial<Lead>): EvidenceClaimDiagnostics => {
    const evidenceText = evidenceTextForLead(lead);
    const unsupportedClientClaims = unsupportedClaimsInText(clientClaimTextForLead(lead), evidenceText);
    const unsupportedSignalClaims = unsupportedClaimsInText(signalClaimTextForLead(lead), evidenceText);

    return {
        unsupportedClientClaims: unique(unsupportedClientClaims),
        unsupportedSignalClaims: unique(unsupportedSignalClaims),
        evidenceClaimReady: unsupportedClientClaims.length === 0 && unsupportedSignalClaims.length === 0,
    };
};

export const sanitizeUnsupportedClaimsFromText = (text = '', lead: Partial<Lead>) => {
    const unsupportedClaims = unsupportedClaimsInText(text, evidenceTextForLead(lead));
    if (unsupportedClaims.length === 0) return text;

    const unsupportedGroups = claimGroups.filter((group) => unsupportedClaims.includes(group.label));
    return text
        .split(/(?<=[.!?])\s+|\n+/g)
        .filter((sentence) => !unsupportedGroups.some((group) => group.claim.test(normalize(sentence))))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

export const sanitizeUnsupportedClaimsFromQuickWins = (wins: QuickWin[] | undefined, lead: Partial<Lead>) => (wins ?? []).map((win) => ({
    ...win,
    title: sanitizeUnsupportedClaimsFromText(win.title, lead) || win.title,
    why: sanitizeUnsupportedClaimsFromText(win.why, lead),
    action: sanitizeUnsupportedClaimsFromText(win.action, lead),
    sourceEvidence: sanitizeUnsupportedClaimsFromText(win.sourceEvidence, lead),
    uniqueBusinessAngle: win.uniqueBusinessAngle ? sanitizeUnsupportedClaimsFromText(win.uniqueBusinessAngle, lead) : win.uniqueBusinessAngle,
    usedSignals: (win.usedSignals ?? []).filter((signal) => validateEvidenceClaims({ ...lead, freeIdeas: [{ ...win, usedSignals: [signal] }] }).evidenceClaimReady),
}));
