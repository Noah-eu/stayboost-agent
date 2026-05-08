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
    { label: 'zahrada', claim: /\b(zahrad[ayěuou]|zahr[aá]dk[ayěuou]|venkovn[ií]\s+z[aá]zem[ií]|garden)\b/i, evidence: /\b(zahrad[ayěuou]|zahr[aá]dk[ayěuou]|garden)\b/i },
    { label: 'gril', claim: /\b(gril(?:u|em|ovat|ov[aá]n[ií])?|grill|barbecue|bbq)\b/i, evidence: /\b(gril(?:u|em|ovat|ov[aá]n[ií])?|grill|barbecue|bbq)\b/i },
    { label: 'restaurace', claim: /\b(restaurace|restaurant|bar|menu)\b/i, evidence: /\b(restaurace|restaurant|bar|menu)\b/i },
    { label: 'bistro', claim: /\b(bistro)\b/i, evidence: /\b(bistro)\b/i },
    { label: 'wellness / relax', claim: /\b(wellness|relax|spa|sauna|v[ií]řivka|virivka|mas[aá]ž|masaz|baz[eé]n|bazen|relax\s+centrum|relaxačn[ií]\s+centrum|relaxacni\s+centrum|l[aá]zeňsk[yý]|lazensky|koupelov[yý])\b/i, evidence: /\b(wellness|spa|sauna|v[ií]řivka|virivka|mas[aá]ž|masaz|baz[eé]n|bazen|relax\s+centrum|relaxačn[ií]\s+centrum|relaxacni\s+centrum|l[aá]zeňsk[yý]|lazensky|koupelov[yý])\b/i },
    { label: 'romantický pobyt', claim: /\b(romantick[yý]\s+pobyt|romantick[yý]\s+sc[eé]n[aá][řr]|romantick[yý]\s+v[ií]kend)\b/i, evidence: /\b(romantick[yý]\s+pobyt|romantick[yý]\s+v[ií]kend)\b/i },
    { label: 'rodinný pobyt / děti', claim: /\b(rodinn[yý]\s+pobyt|rodiny\s+s\s+d[eě]tmi|rodina\s+s\s+d[eě]tmi|s\s+d[eě]tmi|d[eě]ti|children|family\s+stay)\b/i, evidence: /\b(rodinn[yý]\s+pobyt|rodiny\s+s\s+d[eě]tmi|rodina\s+s\s+d[eě]tmi|s\s+d[eě]tmi|d[eě]ti|children|family\s+stay)\b/i },
    { label: 'parkoviště', claim: /\b(parkoviště|parkoviste|parkov[aá]n[ií]|parking|gar[aá]ž|garaz)\b/i, evidence: /\b(parkoviště|parkoviste|parkov[aá]n[ií]|parking|gar[aá]ž|garaz)\b/i },
    { label: 'recepce', claim: /\b(recepce|reception)\b/i, evidence: /\b(recepce|reception)\b/i },
    { label: 'pozdní příjezd', claim: /\b(pozdn[ií]\s+p[řr][ií]jezd|pozd[eě]j[šs][ií]\s+n[aá]stup|late\s+arrival)\b/i, evidence: /\b(pozdn[ií]\s+p[řr][ií]jezd|pozd[eě]j[šs][ií]\s+n[aá]stup|late\s+arrival)\b/i },
    { label: 'self check-in', claim: /\b(self\s*check-?in|samoobslu[zž]n[yý]\s+check-?in|keybox|schr[aá]nka\s+na\s+kl[ií][čc]e)\b/i, evidence: /\b(self\s*check-?in|samoobslu[zž]n[yý]\s+check-?in|keybox|schr[aá]nka\s+na\s+kl[ií][čc]e)\b/i },
    { label: 'QR guide', claim: /\b(qr\s*(k[oó]d|code)|qr\s*guide)\b/i, evidence: /\b(qr\s*(k[oó]d|code)|qr\s*guide)\b/i },
    { label: 'guest guide', claim: /\b(guest\s+guide|pr[uů]vodce\s+pro\s+hosty|online\s+pr[uů]vodce)\b/i, evidence: /\b(guest\s+guide|pr[uů]vodce\s+pro\s+hosty|online\s+pr[uů]vodce)\b/i },
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
    const sentences = normalizedText.split(/(?<=[.!?])\s+|\n+/g).filter(Boolean);
    const proposalPattern = /\b(udelat|vytvorit|pripravit|mit|navrh|navazujici|placeny\s+krok|sel\s+udelat|slo\s+udelat|mohl\s+byt|muze\s+byt|dokazu\s+pripravit|ukazka|draft|preview|dostane\s+odkaz|predprijezdova\s+zprava)\b/i;
    const proposalAllowedLabels = ['guest guide', 'QR guide'];

    return claimGroups
        .filter((group) => {
            if (!group.claim.test(normalizedText) || group.evidence.test(normalizedEvidence)) return false;
            const claimSentences = sentences.filter((sentence) => group.claim.test(sentence));
            return !(proposalAllowedLabels.includes(group.label) && claimSentences.length > 0 && claimSentences.every((sentence) => proposalPattern.test(sentence)));
        })
        .map((group) => group.label);
};

const socialSourcePattern = /social-profile|facebook|instagram|veřejn[yý]\s+profil|verejny\s+profil/i;
const ownedWebsiteClaimPattern = /narazil\s+jsem\s+na\s+v[aá][šs]\s+web|přečetl\s+jsem\s+v[aá][šs]\s+web|precetl\s+jsem\s+vas\s+web|vlastn[ií]\s+web\s+provozu|v[aá][šs]\s+web/i;
const socialUnsupportedClaimsInText = (text: string, lead: Partial<Lead>) => {
    const socialLead = socialSourcePattern.test([
        lead.websiteExtraction?.sourceUrlClassification,
        lead.websiteExtraction?.websiteOwnershipStatus,
        lead.websiteExtraction?.socialProfileStatus,
        lead.websiteExtraction?.websiteUrl,
        lead.sourceUrlClassification,
        lead.websiteOwnershipStatus,
        ...(lead.publicSignals ?? []),
    ].filter(Boolean).join('\n'));

    return socialLead && ownedWebsiteClaimPattern.test(text) ? ['vlastní web / přečetl jsem váš web'] : [];
};

export const validateEvidenceClaims = (lead: Partial<Lead>): EvidenceClaimDiagnostics => {
    const evidenceText = evidenceTextForLead(lead);
    const clientText = clientClaimTextForLead(lead);
    const unsupportedClientClaims = [...unsupportedClaimsInText(clientText, evidenceText), ...socialUnsupportedClaimsInText(clientText, lead)];
    const unsupportedSignalClaims = unsupportedClaimsInText(signalClaimTextForLead(lead), evidenceText);

    return {
        unsupportedClientClaims: unique(unsupportedClientClaims),
        unsupportedSignalClaims: unique(unsupportedSignalClaims),
        evidenceClaimReady: unsupportedClientClaims.length === 0 && unsupportedSignalClaims.length === 0,
    };
};

export const sanitizeUnsupportedClaimsFromText = (text = '', lead: Partial<Lead>) => {
    const unsupportedClaims = unsupportedClaimsInText(text, evidenceTextForLead(lead));
    const socialUnsupportedClaims = socialUnsupportedClaimsInText(text, lead);
    if (unsupportedClaims.length === 0 && socialUnsupportedClaims.length === 0) return text;

    const unsupportedGroups = claimGroups.filter((group) => unsupportedClaims.includes(group.label));
    return text
        .split(/(?<=[.!?])\s+|\n+/g)
        .filter((sentence) => !unsupportedGroups.some((group) => group.claim.test(normalize(sentence))) && !socialUnsupportedClaimsInText(sentence, lead).length)
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
