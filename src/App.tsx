import { Clipboard, ClipboardCheck, ExternalLink, Image, LayoutDashboard, Mail, Plus, Save, Search, Send, Sparkles, Trash2, Users, X } from 'lucide-react';
import { FormEvent, MouseEvent, useEffect, useMemo, useState } from 'react';
import { analyzeLead, analyzeScreenshots, checkAgentHealth, discoverDemoLeads, discoverLeads, extractWebsite } from './agentApi';
import { extractAuditObservations } from './auditExtractor';
import { buildWebsiteOnlyOutreach, cleanLeadDisplayName, clientTextSanitizerDiagnostics, hasClientCopyIssue, hasForbiddenOutreachLanguage, sanitizeClientText } from './clientCopy';
import { createCandidateDebugExport, createLeadDebugExport, createRunDebugExport, createWebsiteExtractionDebugExport, debugFileNames, downloadJsonFile } from './debugExport';
import { sanitizeUnsupportedClaimsFromQuickWins, sanitizeUnsupportedClaimsFromText, validateEvidenceClaims } from './evidenceClaimValidator';
import { generateFirstOutreach, generateFollowUp, generateFreeIdeaTeaser, generateInternalAgentBrief, generateMiniAudit, generateOffer } from './generators';
import { createGuestGuidePreview, createGuestGuideSecondEmail } from './guestGuidePreview';
import { annotateQuickWinSpecificity, buildSpecificFreeIdeas, freeIdeaSpecificityDiagnostics } from './ideaSpecificity';
import { mockLeads } from './mockData';
import { extractRejectedPhones, extractValidPhones, isLikelyPhoneNumber, mergePhones } from './phoneValidation';
import { recommendedProductLabels, recommendProductForLead } from './productRecommendation';
import { assessWebsiteOwnership, isAssetPage, isAssetUrl } from './websiteOwnership';
import {
    LeadAgentAnalysis,
    LeadAgentCandidate,
    LeadAgentCandidateFilter,
    LeadAgentCandidateSort,
    LeadAgentDiagnostic,
    LeadAgentHealth,
    LeadAgentOpportunityType,
    LeadAgentSearchRequest,
    LeadAgentSession,
} from './leadAgentTypes';
import {
    accommodationTypes,
    ContactQuality,
    Lead,
    agentLeadStatusLabels,
    evidenceLevelLabels,
    leadStatuses,
    LeadStatus,
    leadScreenshotTypeLabels,
    LeadScreenshot,
    LeadScreenshotType,
    mainPhotoVerdictLabels,
    offerAngleLabels,
    OfferAngle,
    publicProfileSourceLabels,
    PublicProfileLink,
    PublicProfileSourceType,
    QuickWin,
    sourceMaterialTypeLabels,
    SourceMaterial,
    SourceMaterialType,
    WebsiteExtractionResult,
} from './types';

type Screen = 'dashboard' | 'finder' | 'leads' | 'detail' | 'audit' | 'outreach' | 'offer';

const storageKey = 'stayboost-agent-leads';
const agentStorageKey = 'stayboost-agent-lead-agent';
const legacyRunId = 'legacy-run';

const newAgentRunId = () => `run-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
const nowIso = () => new Date().toISOString();
const formatDateTime = (value?: string) => {
    if (!value) return 'neuvedeno';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' });
};

const emptyLead = (): Lead => ({
    id: `lead-${crypto.randomUUID()}`,
    name: '',
    accommodationType: 'Penzion',
    city: '',
    websiteOrOtaUrl: '',
    email: '',
    status: 'Novy',
    notes: '',
    publicSignals: [],
    quickWins: [],
    leadScore: 0,
    createdFromAgentAnalysis: false,
    addedWithoutAgentAnalysis: false,
    agentLeadStatus: 'manual',
    evidenceLevel: 'pasted-public-text',
    needsAgentAnalysis: false,
    sourceLimitations: [],
    leadAgentRunId: '',
    agentAnalysisProvider: '',
    opportunityScore: 0,
    opportunityType: '',
    fitVerdict: '',
    confidence: '',
    targetOffer: '',
    qualificationReason: '',
    offerHypothesis: '',
    automationNeedScore: 0,
    reviewFrictionScore: 0,
    publicMaturityScore: 0,
    isDemoLead: false,
    demoReason: '',
    publicProfileUrl: '',
    publicLinks: [],
    sourceMaterials: [],
    screenshots: [],
    screenshotAnalysis: undefined,
    screenshotAnalysisDiagnostic: { status: 'idle' },
    latestAnalysisDiagnostic: undefined,
    websiteExtractionDiagnostic: undefined,
    extractionStatus: 'idle',
    firstImpression: '',
    mainPhotoVerdict: 'unknown',
    mainPhotoObservation: '',
    betterPhotoSuggestion: '',
    photoOrderObservation: '',
    descriptionObservation: '',
    checkInParkingInfo: '',
    reviewSignals: '',
    guestFrictionSignals: '',
    guestConfusion: '',
    strengths: '',
    risks: '',
    businessOpportunity: '',
    proposedQuickWins: [],
    structuredQuickWins: [],
    selectedOfferAngle: 'main-photo',
    internalAgentBrief: '',
    clientMiniAudit: '',
    generatedMiniAudit: '',
    generatedOutreach: '',
    generatedFollowUp: '',
    generatedOffer: '',
    freeIdeaTeaser: '',
    freeIdeas: [],
    paidNextStep: '',
    recommendedProduct: 'guest-guide-starter',
    recommendedProductReason: '',
    productRecommendationSignals: [],
    freeIdeaPurpose: '',
    paidOfferShort: '',
    paidOfferDetails: '',
    clientOutputStatus: 'draft-needs-review',
    notReadyReasons: [],
    unsupportedClientClaims: [],
    unsupportedSignalClaims: [],
    evidenceClaimReady: true,
    guestGuidePreviewStatus: 'not-created',
    guestGuidePreview: undefined,
    guestGuideSecondEmail: '',
    contactQuality: {
        validEmails: [],
        validPhones: [],
        rejectedPhones: [],
        emailSource: 'missing',
        phoneSource: 'missing',
        contactReady: false,
    },
    websiteOwnershipStatus: 'unknown',
    websiteOwnershipReason: '',
    officialWebsiteCandidateUrl: '',
    directoryExtractedCandidates: [],
    extractionAllowed: true,
    skippedAssetUrls: [],
    directoryContact: { emails: [], phones: [], contactPageUrl: null },
    contactOwnershipStatus: 'unknown',
    leadPlaybook: 'basic-website-guest-guide',
    leadPlaybookReason: '',
    playbookSignals: [],
    freeIdeasDiversityScore: 0,
    repeatedConceptWarning: false,
    outreachIntent: 'ask-permission-to-send-free-ideas',
    outreachTone: 'humble-transparent-low-pressure',
    lastContactDate: '',
    nextFollowUpDate: '',
});

const screenLabels: Record<Screen, string> = {
    dashboard: 'Dashboard',
    finder: 'Lead Finder',
    leads: 'Leady',
    detail: 'Detail leadu',
    audit: '3 nápady zdarma',
    outreach: 'Osloveni',
    offer: 'Možná placená návaznost',
};

const screenIcons: Record<Screen, typeof LayoutDashboard> = {
    dashboard: LayoutDashboard,
    finder: Search,
    leads: Users,
    detail: ClipboardCheck,
    audit: Sparkles,
    outreach: Mail,
    offer: Send,
};

const leadPlaybookLabels = {
    'city-apartment-arrival': 'City apartment arrival',
    'restaurant-linked-stay': 'Restaurant-linked stay',
    'family-local-experience': 'Family local experience',
    'romantic-wellness-stay': 'Romantic wellness stay',
    'event-wedding-hotel': 'Event / wedding hotel',
    'basic-website-guest-guide': 'Basic website guest guide',
    'ops-audit': 'Ops audit',
    skip: 'Skip',
};

const splitLines = (value: string) =>
    value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

const joinLines = (value: string[]) => value.join('\n');

const uniqueStrings = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const isPresentString = (value: string | undefined | null): value is string => Boolean(value);
const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const emailMissingSignalPattern = /(e-?mail|email).*(nen[ií]|chyb[ií]|nenalezen|nen[íi] vid[eě]t|nen[ií] vid[eě]t|neni videt|není vidět|chyb[ií] ve[řr]ejn[yý])/i;
const removeContactContradictions = (values: string[], hasWebsiteEmail: boolean) => uniqueStrings(values.filter((value) => !(hasWebsiteEmail && emailMissingSignalPattern.test(value))));

const hasCompletedWebsiteExtraction = (lead: Pick<Lead, 'websiteExtraction'>) => Boolean(lead.websiteExtraction && ['completed', 'partial'].includes(lead.websiteExtraction.status));
const hasLeadClientOutputs = (lead: Pick<Lead, 'clientMiniAudit' | 'generatedMiniAudit' | 'generatedOutreach' | 'generatedFollowUp' | 'generatedOffer'>) => Boolean((lead.clientMiniAudit || lead.generatedMiniAudit).trim() && lead.generatedOutreach.trim() && lead.generatedFollowUp.trim() && lead.generatedOffer.trim());
const hasLeadQuickWins = (lead: Pick<Lead, 'structuredQuickWins'>) => (lead.structuredQuickWins ?? []).filter((win) => win.title.trim() && win.why.trim() && win.action.trim()).length === 3;
const needsWebsiteAnalysis = (lead: Lead) => hasCompletedWebsiteExtraction(lead) && lead.needsAgentAnalysis && !lead.createdFromAgentAnalysis;
const clientOutputValues = (lead: Pick<Lead, 'clientMiniAudit' | 'generatedMiniAudit' | 'generatedOutreach' | 'generatedFollowUp' | 'generatedOffer'>) => [lead.clientMiniAudit || lead.generatedMiniAudit, lead.generatedOutreach, lead.generatedFollowUp, lead.generatedOffer];
const notFoundPagePattern = /str[aá]nka nenalezena|page not found|\b404\b|po[zž]adovan[aá] str[aá]nka nebyla nalezena|not found|str[aá]nka byla p[řr]em[ií]st[eě]na nebo odstran[eě]na/i;
const isInvalidExtractedPage = (page: { url?: string; title?: string; textPreview?: string; contentLength?: number }) => notFoundPagePattern.test(`${page.title ?? ''}\n${page.textPreview ?? ''}`) || isAssetPage({ url: page.url ?? '', title: page.title ?? '', textPreview: page.textPreview ?? '', contentLength: page.contentLength ?? 0 });
const websiteOnlyOutreachMismatchPattern = /fotk|hlavn[ií] fot|recenz|redesign|galeri/i;
const validEmail = (value = '') => emailPattern.test(value.trim());
const normalizeEmail = (value = '') => value.trim().toLowerCase();
const discoveryPhoneText = (lead: Pick<Lead, 'sourceMaterials' | 'notes'>) => [
    lead.notes,
    ...(lead.sourceMaterials ?? []).flatMap((material) => [material.title, material.content]),
].filter(Boolean).join('\n');
const contactQualityForLead = (lead: Pick<Lead, 'email' | 'websiteExtraction' | 'sourceMaterials' | 'notes'>, rejectedPhones: string[] = []): ContactQuality => {
    const ownershipStatus = lead.websiteExtraction?.websiteOwnershipStatus ?? 'official';
    const websitePhones = lead.websiteExtraction?.contact.phones ?? [];
    const discoveryPhones = extractValidPhones(discoveryPhoneText(lead));
    const validWebsitePhones = uniqueStrings(websitePhones.filter((phone) => isLikelyPhoneNumber(phone)));
    const validPhones = mergePhones(validWebsitePhones, discoveryPhones);
    const allRejectedPhones = uniqueStrings([...rejectedPhones, ...websitePhones.filter((phone) => !isLikelyPhoneNumber(phone)), ...extractRejectedPhones(discoveryPhoneText(lead))]);
    if (ownershipStatus !== 'official') {
        return {
            validEmails: [],
            validPhones: [],
            rejectedPhones: allRejectedPhones,
            emailSource: 'missing',
            phoneSource: 'missing',
            contactReady: false,
        };
    }
    const websiteEmails = uniqueStrings((lead.websiteExtraction?.contact.emails ?? []).map(normalizeEmail).filter(validEmail));
    const fallbackEmail = normalizeEmail(lead.email || '');
    const validEmails = websiteEmails.length > 0 ? websiteEmails : validEmail(fallbackEmail) ? [fallbackEmail] : [];

    return {
        validEmails,
        validPhones,
        rejectedPhones: allRejectedPhones,
        emailSource: websiteEmails.length > 0 ? 'website' : validEmails.length > 0 ? 'discovery-fallback' : 'missing',
        phoneSource: validWebsitePhones.length > 0 && discoveryPhones.length > 0 ? 'website-and-discovery' : validWebsitePhones.length > 0 ? 'website' : discoveryPhones.length > 0 ? 'discovery-fallback' : 'missing',
        contactReady: validEmails.length > 0 || validPhones.length > 0,
    };
};
const decimalCoordinatePattern = /\b\d{1,3}\.\d{5,}\b/g;
const dataUrlPattern = /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/gi;
const markdownImagePattern = /!\[[^\]]*\]\([^)]*\)/g;
const invalidPhoneSignalPattern = /Telefon nalezen na vlastn[íi]m webu:\s*(.+)$/i;

const sanitizeSourceMaterialContent = (content = '') => content
    .replace(dataUrlPattern, '[image data omitted]')
    .replace(markdownImagePattern, '[image omitted]')
    .replace(decimalCoordinatePattern, '[coordinate omitted]')
    .split('\n')
    .filter((line) => !notFoundPagePattern.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 8000);
const redactInvalidEvidenceValue = (value: string) => value
    .replace(decimalCoordinatePattern, '[coordinate omitted]')
    .replace(/Telefon nalezen na vlastn[íi]m webu:\s*\[coordinate omitted\]/gi, 'Telefon nalezen na vlastním webu: [invalid phone omitted]');

const sanitizeWebsiteExtractionForSourceMaterial = (extraction: WebsiteExtractionResult) => sanitizeSourceMaterialContent([
    extraction.summary,
    '',
    'Contacts:',
    [...extraction.contact.emails, ...extraction.contact.phones].join('\n') || 'Kontakt nenalezen',
    '',
    'Valid pages:',
    extraction.pagesExtracted.map((page) => `${page.title || page.url}\n${page.url}\n${page.textPreview}`).join('\n\n') || 'Žádná validní stránka nebyla přečtena.',
    '',
    'Skipped pages:',
    (extraction.skippedPages ?? []).map((page) => `${page.title || page.url}\n${page.url}\nReason: ${page.reason}`).join('\n\n') || 'Žádné stránky nebyly přeskočeny.',
    '',
    'Key signals:',
    [...extraction.websiteSignals, ...extraction.arrivalSignals, ...extraction.parkingSignals, ...extraction.faqSignals, ...extraction.setupOpportunitySignals, ...extraction.fixOpportunitySignals].join('\n') || 'Bez výrazných signálů.',
    '',
    'Evidence limits:',
    extraction.evidenceLimits.join('\n'),
].join('\n'));

const websiteExtractionSummary = (leadName: string, extraction: WebsiteExtractionResult) => {
    const validCount = extraction.validPagesCount ?? extraction.pagesExtracted.length;
    const invalidCount = extraction.invalidPagesCount ?? extraction.skippedPages.length;
    const validLabel = validCount === 1 ? 'validní stránka' : validCount > 1 && validCount < 5 ? 'validní stránky' : 'validních stránek';
    const skippedLabel = invalidCount === 1 ? 'neplatná/404 stránka přeskočena' : invalidCount > 1 && invalidCount < 5 ? 'neplatné/404 stránky přeskočeny' : 'neplatných/404 stránek přeskočeno';

    return `${leadName || 'Kandidat'}: přečteny ${validCount} ${validLabel} vlastního webu, ${invalidCount} ${skippedLabel}. Kontakt: ${extraction.contact.emails.length > 0 || extraction.contact.phones.length > 0 ? 'nalezen' : 'nenalezen'}. Setup signály: ${extraction.setupOpportunitySignals.length}. Fix signály: ${extraction.fixOpportunitySignals.length}.`;
};

const normalizeForSignalMatch = (value = '') => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const extractionTextForSignals = (extraction: WebsiteExtractionResult) => normalizeForSignalMatch([
    extraction.summary,
    ...(extraction.pagesExtracted ?? []).flatMap((page) => [page.title, page.textPreview, page.url]),
    ...(extraction.parkingSignals ?? []),
    ...(extraction.strengths ?? []),
].join('\n'));
const parkingMissingSignalPattern = /parkov[aá]n[ií]|parking/i;
const normalizeParkingSignals = (extraction: WebsiteExtractionResult): WebsiteExtractionResult => {
    const searchable = extractionTextForSignals(extraction);
    const parkingSignals = uniqueStrings([
        ...(extraction.parkingSignals ?? []),
        /parkoviste|parkovani|parking|garage|garaz/.test(searchable) ? 'Web zmiňuje parkování' : '',
        /nabijeci stanice|elektromobil|ev charging|charging station/.test(searchable) ? 'Web zmiňuje parkování / nabíjecí stanici' : '',
    ]);
    const suppressedMissingSignals = uniqueStrings([
        ...(extraction.suppressedMissingSignals ?? []),
        ...((parkingSignals.length > 0 ? extraction.missingPublicInfoSignals.filter((signal) => parkingMissingSignalPattern.test(signal)) : [])
            .map((signal) => `Potlačeno: ${signal}`)),
    ]);

    return {
        ...extraction,
        parkingSignals,
        missingPublicInfoSignals: parkingSignals.length > 0
            ? extraction.missingPublicInfoSignals.filter((signal) => !parkingMissingSignalPattern.test(signal))
            : extraction.missingPublicInfoSignals,
        suppressedMissingSignals,
        strengths: uniqueStrings([
            ...(extraction.strengths ?? []),
            parkingSignals.length > 0 ? 'Web zmiňuje parkování / nabíjecí stanici.' : '',
        ]),
    };
};

const hasCompletedAgentAnalysis = (lead: Lead) => lead.agentLeadStatus === 'analyzed' || (lead.createdFromAgentAnalysis && !lead.needsAgentAnalysis);

const sourceMaterialHasSkippedPageDump = (material: SourceMaterial, skippedPages: WebsiteExtractionResult['skippedPages']) => {
    if (!/Pages extracted/i.test(material.content)) return false;

    return skippedPages.some((page) => page.url && material.content.includes(page.url));
};

const isStaleSourceMaterial = (material: SourceMaterial, extraction: WebsiteExtractionResult) => {
    const title = material.title.toLowerCase();
    const content = material.content.toLowerCase();

    return title.includes('agent candidate source without analysis')
        || content.includes('bez plne agentni analyzy')
        || sourceMaterialHasSkippedPageDump(material, extraction.skippedPages ?? []);
};

const cleanSearchDiscoverySource = (material: SourceMaterial, lead: Lead): SourceMaterial | null => {
    const sourceSnippet = material.content.split(/Source snippets:/i)[1]?.split(/Website extraction summary:|Pages extracted:/i)[0]
        ?? material.content.split(/Pages extracted:/i)[0]
        ?? material.content;
    const cleanedContent = sanitizeSourceMaterialContent(sourceSnippet)
        .split('\n')
        .filter((line) => !/bez plne agentni analyzy|Agent candidate source without analysis/i.test(line))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 1000);

    if (!cleanedContent) return null;

    return {
        ...material,
        id: `source-search-${lead.id}`,
        type: 'pasted-text',
        title: 'Search discovery source',
        content: cleanedContent,
    };
};

const analyzedLeadNotes = (lead: Lead, extraction: WebsiteExtractionResult) => {
    const contact = extraction.contact.emails[0] || extraction.contact.phones[0] || 'nenalezen';
    const validCount = extraction.validPagesCount ?? extraction.pagesExtracted.length;
    const invalidCount = extraction.invalidPagesCount ?? extraction.skippedPages.length;
    const provider = lead.agentAnalysisProvider === 'openai' ? 'OpenAI analýzy' : 'agentní analýzy';
    const discovery = lead.isDemoLead ? 'demo hledání' : 'reálného Tavily hledání';

    return `Lead vznikl z ${discovery}, website extraction a ${provider}. Vlastní web byl přečten: ${validCount} validní stránky, ${invalidCount} neplatné/404 stránky přeskočeny. Kontakt nalezen: ${contact}. Doporučený úhel: guest guide / předpříjezdové informace.`;
};

const softenQuickWinWhy = (quickWin: QuickWin): QuickWin => {
    const normalizedTitle = quickWin.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const exactArrivalWhy = 'Jasně soustředěné informace k příjezdu mohou snížit nejistotu hosta a omezit opakované dotazy před příjezdem.';
    const softenedWhy = sanitizeClientText(quickWin.why)
        .replace(/bez jasn[eé]ho n[aá]vodu volaj[ií] zbyte[čc]n[eě] na recepci/gi, 'jasný návod může snížit nejistotu hosta a omezit opakované dotazy před příjezdem')
        .replace(/volaj[ií] zbyte[čc]n[eě]/gi, 'mohou posílat opakované dotazy')
        .replace(/zbyte[čc]n[eě] p[řr]id[aá]v[aá] dotazy/gi, 'může vést k opakovaným dotazům')
        .replace(/zp[ůu]sobuje probl[eé]m/gi, 'může vytvářet nejistotu')
        .replace(/host[eé] jsou zmaten[ií]/gi, 'host nemusí hned najít potřebné informace');

    return {
        ...quickWin,
        why: normalizedTitle.includes('prijezd na jednu stranku') ? exactArrivalWhy : softenedWhy,
    };
};

const prepareFreeIdeas = (lead: Lead, quickWins: QuickWin[]) => buildSpecificFreeIdeas(lead, quickWins).map((win) => softenQuickWinWhy(annotateQuickWinSpecificity(win, lead)));

const withProductRecommendation = (lead: Lead): Lead => {
    const recommendation = recommendProductForLead(lead);

    return {
        ...lead,
        recommendedProduct: recommendation.recommendedProduct,
        recommendedProductReason: sanitizeClientText(recommendation.recommendedProductReason),
        productRecommendationSignals: recommendation.productRecommendationSignals,
        freeIdeaPurpose: sanitizeClientText(recommendation.freeIdeaPurpose),
        paidOfferShort: sanitizeClientText(recommendation.paidOfferShort),
        paidOfferDetails: sanitizeClientText(recommendation.paidOfferDetails),
    };
};

const invalidSignalReason = (signal: string, hasWebsiteEmail: boolean) => {
    const phoneMatch = signal.match(invalidPhoneSignalPattern);

    if (phoneMatch && !isLikelyPhoneNumber(phoneMatch[1])) return 'invalid-phone-signal';
    if (decimalCoordinatePattern.test(signal)) {
        decimalCoordinatePattern.lastIndex = 0;
        return 'coordinate-signal';
    }
    decimalCoordinatePattern.lastIndex = 0;
    if (hasWebsiteEmail && emailMissingSignalPattern.test(signal)) return 'email-contradiction';
    return '';
};

const humanizeSlugName = (value = '') => value
    .replace(/^https?:\/\/[^/]+\//i, '')
    .replace(/\.[a-z]{2,}(?:\/.*)?$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase('cs-CZ'));

const displayNameFromLeadEvidence = (lead: Partial<Lead>, fallbackName = '') => {
    const pageTitle = lead.websiteExtraction?.pagesExtracted?.[0]?.title?.trim() || '';
    const normalizedFallback = cleanLeadDisplayName(fallbackName || lead.name || '');
    const normalizedSlug = normalizeForSignalMatch(normalizedFallback);
    const titleCandidate = cleanLeadDisplayName(pageTitle);

    if (/apartmany[-\s]+pod[-\s]+barborou/i.test(fallbackName || '') || /apartmany pod barborou/i.test(normalizedSlug)) {
        return /apartm[aá]ny pod barborou/i.test(titleCandidate) ? titleCandidate : 'Apartmány Pod Barborou';
    }

    if (/sklep[-\s]*rest/i.test(fallbackName || pageTitle)) return 'SKLEP REST';
    if (/[-_]/.test(fallbackName || '') && normalizedFallback === fallbackName) return humanizeSlugName(fallbackName);
    return normalizedFallback;
};

const canonicalizeLeadEvidence = (lead: Lead): Lead => {
    const extraction = lead.websiteExtraction;
    if (!extraction) return lead;

    const ownership = assessWebsiteOwnership({
        url: extraction.websiteUrl || lead.websiteOrOtaUrl || lead.publicProfileUrl,
        pageText: [extraction.summary, ...(extraction.pagesExtracted ?? []).flatMap((page) => [page.url, page.title, page.textPreview])].join('\n'),
        notes: [lead.notes, lead.firstImpression, ...(lead.sourceMaterials ?? []).flatMap((material) => [material.title, material.content])].join('\n'),
        sourceUrls: [lead.websiteOrOtaUrl, lead.publicProfileUrl, ...(lead.publicLinks ?? []).map((link) => link.url)].filter(isPresentString),
    });
    const rawValidPhones = uniqueStrings((extraction.contact.phones ?? []).filter((phone) => isLikelyPhoneNumber(phone)));
    const removedInvalidPhones = uniqueStrings((extraction.contact.phones ?? []).filter((phone) => !isLikelyPhoneNumber(phone)));
    const directoryContact = ownership.websiteOwnershipStatus === 'official'
        ? extraction.directoryContact ?? { emails: [], phones: [], contactPageUrl: null }
        : {
            emails: uniqueStrings([...(extraction.directoryContact?.emails ?? []), ...(extraction.contact.emails ?? [])]),
            phones: uniqueStrings([...(extraction.directoryContact?.phones ?? []), ...rawValidPhones]),
            contactPageUrl: extraction.directoryContact?.contactPageUrl ?? extraction.contact.contactPageUrl,
        };
    const officialContact = ownership.websiteOwnershipStatus === 'official'
        ? { ...extraction.contact, phones: rawValidPhones }
        : { emails: [], phones: [], contactPageUrl: null };
    const contactQuality = contactQualityForLead({ ...lead, websiteExtraction: { ...extraction, ...ownership, contact: officialContact } }, removedInvalidPhones);
    const assetPages = extraction.pagesExtracted.filter((page) => isAssetPage(page));
    const normalizedExtraction: WebsiteExtractionResult = normalizeParkingSignals({
        ...extraction,
        ...ownership,
        contact: { ...officialContact, emails: contactQuality.validEmails, phones: contactQuality.validPhones },
        directoryContact,
        contactOwnershipStatus: ownership.websiteOwnershipStatus === 'official' ? 'official-contact' : 'directory-contact',
        skippedAssetUrls: uniqueStrings([...(extraction.skippedAssetUrls ?? []), ...assetPages.map((page) => page.url), ...(lead.publicLinks ?? []).map((link) => link.url).filter(isAssetUrl)]),
        pagesExtracted: extraction.pagesExtracted.filter((page) => !isInvalidExtractedPage(page)).map((page) => ({
            ...page,
            textPreview: sanitizeSourceMaterialContent(page.textPreview),
        })),
        skippedPages: [
            ...(extraction.skippedPages ?? []),
            ...extraction.pagesExtracted
                .filter(isInvalidExtractedPage)
                .map((page) => ({ url: page.url, title: page.title, reason: isAssetPage(page) ? 'asset_or_binary_file' as const : 'not_found_page' as const })),
        ],
    });
    normalizedExtraction.validPagesCount = normalizedExtraction.pagesExtracted.length;
    normalizedExtraction.invalidPagesCount = normalizedExtraction.skippedPages.length;
    normalizedExtraction.summary = websiteExtractionSummary(lead.name, normalizedExtraction);

    const hasWebsiteEmail = normalizedExtraction.contact.emails.length > 0;
    const cleanContactSignals = [
        ...normalizedExtraction.contact.emails.map((email) => `E-mail nalezen na vlastním webu: ${email}`),
        ...normalizedExtraction.contact.phones.map((phone) => `Telefon nalezen na vlastním webu: ${phone}`),
    ];
    const nextPublicSignals = uniqueStrings([
        ...normalizedExtraction.websiteSignals,
        ...cleanContactSignals,
        ...normalizedExtraction.setupOpportunitySignals,
        ...normalizedExtraction.fixOpportunitySignals,
    ]);
    const removedInvalidSignals = uniqueStrings([
        ...lead.publicSignals.filter((signal) => invalidSignalReason(signal, hasWebsiteEmail)),
        ...splitLines(lead.strengths).filter((signal) => invalidSignalReason(signal, hasWebsiteEmail)),
        ...splitLines(lead.risks).filter((signal) => invalidSignalReason(signal, hasWebsiteEmail)),
        ...splitLines(lead.guestFrictionSignals).filter((signal) => invalidSignalReason(signal, hasWebsiteEmail)),
    ]);
    const staleSourceMaterials = (lead.sourceMaterials ?? [])
        .filter((material) => material.type === 'website-extraction' || isStaleSourceMaterial(material, normalizedExtraction));
    const staleSourceMaterialTitlesRemoved = uniqueStrings(staleSourceMaterials.map((material) => material.title || '(untitled source material)'));
    const cleanedSourceMaterials = (lead.sourceMaterials ?? [])
        .filter((material) => material.type !== 'website-extraction')
        .flatMap((material) => {
            if (isStaleSourceMaterial(material, normalizedExtraction)) {
                const searchSource = cleanSearchDiscoverySource(material, lead);
                return searchSource ? [searchSource] : [];
            }

            return [{
                ...material,
                content: sanitizeSourceMaterialContent(material.content),
            }];
        })
        .filter((material, index, materials) => material.title !== 'Search discovery source' || materials.findIndex((candidate) => candidate.title === 'Search discovery source') === index);
    const removedStaleSourceMaterials = staleSourceMaterials.length;
    const websiteSourceMaterial: SourceMaterial = {
        id: `source-website-${lead.id}`,
        type: 'website-extraction',
        sourceLinkId: '',
        title: 'Website extraction source',
        content: sanitizeWebsiteExtractionForSourceMaterial(normalizedExtraction),
        createdAt: new Date().toISOString(),
    };

    const preparedStructuredQuickWins = prepareFreeIdeas({ ...lead, websiteExtraction: normalizedExtraction }, lead.structuredQuickWins ?? []);
    const preparedFreeIdeas = prepareFreeIdeas({ ...lead, websiteExtraction: normalizedExtraction }, lead.freeIdeas?.length ? lead.freeIdeas : lead.structuredQuickWins ?? []);
    const ideaDiagnostics = freeIdeaSpecificityDiagnostics({
        ...lead,
        websiteExtraction: normalizedExtraction,
        structuredQuickWins: preparedStructuredQuickWins,
        freeIdeas: preparedFreeIdeas,
    });
    const leadWithRecommendation = withProductRecommendation({
        ...lead,
        name: displayNameFromLeadEvidence({ ...lead, websiteExtraction: normalizedExtraction }, lead.name),
        notes: hasCompletedAgentAnalysis(lead) ? analyzedLeadNotes(lead, normalizedExtraction) : sanitizeSourceMaterialContent(lead.notes),
        websiteExtraction: normalizedExtraction,
        contactQuality,
        websiteOwnershipStatus: normalizedExtraction.websiteOwnershipStatus,
        websiteOwnershipReason: normalizedExtraction.websiteOwnershipReason,
        officialWebsiteCandidateUrl: normalizedExtraction.officialWebsiteCandidateUrl,
        directoryExtractedCandidates: normalizedExtraction.directoryExtractedCandidates,
        extractionAllowed: normalizedExtraction.extractionAllowed,
        skippedAssetUrls: normalizedExtraction.skippedAssetUrls,
        directoryContact: normalizedExtraction.directoryContact,
        contactOwnershipStatus: normalizedExtraction.contactOwnershipStatus,
        publicSignals: nextPublicSignals,
        sourceMaterials: [...cleanedSourceMaterials, websiteSourceMaterial],
        structuredQuickWins: preparedStructuredQuickWins,
        clientMiniAudit: sanitizeClientText(lead.clientMiniAudit),
        generatedMiniAudit: sanitizeClientText(lead.generatedMiniAudit),
        generatedOutreach: sanitizeClientText(lead.generatedOutreach),
        generatedFollowUp: sanitizeClientText(lead.generatedFollowUp),
        generatedOffer: sanitizeClientText(lead.generatedOffer),
        freeIdeaTeaser: sanitizeClientText(lead.freeIdeaTeaser || generateFreeIdeaTeaser(lead)),
        freeIdeas: preparedFreeIdeas,
        leadPlaybook: ideaDiagnostics.leadPlaybook,
        leadPlaybookReason: ideaDiagnostics.leadPlaybookReason,
        playbookSignals: ideaDiagnostics.playbookSignals,
        freeIdeasDiversityScore: ideaDiagnostics.freeIdeasDiversityScore,
        repeatedConceptWarning: ideaDiagnostics.repeatedConceptWarning,
        paidNextStep: sanitizeClientText(lead.paidNextStep || lead.generatedOffer || generateOffer(withProductRecommendation({ ...lead, websiteExtraction: normalizedExtraction }))),
        outreachIntent: 'ask-permission-to-send-free-ideas',
        outreachTone: 'humble-transparent-low-pressure',
        strengths: joinLines(removeContactContradictions(uniqueStrings([...splitLines(lead.strengths), ...normalizedExtraction.strengths]).filter((signal) => !invalidSignalReason(signal, hasWebsiteEmail)), hasWebsiteEmail)),
        risks: joinLines(removeContactContradictions(uniqueStrings(splitLines(lead.risks)).filter((signal) => !invalidSignalReason(signal, hasWebsiteEmail)), hasWebsiteEmail)),
        guestFrictionSignals: joinLines(removeContactContradictions(uniqueStrings(splitLines(lead.guestFrictionSignals)).filter((signal) => !invalidSignalReason(signal, hasWebsiteEmail)), hasWebsiteEmail)),
        guestConfusion: joinLines(removeContactContradictions(uniqueStrings(splitLines(lead.guestConfusion)).filter((signal) => !invalidSignalReason(signal, hasWebsiteEmail)), hasWebsiteEmail)),
        evidenceCanonicalizationDiagnostic: {
            canonicalizationApplied: true,
            removedInvalidSignals: removedInvalidSignals.map(redactInvalidEvidenceValue),
            removedInvalidPhones: removedInvalidPhones.map(redactInvalidEvidenceValue),
            removedStaleSourceMaterials,
            staleSourceMaterialTitlesRemoved,
        },
    });

    const staleOpsAuditPaidStep = leadWithRecommendation.recommendedProduct !== 'ops-audit' && /ops audit|rychl[yý] audit|provozn[ií] audit/i.test(`${lead.generatedOffer}\n${lead.paidNextStep}`);
    const nextGeneratedOffer = staleOpsAuditPaidStep ? generateOffer(leadWithRecommendation) : lead.generatedOffer || generateOffer(leadWithRecommendation);

    return applyClientOutputReadiness({
        ...leadWithRecommendation,
        generatedOffer: sanitizeClientText(nextGeneratedOffer),
        paidNextStep: sanitizeClientText(staleOpsAuditPaidStep ? nextGeneratedOffer : lead.paidNextStep || lead.generatedOffer || nextGeneratedOffer),
    });
};

const guardedPreAnalysisFitVerdict = (lead: Pick<Lead, 'needsAgentAnalysis' | 'confidence' | 'structuredQuickWins' | 'fitVerdict'>) => {
    const hasNoQuickWins = (lead.structuredQuickWins ?? []).length === 0;

    if (lead.needsAgentAnalysis && lead.confidence === 'low' && hasNoQuickWins && lead.fitVerdict === 'strong-opportunity') {
        return 'moderate-opportunity';
    }

    return lead.fitVerdict ?? '';
};

const casualOptOutPattern = /\s*Když ne, vůbec se nic neděje\.?/gi;
const stripCasualOptOut = (value = '') => sanitizeClientText(value.replace(casualOptOutPattern, '').replace(/\n{3,}/g, '\n\n'));

const clientOutputReadiness = (lead: Lead) => {
    const ideaDiagnostics = freeIdeaSpecificityDiagnostics(lead);
    const evidenceDiagnostics = validateEvidenceClaims(lead);
    const contactQuality = lead.contactQuality ?? contactQualityForLead(lead);
    const notReadyReasons = uniqueStrings([
        !ideaDiagnostics.freeIdeasReady ? 'free ideas nejsou dost konkrétní' : '',
        ideaDiagnostics.genericFreeIdeasCount > 0 ? `${ideaDiagnostics.genericFreeIdeasCount} nápad je generic / vyžaduje kontrolu` : '',
        ideaDiagnostics.repeatedTemplateWarning ? 'free ideas opakují šablonu' : '',
        ideaDiagnostics.repeatedConceptWarning ? 'free ideas opakují stejný koncept' : '',
        evidenceDiagnostics.unsupportedClientClaims.length > 0 ? `chybí evidence pro klientské signály: ${evidenceDiagnostics.unsupportedClientClaims.join(', ')}` : '',
        evidenceDiagnostics.unsupportedSignalClaims.length > 0 ? `chybí evidence pro interní signály: ${evidenceDiagnostics.unsupportedSignalClaims.join(', ')}` : '',
        !contactQuality.contactReady ? 'kontakt není připravený' : '',
    ]);

    return {
        ...evidenceDiagnostics,
        clientOutputStatus: notReadyReasons.length > 0 ? 'draft-needs-review' as const : 'ready' as const,
        notReadyReasons,
    };
};

const applyClientOutputReadiness = (lead: Lead): Lead => {
    const initialEvidenceDiagnostics = validateEvidenceClaims(lead);
    const withoutUnsupportedClaims: Lead = {
        ...lead,
        clientMiniAudit: sanitizeUnsupportedClaimsFromText(stripCasualOptOut(lead.clientMiniAudit), lead),
        generatedMiniAudit: sanitizeUnsupportedClaimsFromText(stripCasualOptOut(lead.generatedMiniAudit), lead),
        freeIdeaPurpose: sanitizeUnsupportedClaimsFromText(lead.freeIdeaPurpose ?? '', lead),
        paidNextStep: sanitizeUnsupportedClaimsFromText(stripCasualOptOut(lead.paidNextStep ?? ''), lead),
        generatedOutreach: sanitizeUnsupportedClaimsFromText(sanitizeClientText(lead.generatedOutreach), lead),
        generatedOffer: sanitizeUnsupportedClaimsFromText(stripCasualOptOut(lead.generatedOffer), lead),
        generatedFollowUp: stripCasualOptOut(lead.generatedFollowUp),
        guestGuideSecondEmail: sanitizeUnsupportedClaimsFromText(stripCasualOptOut(lead.guestGuideSecondEmail ?? ''), lead),
        structuredQuickWins: sanitizeUnsupportedClaimsFromQuickWins(lead.structuredQuickWins, lead),
        freeIdeas: sanitizeUnsupportedClaimsFromQuickWins(lead.freeIdeas, lead),
    };
    const readiness = clientOutputReadiness(withoutUnsupportedClaims);
    const unsupportedClientClaims = uniqueStrings([...initialEvidenceDiagnostics.unsupportedClientClaims, ...readiness.unsupportedClientClaims]);
    const unsupportedSignalClaims = uniqueStrings([...initialEvidenceDiagnostics.unsupportedSignalClaims, ...readiness.unsupportedSignalClaims]);
    const evidenceClaimReady = initialEvidenceDiagnostics.evidenceClaimReady && readiness.evidenceClaimReady;
    const notReadyReasons = uniqueStrings([
        ...readiness.notReadyReasons,
        unsupportedClientClaims.length > 0 ? `chybí evidence pro klientské signály: ${unsupportedClientClaims.join(', ')}` : '',
        unsupportedSignalClaims.length > 0 ? `chybí evidence pro interní signály: ${unsupportedSignalClaims.join(', ')}` : '',
    ]);

    return {
        ...withoutUnsupportedClaims,
        ...readiness,
        unsupportedClientClaims,
        unsupportedSignalClaims,
        evidenceClaimReady,
        clientOutputStatus: notReadyReasons.length > 0 ? 'draft-needs-review' : readiness.clientOutputStatus,
        notReadyReasons,
    };
};

const workflowNextAction = (lead: Lead) => {
    const ideaDiagnostics = freeIdeaSpecificityDiagnostics(lead);
    const contactQuality = lead.contactQuality ?? contactQualityForLead(lead);
    const ownershipStatus = lead.websiteExtraction?.websiteOwnershipStatus ?? lead.websiteOwnershipStatus;

    if (lead.websiteExtraction && (lead.websiteExtraction.extractionAllowed === false || ownershipStatus && ownershipStatus !== 'official')) return 'needs-official-website';
    if (lead.evidenceClaimReady === false) return 'needs-evidence-review';
    if (lead.websiteExtraction && contactQuality.emailSource === 'discovery-fallback') return contactQuality.contactReady ? 'needs-contact-review' : 'needs-extraction-review';
    if (lead.websiteExtraction && !contactQuality.contactReady) return 'needs-contact-review';
    if (needsWebsiteAnalysis(lead)) return 'analyze-from-extracted-website';
    if (!hasCompletedWebsiteExtraction(lead)) return 'extract-website-or-add-evidence';
    if (!hasLeadQuickWins(lead)) return 'complete-agent-analysis';
    if (!hasLeadClientOutputs(lead)) return 'generate-client-outputs';
    if (hasClientCopyIssue(clientOutputValues(lead))) return 'needs-copy-review';
    if (!ideaDiagnostics.freeIdeasReady || ideaDiagnostics.repeatedConceptWarning) return 'needs-idea-review';
    return 'ready-to-review';
};

const fallbackWebsiteQuickWins = (lead: Lead): QuickWin[] => buildSpecificFreeIdeas(lead, []);

const ensureThreeQuickWins = (lead: Lead, quickWins: QuickWin[]) => {
    const completeWins = quickWins.filter((win) => win.title.trim() && win.why.trim() && win.action.trim()).slice(0, 3);
    const fallbackWins = fallbackWebsiteQuickWins(lead).filter((fallbackWin) => !completeWins.some((win) => win.title === fallbackWin.title));

    return prepareFreeIdeas(lead, [...completeWins, ...fallbackWins].slice(0, 3).map((win) => ({ ...win, id: win.id || `quick-win-${crypto.randomUUID()}` })));
};

const blockedWebsiteExtractorHosts = ['booking.', 'airbnb.', 'google.', 'maps.google.', 'tripadvisor.', 'expedia.', 'agoda.', 'trivago.', 'slevomat.', 'hotelscombined.', 'hotels.com'];
const isOtaOrAggregatorUrl = (url = '') => blockedWebsiteExtractorHosts.some((host) => url.toLowerCase().includes(host));
const hasOwnWebsiteUrl = (candidate: Pick<LeadAgentCandidate, 'websiteUrl' | 'sourceUrls'>) => Boolean(candidate.websiteUrl && !isOtaOrAggregatorUrl(candidate.websiteUrl)) || candidate.sourceUrls.some((url) => !isOtaOrAggregatorUrl(url));

const detectSourceType = (url: string): PublicProfileSourceType => {
    const normalizedUrl = url.toLowerCase();

    if (normalizedUrl.includes('booking.')) {
        return 'booking';
    }

    if (normalizedUrl.includes('airbnb.')) {
        return 'airbnb';
    }

    if (normalizedUrl.includes('google.')) {
        return 'google';
    }

    return normalizedUrl ? 'website' : 'other';
};

const emptyPublicLink = (): PublicProfileLink => ({
    id: `link-${crypto.randomUUID()}`,
    sourceType: 'other',
    url: '',
    label: '',
    notes: '',
});

const emptyQuickWin = (): QuickWin => ({
    id: `quick-win-${crypto.randomUUID()}`,
    title: '',
    why: '',
    action: '',
    sourceEvidence: '',
    candidateSpecificity: 'generic',
    uniqueBusinessAngle: '',
    usedSignals: [],
});

const emptySourceMaterial = (): SourceMaterial => ({
    id: `source-${crypto.randomUUID()}`,
    type: 'pasted-text',
    sourceLinkId: '',
    title: '',
    content: '',
    createdAt: new Date().toISOString(),
});

const emptyScreenshot = (fileName = '', dataUrl = ''): LeadScreenshot => ({
    id: `screenshot-${crypto.randomUUID()}`,
    type: 'ota-profile-screenshot',
    fileName,
    note: '',
    dataUrl,
    createdAt: new Date().toISOString(),
});

const offerAngleForAgentLead = (opportunityType: LeadAgentOpportunityType, targetOffer: string, fallback: OfferAngle): OfferAngle => {
    if (opportunityType === 'setup-automation' || targetOffer === 'guest-guide' || targetOffer === 'self-checkin-setup') return 'guest-guide';
    if (opportunityType === 'fix-existing-process') return 'guest-communication';
    if (opportunityType === 'ota-profile-audit') return targetOffer === 'review-response-improvement' ? 'reviews' : 'description';
    return fallback === 'main-photo' ? 'guest-guide' : fallback;
};

const migratePublicLinks = (lead: Partial<Lead>): PublicProfileLink[] => {
    if (lead.publicLinks && lead.publicLinks.length > 0) {
        return lead.publicLinks;
    }

    const url = lead.publicProfileUrl || lead.websiteOrOtaUrl || '';

    if (!url) {
        return [];
    }

    const sourceType = detectSourceType(url);
    return [
        {
            id: `link-${crypto.randomUUID()}`,
            sourceType,
            url,
            label: publicProfileSourceLabels[sourceType],
            notes: 'Migrovano ze starsiho pole publicProfileUrl / web odkaz.',
        },
    ];
};

const migrateQuickWins = (lead: Partial<Lead>): QuickWin[] => {
    if (lead.structuredQuickWins && lead.structuredQuickWins.length > 0) {
        return lead.structuredQuickWins;
    }

    return (lead.proposedQuickWins ?? []).map((win) => ({
        id: `quick-win-${crypto.randomUUID()}`,
        title: win,
        why: '',
        action: win,
        sourceEvidence: '',
    }));
};

const inferAgentLeadStatus = (lead: Partial<Lead>): Lead['agentLeadStatus'] => {
    if (lead.agentLeadStatus) return lead.agentLeadStatus;
    if (lead.createdFromAgentAnalysis) return 'analyzed';
    if (lead.addedWithoutAgentAnalysis) return 'added-without-analysis';
    return 'manual';
};

const inferEvidenceLevel = (lead: Partial<Lead>): Lead['evidenceLevel'] => {
    if (lead.evidenceLevel) return lead.evidenceLevel;
    if (lead.createdFromAgentAnalysis) return 'full-agent-analysis';
    if (lead.websiteExtraction?.status === 'completed' || lead.websiteExtraction?.status === 'partial') return 'website-extracted';
    if ((lead.screenshotAnalysis || lead.screenshots?.length) && lead.structuredQuickWins?.length) return 'screenshot-analysis';
    if ((lead.sourceMaterials ?? []).some((material) => material.content?.trim())) return 'pasted-public-text';
    if (lead.addedWithoutAgentAnalysis) return 'search-snippet-only';
    return 'pasted-public-text';
};

const defaultSourceLimitations = (lead: Partial<Lead>) => {
    if (lead.sourceLimitations && lead.sourceLimitations.length > 0) return lead.sourceLimitations;
    if (lead.createdFromAgentAnalysis) return ['Výstup vychází z agentní analýzy dodaných veřejných snippetů, odkazů a případných podkladů.'];
    if (lead.addedWithoutAgentAnalysis) return ['Lead vznikl jen z rychlého search nálezu.', 'Search snippety nejsou kompletní OTA profil.', 'OTA URL jsou jen odkazy k otevření, ne automaticky přečtený zdroj.', 'Guest guide může existovat neveřejně a bez screenshotu/textu ho nelze ověřit.'];
    return ['Ručně vedený lead; evidence závisí na vložených veřejných textech, odkazech nebo screenshotech.'];
};

const demoLeadNotice = 'Demo lead - fiktivni data. Nejde o skutecneho klienta ani obchodni lead.';

const hasDemoMarker = (lead: Partial<Lead> & { isMock?: boolean; runMode?: string }) => {
    const searchableText = [
        lead.name,
        lead.email,
        lead.websiteOrOtaUrl,
        lead.publicProfileUrl,
        lead.notes,
        lead.leadAgentRunId,
        lead.agentAnalysisProvider,
        lead.qualificationReason,
        lead.demoReason,
        lead.runMode,
        ...(lead.publicLinks ?? []).flatMap((link) => [link.url, link.notes, link.label]),
        ...(lead.sourceMaterials ?? []).flatMap((material) => [material.title, material.content]),
    ].filter(Boolean).join(' ').toLowerCase();

    return Boolean(
        lead.isDemoLead
        || lead.isMock
        || lead.agentAnalysisProvider === 'demo-fallback'
        || searchableText.includes('demo')
        || searchableText.includes('example.com')
        || searchableText.includes('fiktiv')
    );
};

const normalizeLead = (lead: Partial<Lead>): Lead => {
    const isDemoLead = hasDemoMarker(lead);
    const baseNotes = lead.notes ?? '';
    const hasUnanalyzedWebsiteExtraction = Boolean(lead.websiteExtraction && ['completed', 'partial'].includes(lead.websiteExtraction.status) && (lead.needsAgentAnalysis ?? Boolean(lead.addedWithoutAgentAnalysis && !lead.createdFromAgentAnalysis)));
    const guardedFitVerdict = hasUnanalyzedWebsiteExtraction && lead.fitVerdict === 'strong-opportunity' ? 'moderate-opportunity' : lead.fitVerdict ?? '';
    const guardedOpportunityScore = hasUnanalyzedWebsiteExtraction ? Math.min(lead.opportunityScore ?? 0, 64) : lead.opportunityScore ?? 0;
    const sourceText = [lead.notes, lead.firstImpression, lead.websiteExtraction?.summary, ...(lead.sourceMaterials ?? []).map((material) => material.content)].join(' ').toLowerCase();
    const guardedTargetOffer = hasUnanalyzedWebsiteExtraction && lead.targetOffer === 'self-checkin-setup' && !sourceText.includes('self check-in') ? 'guest-guide' : lead.targetOffer ?? '';
    const normalizedName = (lead.createdFromAgentAnalysis || lead.websiteExtraction) && lead.name ? displayNameFromLeadEvidence(lead, lead.name) : lead.name ?? '';
    const normalizedMiniAudit = sanitizeClientText(lead.clientMiniAudit ?? lead.generatedMiniAudit ?? '');
    const rawPagesExtracted = lead.websiteExtraction?.pagesExtracted ?? [];
    const invalidPagesFromExtraction = rawPagesExtracted
        .filter(isInvalidExtractedPage)
        .map((page) => ({ url: page.url, title: page.title, reason: isAssetPage(page) ? 'asset_or_binary_file' as const : 'not_found_page' as const }));
    const validPagesExtracted = rawPagesExtracted.filter((page) => !isInvalidExtractedPage(page));
    const normalizedSkippedPages = [...(lead.websiteExtraction?.skippedPages ?? []), ...invalidPagesFromExtraction];
    const ownership = lead.websiteExtraction ? assessWebsiteOwnership({
        url: lead.websiteExtraction.websiteUrl ?? lead.websiteOrOtaUrl ?? lead.publicProfileUrl ?? '',
        pageText: [lead.websiteExtraction.summary, ...rawPagesExtracted.flatMap((page) => [page.url, page.title, page.textPreview])].join('\n'),
        notes: [lead.notes, lead.firstImpression, ...(lead.sourceMaterials ?? []).flatMap((material) => [material.title, material.content])].join('\n'),
        sourceUrls: [lead.websiteOrOtaUrl, lead.publicProfileUrl, ...(lead.publicLinks ?? []).map((link) => link.url)].filter(isPresentString),
    }) : undefined;
    const nonOfficialExtraction = ownership && ownership.websiteOwnershipStatus !== 'official';
    const normalizedDirectoryContact = nonOfficialExtraction
        ? {
            emails: uniqueStrings([...(lead.websiteExtraction?.directoryContact?.emails ?? []), ...(lead.websiteExtraction?.contact?.emails ?? [])]),
            phones: uniqueStrings([...(lead.websiteExtraction?.directoryContact?.phones ?? []), ...(lead.websiteExtraction?.contact?.phones ?? [])]),
            contactPageUrl: lead.websiteExtraction?.directoryContact?.contactPageUrl ?? lead.websiteExtraction?.contact?.contactPageUrl ?? null,
        }
        : lead.websiteExtraction?.directoryContact ?? { emails: [], phones: [], contactPageUrl: null };
    const normalizedWebsiteExtraction = lead.websiteExtraction ? normalizeParkingSignals({
        ...(ownership ?? {}),
        provider: lead.websiteExtraction.provider ?? 'fallback',
        status: lead.websiteExtraction.status ?? 'partial',
        websiteUrl: lead.websiteExtraction.websiteUrl ?? lead.websiteOrOtaUrl ?? lead.publicProfileUrl ?? '',
        extractionStrategy: lead.websiteExtraction.extractionStrategy ?? 'legacy',
        discoveredInternalLinksCount: lead.websiteExtraction.discoveredInternalLinksCount ?? 0,
        guessedUrlsUsed: lead.websiteExtraction.guessedUrlsUsed ?? [],
        pagesExtracted: validPagesExtracted,
        skippedPages: normalizedSkippedPages,
        validPagesCount: validPagesExtracted.length,
        invalidPagesCount: normalizedSkippedPages.length,
        contact: {
            emails: nonOfficialExtraction ? [] : lead.websiteExtraction.contact?.emails ?? [],
            phones: nonOfficialExtraction ? [] : lead.websiteExtraction.contact?.phones ?? [],
            contactPageUrl: nonOfficialExtraction ? null : lead.websiteExtraction.contact?.contactPageUrl ?? null,
        },
        directoryContact: normalizedDirectoryContact,
        contactOwnershipStatus: nonOfficialExtraction ? 'directory-contact' : lead.websiteExtraction.contactOwnershipStatus ?? 'official-contact',
        skippedAssetUrls: uniqueStrings([...(lead.websiteExtraction.skippedAssetUrls ?? []), ...rawPagesExtracted.filter(isAssetPage).map((page) => page.url), ...(lead.publicLinks ?? []).map((link) => link.url).filter(isAssetUrl)]),
        websiteSignals: lead.websiteExtraction.websiteSignals ?? [],
        arrivalSignals: lead.websiteExtraction.arrivalSignals ?? [],
        parkingSignals: lead.websiteExtraction.parkingSignals ?? [],
        faqSignals: lead.websiteExtraction.faqSignals ?? [],
        guestGuideSignals: lead.websiteExtraction.guestGuideSignals ?? [],
        automationSignals: lead.websiteExtraction.automationSignals ?? [],
        missingPublicInfoSignals: lead.websiteExtraction.missingPublicInfoSignals ?? [],
        suppressedMissingSignals: lead.websiteExtraction.suppressedMissingSignals ?? [],
        likelyManualProcessSignals: lead.websiteExtraction.likelyManualProcessSignals ?? [],
        strengths: lead.websiteExtraction.strengths ?? [],
        risks: lead.websiteExtraction.risks ?? [],
        setupOpportunitySignals: lead.websiteExtraction.setupOpportunitySignals ?? [],
        fixOpportunitySignals: lead.websiteExtraction.fixOpportunitySignals ?? [],
        evidenceLimits: lead.websiteExtraction.evidenceLimits ?? [],
        summary: lead.websiteExtraction.summary ?? '',
        debug: lead.websiteExtraction.debug ?? { debugId: '', elapsedMs: 0, partial: false, reason: null },
    }) : undefined;
    const sanitizedGeneratedOutreach = sanitizeClientText(lead.generatedOutreach ?? '');
    const shouldRegenerateWebsiteOutreach = normalizedWebsiteExtraction && (lead.screenshots ?? []).length === 0 && (
        websiteOnlyOutreachMismatchPattern.test(sanitizedGeneratedOutreach)
        || hasForbiddenOutreachLanguage(sanitizedGeneratedOutreach)
        || !/omlouv[aá]m se za nevy[žz][aá]danou zpr[aá]vu/i.test(sanitizedGeneratedOutreach)
        || !/za [úu]platu/i.test(sanitizedGeneratedOutreach)
    );
    const normalizedGeneratedOutreach = shouldRegenerateWebsiteOutreach
        ? buildWebsiteOnlyOutreach({ leadName: normalizedName, websiteExtraction: normalizedWebsiteExtraction, signals: lead.publicSignals ?? [] })
        : sanitizedGeneratedOutreach;
    const migratedQuickWins = prepareFreeIdeas({ ...emptyLead(), ...lead, websiteExtraction: normalizedWebsiteExtraction }, migrateQuickWins(lead));
    const normalizedFreeIdeas = prepareFreeIdeas({ ...emptyLead(), ...lead, websiteExtraction: normalizedWebsiteExtraction }, lead.freeIdeas ?? migratedQuickWins);
    const ideaDiagnostics = freeIdeaSpecificityDiagnostics({
        ...emptyLead(),
        ...lead,
        websiteExtraction: normalizedWebsiteExtraction,
        structuredQuickWins: migratedQuickWins,
        freeIdeas: normalizedFreeIdeas,
    });

    const normalizedLead: Lead = withProductRecommendation({
        ...emptyLead(),
        ...lead,
        name: normalizedName,
        notes: isDemoLead && !baseNotes.toLowerCase().includes('nejde o skutecneho klienta')
            ? `${demoLeadNotice}\n\n${baseNotes}`.trim()
            : baseNotes,
        publicLinks: migratePublicLinks(lead),
        sourceMaterials: lead.sourceMaterials ?? [],
        extractionStatus: lead.extractionStatus ?? 'idle',
        publicSignals: lead.publicSignals ?? [],
        quickWins: lead.quickWins ?? [],
        proposedQuickWins: lead.proposedQuickWins ?? lead.quickWins ?? [],
        structuredQuickWins: migratedQuickWins,
        selectedOfferAngle: lead.selectedOfferAngle ?? 'main-photo',
        internalAgentBrief: lead.internalAgentBrief ?? '',
        clientMiniAudit: normalizedMiniAudit,
        generatedMiniAudit: sanitizeClientText(lead.generatedMiniAudit ?? normalizedMiniAudit),
        generatedOutreach: normalizedGeneratedOutreach,
        generatedFollowUp: sanitizeClientText(lead.generatedFollowUp ?? ''),
        generatedOffer: sanitizeClientText(lead.generatedOffer ?? ''),
        freeIdeaTeaser: sanitizeClientText(lead.freeIdeaTeaser ?? ''),
        freeIdeas: normalizedFreeIdeas,
        leadPlaybook: ideaDiagnostics.leadPlaybook,
        leadPlaybookReason: sanitizeClientText(ideaDiagnostics.leadPlaybookReason),
        playbookSignals: ideaDiagnostics.playbookSignals,
        freeIdeasDiversityScore: ideaDiagnostics.freeIdeasDiversityScore,
        repeatedConceptWarning: ideaDiagnostics.repeatedConceptWarning,
        paidNextStep: sanitizeClientText(lead.paidNextStep ?? lead.generatedOffer ?? ''),
        recommendedProduct: lead.recommendedProduct,
        recommendedProductReason: sanitizeClientText(lead.recommendedProductReason ?? ''),
        productRecommendationSignals: lead.productRecommendationSignals ?? [],
        freeIdeaPurpose: sanitizeClientText(lead.freeIdeaPurpose ?? ''),
        paidOfferShort: sanitizeClientText(lead.paidOfferShort ?? ''),
        paidOfferDetails: sanitizeClientText(lead.paidOfferDetails ?? ''),
        clientOutputStatus: lead.clientOutputStatus ?? 'draft-needs-review',
        notReadyReasons: lead.notReadyReasons ?? [],
        unsupportedClientClaims: lead.unsupportedClientClaims ?? [],
        unsupportedSignalClaims: lead.unsupportedSignalClaims ?? [],
        evidenceClaimReady: lead.evidenceClaimReady ?? true,
        guestGuidePreviewStatus: lead.guestGuidePreviewStatus ?? 'not-created',
        guestGuidePreview: lead.guestGuidePreview,
        guestGuideSecondEmail: sanitizeClientText(lead.guestGuideSecondEmail ?? ''),
        contactQuality: lead.contactQuality,
        outreachIntent: 'ask-permission-to-send-free-ideas',
        outreachTone: 'humble-transparent-low-pressure',
        createdFromAgentAnalysis: lead.createdFromAgentAnalysis ?? false,
        addedWithoutAgentAnalysis: lead.addedWithoutAgentAnalysis ?? false,
        agentLeadStatus: inferAgentLeadStatus(lead),
        evidenceLevel: inferEvidenceLevel(lead),
        needsAgentAnalysis: lead.needsAgentAnalysis ?? Boolean(lead.addedWithoutAgentAnalysis && !lead.createdFromAgentAnalysis),
        sourceLimitations: defaultSourceLimitations(lead),
        leadAgentRunId: lead.leadAgentRunId ?? '',
        agentAnalysisProvider: lead.agentAnalysisProvider ?? '',
        opportunityScore: guardedOpportunityScore,
        opportunityType: lead.opportunityType ?? '',
        fitVerdict: guardedFitVerdict,
        confidence: lead.confidence ?? '',
        targetOffer: guardedTargetOffer,
        qualificationReason: lead.qualificationReason ?? '',
        offerHypothesis: lead.offerHypothesis ?? '',
        automationNeedScore: lead.automationNeedScore ?? 0,
        reviewFrictionScore: lead.reviewFrictionScore ?? 0,
        publicMaturityScore: lead.publicMaturityScore ?? 0,
        isDemoLead,
        demoReason: isDemoLead ? lead.demoReason || demoLeadNotice : lead.demoReason ?? '',
        screenshots: lead.screenshots ?? [],
        screenshotAnalysis: lead.screenshotAnalysis,
        screenshotAnalysisDiagnostic: lead.screenshotAnalysisDiagnostic ?? { status: 'idle' },
        latestAnalysisDiagnostic: lead.latestAnalysisDiagnostic,
        websiteExtractionDiagnostic: lead.websiteExtractionDiagnostic,
        websiteExtraction: normalizedWebsiteExtraction,
        websiteOwnershipStatus: normalizedWebsiteExtraction?.websiteOwnershipStatus ?? lead.websiteOwnershipStatus ?? 'unknown',
        websiteOwnershipReason: normalizedWebsiteExtraction?.websiteOwnershipReason ?? lead.websiteOwnershipReason ?? '',
        officialWebsiteCandidateUrl: normalizedWebsiteExtraction?.officialWebsiteCandidateUrl ?? lead.officialWebsiteCandidateUrl ?? '',
        directoryExtractedCandidates: normalizedWebsiteExtraction?.directoryExtractedCandidates ?? lead.directoryExtractedCandidates ?? [],
        extractionAllowed: normalizedWebsiteExtraction?.extractionAllowed ?? lead.extractionAllowed ?? true,
        skippedAssetUrls: normalizedWebsiteExtraction?.skippedAssetUrls ?? lead.skippedAssetUrls ?? [],
        directoryContact: normalizedWebsiteExtraction?.directoryContact ?? lead.directoryContact ?? { emails: [], phones: [], contactPageUrl: null },
        contactOwnershipStatus: normalizedWebsiteExtraction?.contactOwnershipStatus ?? lead.contactOwnershipStatus ?? 'unknown',
    });

    return canonicalizeLeadEvidence(normalizedLead);
};

const emptyAgentRequest = (): LeadAgentSearchRequest => ({
    location: 'Praha',
    accommodationType: 'apartmany',
    segment: 'self check-in / bez recepce',
    maxResults: 10,
    notes: '',
    knownTargetName: '',
    knownTargetCity: '',
    knownTargetWebsiteUrl: '',
    knownTargetNote: '',
    knownTargetEmail: '',
});

const emptyAgentSession = (): LeadAgentSession => ({
    runId: newAgentRunId(),
    createdAt: nowIso(),
    request: emptyAgentRequest(),
    status: 'idle',
    message: '',
    isMock: false,
    candidates: [],
    analyses: {},
    dismissedCandidateIds: [],
    candidateFilter: 'all',
    candidateSort: 'opportunityScore',
    loadedFromStorage: false,
    storedBannerDismissed: false,
    diagnostic: undefined,
    health: undefined,
    healthMessage: '',
});

const hasDemoCandidateMarker = (candidate: Partial<LeadAgentCandidate>) => {
    const searchableText = [
        candidate.name,
        candidate.websiteUrl,
        candidate.possibleEmail,
        candidate.runId,
        candidate.evidenceSummary,
        candidate.qualificationReason,
        candidate.offerHypothesis,
        ...(candidate.sourceUrls ?? []),
        ...(candidate.sourceSnippets ?? []),
    ].filter(Boolean).join(' ').toLowerCase();

    return Boolean(candidate.isMock || searchableText.includes('demo') || searchableText.includes('example.com'));
};

const normalizeAgentCandidate = (candidate: Partial<LeadAgentCandidate>): LeadAgentCandidate => {
    const isMock = hasDemoCandidateMarker(candidate);

    return {
        id: candidate.id ?? `agent-candidate-${crypto.randomUUID()}`,
        runId: candidate.runId ?? legacyRunId,
        createdAt: candidate.createdAt ?? nowIso(),
        name: isMock && candidate.name && !candidate.name.startsWith('DEMO') ? `DEMO — ${candidate.name}` : candidate.name ?? 'Neznamy kandidat',
        location: candidate.location ?? '',
        type: candidate.type ?? 'Jine',
        websiteUrl: candidate.websiteUrl ?? '',
        sourceUrls: candidate.sourceUrls ?? [],
        sourceSnippets: candidate.sourceSnippets ?? [],
        possibleEmail: candidate.possibleEmail ?? '',
        signals: candidate.signals ?? [],
        risks: candidate.risks ?? [],
        leadScore: candidate.leadScore ?? 0,
        opportunityScore: candidate.opportunityScore ?? Math.max(0, Math.min(100, candidate.leadScore ?? 0)),
        opportunityType: candidate.opportunityType ?? (candidate.painSignals?.length ? 'fix-existing-process' : candidate.targetOffer === 'skip' ? 'skip' : 'setup-automation'),
        automationNeedScore: candidate.automationNeedScore ?? 0,
        publicMaturityScore: candidate.publicMaturityScore ?? 0,
        reviewFrictionScore: candidate.reviewFrictionScore ?? 0,
        fitVerdict: candidate.fitVerdict ?? 'not-enough-evidence',
        confidence: candidate.confidence ?? 'low',
        contactMissing: candidate.contactMissing ?? !candidate.possibleEmail,
        painSignals: candidate.painSignals ?? [],
        positiveSolvedSignals: candidate.positiveSolvedSignals ?? candidate.alreadySolvedSignals ?? [],
        noPainReason: candidate.noPainReason,
        targetOffer: candidate.targetOffer ?? (['strong-opportunity', 'moderate-opportunity'].includes(candidate.fitVerdict ?? '') ? 'guest-guide' : 'skip'),
        offerHypothesis: candidate.offerHypothesis ?? 'Legacy data nemaji samostatnou offer hypothesis.',
        websiteSignals: candidate.websiteSignals ?? [],
        contactSignals: candidate.contactSignals ?? (candidate.possibleEmail ? ['Verejny e-mail'] : []),
        missingAutomationSignals: candidate.missingAutomationSignals ?? [],
        likelyManualProcessSignals: candidate.likelyManualProcessSignals ?? [],
        qualificationReason: candidate.qualificationReason ?? 'Legacy data nemaji samostatnou pain kvalifikaci.',
        alreadySolvedSignals: candidate.alreadySolvedSignals ?? [],
        missingEvidence: candidate.missingEvidence ?? ['Ulozena legacy data nemaji kompletni scoring evidence.'],
        contradictionWarnings: candidate.contradictionWarnings ?? [],
        recommendedAngle: candidate.recommendedAngle ?? 'main-photo',
        evidenceSummary: candidate.evidenceSummary ?? 'Chybi evidence summary.',
        websiteExtraction: candidate.websiteExtraction,
        isMock,
        isLegacy: candidate.isLegacy ?? !candidate.runId,
        addedLeadId: candidate.addedLeadId,
        rejected: candidate.rejected,
    };
};

const normalizeAgentAnalysis = (analysis: Partial<LeadAgentAnalysis>, candidate?: LeadAgentCandidate): LeadAgentAnalysis => ({
    runId: analysis.runId ?? candidate?.runId ?? legacyRunId,
    analyzedAt: analysis.analyzedAt ?? nowIso(),
    provider: analysis.provider ?? 'legacy',
    model: analysis.model ?? null,
    leadDisplayName: analysis.leadDisplayName ?? (candidate?.name ? cleanLeadDisplayName(candidate.name) : undefined),
    firstImpression: analysis.firstImpression ?? 'Legacy analyza bez prvniho dojmu.',
    strengths: analysis.strengths ?? [],
    risks: analysis.risks ?? [],
    guestFrictionSignals: analysis.guestFrictionSignals ?? [],
    quickWins: analysis.quickWins ?? [],
    miniAudit: analysis.miniAudit ?? '',
    outreachEmail: analysis.outreachEmail ?? '',
    followUp: analysis.followUp ?? '',
    offerRecommendation: analysis.offerRecommendation ?? '',
    confidence: analysis.confidence ?? candidate?.confidence ?? 'low',
    fitVerdict: analysis.fitVerdict ?? candidate?.fitVerdict ?? 'not-enough-evidence',
    opportunityScore: analysis.opportunityScore ?? candidate?.opportunityScore ?? 0,
    opportunityType: analysis.opportunityType ?? candidate?.opportunityType ?? (analysis.painSignals?.length || candidate?.painSignals.length ? 'fix-existing-process' : 'skip'),
    automationNeedScore: analysis.automationNeedScore ?? candidate?.automationNeedScore ?? 0,
    publicMaturityScore: analysis.publicMaturityScore ?? candidate?.publicMaturityScore ?? 0,
    reviewFrictionScore: analysis.reviewFrictionScore ?? candidate?.reviewFrictionScore ?? 0,
    painSignals: analysis.painSignals ?? candidate?.painSignals ?? [],
    positiveSolvedSignals: analysis.positiveSolvedSignals ?? candidate?.positiveSolvedSignals ?? candidate?.alreadySolvedSignals ?? [],
    noPainReason: analysis.noPainReason ?? candidate?.noPainReason,
    targetOffer: analysis.targetOffer ?? candidate?.targetOffer ?? 'skip',
    offerHypothesis: analysis.offerHypothesis ?? candidate?.offerHypothesis ?? 'Legacy analyza nema offer hypothesis.',
    websiteSignals: analysis.websiteSignals ?? candidate?.websiteSignals ?? [],
    contactSignals: analysis.contactSignals ?? candidate?.contactSignals ?? [],
    missingAutomationSignals: analysis.missingAutomationSignals ?? candidate?.missingAutomationSignals ?? [],
    likelyManualProcessSignals: analysis.likelyManualProcessSignals ?? candidate?.likelyManualProcessSignals ?? [],
    qualificationReason: analysis.qualificationReason ?? candidate?.qualificationReason ?? 'Legacy analyza nema samostatnou pain kvalifikaci.',
    alreadySolvedSignals: analysis.alreadySolvedSignals ?? candidate?.alreadySolvedSignals ?? [],
    missingEvidence: analysis.missingEvidence ?? candidate?.missingEvidence ?? ['Legacy analyza nema kompletni evidence model.'],
    contradictionWarnings: analysis.contradictionWarnings ?? candidate?.contradictionWarnings ?? [],
    evidenceLimits: analysis.evidenceLimits ?? ['Ulozeno z predchozi verze bez kompletni diagnostiky.'],
    isMock: analysis.isMock ?? candidate?.isMock ?? analysis.provider === 'demo-fallback',
    isLegacy: analysis.isLegacy ?? !analysis.provider,
});

const evidenceBadgeForCandidate = (candidate: LeadAgentCandidate, analysis?: LeadAgentAnalysis) => {
    if (analysis) return 'Full agent analysis';
    if (candidate.websiteExtraction && ['completed', 'partial'].includes(candidate.websiteExtraction.status)) return 'Web přečten';
    if (candidate.websiteSignals.length > 0 || candidate.websiteUrl) return 'Website evidence';
    return 'Search snippet only';
};

const candidateFromLead = (lead: Lead): LeadAgentCandidate => ({
    id: `detail-candidate-${lead.id}`,
    runId: lead.leadAgentRunId || `detail-${lead.id}`,
    createdAt: nowIso(),
    name: lead.name,
    location: lead.city,
    type: lead.accommodationType,
    websiteUrl: lead.websiteExtraction?.websiteUrl || lead.websiteOrOtaUrl || lead.publicProfileUrl,
    sourceUrls: uniqueStrings([lead.websiteExtraction?.websiteUrl || '', ...lead.publicLinks.map((link) => link.url), ...(lead.websiteExtraction?.pagesExtracted.map((page) => page.url) ?? [])]),
    sourceSnippets: [
        lead.firstImpression,
        lead.notes,
        lead.qualificationReason || '',
        lead.offerHypothesis || '',
        lead.websiteExtraction ? `Website extraction summary: ${lead.websiteExtraction.summary}` : '',
        lead.websiteExtraction ? `Website contacts: ${[...lead.websiteExtraction.contact.emails, ...lead.websiteExtraction.contact.phones].join(', ') || 'nenalezeno'}` : '',
        ...(lead.websiteExtraction?.pagesExtracted.map((page) => `${page.title}: ${page.textPreview}`) ?? []),
        ...lead.sourceMaterials.map((material) => `${material.title}: ${material.content}`),
    ].filter((value) => value.trim()),
    possibleEmail: lead.email || lead.websiteExtraction?.contact.emails[0] || '',
    signals: uniqueStrings([...lead.publicSignals, ...(lead.websiteExtraction?.strengths ?? []), ...(lead.websiteExtraction?.websiteSignals ?? [])]),
    risks: removeContactContradictions(splitLines(lead.risks || lead.guestFrictionSignals), (lead.websiteExtraction?.contact.emails.length ?? 0) > 0),
    leadScore: lead.leadScore,
    opportunityScore: lead.opportunityScore ?? lead.leadScore,
    opportunityType: (lead.opportunityType as LeadAgentOpportunityType) || 'setup-automation',
    automationNeedScore: lead.automationNeedScore ?? 0,
    publicMaturityScore: lead.publicMaturityScore ?? 0,
    reviewFrictionScore: lead.reviewFrictionScore ?? 0,
    fitVerdict: ['strong-opportunity', 'moderate-opportunity', 'weak-opportunity', 'not-enough-evidence', 'skip'].includes(guardedPreAnalysisFitVerdict(lead) || '') ? guardedPreAnalysisFitVerdict(lead) as LeadAgentCandidate['fitVerdict'] : 'not-enough-evidence',
    confidence: ['low', 'medium', 'high'].includes(lead.confidence || '') ? lead.confidence as LeadAgentCandidate['confidence'] : 'low',
    contactMissing: !lead.email && (lead.websiteExtraction?.contact.emails.length ?? 0) === 0 && (lead.websiteExtraction?.contact.phones.length ?? 0) === 0,
    painSignals: splitLines(lead.reviewSignals).filter((signal) => !signal.toLowerCase().includes('guest guide')),
    positiveSolvedSignals: [],
    noPainReason: '',
    targetOffer: ['guest-communication-fix', 'guest-guide', 'ota-profile-audit', 'review-response-improvement', 'self-checkin-setup', 'skip'].includes(lead.targetOffer || '') ? lead.targetOffer as LeadAgentCandidate['targetOffer'] : 'guest-guide',
    offerHypothesis: lead.offerHypothesis || lead.businessOpportunity || 'Z dostupných veřejných podkladů zatím chybí plná agentní analýza.',
    websiteSignals: uniqueStrings([...(lead.publicLinks.some((link) => link.sourceType === 'website') ? ['Vlastní web jako odkaz k ruční kontrole'] : []), ...(lead.websiteExtraction?.websiteSignals ?? []), ...(lead.websiteExtraction?.arrivalSignals ?? []), ...(lead.websiteExtraction?.faqSignals ?? [])]),
    contactSignals: uniqueStrings([lead.email ? 'Veřejný e-mail v CRM' : '', ...(lead.websiteExtraction?.contact.emails.map((email) => `E-mail nalezen na vlastním webu: ${email}`) ?? []), ...(lead.websiteExtraction?.contact.phones.map((phone) => `Telefon nalezen na vlastním webu: ${phone}`) ?? [])]),
    missingAutomationSignals: removeContactContradictions(['Nelze veřejně ověřit, zda mají guest guide.', 'Guest guide může existovat neveřejně.', ...(lead.websiteExtraction?.missingPublicInfoSignals ?? [])], (lead.websiteExtraction?.contact.emails.length ?? 0) > 0),
    likelyManualProcessSignals: uniqueStrings([...splitLines(lead.checkInParkingInfo), ...(lead.websiteExtraction?.likelyManualProcessSignals ?? [])]),
    qualificationReason: lead.qualificationReason || 'Lead analyzovaný z detailu CRM; dostupná evidence může být jen rychlý search snippet nebo ručně vložené podklady.',
    alreadySolvedSignals: [],
    missingEvidence: removeContactContradictions(['Nelze veřejně ověřit, zda mají guest guide.', 'OTA URL nejsou automaticky přečtené.', ...lead.sourceLimitations, ...(lead.websiteExtraction?.evidenceLimits ?? [])], (lead.websiteExtraction?.contact.emails.length ?? 0) > 0),
    contradictionWarnings: ['Netvrdit, že nemají guest guide, pokud to není v dodaných podkladech prokazatelné.'],
    recommendedAngle: lead.selectedOfferAngle,
    evidenceSummary: lead.websiteExtraction?.summary || lead.notes || lead.firstImpression || 'CRM lead bez plné agentní analýzy.',
    websiteExtraction: lead.websiteExtraction,
    isMock: lead.isDemoLead ?? false,
    isLegacy: false,
});

const applyAgentAnalysisToLead = (lead: Lead, analysis: LeadAgentAnalysis): Lead => {
    const hasWebsiteEmail = (lead.websiteExtraction?.contact.emails.length ?? 0) > 0;
    const contactSignals = hasWebsiteEmail ? [`E-mail nalezen na vlastním webu: ${lead.websiteExtraction?.contact.emails[0]}`] : [];
    const quickWins = ensureThreeQuickWins(lead, analysis.quickWins);
    const ideaDiagnostics = freeIdeaSpecificityDiagnostics({ ...lead, structuredQuickWins: quickWins, freeIdeas: quickWins });
    const cleanedDisplayName = cleanLeadDisplayName(analysis.leadDisplayName || lead.name);
    const analyzedLead: Lead = {
        ...lead,
        name: cleanedDisplayName,
        status: 'Audit pripraven',
        createdFromAgentAnalysis: true,
        addedWithoutAgentAnalysis: false,
        agentLeadStatus: 'analyzed',
        evidenceLevel: 'full-agent-analysis',
        needsAgentAnalysis: false,
        agentAnalysisProvider: analysis.provider,
        opportunityScore: analysis.opportunityScore,
        opportunityType: analysis.opportunityType,
        fitVerdict: analysis.fitVerdict,
        confidence: analysis.confidence,
        targetOffer: analysis.targetOffer,
        qualificationReason: analysis.qualificationReason,
        offerHypothesis: analysis.offerHypothesis,
        automationNeedScore: analysis.automationNeedScore,
        reviewFrictionScore: analysis.reviewFrictionScore,
        publicMaturityScore: analysis.publicMaturityScore,
        publicSignals: uniqueStrings([...removeContactContradictions(lead.publicSignals, hasWebsiteEmail), ...analysis.strengths, ...analysis.websiteSignals, ...analysis.contactSignals, ...contactSignals]),
        quickWins: quickWins.map((win) => win.title),
        proposedQuickWins: quickWins.map((win) => win.title),
        structuredQuickWins: quickWins,
        leadPlaybook: analysis.leadPlaybook ?? ideaDiagnostics.leadPlaybook,
        leadPlaybookReason: sanitizeClientText(analysis.leadPlaybookReason ?? ideaDiagnostics.leadPlaybookReason),
        playbookSignals: analysis.playbookSignals ?? ideaDiagnostics.playbookSignals,
        freeIdeasDiversityScore: analysis.freeIdeasDiversityScore ?? ideaDiagnostics.freeIdeasDiversityScore,
        repeatedConceptWarning: analysis.repeatedConceptWarning ?? ideaDiagnostics.repeatedConceptWarning,
        firstImpression: analysis.firstImpression,
        descriptionObservation: analysis.offerHypothesis,
        checkInParkingInfo: [...analysis.missingAutomationSignals, ...analysis.likelyManualProcessSignals].join('\n'),
        reviewSignals: [...analysis.painSignals, ...analysis.positiveSolvedSignals].join('\n'),
        guestFrictionSignals: removeContactContradictions(analysis.guestFrictionSignals, hasWebsiteEmail).join('\n'),
        guestConfusion: removeContactContradictions(analysis.guestFrictionSignals, hasWebsiteEmail).join('\n'),
        strengths: analysis.strengths.join('\n'),
        risks: removeContactContradictions(analysis.risks, hasWebsiteEmail).join('\n'),
        businessOpportunity: `${analysis.offerHypothesis}\n\n${analysis.offerRecommendation}`,
        extractionStatus: 'completed',
        sourceLimitations: analysis.evidenceLimits,
    };
    const clientMiniAudit = sanitizeClientText(analysis.miniAudit.trim() || generateMiniAudit(analyzedLead));
    const leadWithClientAudit = withProductRecommendation({ ...analyzedLead, clientMiniAudit, generatedMiniAudit: clientMiniAudit });
    const hasWebsiteOnlyEvidence = Boolean(leadWithClientAudit.websiteExtraction && leadWithClientAudit.screenshots.length === 0);
    const websiteOnlyOutreach = hasWebsiteOnlyEvidence ? buildWebsiteOnlyOutreach({ leadName: cleanedDisplayName, websiteExtraction: leadWithClientAudit.websiteExtraction, signals: leadWithClientAudit.publicSignals }) : '';
    const analyzedOutreach = sanitizeClientText(analysis.outreachEmail.trim());

    return {
        ...leadWithClientAudit,
        internalAgentBrief: generateInternalAgentBrief(leadWithClientAudit),
        generatedOutreach: hasWebsiteOnlyEvidence ? websiteOnlyOutreach : analyzedOutreach || generateFirstOutreach(leadWithClientAudit),
        generatedFollowUp: sanitizeClientText(analysis.followUp.trim() || generateFollowUp(leadWithClientAudit)),
        generatedOffer: generateOffer(leadWithClientAudit),
        freeIdeaTeaser: generateFreeIdeaTeaser(leadWithClientAudit),
        freeIdeas: prepareFreeIdeas(leadWithClientAudit, leadWithClientAudit.structuredQuickWins),
        paidNextStep: generateOffer(leadWithClientAudit),
        outreachIntent: 'ask-permission-to-send-free-ideas',
        outreachTone: 'humble-transparent-low-pressure',
    };
};

const candidateWithWebsiteExtraction = (candidate: LeadAgentCandidate, websiteExtraction: WebsiteExtractionResult): LeadAgentCandidate => {
    if (!['completed', 'partial'].includes(websiteExtraction.status)) {
        return {
            ...candidate,
            websiteExtraction,
            missingEvidence: [...new Set([...candidate.missingEvidence, ...websiteExtraction.evidenceLimits])],
            evidenceSummary: `${candidate.evidenceSummary}\nWebsite extraction: ${websiteExtraction.summary}`.trim(),
        };
    }

    const hasContact = websiteExtraction.contact.emails.length > 0 || websiteExtraction.contact.phones.length > 0 || Boolean(candidate.possibleEmail);
    const hasWebsiteEmail = websiteExtraction.contact.emails.length > 0;
    const hasWebsitePhone = websiteExtraction.contact.phones.length > 0;
    const hasStructuredArrival = websiteExtraction.arrivalSignals.length > 0 || websiteExtraction.parkingSignals.length > 0 || websiteExtraction.faqSignals.length > 0;
    const hasSetupOpportunity = websiteExtraction.setupOpportunitySignals.length > 0 && !hasStructuredArrival;
    const hasFixOpportunity = websiteExtraction.fixOpportunitySignals.length > 0;
    const publicMaturityScore = Math.max(candidate.publicMaturityScore, Math.min(100, 20 + websiteExtraction.websiteSignals.length * 10 + websiteExtraction.arrivalSignals.length * 18 + websiteExtraction.parkingSignals.length * 12 + websiteExtraction.faqSignals.length * 18 + websiteExtraction.automationSignals.length * 16));
    const automationNeedScore = hasSetupOpportunity ? Math.max(candidate.automationNeedScore, 68) : Math.max(0, candidate.automationNeedScore - (hasStructuredArrival ? 18 : 0));
    const opportunityType: LeadAgentOpportunityType = hasFixOpportunity
        ? 'fix-existing-process'
        : hasSetupOpportunity
            ? 'setup-automation'
            : publicMaturityScore >= 70
                ? 'benchmark'
                : candidate.opportunityType;
    const opportunityScore = Math.max(candidate.opportunityScore, hasFixOpportunity ? 72 : hasSetupOpportunity ? 62 : hasContact ? 44 : 28);
    const fitVerdict = hasFixOpportunity || hasSetupOpportunity
        ? 'moderate-opportunity'
        : publicMaturityScore >= 70 ? 'weak-opportunity' : candidate.fitVerdict;
    const targetOffer = hasSetupOpportunity && !candidate.sourceSnippets.join(' ').toLowerCase().includes('self check-in')
        ? 'guest-guide'
        : candidate.targetOffer === 'self-checkin-setup' && !hasFixOpportunity
            ? 'guest-guide'
            : candidate.targetOffer;
    const contactSignals = uniqueStrings([
        ...candidate.contactSignals,
        ...websiteExtraction.contact.emails.map((email) => `E-mail nalezen na vlastním webu: ${email}`),
        ...websiteExtraction.contact.phones.map((phone) => `Telefon nalezen na vlastním webu: ${phone}`),
    ]);

    return {
        ...candidate,
        websiteExtraction,
        sourceUrls: [...new Set([candidate.websiteUrl, ...candidate.sourceUrls, ...websiteExtraction.pagesExtracted.map((page) => page.url)].filter(Boolean))],
        possibleEmail: candidate.possibleEmail || websiteExtraction.contact.emails[0] || '',
        contactMissing: !hasContact,
        signals: uniqueStrings([...candidate.signals, ...websiteExtraction.strengths, ...websiteExtraction.websiteSignals, hasWebsiteEmail ? 'E-mail nalezen na vlastním webu' : '', hasWebsitePhone ? 'Telefon nalezen na vlastním webu' : '']),
        risks: removeContactContradictions([...candidate.risks, ...websiteExtraction.risks], hasWebsiteEmail),
        websiteSignals: uniqueStrings([...candidate.websiteSignals, ...websiteExtraction.websiteSignals, ...websiteExtraction.arrivalSignals, ...websiteExtraction.parkingSignals, ...websiteExtraction.faqSignals]),
        contactSignals,
        missingAutomationSignals: removeContactContradictions([...websiteExtraction.missingPublicInfoSignals, ...candidate.missingAutomationSignals], hasWebsiteEmail),
        likelyManualProcessSignals: uniqueStrings([...candidate.likelyManualProcessSignals, ...websiteExtraction.likelyManualProcessSignals]),
        opportunityType,
        automationNeedScore,
        publicMaturityScore,
        opportunityScore,
        fitVerdict,
        targetOffer,
        confidence: websiteExtraction.status === 'completed' ? 'medium' : candidate.confidence,
        qualificationReason: hasSetupOpportunity
            ? 'Website Extractor našel vlastní web a setup příležitost: praktické příjezdové informace nejsou veřejně jasně strukturované. Guest guide může existovat neveřejně.'
            : hasFixOpportunity
                ? 'Website Extractor našel vlastní web a konkrétní mezeru ve veřejné struktuře praktických informací.'
                : publicMaturityScore >= 70
                    ? 'Website Extractor ukazuje dobře strukturovaný vlastní web; kandidát je spíš benchmark nebo slabší priorita.'
                    : candidate.qualificationReason,
        evidenceSummary: `${candidate.evidenceSummary}\nWebsite extraction: ${websiteExtraction.summary}`.trim(),
        missingEvidence: removeContactContradictions([...candidate.missingEvidence, ...websiteExtraction.evidenceLimits], hasWebsiteEmail),
    };
};

const normalizeAgentSession = (session: Partial<LeadAgentSession>, loadedFromStorage = false): LeadAgentSession => {
    const base = emptyAgentSession();
    const candidates = (session.candidates ?? []).map(normalizeAgentCandidate);
    const analyses = Object.fromEntries(
        Object.entries(session.analyses ?? {}).map(([candidateId, analysis]) => [
            candidateId,
            normalizeAgentAnalysis(analysis as Partial<LeadAgentAnalysis>, candidates.find((candidate) => candidate.id === candidateId)),
        ]),
    );

    return {
        ...base,
        ...session,
        runId: session.runId ?? candidates[0]?.runId ?? base.runId,
        createdAt: session.createdAt ?? candidates[0]?.createdAt ?? base.createdAt,
        request: { ...emptyAgentRequest(), ...session.request },
        candidates,
        analyses,
        dismissedCandidateIds: session.dismissedCandidateIds ?? candidates.filter((candidate) => candidate.rejected).map((candidate) => candidate.id),
        candidateFilter: session.candidateFilter ?? 'all',
        candidateSort: session.candidateSort ?? 'opportunityScore',
        loadedFromStorage: loadedFromStorage && (candidates.length > 0 || Object.keys(analyses).length > 0),
        storedBannerDismissed: session.storedBannerDismissed ?? false,
        diagnostic: session.diagnostic,
        health: session.health,
        healthMessage: session.healthMessage ?? '',
    };
};

function App() {
    const [leads, setLeads] = useState<Lead[]>(() => {
        const storedLeads = localStorage.getItem(storageKey);

        if (!storedLeads) {
            return mockLeads.map(normalizeLead);
        }

        try {
            return (JSON.parse(storedLeads) as Partial<Lead>[]).map(normalizeLead);
        } catch {
            return mockLeads.map(normalizeLead);
        }
    });
    const [activeScreen, setActiveScreen] = useState<Screen>('dashboard');
    const [selectedLeadId, setSelectedLeadId] = useState(leads[0]?.id ?? '');
    const [draftLead, setDraftLead] = useState<Lead>(() => leads[0] ?? emptyLead());
    const [isCreating, setIsCreating] = useState(false);
    const [copiedTextId, setCopiedTextId] = useState('');
    const [includeScreenshotDataUrlsInExport, setIncludeScreenshotDataUrlsInExport] = useState(false);
    const [extractingWebsiteCandidateIds, setExtractingWebsiteCandidateIds] = useState<string[]>([]);
    const [leadAgentSession, setLeadAgentSession] = useState<LeadAgentSession>(() => {
        const storedSession = localStorage.getItem(agentStorageKey);

        if (!storedSession) {
            return emptyAgentSession();
        }

        try {
            return normalizeAgentSession(JSON.parse(storedSession) as Partial<LeadAgentSession>, true);
        } catch {
            return emptyAgentSession();
        }
    });

    useEffect(() => {
        localStorage.setItem(storageKey, JSON.stringify(leads));
    }, [leads]);

    useEffect(() => {
        localStorage.setItem(agentStorageKey, JSON.stringify(leadAgentSession));
    }, [leadAgentSession]);

    const selectedLead = useMemo(
        () => leads.find((lead) => lead.id === selectedLeadId) ?? leads[0],
        [leads, selectedLeadId],
    );

    useEffect(() => {
        if (selectedLead) {
            setDraftLead(selectedLead);
            setSelectedLeadId(selectedLead.id);
        }
    }, [selectedLead]);

    const stats = useMemo(() => {
        const followUps = leads.filter((lead) => lead.nextFollowUpDate).length;
        const readyAudits = leads.filter((lead) => lead.status === 'Audit pripraven').length;
        const contacted = leads.filter((lead) => ['Kontaktovan', 'Follow-up', 'Nabidka'].includes(lead.status)).length;

        return { total: leads.length, followUps, readyAudits, contacted };
    }, [leads]);

    const selectLead = (leadId: string, nextScreen: Screen = 'detail') => {
        setSelectedLeadId(leadId);
        setIsCreating(false);
        setActiveScreen(nextScreen);
    };

    const startNewLead = () => {
        setDraftLead(emptyLead());
        setIsCreating(true);
        setActiveScreen('detail');
    };

    const updateDraft = <Field extends keyof Lead>(field: Field, value: Lead[Field]) => {
        setDraftLead((current) => {
            const nextLead = field === 'clientMiniAudit'
                ? { ...current, clientMiniAudit: String(value), generatedMiniAudit: String(value), freeIdeas: prepareFreeIdeas(current, current.structuredQuickWins) }
                : field === 'generatedOffer'
                    ? { ...current, generatedOffer: String(value), paidNextStep: String(value) }
                    : field === 'generatedOutreach'
                        ? { ...current, generatedOutreach: String(value), outreachIntent: 'ask-permission-to-send-free-ideas' as const, outreachTone: 'humble-transparent-low-pressure' as const }
                        : { ...current, [field]: value };
            const nextLeadWithRecommendation = withProductRecommendation(nextLead);

            if (!isCreating && selectedLeadId === current.id) {
                setLeads((currentLeads) => currentLeads.map((lead) => (lead.id === current.id ? nextLeadWithRecommendation : lead)));
            }

            return nextLeadWithRecommendation;
        });
    };

    const persistLead = (lead: Lead) => {
        const canonicalLead = canonicalizeLeadEvidence(lead);

        if (!canonicalLead.name.trim()) {
            setDraftLead(canonicalLead);
            return;
        }

        setDraftLead(canonicalLead);
        setLeads((currentLeads) => {
            const exists = currentLeads.some((currentLead) => currentLead.id === canonicalLead.id);
            return exists ? currentLeads.map((currentLead) => (currentLead.id === canonicalLead.id ? canonicalLead : currentLead)) : [canonicalLead, ...currentLeads];
        });
        setSelectedLeadId(canonicalLead.id);
        setIsCreating(false);
    };

    const saveDraft = (event?: FormEvent) => {
        event?.preventDefault();

        if (!draftLead.name.trim()) {
            return;
        }

        persistLead(draftLead);
    };

    const deleteLead = (leadId: string) => {
        const leadToDelete = leads.find((lead) => lead.id === leadId);

        if (!leadToDelete) {
            return;
        }

        const confirmed = window.confirm(`Opravdu smazat lead "${leadToDelete.name || 'bez nazvu'}"? Tato akce nejde vratit zpet.`);

        if (!confirmed) {
            return;
        }

        setLeads((currentLeads) => {
            const remainingLeads = currentLeads.filter((lead) => lead.id !== leadId);
            const nextSelectedLead = remainingLeads[0];

            setSelectedLeadId(nextSelectedLead?.id ?? '');
            setDraftLead(nextSelectedLead ?? emptyLead());
            setIsCreating(false);
            setActiveScreen(remainingLeads.length > 0 ? 'leads' : 'dashboard');

            return remainingLeads;
        });
    };

    const updateAgentRequest = <Field extends keyof LeadAgentSearchRequest>(field: Field, value: LeadAgentSearchRequest[Field]) => {
        setLeadAgentSession((currentSession) => ({
            ...currentSession,
            request: { ...currentSession.request, [field]: value },
        }));
    };

    const resetAgentResults = (preserveNotice = false) => {
        setLeadAgentSession((currentSession) => ({
            ...emptyAgentSession(),
            request: currentSession.request,
            health: currentSession.health,
            healthMessage: currentSession.healthMessage,
            storedBannerDismissed: preserveNotice ? currentSession.storedBannerDismissed : false,
        }));
    };

    const deleteAgentResults = () => {
        const confirmed = window.confirm('Smazat aktualni vysledky hledani a analyzy z localStorage? Ulozene leady v CRM zustanou zachovane.');

        if (!confirmed) return;
        resetAgentResults();
    };

    const clearAllTestData = () => {
        const confirmed = window.confirm('Smazat vsechna lokalni testovaci data v tomto prohlizeci? Smazou se Lead Finder vysledky i lokalne ulozene leady v CRM. Tato akce nejde vratit zpet.');

        if (!confirmed) return;
        localStorage.removeItem(storageKey);
        localStorage.removeItem(agentStorageKey);
        setLeads([]);
        setSelectedLeadId('');
        setDraftLead(emptyLead());
        setIsCreating(false);
        setLeadAgentSession(emptyAgentSession());
        setActiveScreen('finder');
    };

    const deleteDemoData = () => {
        const confirmed = window.confirm('Smazat demo data? Odstrani se demo kandidati, demo analyzy a demo leady z lokalniho uloziste. Realne leady zustanou zachovane.');

        if (!confirmed) return;
        setLeads((currentLeads) => {
            const remainingLeads = currentLeads.filter((lead) => !lead.isDemoLead);
            const nextSelectedLead = remainingLeads.find((lead) => lead.id === selectedLeadId) ?? remainingLeads[0];
            setSelectedLeadId(nextSelectedLead?.id ?? '');
            setDraftLead(nextSelectedLead ?? emptyLead());
            setIsCreating(false);
            return remainingLeads;
        });
        setLeadAgentSession((currentSession) => currentSession.isMock ? {
            ...emptyAgentSession(),
            request: currentSession.request,
            health: currentSession.health,
            healthMessage: currentSession.healthMessage,
            storedBannerDismissed: true,
        } : currentSession);
    };

    const dismissStoredBanner = () => {
        setLeadAgentSession((currentSession) => ({ ...currentSession, storedBannerDismissed: true }));
    };

    const updateCandidateFilter = (candidateFilter: LeadAgentCandidateFilter) => {
        setLeadAgentSession((currentSession) => ({ ...currentSession, candidateFilter }));
    };

    const updateCandidateSort = (candidateSort: LeadAgentCandidateSort) => {
        setLeadAgentSession((currentSession) => ({ ...currentSession, candidateSort }));
    };

    const executeLeadAgentSearch = async (request: LeadAgentSearchRequest, searchingMessage: string) => {
        const runId = newAgentRunId();
        const createdAt = nowIso();
        setLeadAgentSession((currentSession) => ({
            ...currentSession,
            request,
            runId,
            createdAt,
            status: 'searching',
            message: searchingMessage,
            isMock: false,
            candidates: [],
            analyses: {},
            dismissedCandidateIds: [],
            diagnostic: undefined,
            loadedFromStorage: false,
            storedBannerDismissed: true,
        }));

        try {
            const response = await discoverLeads(request);
            if (response.isMock) {
                const reason = response.diagnostic?.fallbackReason ?? 'unexpected_demo_fallback';
                const message = `Reálné hledání neběželo. Discovery function selhala: ${reason}. Demo kandidáti nejsou skuteční klienti.`;
                setLeadAgentSession((currentSession) => ({
                    ...currentSession,
                    status: 'error',
                    message,
                    isMock: false,
                    candidates: [],
                    analyses: {},
                    diagnostic: {
                        ...response.diagnostic,
                        mode: 'error',
                        discoverProvider: 'error',
                        source: 'error',
                        fallbackReason: reason,
                        userMessage: message,
                    },
                }));
                return;
            }

            setLeadAgentSession((currentSession) => ({
                ...currentSession,
                status: response.status === 'needs-config' ? 'needs-config' : 'found',
                message: response.message,
                isMock: response.isMock,
                candidates: response.candidates.map((candidate) => normalizeAgentCandidate({ ...candidate, runId, createdAt, isLegacy: false })),
                diagnostic: response.diagnostic
                    ? { ...response.diagnostic, discoverProvider: response.diagnostic.discoverProvider ?? currentSession.diagnostic?.discoverProvider, source: response.diagnostic.source ?? 'real API' }
                    : currentSession.diagnostic,
            }));
        } catch (error) {
            const reason = 'network_error';
            const message = `Reálné hledání neběželo. Discovery function selhala: ${reason}. Demo kandidáti nejsou skuteční klienti.`;
            setLeadAgentSession((currentSession) => ({
                ...currentSession,
                status: 'error',
                message,
                isMock: false,
                candidates: [],
                analyses: {},
                diagnostic: {
                    mode: 'error',
                    discoverProvider: 'error',
                    source: 'error',
                    fallbackReason: reason,
                    userMessage: error instanceof Error ? error.message : 'Lead Finder Agent selhal.',
                },
            }));
        }
    };

    const runDemoLeadAgentSearch = async () => {
        const request = {
            ...leadAgentSession.request,
            knownTargetName: '',
            knownTargetCity: '',
            knownTargetWebsiteUrl: '',
            knownTargetNote: '',
            knownTargetEmail: '',
        };
        const runId = newAgentRunId();
        const createdAt = nowIso();
        const response = await discoverDemoLeads(request);

        setLeadAgentSession((currentSession) => ({
            ...currentSession,
            request,
            runId,
            createdAt,
            status: 'found',
            message: response.message,
            isMock: true,
            candidates: response.candidates.map((candidate) => normalizeAgentCandidate({ ...candidate, runId, createdAt, isMock: true, isLegacy: false })),
            analyses: {},
            dismissedCandidateIds: [],
            diagnostic: response.diagnostic,
            loadedFromStorage: false,
            storedBannerDismissed: true,
        }));
    };

    const runLeadAgentSearch = async () => {
        await executeLeadAgentSearch({
            ...leadAgentSession.request,
            knownTargetName: '',
            knownTargetCity: '',
            knownTargetWebsiteUrl: '',
            knownTargetNote: '',
            knownTargetEmail: '',
        }, 'Vyhledavam potencialni klienty...');
    };

    const runKnownTargetCheck = async () => {
        const request = leadAgentSession.request;
        await executeLeadAgentSearch({
            ...request,
            location: request.knownTargetCity?.trim() || request.location,
            maxResults: 1,
        }, `Proveruji konkretni provoz ${request.knownTargetName || request.knownTargetWebsiteUrl || 'bez nazvu'}...`);
    };

    const verifyAgentConfiguration = async () => {
        setLeadAgentSession((currentSession) => ({ ...currentSession, healthMessage: 'Overuji Netlify Functions konfiguraci...' }));

        try {
            const health = await checkAgentHealth();
            setLeadAgentSession((currentSession) => ({
                ...currentSession,
                health,
                healthMessage: 'Konfigurace agenta overena pres Netlify Function.',
            }));
        } catch {
            setLeadAgentSession((currentSession) => ({
                ...currentSession,
                health: undefined,
                healthMessage: 'Netlify Functions nejsou dostupne z teto URL.',
            }));
        }
    };

    const analyzeAgentCandidate = async (candidate: LeadAgentCandidate) => {
        setLeadAgentSession((currentSession) => ({ ...currentSession, status: 'analyzing', message: `Analyzuji ${candidate.name}...` }));

        try {
            const response = await analyzeLead(candidate, leadAgentSession.request.notes);
            setLeadAgentSession((currentSession) => ({
                ...currentSession,
                status: response.status === 'needs-config' ? 'needs-config' : 'completed',
                message: response.message,
                isMock: currentSession.isMock,
                analyses: response.analysis ? { ...currentSession.analyses, [candidate.id]: normalizeAgentAnalysis(response.analysis, candidate) } : currentSession.analyses,
                diagnostic: response.diagnostic
                    ? {
                        ...currentSession.diagnostic,
                        ...response.diagnostic,
                        discoverProvider: currentSession.diagnostic?.discoverProvider,
                        source: currentSession.diagnostic?.source,
                        partial: currentSession.diagnostic?.partial,
                        queriesAttempted: currentSession.diagnostic?.queriesAttempted,
                        queriesSucceeded: currentSession.diagnostic?.queriesSucceeded,
                        queriesTimedOut: currentSession.diagnostic?.queriesTimedOut,
                        timeoutBudgetMs: currentSession.diagnostic?.timeoutBudgetMs,
                        skippedHeavyEnrichment: currentSession.diagnostic?.skippedHeavyEnrichment,
                    }
                    : currentSession.diagnostic,
            }));
        } catch (error) {
            setLeadAgentSession((currentSession) => ({
                ...currentSession,
                status: 'error',
                message: error instanceof Error ? error.message : 'Analyza kandidata selhala.',
                diagnostic: {
                    mode: 'demo-fallback',
                    analyzeProvider: 'unknown',
                    fallbackReason: 'network_error',
                    userMessage: error instanceof Error ? error.message : 'Analyza kandidata selhala.',
                },
            }));
        }
    };

    const rejectAgentCandidate = (candidateId: string) => {
        setLeadAgentSession((currentSession) => ({
            ...currentSession,
            dismissedCandidateIds: [...new Set([...currentSession.dismissedCandidateIds, candidateId])],
            candidates: currentSession.candidates.map((candidate) => (candidate.id === candidateId ? { ...candidate, rejected: true } : candidate)),
        }));
    };

    const clearAgentAnalysis = (candidateId: string) => {
        setLeadAgentSession((currentSession) => {
            const remainingAnalyses = { ...currentSession.analyses };
            delete remainingAnalyses[candidateId];
            return { ...currentSession, analyses: remainingAnalyses };
        });
    };

    const extractCandidateWebsite = async (candidate: LeadAgentCandidate) => {
        if (!hasOwnWebsiteUrl(candidate)) return;

        setExtractingWebsiteCandidateIds((current) => [...new Set([...current, candidate.id])]);
        try {
            const websiteExtraction = await extractWebsite(candidate, leadAgentSession.request.notes);
            setLeadAgentSession((currentSession) => ({
                ...currentSession,
                candidates: currentSession.candidates.map((currentCandidate) => currentCandidate.id === candidate.id
                    ? candidateWithWebsiteExtraction(currentCandidate, websiteExtraction)
                    : currentCandidate),
                message: `Website extraction: ${websiteExtraction.status} pro ${candidate.name}`,
            }));
        } finally {
            setExtractingWebsiteCandidateIds((current) => current.filter((candidateId) => candidateId !== candidate.id));
        }
    };

    const addAgentCandidateToLeads = (candidate: LeadAgentCandidate) => {
        if (candidate.isMock) {
            const confirmed = window.confirm('Toto je demo kandidát, není to skutečný klient. Přidat jen pro test?');

            if (!confirmed) return;
        }

        const analysis = leadAgentSession.analyses[candidate.id];
        const websiteExtraction = candidate.websiteExtraction;
        const candidateText = candidate.sourceSnippets.join('\n');
        const hasAgentAnalysis = Boolean(analysis);
        const quickWins = prepareFreeIdeas({ ...emptyLead(), websiteExtraction, strengths: analysis?.strengths.join('\n') ?? candidate.signals.join('\n'), publicSignals: candidate.signals, checkInParkingInfo: [...(websiteExtraction?.arrivalSignals ?? []), ...(websiteExtraction?.parkingSignals ?? [])].join('\n') }, (analysis?.quickWins ?? []).slice(0, 3).map((win) => ({
            ...win,
            id: win.id || `quick-win-${crypto.randomUUID()}`,
        })));
        const agentSourceContent = [
            `Evidence summary: ${candidate.evidenceSummary}`,
            `Qualification: ${analysis?.qualificationReason ?? candidate.qualificationReason}`,
            `Offer hypothesis: ${analysis?.offerHypothesis ?? candidate.offerHypothesis}`,
            `Opportunity type: ${analysis?.opportunityType ?? candidate.opportunityType}`,
            `Fit verdict: ${analysis?.fitVerdict ?? candidate.fitVerdict}`,
            '',
            'Source snippets:',
            candidateText,
            websiteExtraction ? `\nWebsite extraction summary:\n${websiteExtraction.summary}` : '',
            websiteExtraction ? `Pages extracted:\n${websiteExtraction.pagesExtracted.map((page) => `${page.url} (${page.contentLength})`).join('\n')}` : '',
        ].filter(Boolean).join('\n');
        const selectedOfferAngle = offerAngleForAgentLead(analysis?.opportunityType ?? candidate.opportunityType, analysis?.targetOffer ?? candidate.targetOffer, candidate.recommendedAngle);
        const hasWebsiteEmail = (websiteExtraction?.contact.emails.length ?? 0) > 0;
        const guardedFitVerdict = !hasAgentAnalysis && candidate.confidence === 'low' && quickWins.length === 0 && candidate.fitVerdict === 'strong-opportunity'
            ? 'moderate-opportunity'
            : candidate.fitVerdict === 'strong-opportunity' && !hasAgentAnalysis
                ? 'moderate-opportunity'
                : candidate.fitVerdict;
        const guardedTargetOffer = !hasAgentAnalysis && candidate.opportunityType === 'setup-automation' && candidate.targetOffer === 'self-checkin-setup' && !candidate.sourceSnippets.join(' ').toLowerCase().includes('self check-in')
            ? 'guest-guide'
            : candidate.targetOffer;
        const nextLeadBase: Lead = {
            ...emptyLead(),
            id: `lead-${crypto.randomUUID()}`,
            name: candidate.name,
            accommodationType: candidate.type,
            city: candidate.location,
            websiteOrOtaUrl: candidate.websiteUrl,
            publicProfileUrl: candidate.websiteUrl,
            publicLinks: candidate.sourceUrls.map((url) => ({
                id: `link-${crypto.randomUUID()}`,
                sourceType: detectSourceType(url),
                url,
                label: publicProfileSourceLabels[detectSourceType(url)],
                notes: candidate.isMock ? 'Demo agentni kandidat; URL nebyla automaticky ctena.' : 'Agentni kandidat ze search API; URL nebyla scrapovana.',
            })),
            sourceMaterials: [
                {
                    id: `source-${crypto.randomUUID()}`,
                    type: 'pasted-text',
                    sourceLinkId: '',
                    title: hasAgentAnalysis ? 'Agent analysis source' : 'Agent candidate source without analysis',
                    content: agentSourceContent,
                    createdAt: new Date().toISOString(),
                },
                ...(websiteExtraction ? [{
                    id: `source-${crypto.randomUUID()}`,
                    type: 'website-extraction' as const,
                    sourceLinkId: '',
                    title: 'Website extraction source',
                    content: sanitizeWebsiteExtractionForSourceMaterial(websiteExtraction),
                    createdAt: new Date().toISOString(),
                }] : []),
            ],
            extractionStatus: analysis ? 'completed' : 'ready',
            latestAnalysisDiagnostic: analysis ? { mode: analysis.provider === 'openai' ? 'real-api' : 'demo-fallback', analyzeProvider: analysis.provider, userMessage: 'Lead přidán z existující agentní analýzy.' } : undefined,
            websiteExtractionDiagnostic: websiteExtraction ? { ...websiteExtraction.debug, provider: websiteExtraction.provider, status: websiteExtraction.status, contactFound: (websiteExtraction.contact.emails.length + websiteExtraction.contact.phones.length) > 0 } : undefined,
            email: candidate.possibleEmail,
            status: analysis ? 'Audit pripraven' : 'Novy',
            notes: `${candidate.isMock ? `${demoLeadNotice}\n\n` : ''}${analysis ? 'Lead vytvoren z Lead Finder Agent analyzy.' : 'Rychly nalez z Lead Finderu bez plne agentni analyzy.'} Skore: ${candidate.leadScore}. Opportunity: ${analysis?.opportunityScore ?? candidate.opportunityScore}. ${candidate.isMock ? 'Demo rezim - fiktivni kandidat, nepouzivat jako realny obchodni lead.' : 'Search API rezim.'} ${candidate.evidenceSummary}`,
            leadScore: candidate.leadScore,
            createdFromAgentAnalysis: hasAgentAnalysis,
            addedWithoutAgentAnalysis: !hasAgentAnalysis,
            agentLeadStatus: hasAgentAnalysis ? 'analyzed' : 'quick-discovery',
            evidenceLevel: hasAgentAnalysis ? 'full-agent-analysis' : websiteExtraction && ['completed', 'partial'].includes(websiteExtraction.status) ? 'website-extracted' : candidate.websiteSignals.length > 0 || candidate.websiteUrl ? 'website-snippet' : 'search-snippet-only',
            needsAgentAnalysis: !hasAgentAnalysis,
            sourceLimitations: hasAgentAnalysis
                ? analysis.evidenceLimits
                : websiteExtraction
                    ? websiteExtraction.evidenceLimits
                    : ['Tento lead vznikl jen z rychlého vyhledání.', 'Search snippety nejsou kompletní OTA profil.', 'OTA URL jsou jen odkazy k otevření, ne automaticky přečtený zdroj.', 'Screenshoty jsou analyzované jen tehdy, když je uživatel nahraje.', 'Nelze veřejně ověřit, zda mají guest guide; guest guide může existovat neveřejně.'],
            leadAgentRunId: candidate.runId,
            agentAnalysisProvider: analysis?.provider ?? '',
            isDemoLead: candidate.isMock,
            demoReason: candidate.isMock ? demoLeadNotice : '',
            opportunityScore: analysis?.opportunityScore ?? Math.min(candidate.opportunityScore, !hasAgentAnalysis && guardedFitVerdict !== 'strong-opportunity' ? 64 : candidate.opportunityScore),
            opportunityType: analysis?.opportunityType ?? candidate.opportunityType,
            fitVerdict: analysis?.fitVerdict ?? guardedFitVerdict,
            confidence: analysis?.confidence ?? candidate.confidence,
            targetOffer: analysis?.targetOffer ?? guardedTargetOffer,
            qualificationReason: analysis?.qualificationReason ?? candidate.qualificationReason,
            offerHypothesis: analysis?.offerHypothesis ?? candidate.offerHypothesis,
            automationNeedScore: analysis?.automationNeedScore ?? candidate.automationNeedScore,
            reviewFrictionScore: analysis?.reviewFrictionScore ?? candidate.reviewFrictionScore,
            publicMaturityScore: analysis?.publicMaturityScore ?? candidate.publicMaturityScore,
            publicSignals: uniqueStrings([...removeContactContradictions(candidate.signals, hasWebsiteEmail), ...(analysis?.websiteSignals ?? candidate.websiteSignals), ...(analysis?.contactSignals ?? candidate.contactSignals), ...(analysis?.missingAutomationSignals ?? candidate.missingAutomationSignals), ...(websiteExtraction?.strengths ?? []), hasWebsiteEmail ? 'E-mail nalezen na vlastním webu' : '']),
            quickWins: quickWins.map((win) => win.title),
            proposedQuickWins: quickWins.map((win) => win.title),
            firstImpression: analysis?.firstImpression ?? websiteExtraction?.summary ?? '',
            mainPhotoVerdict: 'unknown',
            descriptionObservation: analysis?.offerHypothesis ?? websiteExtraction?.summary ?? candidate.offerHypothesis,
            checkInParkingInfo: [...(analysis?.missingAutomationSignals ?? candidate.missingAutomationSignals), ...(websiteExtraction?.arrivalSignals ?? []), ...(websiteExtraction?.parkingSignals ?? []), ...(websiteExtraction?.faqSignals ?? [])].join('\n'),
            reviewSignals: [...(analysis?.painSignals ?? candidate.painSignals), ...(analysis?.positiveSolvedSignals ?? candidate.positiveSolvedSignals), candidateText].filter(Boolean).join('\n'),
            guestFrictionSignals: analysis?.guestFrictionSignals.join('\n') ?? removeContactContradictions(candidate.risks, hasWebsiteEmail).join('\n'),
            guestConfusion: analysis?.guestFrictionSignals.join('\n') ?? removeContactContradictions(candidate.risks, hasWebsiteEmail).join('\n'),
            strengths: analysis?.strengths.join('\n') ?? [...candidate.signals, ...(websiteExtraction?.strengths ?? [])].join('\n'),
            risks: analysis?.risks.join('\n') ?? removeContactContradictions([...candidate.risks, ...(websiteExtraction?.risks ?? [])], hasWebsiteEmail).join('\n'),
            businessOpportunity: analysis ? `${analysis.offerHypothesis}\n\n${analysis.offerRecommendation}` : websiteExtraction ? [...websiteExtraction.setupOpportunitySignals, ...websiteExtraction.fixOpportunitySignals].join('\n') : '',
            websiteExtraction,
            structuredQuickWins: quickWins,
            internalAgentBrief: analysis?.miniAudit ?? '',
            clientMiniAudit: '',
            generatedMiniAudit: '',
            generatedOutreach: '',
            generatedFollowUp: '',
            generatedOffer: '',
            selectedOfferAngle,
        };
        const nextLead: Lead = canonicalizeLeadEvidence(analysis ? {
            ...nextLeadBase,
            clientMiniAudit: generateMiniAudit(nextLeadBase),
            generatedMiniAudit: generateMiniAudit(nextLeadBase),
            generatedOutreach: generateFirstOutreach(nextLeadBase),
            generatedFollowUp: generateFollowUp(nextLeadBase),
            generatedOffer: generateOffer(nextLeadBase),
        } : nextLeadBase);

        setLeads((currentLeads) => [nextLead, ...currentLeads]);
        setSelectedLeadId(nextLead.id);
        setDraftLead(nextLead);
        setIsCreating(false);
        setLeadAgentSession((currentSession) => ({
            ...currentSession,
            candidates: currentSession.candidates.map((currentCandidate) =>
                currentCandidate.id === candidate.id ? { ...currentCandidate, addedLeadId: nextLead.id } : currentCandidate,
            ),
        }));
        setActiveScreen('detail');
    };

    const analyzeLeadFromDetail = async (lead: Lead) => {
        const runningLead: Lead = {
            ...lead,
            needsAgentAnalysis: true,
            latestAnalysisDiagnostic: {
                mode: 'real-api',
                analyzeProvider: 'unknown',
                userMessage: lead.websiteExtraction ? 'Probíhá obchodní analýza z extrahovaného vlastního webu.' : 'Probíhá agentní analýza z dostupných CRM podkladů.',
            },
            sourceLimitations: [...new Set([...lead.sourceLimitations, lead.websiteExtraction ? 'Probíhá obchodní analýza z extrahovaného vlastního webu.' : 'Probíhá agentní analýza z dostupných CRM podkladů.'])],
        };
        setDraftLead(runningLead);
        persistLead(runningLead);

        try {
            const analysisCandidate = candidateFromLead(runningLead);
            const response = await analyzeLead(analysisCandidate, runningLead.notes);

            if (!response.analysis) {
                const nextLead: Lead = {
                    ...runningLead,
                    latestAnalysisDiagnostic: response.diagnostic ?? { mode: 'error', analyzeProvider: 'unknown', userMessage: response.message },
                    sourceLimitations: [...new Set([...runningLead.sourceLimitations, response.diagnostic?.userMessage || response.message])],
                };
                persistLead(nextLead);
                return;
            }

            const normalizedAnalysis = normalizeAgentAnalysis(response.analysis, analysisCandidate);
            const analyzedLead = applyAgentAnalysisToLead(runningLead, normalizedAnalysis);
            persistLead({
                ...analyzedLead,
                latestAnalysisDiagnostic: response.diagnostic ?? { mode: normalizedAnalysis.provider === 'openai' ? 'real-api' : 'demo-fallback', analyzeProvider: normalizedAnalysis.provider, userMessage: response.message },
                agentAnalysisProvider: normalizedAnalysis.provider === 'legacy' ? 'fallback' : normalizedAnalysis.provider,
            });
        } catch (error) {
            persistLead({
                ...runningLead,
                latestAnalysisDiagnostic: {
                    mode: 'error',
                    analyzeProvider: 'unknown',
                    fallbackReason: 'client_exception',
                    userMessage: error instanceof Error ? error.message : 'Analýza z detailu leadu selhala.',
                },
                sourceLimitations: [...new Set([...runningLead.sourceLimitations, error instanceof Error ? error.message : 'Analýza z detailu leadu selhala.'])],
            });
        }
    };

    const analyzeLeadScreenshots = async (lead: Lead) => {
        if ((lead.screenshots ?? []).length === 0) {
            persistLead({
                ...lead,
                screenshotAnalysisDiagnostic: {
                    status: 'error',
                    provider: 'client',
                    fallbackReason: 'missing_images',
                    userMessage: 'Nejdřív nahraj alespoň jeden screenshot nebo fotku veřejné prezentace.',
                },
            });
            return;
        }

        const runningLead: Lead = {
            ...lead,
            screenshotAnalysisDiagnostic: { status: 'running', userMessage: 'Analyzuji screenshoty...' },
        };
        setDraftLead(runningLead);
        persistLead(runningLead);

        const response = await analyzeScreenshots({
            leadId: runningLead.id,
            leadName: runningLead.name,
            images: runningLead.screenshots,
            existingCandidateSummary: [runningLead.notes, runningLead.firstImpression, runningLead.businessOpportunity].filter(Boolean).join('\n'),
            publicLinks: runningLead.publicLinks,
        });

        if (!response.analysis) {
            persistLead({
                ...runningLead,
                screenshotAnalysisDiagnostic: response.diagnostic,
                sourceLimitations: [...new Set([...runningLead.sourceLimitations, response.diagnostic.userMessage || response.message])],
            });
            return;
        }

        const analysis = response.analysis;
        const quickWins = prepareFreeIdeas(runningLead, analysis.quickWins.slice(0, 3).map((win) => ({ ...win, id: `quick-win-${crypto.randomUUID()}` })));
        const nextLead: Lead = {
            ...runningLead,
            screenshotAnalysis: analysis,
            screenshotAnalysisDiagnostic: response.diagnostic,
            agentLeadStatus: runningLead.createdFromAgentAnalysis ? 'analyzed' : runningLead.agentLeadStatus,
            evidenceLevel: 'screenshot-analysis',
            needsAgentAnalysis: runningLead.createdFromAgentAnalysis ? false : runningLead.needsAgentAnalysis,
            extractionStatus: 'completed',
            firstImpression: analysis.photoFirstImpression,
            mainPhotoVerdict: analysis.mainPhotoVerdict,
            mainPhotoObservation: analysis.photoFirstImpression,
            betterPhotoSuggestion: analysis.mainPhotoVerdict === 'weak' ? analysis.photoOrderSuggestions[0] || '' : runningLead.betterPhotoSuggestion,
            photoOrderObservation: analysis.photoOrderSuggestions.join('\n'),
            strengths: analysis.visibleStrengths.join('\n'),
            risks: analysis.visibleWeaknesses.join('\n'),
            reviewSignals: analysis.reviewSignalsFromScreenshots.join('\n'),
            guestFrictionSignals: analysis.guestFrictionVisible.join('\n'),
            guestConfusion: analysis.guestFrictionVisible.join('\n'),
            businessOpportunity: analysis.otaPresentationObservations.join('\n'),
            structuredQuickWins: quickWins,
            quickWins: quickWins.map((win) => win.title),
            proposedQuickWins: quickWins.map((win) => win.title),
            publicSignals: [...new Set([...runningLead.publicSignals, ...analysis.visibleStrengths, ...analysis.otaPresentationObservations])],
            sourceLimitations: [...new Set([...runningLead.sourceLimitations, ...analysis.evidenceLimits, 'Vision analýza hodnotí jen nahrané screenshoty, ne celou OTA stránku.'])],
        };

        persistLead(nextLead);
    };

    const prepareAuditObservations = () => {
        const runningLead: Lead = { ...draftLead, extractionStatus: 'running' };
        setDraftLead(runningLead);

        const result = extractAuditObservations({
            leadName: runningLead.name,
            publicLinks: runningLead.publicLinks ?? [],
            sourceMaterials: runningLead.sourceMaterials ?? [],
        });
        const nextLead: Lead = {
            ...runningLead,
            extractionStatus: result.status,
            notes: result.message ? `${runningLead.notes}${runningLead.notes ? '\n\n' : ''}Extractor: ${result.message}` : runningLead.notes,
        };

        if (result.status === 'completed' && result.draft) {
            nextLead.firstImpression = result.draft.firstImpression;
            nextLead.strengths = result.draft.strengths;
            nextLead.reviewSignals = result.draft.reviewSignals;
            nextLead.guestFrictionSignals = result.draft.guestFrictionSignals;
            nextLead.guestConfusion = result.draft.guestConfusion;
            nextLead.risks = result.draft.risks;
            nextLead.businessOpportunity = result.draft.businessOpportunity;
            nextLead.mainPhotoVerdict = result.draft.mainPhotoVerdict;
            nextLead.mainPhotoObservation = result.draft.mainPhotoObservation;
            nextLead.checkInParkingInfo = result.draft.checkInParkingInfo;
            nextLead.structuredQuickWins = result.draft.structuredQuickWins;
            nextLead.publicSignals = result.draft.publicSignals;
            nextLead.selectedOfferAngle = result.draft.selectedOfferAngle;
            nextLead.status = 'Audit pripraven';
        }

        persistLead(nextLead);
    };

    const generateText = (field: 'internalAgentBrief' | 'clientMiniAudit' | 'generatedMiniAudit' | 'generatedOutreach' | 'generatedFollowUp' | 'generatedOffer') => {
        const generators = {
            internalAgentBrief: generateInternalAgentBrief,
            clientMiniAudit: generateMiniAudit,
            generatedMiniAudit: generateMiniAudit,
            generatedOutreach: generateFirstOutreach,
            generatedFollowUp: generateFollowUp,
            generatedOffer: generateOffer,
        };
        const generatedText = generators[field](draftLead);
        const nextLead = field === 'clientMiniAudit' || field === 'generatedMiniAudit'
            ? { ...draftLead, clientMiniAudit: generatedText, generatedMiniAudit: generatedText, freeIdeas: prepareFreeIdeas(draftLead, draftLead.structuredQuickWins) }
            : field === 'generatedOffer'
                ? { ...draftLead, generatedOffer: generatedText, paidNextStep: generatedText }
                : field === 'generatedOutreach'
                    ? { ...draftLead, generatedOutreach: generatedText, outreachIntent: 'ask-permission-to-send-free-ideas' as const, outreachTone: 'humble-transparent-low-pressure' as const }
                    : { ...draftLead, [field]: generatedText };

        persistLead(withProductRecommendation(nextLead));
    };

    const createGuestGuidePreviewForDraft = () => {
        const preview = createGuestGuidePreview(draftLead);
        const secondEmail = draftLead.guestGuideSecondEmail || createGuestGuideSecondEmail(draftLead, preview);
        const needsReview = draftLead.clientOutputStatus === 'draft-needs-review' || draftLead.evidenceClaimReady === false;

        persistLead({
            ...draftLead,
            guestGuidePreviewStatus: needsReview ? 'draft-needs-review' : 'created',
            guestGuidePreview: preview,
            guestGuideSecondEmail: secondEmail,
        });
    };

    const prepareGuestGuideSecondEmail = () => {
        const preview = draftLead.guestGuidePreview ?? createGuestGuidePreview(draftLead);
        const needsReview = draftLead.clientOutputStatus === 'draft-needs-review' || draftLead.evidenceClaimReady === false;

        persistLead({
            ...draftLead,
            guestGuidePreviewStatus: needsReview ? 'draft-needs-review' : draftLead.guestGuidePreviewStatus === 'not-created' ? 'created' : draftLead.guestGuidePreviewStatus,
            guestGuidePreview: preview,
            guestGuideSecondEmail: createGuestGuideSecondEmail(draftLead, preview),
        });
    };

    const copyText = (textId: string, value: string) => {
        if (!value.trim()) {
            return;
        }

        const markCopied = () => {
            setCopiedTextId(textId);
            window.setTimeout(() => setCopiedTextId(''), 1800);
        };

        const fallbackCopy = () => {
            const copyTarget = document.createElement('textarea');
            copyTarget.value = value;
            copyTarget.setAttribute('readonly', 'true');
            copyTarget.style.position = 'fixed';
            copyTarget.style.opacity = '0';
            document.body.appendChild(copyTarget);
            copyTarget.select();
            document.execCommand('copy');
            document.body.removeChild(copyTarget);
            markCopied();
        };

        fallbackCopy();

        if (navigator.clipboard) {
            void navigator.clipboard.writeText(value).catch(() => undefined);
        }
    };

    const exportRunJson = () => {
        downloadJsonFile(debugFileNames.run(leadAgentSession.runId), createRunDebugExport(leadAgentSession, { includeScreenshotDataUrls: includeScreenshotDataUrlsInExport }));
    };

    const exportCandidateJson = (candidate: LeadAgentCandidate) => {
        downloadJsonFile(
            debugFileNames.candidate(candidate.name || candidate.id),
            createCandidateDebugExport(candidate, { session: leadAgentSession, analysis: leadAgentSession.analyses[candidate.id], diagnostic: leadAgentSession.diagnostic }, { includeScreenshotDataUrls: includeScreenshotDataUrlsInExport }),
        );
    };

    const exportWebsiteExtractionJson = (extraction: WebsiteExtractionResult, candidate?: LeadAgentCandidate, lead?: Lead) => {
        downloadJsonFile(
            debugFileNames.websiteExtraction(candidate?.name || lead?.name || extraction.websiteUrl || 'website-extraction'),
            createWebsiteExtractionDebugExport(extraction, { candidate, lead, diagnostic: leadAgentSession.diagnostic }, { includeScreenshotDataUrls: includeScreenshotDataUrlsInExport }),
        );
    };

    const exportLeadJson = (lead: Lead) => {
        const analysis = lead.leadAgentRunId
            ? Object.values(leadAgentSession.analyses).find((candidateAnalysis) => candidateAnalysis.runId === lead.leadAgentRunId)
            : undefined;
        downloadJsonFile(
            debugFileNames.lead(lead.name || lead.id),
            createLeadDebugExport(lead, { diagnostics: leadAgentSession.diagnostic, analysis }, { includeScreenshotDataUrls: includeScreenshotDataUrlsInExport }),
        );
    };

    const exportGuestGuideConfig = (lead: Lead) => {
        const preview = lead.guestGuidePreview ?? createGuestGuidePreview(lead);
        downloadJsonFile(`stayboost-guest-guide-${preview.suggestedSlug}.json`, preview.configExport);
    };

    const renderScreen = () => {
        if (activeScreen === 'dashboard') {
            return <Dashboard leads={leads} stats={stats} onSelectLead={selectLead} />;
        }

        if (activeScreen === 'finder') {
            return (
                <LeadFinderPanel
                    onAddCandidate={addAgentCandidateToLeads}
                    onAnalyzeCandidate={analyzeAgentCandidate}
                    onCheckHealth={verifyAgentConfiguration}
                    onClearAllTestData={clearAllTestData}
                    onClearAnalysis={clearAgentAnalysis}
                    onContinueStoredSession={dismissStoredBanner}
                    onDeleteDemoData={deleteDemoData}
                    onDeleteResults={deleteAgentResults}
                    onExportCandidate={exportCandidateJson}
                    onExportRun={exportRunJson}
                    onExportWebsiteExtraction={exportWebsiteExtractionJson}
                    onNewSearch={() => resetAgentResults(true)}
                    onRejectCandidate={rejectAgentCandidate}
                    onExtractWebsite={extractCandidateWebsite}
                    extractingWebsiteCandidateIds={extractingWebsiteCandidateIds}
                    onRunDemo={runDemoLeadAgentSearch}
                    onRunSearch={runLeadAgentSearch}
                    onRunKnownTarget={runKnownTargetCheck}
                    onUpdateFilter={updateCandidateFilter}
                    onUpdateRequest={updateAgentRequest}
                    onUpdateSort={updateCandidateSort}
                    session={leadAgentSession}
                />
            );
        }

        if (activeScreen === 'leads') {
            return <LeadList leads={leads} onCreateLead={startNewLead} onDeleteLead={deleteLead} onSelectLead={selectLead} selectedLeadId={selectedLeadId} />;
        }

        if (!selectedLead && !isCreating) {
            return <EmptyState onCreateLead={startNewLead} />;
        }

        if (activeScreen === 'audit') {
            return (
                <AuditPanel
                    copiedTextId={copiedTextId}
                    draftLead={draftLead}
                    onAnalyzeScreenshots={analyzeLeadScreenshots}
                    onChange={updateDraft}
                    onCopyText={copyText}
                    onGenerateText={generateText}
                    onPrepareAudit={prepareAuditObservations}
                    onSave={saveDraft}
                />
            );
        }

        if (activeScreen === 'outreach') {
            return (
                <OutreachPanel
                    copiedTextId={copiedTextId}
                    draftLead={draftLead}
                    onChange={updateDraft}
                    onCopyText={copyText}
                    onGenerateText={generateText}
                    onPrepareAudit={prepareAuditObservations}
                    onSave={saveDraft}
                />
            );
        }

        if (activeScreen === 'offer') {
            return (
                <OfferPanel
                    copiedTextId={copiedTextId}
                    draftLead={draftLead}
                    onChange={updateDraft}
                    onCopyText={copyText}
                    onGenerateText={generateText}
                    onSave={saveDraft}
                />
            );
        }

        return (
            <LeadDetail
                copiedTextId={copiedTextId}
                draftLead={draftLead}
                isCreating={isCreating}
                    onAnalyzeLead={analyzeLeadFromDetail}
                    onAnalyzeScreenshots={analyzeLeadScreenshots}
                onChange={updateDraft}
                onCopyText={copyText}
                onCreateGuestGuidePreview={createGuestGuidePreviewForDraft}
                onDeleteLead={deleteLead}
                onExportGuestGuideConfig={exportGuestGuideConfig}
                onExportLead={exportLeadJson}
                onExportWebsiteExtraction={exportWebsiteExtractionJson}
                onGenerateText={generateText}
                includeScreenshotDataUrlsInExport={includeScreenshotDataUrlsInExport}
                onToggleIncludeScreenshotDataUrls={setIncludeScreenshotDataUrlsInExport}
                onPrepareAudit={prepareAuditObservations}
                onPrepareGuestGuideSecondEmail={prepareGuestGuideSecondEmail}
                onSave={saveDraft}
            />
        );
    };

    return (
        <div className="app-shell">
            <aside className="sidebar">
                <div className="brand">
                    <div className="brand-mark">SB</div>
                    <div>
                        <p>StayBoost</p>
                        <span>Agent MVP</span>
                    </div>
                </div>

                <nav className="nav-list" aria-label="Hlavni navigace">
                    {(Object.keys(screenLabels) as Screen[]).map((screen) => {
                        const Icon = screenIcons[screen];
                        return (
                            <button
                                className={activeScreen === screen ? 'nav-item active' : 'nav-item'}
                                key={screen}
                                onClick={() => setActiveScreen(screen)}
                                type="button"
                            >
                                <Icon size={18} aria-hidden="true" />
                                <span>{screenLabels[screen]}</span>
                            </button>
                        );
                    })}
                </nav>
            </aside>

            <main className="workspace">
                <header className="topbar">
                    <div>
                        <p className="eyebrow">Interni workflow pro Davida</p>
                        <h1>{screenLabels[activeScreen]}</h1>
                    </div>
                    <button className="primary-button" onClick={startNewLead} type="button">
                        <Plus size={18} aria-hidden="true" />
                        Novy lead
                    </button>
                </header>

                {renderScreen()}
            </main>
        </div>
    );
}

interface DashboardProps {
    leads: Lead[];
    stats: { total: number; followUps: number; readyAudits: number; contacted: number };
    onSelectLead: (leadId: string, nextScreen?: Screen) => void;
}

function Dashboard({ leads, stats, onSelectLead }: DashboardProps) {
    const nextFollowUps = leads.filter((lead) => lead.nextFollowUpDate).slice(0, 4);

    return (
        <section className="screen-grid">
            <div className="metric-card">
                <span>Leady celkem</span>
                <strong>{stats.total}</strong>
            </div>
            <div className="metric-card">
                <span>Audity pripravene</span>
                <strong>{stats.readyAudits}</strong>
            </div>
            <div className="metric-card">
                <span>Kontaktovano</span>
                <strong>{stats.contacted}</strong>
            </div>
            <div className="metric-card">
                <span>Follow-upy</span>
                <strong>{stats.followUps}</strong>
            </div>

            <div className="panel wide-panel">
                <div className="panel-header">
                    <div>
                        <p className="eyebrow">Priorita</p>
                        <h2>Dalsi follow-upy</h2>
                    </div>
                </div>
                <div className="lead-stack">
                    {nextFollowUps.map((lead) => (
                        <button className="lead-row" key={lead.id} onClick={() => onSelectLead(lead.id, 'offer')} type="button">
                            <span>
                                <strong>{lead.name}</strong>
                                <small>{lead.city}</small>
                            </span>
                            <em>{lead.nextFollowUpDate}</em>
                        </button>
                    ))}
                </div>
            </div>
        </section>
    );
}

interface LeadFinderPanelProps {
    session: LeadAgentSession;
    onUpdateRequest: <Field extends keyof LeadAgentSearchRequest>(field: Field, value: LeadAgentSearchRequest[Field]) => void;
    onRunSearch: () => void;
    onNewSearch: () => void;
    onDeleteResults: () => void;
    onDeleteDemoData: () => void;
    onClearAllTestData: () => void;
    onContinueStoredSession: () => void;
    onUpdateFilter: (filter: LeadAgentCandidateFilter) => void;
    onUpdateSort: (sort: LeadAgentCandidateSort) => void;
    onCheckHealth: () => void;
    onRunDemo: () => void;
    onRunKnownTarget: () => void;
    onAnalyzeCandidate: (candidate: LeadAgentCandidate) => void;
    onClearAnalysis: (candidateId: string) => void;
    onExtractWebsite: (candidate: LeadAgentCandidate) => void;
    onExportRun: () => void;
    onExportCandidate: (candidate: LeadAgentCandidate) => void;
    onExportWebsiteExtraction: (extraction: WebsiteExtractionResult, candidate?: LeadAgentCandidate) => void;
    extractingWebsiteCandidateIds: string[];
    onAddCandidate: (candidate: LeadAgentCandidate) => void;
    onRejectCandidate: (candidateId: string) => void;
}

function LeadFinderPanel({
    onAddCandidate,
    onAnalyzeCandidate,
    onCheckHealth,
    onClearAllTestData,
    onClearAnalysis,
    onContinueStoredSession,
    onDeleteResults,
    onDeleteDemoData,
    onExtractWebsite,
    onExportCandidate,
    onExportRun,
    onExportWebsiteExtraction,
    onNewSearch,
    onRejectCandidate,
    onRunSearch,
    onRunDemo,
    onRunKnownTarget,
    onUpdateFilter,
    onUpdateRequest,
    onUpdateSort,
    extractingWebsiteCandidateIds,
    session,
}: LeadFinderPanelProps) {
    const hasStoredResults = session.loadedFromStorage && !session.storedBannerDismissed && (session.candidates.length > 0 || Object.keys(session.analyses).length > 0);
    const renderCandidates = session.candidates.map(normalizeAgentCandidate);
    const filteredCandidates = renderCandidates.filter((candidate) => {
        const isHidden = candidate.rejected || session.dismissedCandidateIds.includes(candidate.id);

        if (session.candidateFilter === 'hidden') return isHidden;
        if (isHidden) return false;
        if (session.candidateFilter === 'fix-leads') return candidate.opportunityType === 'fix-existing-process';
        if (session.candidateFilter === 'setup-leads') return candidate.opportunityType === 'setup-automation';
        if (session.candidateFilter === 'with-contact') return !candidate.contactMissing;
        if (session.candidateFilter === 'without-contact') return candidate.contactMissing;
        if (session.candidateFilter === 'benchmark-or-skip') return ['benchmark', 'skip'].includes(candidate.opportunityType) || candidate.fitVerdict === 'skip';
        if (session.candidateFilter === 'good-leads') return ['strong-opportunity', 'moderate-opportunity'].includes(candidate.fitVerdict);
        if (session.candidateFilter === 'pain-signals') return candidate.painSignals.length > 0;
        if (session.candidateFilter === 'no-pain-or-skip') return candidate.painSignals.length === 0 || ['weak-opportunity', 'not-enough-evidence', 'skip'].includes(candidate.fitVerdict);
        if (session.candidateFilter === 'benchmark-solved') return candidate.positiveSolvedSignals.length > 0 && candidate.painSignals.length === 0;
        if (session.candidateFilter === 'weak-or-skip') return ['weak-opportunity', 'not-enough-evidence', 'skip'].includes(candidate.fitVerdict);
        if (session.candidateFilter === 'website-extracted') return ['completed', 'partial'].includes(candidate.websiteExtraction?.status ?? '');
        if (session.candidateFilter === 'setup-opportunity') return candidate.websiteExtraction?.setupOpportunitySignals.length ? true : candidate.opportunityType === 'setup-automation';
        if (session.candidateFilter === 'fix-opportunity') return candidate.websiteExtraction?.fixOpportunitySignals.length ? true : candidate.opportunityType === 'fix-existing-process';
        if (session.candidateFilter === 'without-own-website') return !hasOwnWebsiteUrl(candidate);
        return true;
    });
    const visibleCandidates = [...filteredCandidates].sort((first, second) => {
        if (session.candidateSort === 'websiteExtracted') return Number(Boolean(second.websiteExtraction)) - Number(Boolean(first.websiteExtraction));
        if (session.candidateSort === 'contactFirst') return Number(!second.contactMissing) - Number(!first.contactMissing);
        if (session.candidateSort === 'setupOpportunity') return (second.websiteExtraction?.setupOpportunitySignals.length ?? 0) - (first.websiteExtraction?.setupOpportunitySignals.length ?? 0);
        if (session.candidateSort === 'fixOpportunity') return (second.websiteExtraction?.fixOpportunitySignals.length ?? 0) - (first.websiteExtraction?.fixOpportunitySignals.length ?? 0);
        if (session.candidateSort === 'automationNeedScore') return second.automationNeedScore - first.automationNeedScore;
        if (session.candidateSort === 'reviewFrictionScore') return second.reviewFrictionScore - first.reviewFrictionScore;
        if (session.candidateSort === 'leadScore') return second.leadScore - first.leadScore;
        if (session.candidateSort === 'newest') return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
        return second.opportunityScore - first.opportunityScore;
    });

    return (
        <section className="finder-layout">
            <div className="panel form-panel finder-form">
                <div className="panel-header">
                    <div>
                        <p className="eyebrow">Agentni workflow</p>
                        <h2>Spustit Lead Finder Agenta</h2>
                    </div>
                    <div className="button-group">
                        <button className="secondary-button" onClick={onNewSearch} type="button">
                            Nové hledání
                        </button>
                        <button className="secondary-button" onClick={onDeleteResults} type="button">
                            Smazat výsledky hledání
                        </button>
                        <button className="secondary-button" disabled={session.candidates.length === 0 && !session.diagnostic} onClick={onExportRun} type="button">
                            <Clipboard size={18} aria-hidden="true" />
                            Exportovat run JSON
                        </button>
                        <button className="secondary-button" onClick={onCheckHealth} type="button">
                            <Sparkles size={18} aria-hidden="true" />
                            Ověřit konfiguraci agenta
                        </button>
                        <button className="secondary-button" onClick={onRunDemo} type="button">
                            Zobrazit demo kandidáty
                        </button>
                        <button className="secondary-button danger-button" onClick={onDeleteDemoData} type="button">
                            Smazat demo data
                        </button>
                        <button className="secondary-button danger-button" onClick={onClearAllTestData} type="button">
                            Smazat všechna testovací data
                        </button>
                        <button className="primary-button" disabled={session.status === 'searching'} onClick={onRunSearch} type="button">
                            <Search size={18} aria-hidden="true" />
                            {session.status === 'searching' ? 'Hledam...' : 'Najit potencialni klienty'}
                        </button>
                    </div>
                </div>

                <div className="scope-note">
                    Reálné leady vznikají jen z provideru Tavily. Demo kandidáti slouží pouze pro test UI a nejsou skuteční klienti.
                    Website Extractor čte pouze vlastní veřejný web provozu. OTA profily jako Booking/Airbnb/Google Maps automaticky neprochází a neposílá e-maily automaticky.
                </div>

                {session.isMock ? <div className="scope-note demo-note demo-mode-banner"><strong>DEMO REŽIM — tito kandidáti jsou fiktivní</strong><span>Nepřidávej je jako reálné obchodní leady; slouží jen pro test UI.</span></div> : null}

                {session.diagnostic?.discoverProvider === 'error' ? (
                    <div className="scope-note error-note">
                        <strong>{session.message}</strong>
                        <span>Zkontroluj Netlify Functions logs pro discover-leads.</span>
                        <span>Ověř TAVILY_API_KEY.</span>
                        <span>Zkus menší max výsledků.</span>
                    </div>
                ) : null}

                {session.diagnostic?.partial && session.candidates.length > 0 ? (
                    <div className="scope-note partial-note">
                        <strong>Zobrazeny částečné výsledky, některé search dotazy vytimeoutovaly.</strong>
                        <span>Pokračuj analýzou konkrétního kandidáta; hlubší enrichment neběží v první discovery fázi.</span>
                    </div>
                ) : null}

                {hasStoredResults ? (
                    <div className="scope-note stored-note">
                        Zobrazuješ uložené výsledky z předchozího běhu.
                        <div className="button-group inline-actions">
                            <button className="secondary-button compact-button" onClick={onContinueStoredSession} type="button">Pokračovat</button>
                            <button className="secondary-button compact-button" onClick={onNewSearch} type="button">Nové hledání</button>
                            <button className="secondary-button compact-button danger-button" onClick={onDeleteResults} type="button">Smazat výsledky</button>
                        </div>
                    </div>
                ) : null}

                <div className="form-grid">
                    <label>
                        Mesto / oblast
                        <input value={session.request.location} onChange={(event) => onUpdateRequest('location', event.target.value)} />
                    </label>
                    <label>
                        Typ ubytovani
                        <input value={session.request.accommodationType} onChange={(event) => onUpdateRequest('accommodationType', event.target.value)} />
                    </label>
                    <label>
                        Cilovy segment
                        <input value={session.request.segment} onChange={(event) => onUpdateRequest('segment', event.target.value)} />
                    </label>
                    <label>
                        Max vysledku
                        <input min={1} max={20} type="number" value={session.request.maxResults} onChange={(event) => onUpdateRequest('maxResults', Number(event.target.value))} />
                    </label>
                    <label className="full-width">
                        Poznamky pro agenta
                        <textarea value={session.request.notes} onChange={(event) => onUpdateRequest('notes', event.target.value)} rows={5} />
                    </label>
                </div>

                <div className="known-target-box">
                    <div className="panel-header compact-header">
                        <div>
                            <p className="eyebrow">Znamy cil / konkretni provoz</p>
                            <h2>Proverit jeden provoz</h2>
                        </div>
                        <button className="secondary-button" disabled={session.status === 'searching' || (!session.request.knownTargetName?.trim() && !session.request.knownTargetWebsiteUrl?.trim())} onClick={onRunKnownTarget} type="button">
                            <Search size={18} aria-hidden="true" />
                            Proverit konkretni provoz
                        </button>
                    </div>
                    <div className="form-grid compact-form-grid">
                        <label>
                            Nazev provozu
                            <input value={session.request.knownTargetName || ''} onChange={(event) => onUpdateRequest('knownTargetName', event.target.value)} />
                        </label>
                        <label>
                            Mesto
                            <input value={session.request.knownTargetCity || ''} onChange={(event) => onUpdateRequest('knownTargetCity', event.target.value)} />
                        </label>
                        <label>
                            Web URL
                            <input value={session.request.knownTargetWebsiteUrl || ''} onChange={(event) => onUpdateRequest('knownTargetWebsiteUrl', event.target.value)} />
                        </label>
                        <label>
                            E-mail
                            <input value={session.request.knownTargetEmail || ''} onChange={(event) => onUpdateRequest('knownTargetEmail', event.target.value)} />
                        </label>
                        <label className="full-width">
                            Poznamka
                            <textarea value={session.request.knownTargetNote || ''} onChange={(event) => onUpdateRequest('knownTargetNote', event.target.value)} rows={3} />
                        </label>
                    </div>
                </div>
            </div>

            <aside className="panel query-box">
                <p className="eyebrow">Stav agenta</p>
                <h2>{session.status}</h2>
                <p className="section-help">{session.message || 'Zadej lokalitu a segment, potom spust hledani.'}</p>
                <div className="diagnostic-box">
                    <p className="eyebrow">Beh</p>
                    <span>Run ID: {session.runId}</span>
                    <span>Created: {formatDateTime(session.createdAt)}</span>
                    <span>Discovery provider: {session.diagnostic?.discoverProvider ?? 'unknown'}</span>
                    <span>isMock: {session.isMock ? 'true' : 'false'}</span>
                    <span>source: {session.diagnostic?.source ?? (session.isMock ? 'demo fallback' : session.diagnostic?.discoverProvider === 'tavily' ? 'real API' : 'error')}</span>
                    <span>{session.loadedFromStorage ? 'Vysledek je ulozeny z predchoziho behu.' : 'Aktualni beh v tomto otevreni aplikace.'}</span>
                </div>
                <AgentDiagnosticBox diagnostic={session.diagnostic} />
                <AgentHealthBox health={session.health} message={session.healthMessage} />
            </aside>

            <div className="panel finder-results">
                <div className="panel-header">
                    <div>
                        <p className="eyebrow">Kandidati ke schvaleni</p>
                        <h2>Vyhodnocene nalezy</h2>
                    </div>
                    <span className="status-pill">{visibleCandidates.length} kandidatu</span>
                </div>

                <div className="table-toolbar">
                    <label>
                        Filtr
                        <select value={session.candidateFilter} onChange={(event) => onUpdateFilter(event.target.value as LeadAgentCandidateFilter)}>
                            <option value="all">Vše</option>
                            <option value="fix-leads">Fix leads</option>
                            <option value="setup-leads">Setup leads</option>
                            <option value="with-contact">Jen s kontaktem</option>
                            <option value="without-contact">Bez kontaktu</option>
                            <option value="website-extracted">Jen s extrahovaným webem</option>
                            <option value="setup-opportunity">Setup opportunity</option>
                            <option value="fix-opportunity">Fix opportunity</option>
                            <option value="without-own-website">Bez vlastního webu</option>
                            <option value="benchmark-or-skip">Benchmark / skip</option>
                            <option value="hidden">Skryté</option>
                        </select>
                    </label>
                    <label>
                        Razeni
                        <select value={session.candidateSort} onChange={(event) => onUpdateSort(event.target.value as LeadAgentCandidateSort)}>
                            <option value="opportunityScore">Nejvyssi opportunityScore</option>
                            <option value="automationNeedScore">Nejvyssi automationNeedScore</option>
                            <option value="reviewFrictionScore">Nejvyssi reviewFrictionScore</option>
                            <option value="leadScore">Nejvyssi leadScore</option>
                            <option value="newest">Nejnovejsi</option>
                            <option value="websiteExtracted">Web přečtený první</option>
                            <option value="contactFirst">Kontakt první</option>
                            <option value="setupOpportunity">Setup opportunity z webu</option>
                            <option value="fixOpportunity">Fix opportunity z webu</option>
                        </select>
                    </label>
                </div>

                {visibleCandidates.length === 0 ? (
                    <div className="empty-state compact-empty">
                        <h2>Zatim nejsou vytvoreni zadni kandidati</h2>
                        <p>Spust reálné hledání přes Tavily. Pokud discovery selže, demo kandidáti se nezobrazí automaticky; otevřeš je jen tlačítkem Zobrazit demo kandidáty.</p>
                    </div>
                ) : (
                    <div className="table-wrap">
                        <table className="candidate-table">
                            <thead>
                                <tr>
                                    <th>Nazev</th>
                                    <th>Lokalita</th>
                                    <th>Typ</th>
                                    <th>Skore</th>
                                    <th>Prilezitost</th>
                                    <th>Typ prilezitosti</th>
                                    <th>Automation need</th>
                                    <th>Review pain</th>
                                    <th>Kontakt</th>
                                    <th>Duvod</th>
                                    <th>Zdroje</th>
                                    <th>Signaly</th>
                                    <th>Uhel</th>
                                    <th>Akce</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleCandidates.map((candidate) => {
                                    const analysis = session.analyses[candidate.id];
                                    const canAddCandidate = ['strong-opportunity', 'moderate-opportunity'].includes(candidate.fitVerdict) && ['fix-existing-process', 'setup-automation'].includes(candidate.opportunityType);
                                    const canExtractWebsite = hasOwnWebsiteUrl(candidate);
                                    const isExtractingWebsite = extractingWebsiteCandidateIds.includes(candidate.id);
                                    const addCandidate = () => {
                                        if (!canAddCandidate) {
                                            const confirmed = window.confirm('Tento kandidát nemá silnou prodejní příležitost podle dostupné evidence. Přesto přidat do leadů?');
                                            if (!confirmed) return;
                                        }

                                        onAddCandidate(candidate);
                                    };

                                    return (
                                    <tr className={[['skip', 'weak-opportunity', 'not-enough-evidence'].includes(candidate.fitVerdict) ? 'weak-candidate-row' : '', candidate.isMock ? 'demo-candidate-row' : ''].filter(Boolean).join(' ')} key={candidate.id}>
                                        <td>
                                            {candidate.isMock ? <span className="demo-badge">FIKTIVNÍ</span> : null}
                                            {!candidate.isMock && session.diagnostic?.discoverProvider === 'tavily' ? <span className="quick-badge">Rychlý nález</span> : null}
                                            <span className="evidence-badge">{evidenceBadgeForCandidate(candidate, analysis)}</span>
                                            {!analysis ? <span className="evidence-badge warning-evidence">Needs web/analysis</span> : null}
                                            <strong>{candidate.isMock && !candidate.name.startsWith('DEMO') ? `DEMO — ${candidate.name}` : candidate.name}</strong>
                                            <small>{candidate.isMock ? 'Demo výsledek - není skutečný klient' : candidate.possibleEmail || 'Kontakt neznamy'}</small>
                                            {!candidate.isMock && session.diagnostic?.discoverProvider === 'tavily' ? <small>Vyžaduje analýzu</small> : null}
                                            <small>Run: {candidate.runId}</small>
                                            <small>{candidate.isLegacy ? 'uložené z předchozí verze' : candidate.runId === session.runId && !session.loadedFromStorage ? 'aktuální běh' : 'uložené z předchozího běhu'}</small>
                                        </td>
                                        <td>{candidate.location || 'Neuvedeno'}</td>
                                        <td>{candidate.type}</td>
                                        <td>
                                            <strong className="score-value">{candidate.leadScore}</strong>
                                        </td>
                                        <td>
                                            <strong className="score-value">{candidate.opportunityScore}</strong>
                                            <small>{candidate.fitVerdict}</small>
                                            <small>{candidate.confidence}</small>
                                        </td>
                                        <td>
                                            <strong>{candidate.opportunityType}</strong>
                                            <small>{candidate.offerHypothesis}</small>
                                        </td>
                                        <td>
                                            <strong className="score-value">{candidate.automationNeedScore}</strong>
                                            <small>Maturity {candidate.publicMaturityScore}</small>
                                            <small>{candidate.missingAutomationSignals.length} missing signals</small>
                                        </td>
                                        <td>
                                            <strong className="score-value">{candidate.reviewFrictionScore}</strong>
                                            <small>{candidate.painSignals.length} pain signals</small>
                                            <small>{candidate.targetOffer}</small>
                                        </td>
                                        <td>{candidate.contactMissing ? 'neznamy' : 'znamy'}</td>
                                        <td>
                                            {candidate.evidenceSummary}
                                            <small>{candidate.qualificationReason}</small>
                                            <small>{candidate.offerHypothesis}</small>
                                            {candidate.noPainReason ? <small>{candidate.noPainReason}</small> : null}
                                        </td>
                                        <td>
                                            <div className="source-list">
                                                {candidate.sourceUrls.map((url) => (
                                                    <a href={url} key={url} rel="noreferrer" target="_blank">Odkaz</a>
                                                ))}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="signal-list">
                                                {candidate.signals.length > 0 ? candidate.signals.map((signal) => <span key={signal}>{signal}</span>) : <span>Bez signalu</span>}
                                            </div>
                                            <div className="qualification-lists">
                                                {candidate.painSignals.length > 0 ? (
                                                    <div>
                                                        <p className="eyebrow">Pain signals</p>
                                                        {candidate.painSignals.map((signal) => <span className="pain-chip" key={signal}>{signal}</span>)}
                                                    </div>
                                                ) : null}
                                                {candidate.positiveSolvedSignals.length > 0 ? (
                                                    <div>
                                                        <p className="eyebrow">Positive solved</p>
                                                        {candidate.positiveSolvedSignals.map((signal) => <span className="solved-chip" key={signal}>{signal}</span>)}
                                                    </div>
                                                ) : null}
                                                {candidate.missingAutomationSignals.length > 0 ? (
                                                    <div>
                                                        <p className="eyebrow">Missing automation</p>
                                                        {candidate.missingAutomationSignals.map((signal) => <span className="setup-chip" key={signal}>{signal}</span>)}
                                                    </div>
                                                ) : null}
                                                {candidate.contactSignals.length > 0 ? (
                                                    <div>
                                                        <p className="eyebrow">Contact / website</p>
                                                        {[...candidate.contactSignals, ...candidate.websiteSignals].slice(0, 5).map((signal) => <span className="contact-chip" key={signal}>{signal}</span>)}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </td>
                                        <td>{offerAngleLabels[candidate.recommendedAngle]}</td>
                                        <td>
                                            <div className="table-actions">
                                                <button className={analysis ? 'secondary-button compact-button' : 'primary-button compact-button'} onClick={() => onAnalyzeCandidate(candidate)} type="button">
                                                    <Sparkles size={16} aria-hidden="true" />
                                                    Analyzovat
                                                </button>
                                                {canExtractWebsite ? (
                                                    <button className="secondary-button compact-button" disabled={isExtractingWebsite} onClick={() => onExtractWebsite(candidate)} type="button">
                                                        <Search size={16} aria-hidden="true" />
                                                        {isExtractingWebsite ? 'Extrahuji web...' : 'Extrahovat web'}
                                                    </button>
                                                ) : (
                                                    <div className="scope-note warning-note compact-warning">Vlastní web nenalezen</div>
                                                )}
                                                {!canAddCandidate ? (
                                                    <div className="scope-note warning-note compact-warning">Slaby/skip kandidat. Neposilat osloveni bez dalsiho overeni kontaktu, painu nebo setup mezery.</div>
                                                ) : null}
                                                <button className="secondary-button compact-button" onClick={() => onExportCandidate(candidate)} type="button">
                                                    <Clipboard size={16} aria-hidden="true" />
                                                    Exportovat kandidáta JSON
                                                </button>
                                                <button className="secondary-button compact-button" disabled={Boolean(candidate.addedLeadId) || !canAddCandidate} onClick={addCandidate} type="button">
                                                    <Plus size={16} aria-hidden="true" />
                                                    {candidate.addedLeadId ? 'Pridano' : 'Pridat do leadu'}
                                                </button>
                                                <button className="secondary-button compact-button danger-button" onClick={() => onRejectCandidate(candidate.id)} type="button">
                                                    Odebrat z výsledků
                                                </button>
                                            </div>
                                            {candidate.websiteExtraction ? <WebsiteExtractionPanel extraction={candidate.websiteExtraction} onExport={() => onExportWebsiteExtraction(candidate.websiteExtraction as WebsiteExtractionResult, candidate)} /> : null}
                                            {analysis ? <AgentAnalysisPreview analysis={analysis} diagnostic={session.diagnostic} onClear={() => onClearAnalysis(candidate.id)} /> : null}
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}

function WebsiteExtractionPanel({ extraction, onExport }: { extraction: WebsiteExtractionResult; onExport?: () => void }) {
    const hasContact = extraction.contact.emails.length > 0 || extraction.contact.phones.length > 0;

    return (
        <div className="analysis-preview website-extraction-preview">
            <div className="analysis-preview-header">
                <div>
                    <p className="eyebrow">Website extraction</p>
                    <strong>{extraction.status}</strong>
                    <span>{extraction.summary}</span>
                </div>
                {onExport ? (
                    <button className="secondary-button compact-button" onClick={onExport} type="button">
                        <Clipboard size={16} aria-hidden="true" />
                        Exportovat extrakci JSON
                    </button>
                ) : null}
            </div>
            <div className="metadata-row">
                <span>{extraction.provider}</span>
                <span>kontakt nalezen: {hasContact ? 'ano' : 'ne'}</span>
                <span>valid pages: {extraction.validPagesCount ?? extraction.pagesExtracted.length}</span>
                <span>skipped pages: {extraction.invalidPagesCount ?? extraction.skippedPages?.length ?? 0}</span>
                <span>partial: {extraction.debug.partial ? 'ano' : 'ne'}</span>
            </div>
            <div className="analysis-grid">
                <div>
                    <p className="eyebrow">Kontakty</p>
                    {extraction.contact.emails.length > 0 ? extraction.contact.emails.map((email) => <span key={email}>{email}</span>) : <span>E-mail nenalezen</span>}
                    {extraction.contact.phones.map((phone) => <span key={phone}>{phone}</span>)}
                    {extraction.contact.contactPageUrl ? <a href={extraction.contact.contactPageUrl} rel="noreferrer" target="_blank">Kontakt stránka</a> : null}
                </div>
                <div>
                    <p className="eyebrow">Stránky</p>
                    {extraction.pagesExtracted.length > 0 ? extraction.pagesExtracted.map((page) => <a href={page.url} key={page.url} rel="noreferrer" target="_blank">{page.title || page.url} ({page.contentLength})</a>) : <span>Žádná stránka nebyla přečtena.</span>}
                </div>
                <div>
                    <p className="eyebrow">Skipped pages</p>
                    {(extraction.skippedPages ?? []).length > 0 ? (extraction.skippedPages ?? []).map((page) => <span key={page.url}>{page.title || page.url}: {page.reason}</span>) : <span>Žádná stránka nebyla přeskočena.</span>}
                </div>
                <div>
                    <p className="eyebrow">Hlavní signály</p>
                    {[...extraction.websiteSignals, ...extraction.arrivalSignals, ...extraction.parkingSignals, ...extraction.faqSignals].slice(0, 8).map((signal) => <span key={signal}>{signal}</span>)}
                </div>
                <div>
                    <p className="eyebrow">Setup opportunity</p>
                    {extraction.setupOpportunitySignals.length > 0 ? extraction.setupOpportunitySignals.map((signal) => <span key={signal}>{signal}</span>) : <span>Bez setup signálu z webu.</span>}
                </div>
                <div>
                    <p className="eyebrow">Fix opportunity</p>
                    {extraction.fixOpportunitySignals.length > 0 ? extraction.fixOpportunitySignals.map((signal) => <span key={signal}>{signal}</span>) : <span>Bez fix signálu z webu.</span>}
                </div>
                <div>
                    <p className="eyebrow">Evidence limits</p>
                    {extraction.evidenceLimits.map((limit) => <span key={limit}>{limit}</span>)}
                </div>
            </div>
        </div>
    );
}

function AgentDiagnosticBox({ diagnostic }: { diagnostic?: LeadAgentDiagnostic }) {
    if (!diagnostic) return null;

    return (
        <div className="diagnostic-box">
            <p className="eyebrow">Diagnostika</p>
            {diagnostic.discoverProvider ? <span>Discovery provider: {diagnostic.discoverProvider}</span> : null}
            {diagnostic.analyzeProvider ? <span>Analysis provider: {diagnostic.analyzeProvider}</span> : null}
            {diagnostic.source ? <span>Source: {diagnostic.source}</span> : null}
            {diagnostic.fallbackReason ? <span>Fallback reason: {diagnostic.fallbackReason}</span> : null}
            {diagnostic.httpStatus ? <span>HTTP status: {diagnostic.httpStatus}</span> : null}
            {typeof diagnostic.elapsedMs === 'number' ? <span>Elapsed: {diagnostic.elapsedMs} ms</span> : null}
            {typeof diagnostic.partial === 'boolean' ? <span>Partial: {diagnostic.partial ? 'true' : 'false'}</span> : null}
            {typeof diagnostic.queriesSucceeded === 'number' && typeof diagnostic.queriesAttempted === 'number' ? <span>Queries: {diagnostic.queriesSucceeded}/{diagnostic.queriesAttempted}</span> : null}
            {typeof diagnostic.queriesTimedOut === 'number' ? <span>Queries timed out: {diagnostic.queriesTimedOut}</span> : null}
            {typeof diagnostic.timeoutBudgetMs === 'number' ? <span>Timeout budget: {diagnostic.timeoutBudgetMs} ms</span> : null}
            {typeof diagnostic.skippedHeavyEnrichment === 'boolean' ? <span>Skipped heavy enrichment: {diagnostic.skippedHeavyEnrichment ? 'true' : 'false'}</span> : null}
            {diagnostic.debugId ? <span>Debug ID: {diagnostic.debugId}</span> : null}
            {typeof diagnostic.hasOpenAIKey === 'boolean' ? <span>OpenAI key: {diagnostic.hasOpenAIKey ? 'OK' : 'chybi'}</span> : null}
            {diagnostic.model ? <span>Model: {diagnostic.model}</span> : null}
            {diagnostic.rawOutputKind ? <span>Raw output kind: {diagnostic.rawOutputKind}</span> : null}
            {diagnostic.sanitizedOutputSample || diagnostic.sanitizedSample ? <span>Sanitized sample: {diagnostic.sanitizedOutputSample || diagnostic.sanitizedSample}</span> : null}
            <span>{diagnostic.userMessage}</span>
        </div>
    );
}

function AgentHealthBox({ health, message }: { health?: LeadAgentHealth; message?: string }) {
    if (!health && !message) return null;

    return (
        <div className="diagnostic-box">
            <p className="eyebrow">Konfigurace</p>
            {message ? <span>{message}</span> : null}
            {health ? (
                <>
                    <span>Runtime: {health.runtime}</span>
                    <span>Tavily key: {health.hasTavilyKey ? 'OK' : 'chybi'}</span>
                    <span>OpenAI key: {health.hasOpenAIKey ? 'OK' : 'chybi'}</span>
                    <span>Model: {health.openAIModel || 'nenastaveno'}</span>
                    <span>Timestamp: {health.timestamp}</span>
                </>
            ) : null}
        </div>
    );
}

function AgentAnalysisPreview({ analysis, diagnostic, onClear }: { analysis: LeadAgentAnalysis; diagnostic?: LeadAgentDiagnostic; onClear: () => void }) {
    return (
        <div className="analysis-preview">
            <div className="analysis-preview-header">
                <div>
                    <p className="eyebrow">Analyza</p>
                    <strong>{analysis.firstImpression}</strong>
                </div>
                <button className="secondary-button compact-button" onClick={onClear} type="button">Vymazat analýzu</button>
            </div>
            <div className="metadata-row">
                <span>{analysis.fitVerdict}</span>
                <span>{analysis.opportunityType}</span>
                <span>Opportunity {analysis.opportunityScore}</span>
                <span>Automation {analysis.automationNeedScore}</span>
                <span>Review pain {analysis.reviewFrictionScore}</span>
                <span>{analysis.targetOffer}</span>
                <span>{analysis.confidence}</span>
                <span>{analysis.provider}</span>
                <span>{analysis.model || 'bez modelu'}</span>
                <span>{formatDateTime(analysis.analyzedAt)}</span>
            </div>
            {diagnostic?.analyzeProvider && diagnostic.analyzeProvider !== 'openai' ? <AgentDiagnosticBox diagnostic={diagnostic} /> : null}
            <div className="analysis-grid">
                <div>
                    <p className="eyebrow">Proc kontakt / proc skip</p>
                    <span>{analysis.qualificationReason}</span>
                    <span>{analysis.offerHypothesis}</span>
                    {analysis.noPainReason ? <span>{analysis.noPainReason}</span> : null}
                </div>
                <div>
                    <p className="eyebrow">Pain signals</p>
                    {analysis.painSignals.length > 0 ? analysis.painSignals.map((item) => <span key={item}>{item}</span>) : <span>Bez verejneho pain signalu.</span>}
                </div>
                <div>
                    <p className="eyebrow">Co uz pravdepodobne maji vyresene</p>
                    {[...analysis.positiveSolvedSignals, ...analysis.alreadySolvedSignals].length > 0 ? [...new Set([...analysis.positiveSolvedSignals, ...analysis.alreadySolvedSignals])].map((item) => <span key={item}>{item}</span>) : <span>Bez silneho pozitivniho signalu.</span>}
                </div>
                <div>
                    <p className="eyebrow">Co chybi overit</p>
                    {analysis.missingEvidence.length > 0 ? analysis.missingEvidence.map((item) => <span key={item}>{item}</span>) : <span>Bez zasadni mezery v evidenci.</span>}
                </div>
                <div>
                    <p className="eyebrow">Setup evidence</p>
                    {[...analysis.missingAutomationSignals, ...analysis.likelyManualProcessSignals].length > 0 ? [...new Set([...analysis.missingAutomationSignals, ...analysis.likelyManualProcessSignals])].map((item) => <span key={item}>{item}</span>) : <span>Bez setup signalu.</span>}
                </div>
            </div>
            {analysis.contradictionWarnings.length > 0 ? (
                <div className="scope-note warning-note">
                    {analysis.contradictionWarnings.map((warning) => <span key={warning}>{warning}</span>)}
                </div>
            ) : null}
            <div className="signal-list">
                {analysis.quickWins.slice(0, 3).map((win) => (
                    <span key={win.title}>{win.title}</span>
                ))}
            </div>
            <textarea readOnly value={`${analysis.miniAudit}\n\n---\n\n${analysis.outreachEmail}`} rows={8} />
        </div>
    );
}

interface LeadListProps {
    leads: Lead[];
    selectedLeadId: string;
    onCreateLead: () => void;
    onDeleteLead: (leadId: string) => void;
    onSelectLead: (leadId: string, nextScreen?: Screen) => void;
}

function LeadList({ leads, selectedLeadId, onCreateLead, onDeleteLead, onSelectLead }: LeadListProps) {
    return (
        <section className="panel">
            <div className="panel-header">
                <div>
                    <p className="eyebrow">Pipeline</p>
                    <h2>Seznam leadu</h2>
                </div>
                <button className="secondary-button" onClick={onCreateLead} type="button">
                    <Plus size={18} aria-hidden="true" />
                    Pridat lead
                </button>
            </div>

            <div className="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Ubytovani</th>
                            <th>Typ</th>
                            <th>Mesto</th>
                            <th>Stav</th>
                            <th>Dalsi follow-up</th>
                            <th>Akce</th>
                        </tr>
                    </thead>
                    <tbody>
                        {leads.map((lead) => (
                            <tr className={lead.id === selectedLeadId ? 'selected-row' : ''} key={lead.id} onClick={() => onSelectLead(lead.id)}>
                                <td>
                                    <strong>{lead.name}</strong>
                                    {lead.isDemoLead ? <span className="demo-badge small-demo-badge">Demo</span> : null}
                                    <small>{lead.email || 'E-mail chybi'}</small>
                                </td>
                                <td>{lead.accommodationType}</td>
                                <td>{lead.city}</td>
                                <td>
                                    <span className="status-pill">{lead.status}</span>
                                </td>
                                <td>{lead.nextFollowUpDate || 'Nenastaveno'}</td>
                                <td>
                                    <button
                                        className="secondary-button compact-button danger-button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onDeleteLead(lead.id);
                                        }}
                                        type="button"
                                    >
                                        <Trash2 size={16} aria-hidden="true" />
                                        Smazat lead
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

interface LeadEditorProps {
    draftLead: Lead;
    isCreating?: boolean;
    onChange: <Field extends keyof Lead>(field: Field, value: Lead[Field]) => void;
    onCopyText?: (textId: string, value: string) => void;
    onCreateGuestGuidePreview?: () => void;
    onDeleteLead?: (leadId: string) => void;
    onGenerateText?: (field: 'internalAgentBrief' | 'clientMiniAudit' | 'generatedMiniAudit' | 'generatedOutreach' | 'generatedFollowUp' | 'generatedOffer') => void;
    onPrepareAudit?: () => void;
    onPrepareGuestGuideSecondEmail?: () => void;
    onAnalyzeLead?: (lead: Lead) => void;
    onAnalyzeScreenshots?: (lead: Lead) => void;
    onExportLead?: (lead: Lead) => void;
    onExportGuestGuideConfig?: (lead: Lead) => void;
    onExportWebsiteExtraction?: (extraction: WebsiteExtractionResult, candidate?: LeadAgentCandidate, lead?: Lead) => void;
    includeScreenshotDataUrlsInExport?: boolean;
    onToggleIncludeScreenshotDataUrls?: (include: boolean) => void;
    onSave: (event?: FormEvent) => void;
    copiedTextId?: string;
}

function LeadDetail({ copiedTextId = '', draftLead, includeScreenshotDataUrlsInExport = false, isCreating = false, onAnalyzeLead, onAnalyzeScreenshots, onChange, onCopyText, onCreateGuestGuidePreview, onDeleteLead, onExportGuestGuideConfig, onExportLead, onExportWebsiteExtraction, onGenerateText, onPrepareAudit, onPrepareGuestGuideSecondEmail, onSave, onToggleIncludeScreenshotDataUrls }: LeadEditorProps) {
    const showWebsiteAnalysisPanel = needsWebsiteAnalysis(draftLead);
    const latestAnalysisDiagnostic = draftLead.latestAnalysisDiagnostic as { userMessage?: string; fallbackReason?: string; analyzeProvider?: string; debugId?: string; model?: string | null } | undefined;
    const clientDiagnostics = clientTextSanitizerDiagnostics(clientOutputValues(draftLead));
    const hasCopyWarning = hasLeadClientOutputs(draftLead) && !clientDiagnostics.clientTextReady;
    const agentBadges = [
        draftLead.opportunityType ? `Opportunity: ${draftLead.opportunityType}` : '',
        draftLead.fitVerdict ? `Fit: ${draftLead.fitVerdict}` : '',
        draftLead.confidence ? `Confidence: ${draftLead.confidence}` : '',
        draftLead.targetOffer ? `Offer: ${draftLead.targetOffer}` : '',
        typeof draftLead.opportunityScore === 'number' && draftLead.opportunityScore > 0 ? `Opportunity score ${draftLead.opportunityScore}` : '',
        typeof draftLead.automationNeedScore === 'number' && draftLead.automationNeedScore > 0 ? `Automation ${draftLead.automationNeedScore}` : '',
        typeof draftLead.reviewFrictionScore === 'number' && draftLead.reviewFrictionScore > 0 ? `Review pain ${draftLead.reviewFrictionScore}` : '',
    ].filter(Boolean);
    const guestGuideConfigText = draftLead.guestGuidePreview ? JSON.stringify(draftLead.guestGuidePreview.configExport, null, 2) : '';
    const guestGuidePlaceholderItems = draftLead.guestGuidePreview?.sections.flatMap((guideSection) => guideSection.groups.flatMap((group) => group.items.filter((item) => item.includes('[DOPLNIT:')))) ?? [];
    const ownershipStatus = draftLead.websiteExtraction?.websiteOwnershipStatus ?? draftLead.websiteOwnershipStatus;
    const showOfficialWebsiteGate = Boolean(draftLead.websiteExtraction && ownershipStatus && ownershipStatus !== 'official');
    const nextAction = workflowNextAction(draftLead);
    const clientOutputNeedsReview = draftLead.clientOutputStatus === 'draft-needs-review' || ['needs-idea-review', 'needs-evidence-review', 'needs-contact-review'].includes(nextAction);
    const directoryCandidates = draftLead.websiteExtraction?.directoryExtractedCandidates ?? draftLead.directoryExtractedCandidates ?? [];
    const firstDirectoryCandidate = directoryCandidates[0];
    const officialCandidateUrl = draftLead.websiteExtraction?.officialWebsiteCandidateUrl ?? draftLead.officialWebsiteCandidateUrl ?? firstDirectoryCandidate?.websiteUrl ?? '';
    const applyDirectoryCandidate = () => {
        if (!firstDirectoryCandidate) return;
        onChange('name', firstDirectoryCandidate.name);
        if (firstDirectoryCandidate.websiteUrl) onChange('websiteOrOtaUrl', firstDirectoryCandidate.websiteUrl);
        if (firstDirectoryCandidate.email) onChange('email', firstDirectoryCandidate.email);
        onChange('websiteExtraction', undefined);
        onChange('extractionStatus', 'ready');
        onChange('needsAgentAnalysis', true);
    };
    const applyOfficialCandidateUrl = () => {
        if (!officialCandidateUrl) return;
        onChange('websiteOrOtaUrl', officialCandidateUrl);
        onChange('publicProfileUrl', officialCandidateUrl);
        onChange('websiteExtraction', undefined);
        onChange('extractionStatus', 'ready');
        onChange('needsAgentAnalysis', true);
    };
    const markAsUnsuitableLead = () => {
        onChange('recommendedProduct', 'skip');
        onChange('fitVerdict', 'skip');
        onChange('targetOffer', 'skip');
        onChange('qualificationReason', 'Zdroj není vlastní web ubytování; vyžaduje konkrétní provoz nebo oficiální web.');
    };

    return (
        <form className="detail-stack" onSubmit={onSave}>
            <section className="panel form-panel">
                <div className="panel-header">
                    <div>
                        <p className="eyebrow">{isCreating ? 'Novy zaznam' : 'Editace'}</p>
                        <h2>{isCreating ? 'Pridat lead' : draftLead.name}</h2>
                    </div>
                    <div className="button-group">
                        {!isCreating ? (
                            <>
                                <button className="secondary-button" onClick={() => onExportLead?.(draftLead)} type="button">
                                    <Clipboard size={18} aria-hidden="true" />
                                    Exportovat lead JSON
                                </button>
                                <button className="secondary-button danger-button" onClick={() => onDeleteLead?.(draftLead.id)} type="button">
                                    <Trash2 size={18} aria-hidden="true" />
                                    Smazat lead
                                </button>
                            </>
                        ) : null}
                        <button className="primary-button" type="submit">
                            <Save size={18} aria-hidden="true" />
                            Ulozit
                        </button>
                    </div>
                </div>

                <label className="scope-note export-option-note">
                    <span>
                        <input checked={includeScreenshotDataUrlsInExport} onChange={(event) => onToggleIncludeScreenshotDataUrls?.(event.target.checked)} type="checkbox" />
                        Zahrnout obrázky jako dataUrl
                    </span>
                    {includeScreenshotDataUrlsInExport ? <strong>Soubor může být velký a může obsahovat veřejné screenshoty.</strong> : <span>Screenshot dataUrl jsou v JSON exportu standardně vynechané.</span>}
                </label>

                {showWebsiteAnalysisPanel ? (
                    <div className="scope-note warning-note website-analysis-note">
                        <strong>Web byl přečten, ale obchodní analýza ještě neběžela.</strong>
                        <span>Website Extractor pouze shromáždil evidence z vlastního webu. Klientský mini-audit, oslovení a nabídka vzniknou až po obchodní analýze z extrahovaného webu.</span>
                        {latestAnalysisDiagnostic?.userMessage ? <span>{latestAnalysisDiagnostic.userMessage}</span> : null}
                        {latestAnalysisDiagnostic?.fallbackReason ? <span>Fallback reason: {latestAnalysisDiagnostic.fallbackReason}</span> : null}
                        <div className="button-group inline-actions">
                            <button className="primary-button compact-button" onClick={() => onAnalyzeLead?.(draftLead)} type="button">
                                <Sparkles size={16} aria-hidden="true" />
                                Analyzovat z extrahovaného webu
                            </button>
                            <button className="secondary-button compact-button" onClick={() => document.getElementById('lead-screenshot-upload')?.click()} type="button">
                                <Image size={16} aria-hidden="true" />
                                Přidat screenshoty
                            </button>
                        </div>
                    </div>
                ) : draftLead.createdFromAgentAnalysis ? (
                    <div className="scope-note agent-origin-note">
                        <strong>Vytvořeno z Lead Finder Agent analýzy</strong>
                        {draftLead.agentAnalysisProvider === 'demo-fallback' || draftLead.agentAnalysisProvider === 'fallback' ? <span className="fallback-badge">Fallback analýza — zkontrolovat před odesláním</span> : null}
                        {hasCopyWarning ? <span className="copy-review-badge">Text vyžaduje kontrolu</span> : null}
                        {latestAnalysisDiagnostic?.userMessage && (draftLead.agentAnalysisProvider === 'demo-fallback' || draftLead.agentAnalysisProvider === 'fallback') ? <span>{latestAnalysisDiagnostic.userMessage}</span> : null}
                        {hasCopyWarning ? <span>Klientský text obsahuje interní formulace a je potřeba ho upravit.</span> : null}
                        <div className="metadata-row">
                            {agentBadges.map((badge) => <span key={badge}>{badge}</span>)}
                        </div>
                        {draftLead.qualificationReason ? <span>{draftLead.qualificationReason}</span> : null}
                    </div>
                ) : draftLead.addedWithoutAgentAnalysis ? (
                    <div className="scope-note warning-note quick-discovery-note">
                        <strong>Rychlý nález — vyžaduje analýzu</strong>
                        <span>Tento lead vznikl jen z rychlého vyhledání. Pro konkrétní audit spusť agentní analýzu nebo přidej screenshoty/veřejné podklady.</span>
                        <div className="button-group inline-actions">
                            <button className="primary-button compact-button" onClick={() => onAnalyzeLead?.(draftLead)} type="button">
                                <Sparkles size={16} aria-hidden="true" />
                                Spustit agentní analýzu tohoto leadu
                            </button>
                            <button className="secondary-button compact-button" onClick={() => onAnalyzeScreenshots?.(draftLead)} type="button">
                                <Image size={16} aria-hidden="true" />
                                Analyzovat screenshoty
                            </button>
                        </div>
                    </div>
                ) : null}

                {showOfficialWebsiteGate ? (
                    <div className="scope-note warning-note website-ownership-note">
                        <strong>{ownershipStatus === 'asset' ? 'URL je obrázek nebo soubor' : 'Toto není vlastní web ubytování'}</strong>
                        <span>{draftLead.websiteExtraction?.websiteOwnershipReason ?? draftLead.websiteOwnershipReason}</span>
                        {ownershipStatus === 'asset'
                            ? <span>Soubor nebo GIF asset nelze analyzovat jako web. Další krok je doplnit oficiální web konkrétního provozu.</span>
                            : <span>Katalog nebo městský portál může pomoct najít položku, ale jeho kontakty se nepočítají jako kontakt leadu.</span>}
                        {directoryCandidates.length > 0 ? <span>Nalezené položky: {directoryCandidates.map((candidate) => [candidate.name, candidate.websiteUrl || candidate.email || candidate.phone].filter(Boolean).join(' - ')).join('; ')}</span> : null}
                        {draftLead.websiteExtraction?.directoryContact && (draftLead.websiteExtraction.directoryContact.emails.length > 0 || draftLead.websiteExtraction.directoryContact.phones.length > 0)
                            ? <span>Kontakt z katalogu odděleně: {[...draftLead.websiteExtraction.directoryContact.emails, ...draftLead.websiteExtraction.directoryContact.phones].join(', ')}</span>
                            : null}
                        {draftLead.websiteExtraction?.skippedAssetUrls?.length ? <span>Přeskočené asset URL: {draftLead.websiteExtraction.skippedAssetUrls.join(', ')}</span> : null}
                        <div className="button-group inline-actions">
                            <button className="secondary-button compact-button" disabled={!firstDirectoryCandidate} onClick={applyDirectoryCandidate} type="button">
                                <Plus size={16} aria-hidden="true" />
                                Vytvořit kandidáta z položky
                            </button>
                            <button className="secondary-button compact-button" disabled={!officialCandidateUrl} onClick={applyOfficialCandidateUrl} type="button">
                                <ExternalLink size={16} aria-hidden="true" />
                                Použít oficiální web
                            </button>
                            <button className="secondary-button compact-button" onClick={markAsUnsuitableLead} type="button">
                                <X size={16} aria-hidden="true" />
                                Označit jako nevhodný lead
                            </button>
                        </div>
                    </div>
                ) : null}

                <div className="evidence-status-panel">
                    <span>{agentLeadStatusLabels[draftLead.agentLeadStatus]}</span>
                    <span>{evidenceLevelLabels[draftLead.evidenceLevel]}</span>
                    {draftLead.websiteExtraction && ['completed', 'partial'].includes(draftLead.websiteExtraction.status) ? <span>Web přečten</span> : null}
                    <span>{draftLead.needsAgentAnalysis ? 'Needs agent analysis' : 'Evidence ready'}</span>
                    <span>Další krok: {nextAction}</span>
                </div>

                {clientOutputNeedsReview ? (
                    <div className="scope-note warning-note client-output-review-note">
                        <strong>Výstup zatím není připravený k odeslání.</strong>
                        {(draftLead.notReadyReasons?.length ? draftLead.notReadyReasons : ['Výstup čeká na kontrolu evidence nebo konkrétnosti nápadů.']).map((reason) => <span key={reason}>{reason}</span>)}
                        {draftLead.unsupportedClientClaims?.length ? <span>Nepodložené klientské claimy: {draftLead.unsupportedClientClaims.join(', ')}</span> : null}
                    </div>
                ) : null}

                <div className="scope-note product-recommendation-note">
                    <strong>Doporučený produkt: {recommendedProductLabels[draftLead.recommendedProduct ?? 'guest-guide-starter']}</strong>
                    <span>Proč tento produkt: {draftLead.recommendedProductReason || recommendProductForLead(draftLead).recommendedProductReason}</span>
                    <span>Účel 3 nápadů zdarma: {draftLead.freeIdeaPurpose || recommendProductForLead(draftLead).freeIdeaPurpose}</span>
                    <span>Možná placená návaznost: {draftLead.paidOfferShort || recommendProductForLead(draftLead).paidOfferShort}</span>
                    <span>{draftLead.paidOfferDetails || recommendProductForLead(draftLead).paidOfferDetails}</span>
                </div>

                <div className={`scope-note ${draftLead.repeatedConceptWarning ? 'warning-note' : 'product-recommendation-note'}`}>
                    <strong>Lead playbook: {leadPlaybookLabels[draftLead.leadPlaybook ?? 'basic-website-guest-guide']}</strong>
                    <span>Proč tento playbook: {draftLead.leadPlaybookReason || freeIdeaSpecificityDiagnostics(draftLead).leadPlaybookReason}</span>
                    <span>Signály: {(draftLead.playbookSignals?.length ? draftLead.playbookSignals : freeIdeaSpecificityDiagnostics(draftLead).playbookSignals).join(', ') || 'žádné výrazné signály'}</span>
                    <span>Diverzita nápadů: {draftLead.freeIdeasDiversityScore ?? freeIdeaSpecificityDiagnostics(draftLead).freeIdeasDiversityScore}/100</span>
                    {draftLead.repeatedConceptWarning || freeIdeaSpecificityDiagnostics(draftLead).repeatedConceptWarning ? <span>Nápady opakují stejný koncept. Další krok zůstává needs-idea-review.</span> : null}
                </div>

                <section className="nested-section guest-guide-preview-panel">
                    <div className="panel-header compact-header">
                        <div>
                            <p className="eyebrow">Návaznost po souhlasu</p>
                            <h2>Guest Guide Preview</h2>
                        </div>
                        <div className="button-group">
                            <button className="secondary-button compact-button" disabled={!draftLead.websiteExtraction} onClick={onCreateGuestGuidePreview} type="button">
                                <Sparkles size={16} aria-hidden="true" />
                                Vytvořit ukázku guest guide
                            </button>
                            <button className="secondary-button compact-button" disabled={!draftLead.guestGuidePreview} onClick={() => onExportGuestGuideConfig?.(draftLead)} type="button">
                                <Clipboard size={16} aria-hidden="true" />
                                Exportovat guest guide JSON
                            </button>
                            <button className="secondary-button compact-button" disabled={!guestGuideConfigText} onClick={() => onCopyText?.('guest-guide-config', guestGuideConfigText)} type="button">
                                <Clipboard size={16} aria-hidden="true" />
                                {copiedTextId === 'guest-guide-config' ? 'Zkopírováno' : 'Zkopírovat guest guide config'}
                            </button>
                            <button className="secondary-button compact-button" disabled={!draftLead.websiteExtraction} onClick={onPrepareGuestGuideSecondEmail} type="button">
                                <Mail size={16} aria-hidden="true" />
                                Připravit druhý e-mail
                            </button>
                        </div>
                    </div>

                    <div className="metadata-row">
                        <span>Status: {draftLead.guestGuidePreviewStatus ?? 'not-created'}</span>
                        <span>Workflow: až po souhlasu s první zprávou</span>
                        <span>{draftLead.guestGuidePreview ? `${draftLead.guestGuidePreview.sections.length} sekcí` : 'Preview zatím nevytvořeno'}</span>
                    </div>

                    {!draftLead.websiteExtraction ? <div className="scope-note warning-note compact-warning">Nejdřív přečti vlastní web kandidáta přes Website Extractor. Preview má vycházet z veřejné evidence.</div> : null}

                    {draftLead.guestGuidePreview ? (
                        <div className="guest-guide-preview-content">
                            <div className="analysis-grid">
                                <div>
                                    <p className="eyebrow">Property</p>
                                    <span>{draftLead.guestGuidePreview.propertyName}</span>
                                    <span>{draftLead.guestGuidePreview.city}</span>
                                    <span>{draftLead.guestGuidePreview.suggestedSlug}</span>
                                </div>
                                <div>
                                    <p className="eyebrow">Limity</p>
                                    {draftLead.guestGuidePreview.limitations.slice(0, 5).map((limitation) => <span key={limitation}>{limitation}</span>)}
                                </div>
                                <div>
                                    <p className="eyebrow">Doplnit</p>
                                    {guestGuidePlaceholderItems.length > 0 ? guestGuidePlaceholderItems.slice(0, 8).map((item) => <span key={item}>{item}</span>) : <span>Bez placeholderů.</span>}
                                </div>
                            </div>

                            <div className="guest-guide-section-list">
                                {draftLead.guestGuidePreview.sections.map((guideSection) => (
                                    <div className="guest-guide-section-card" key={guideSection.id}>
                                        <div>
                                            <p className="eyebrow">{guideSection.id}</p>
                                            <h2>{guideSection.title}</h2>
                                        </div>
                                        <strong>{guideSection.headline}</strong>
                                        <p>{guideSection.overview}</p>
                                        <div className="analysis-grid">
                                            {guideSection.groups.map((group) => (
                                                <div key={group.title}>
                                                    <p className="eyebrow">{group.title}</p>
                                                    {group.items.map((item) => <span key={item}>{item}</span>)}
                                                </div>
                                            ))}
                                        </div>
                                        <div className="signal-list">
                                            {guideSection.sourceEvidence.slice(0, 4).map((evidence) => <span key={evidence}>{evidence}</span>)}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <label className="stacked-label full-width">
                                Export configu pro Guest Guide App
                                <textarea readOnly value={guestGuideConfigText} rows={10} />
                            </label>
                        </div>
                    ) : null}

                    <label className="stacked-label full-width">
                        Druhý e-mail po souhlasu
                        <textarea value={draftLead.guestGuideSecondEmail ?? ''} onChange={(event) => onChange('guestGuideSecondEmail', event.target.value)} rows={12} />
                    </label>
                </section>

                {draftLead.websiteExtraction ? (
                    <div className="scope-note website-lead-note">
                        <strong>Web přečten</strong>
                        <span>{draftLead.websiteExtraction.summary}</span>
                        <span>Kontakt: {[...draftLead.websiteExtraction.contact.emails, ...draftLead.websiteExtraction.contact.phones].join(', ') || 'nenalezen'}</span>
                        <span>Valid pages: {draftLead.websiteExtraction.validPagesCount ?? draftLead.websiteExtraction.pagesExtracted.length}</span>
                        <span>Skipped pages: {draftLead.websiteExtraction.invalidPagesCount ?? draftLead.websiteExtraction.skippedPages?.length ?? 0}</span>
                        <span>Stránky: {draftLead.websiteExtraction.pagesExtracted.map((page) => page.url).join(', ') || 'žádná stránka nebyla přečtena'}</span>
                        {(draftLead.websiteExtraction.skippedPages ?? []).length > 0 ? <span>Skipped: {(draftLead.websiteExtraction.skippedPages ?? []).map((page) => `${page.url} (${page.reason})`).join(', ')}</span> : null}
                        <span>Website Extractor čte pouze vlastní veřejný web provozu. OTA stránky nebyly automaticky čtené.</span>
                        <button className="secondary-button compact-button" onClick={() => onExportWebsiteExtraction?.(draftLead.websiteExtraction as WebsiteExtractionResult, undefined, draftLead)} type="button">
                            <Clipboard size={16} aria-hidden="true" />
                            Exportovat extrakci JSON
                        </button>
                    </div>
                ) : null}

                {draftLead.sourceLimitations.length > 0 ? (
                    <div className="scope-note source-limit-note">
                        <strong>Limity evidence</strong>
                        {draftLead.sourceLimitations.map((limitation) => <span key={limitation}>{limitation}</span>)}
                    </div>
                ) : null}

                {draftLead.isDemoLead ? (
                    <div className="scope-note demo-lead-note">
                        <strong>Demo lead — fiktivní data</strong>
                        <span>{draftLead.demoReason || demoLeadNotice}</span>
                        <span>Tento záznam nesmí být zaměněn za reálného obchodního leada.</span>
                    </div>
                ) : null}

                <LeadCoreFields draftLead={draftLead} onChange={onChange} />
            </section>

            <PublicAuditWorkspace
                copiedTextId={copiedTextId}
                draftLead={draftLead}
                onChange={onChange}
                onCopyText={onCopyText}
                onGenerateText={onGenerateText}
                onAnalyzeScreenshots={onAnalyzeScreenshots}
                onPrepareAudit={onPrepareAudit}
                onSave={onSave}
            />
        </form>
    );
}

function LeadCoreFields({ draftLead, onChange }: Pick<LeadEditorProps, 'draftLead' | 'onChange'>) {
    return (
        <div className="form-grid">
            <label>
                Nazev ubytovani
                <input required value={draftLead.name} onChange={(event) => onChange('name', event.target.value)} />
            </label>
            <label>
                Typ ubytovani
                <select
                    value={draftLead.accommodationType}
                    onChange={(event) => onChange('accommodationType', event.target.value as Lead['accommodationType'])}
                >
                    {accommodationTypes.map((type) => (
                        <option key={type} value={type}>
                            {type}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                Mesto
                <input value={draftLead.city} onChange={(event) => onChange('city', event.target.value)} />
            </label>
            <label>
                E-mail
                <input type="email" value={draftLead.email} onChange={(event) => onChange('email', event.target.value)} />
            </label>
            <label>
                Stav leadu
                <select value={draftLead.status} onChange={(event) => onChange('status', event.target.value as LeadStatus)}>
                    {leadStatuses.map((status) => (
                        <option key={status} value={status}>
                            {status}
                        </option>
                    ))}
                </select>
            </label>
            <label className="full-width">
                Poznamky
                <textarea value={draftLead.notes} onChange={(event) => onChange('notes', event.target.value)} rows={5} />
            </label>
            <details className="full-width legacy-fields">
                <summary>Starsi pole</summary>
                <div className="form-grid">
                    <label>
                        Legacy Web / OTA odkaz
                        <input value={draftLead.websiteOrOtaUrl} onChange={(event) => onChange('websiteOrOtaUrl', event.target.value)} />
                    </label>
                    <label>
                        Legacy verejny profil / OTA odkaz
                        <input value={draftLead.publicProfileUrl} onChange={(event) => onChange('publicProfileUrl', event.target.value)} />
                    </label>
                </div>
            </details>
        </div>
    );
}

function AuditPanel({ copiedTextId = '', draftLead, onAnalyzeScreenshots, onChange, onCopyText, onGenerateText, onPrepareAudit, onSave }: LeadEditorProps) {
    return (
        <form className="panel form-panel" onSubmit={onSave}>
            <div className="panel-header">
                <div>
                    <p className="eyebrow">Verejny prvni dojem</p>
                    <h2>{draftLead.name || 'Vyber lead'}</h2>
                </div>
                <button className="primary-button" type="submit">
                    <Save size={18} aria-hidden="true" />
                    Ulozit audit
                </button>
            </div>

            <PublicAuditWorkspace
                copiedTextId={copiedTextId}
                draftLead={draftLead}
                onChange={onChange}
                onCopyText={onCopyText}
                onGenerateText={onGenerateText}
                onAnalyzeScreenshots={onAnalyzeScreenshots}
                onPrepareAudit={onPrepareAudit}
                onSave={onSave}
            />
        </form>
    );
}

function OutreachPanel({ copiedTextId = '', draftLead, onChange, onCopyText, onGenerateText, onSave }: LeadEditorProps) {
    return (
        <form className="panel form-panel" onSubmit={onSave}>
            <div className="panel-header">
                <div>
                    <p className="eyebrow">Text ke schvaleni</p>
                    <h2>{draftLead.name || 'Osloveni'}</h2>
                </div>
                <div className="button-group">
                    <button className="secondary-button" onClick={() => onGenerateText?.('generatedOutreach')} type="button">
                        <Sparkles size={18} aria-hidden="true" />
                        Vygenerovat prvni osloveni
                    </button>
                    <button className="secondary-button" onClick={() => onGenerateText?.('generatedFollowUp')} type="button">
                        <Mail size={18} aria-hidden="true" />
                        Vygenerovat follow-up
                    </button>
                    <button className="primary-button" type="submit">
                        <Save size={18} aria-hidden="true" />
                        Ulozit
                    </button>
                </div>
            </div>

            <div className="generated-grid">
                <GeneratedTextArea
                    copiedTextId={copiedTextId}
                    field="generatedOutreach"
                    label="Prvni obchodni osloveni"
                    onChange={onChange}
                    onCopyText={onCopyText}
                    textId="outreach"
                    value={draftLead.generatedOutreach}
                />
                <GeneratedTextArea
                    copiedTextId={copiedTextId}
                    field="generatedFollowUp"
                    label="Follow-up zprava"
                    onChange={onChange}
                    onCopyText={onCopyText}
                    textId="follow-up"
                    value={draftLead.generatedFollowUp}
                />
            </div>
        </form>
    );
}

function OfferPanel({ copiedTextId = '', draftLead, onChange, onCopyText, onGenerateText, onSave }: LeadEditorProps) {
    const nextAction = workflowNextAction(draftLead);
    const clientOutputNeedsReview = draftLead.clientOutputStatus === 'draft-needs-review' || ['needs-idea-review', 'needs-evidence-review', 'needs-contact-review'].includes(nextAction);

    return (
        <form className="panel form-panel" onSubmit={onSave}>
            <div className="panel-header">
                <div>
                    <p className="eyebrow">Rucni workflow</p>
                    <h2>Nabidka a dalsi krok</h2>
                </div>
                <div className="button-group">
                    <button className="secondary-button" onClick={() => onGenerateText?.('generatedOffer')} type="button">
                        <Sparkles size={18} aria-hidden="true" />
                        Vygenerovat možnou placenou návaznost
                    </button>
                    <button className="primary-button" type="submit">
                        <Save size={18} aria-hidden="true" />
                        Ulozit krok
                    </button>
                </div>
            </div>

            {clientOutputNeedsReview ? (
                <div className="scope-note warning-note">
                    <strong>Výstup zatím není připravený k odeslání.</strong>
                    {(draftLead.notReadyReasons?.length ? draftLead.notReadyReasons : ['Možná placená návaznost je zatím draft, ne hotový text k poslání.']).map((reason) => <span key={reason}>{reason}</span>)}
                </div>
            ) : null}

            <div className="form-grid">
                <label>
                    Doporučený produkt
                    <input readOnly value={recommendedProductLabels[draftLead.recommendedProduct ?? 'guest-guide-starter']} />
                </label>
                <label>
                    Krátký název nabídky
                    <input readOnly value={draftLead.paidOfferShort || recommendProductForLead(draftLead).paidOfferShort} />
                </label>
                <label className="full-width">
                    Proč tento produkt
                    <textarea readOnly value={draftLead.recommendedProductReason || recommendProductForLead(draftLead).recommendedProductReason} rows={3} />
                </label>
                <label className="full-width">
                    Detail placené návaznosti
                    <textarea readOnly value={draftLead.paidOfferDetails || recommendProductForLead(draftLead).paidOfferDetails} rows={3} />
                </label>
                <label>
                    Datum posledniho kontaktu
                    <input type="date" value={draftLead.lastContactDate} onChange={(event) => onChange('lastContactDate', event.target.value)} />
                </label>
                <label>
                    Datum dalsiho follow-upu
                    <input type="date" value={draftLead.nextFollowUpDate} onChange={(event) => onChange('nextFollowUpDate', event.target.value)} />
                </label>
                <label>
                    Stav leadu
                    <select value={draftLead.status} onChange={(event) => onChange('status', event.target.value as LeadStatus)}>
                        {leadStatuses.map((status) => (
                            <option key={status} value={status}>
                                {status}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="full-width">
                    Poznamky k dalsimu kroku
                    <textarea value={draftLead.notes} onChange={(event) => onChange('notes', event.target.value)} rows={7} />
                </label>
            </div>

            <GeneratedTextArea
                copiedTextId={copiedTextId}
                field="generatedOffer"
                label="Navrh placene nabidky / dalsiho kroku"
                onChange={onChange}
                onCopyText={onCopyText}
                textId="offer"
                value={draftLead.generatedOffer}
            />
        </form>
    );
}

function PublicAuditWorkspace({ copiedTextId = '', draftLead, onAnalyzeScreenshots, onChange, onCopyText, onGenerateText, onPrepareAudit }: LeadEditorProps) {
    const [sourceDraft, setSourceDraft] = useState<SourceMaterial>(emptySourceMaterial);
    const publicLinks = draftLead.publicLinks ?? [];
    const sourceMaterials = draftLead.sourceMaterials ?? [];
    const screenshots = draftLead.screenshots ?? [];
    const structuredQuickWins = draftLead.structuredQuickWins ?? [];
    const extractionStatus = draftLead.extractionStatus ?? 'idle';
    const concreteObservationCount = [
        draftLead.firstImpression,
        draftLead.mainPhotoObservation,
        draftLead.photoOrderObservation,
        draftLead.descriptionObservation,
        draftLead.checkInParkingInfo,
        draftLead.reviewSignals,
        draftLead.guestConfusion,
        draftLead.businessOpportunity,
    ].filter((value) => value.trim()).length;
    const completeQuickWins = structuredQuickWins.filter((win) => win.title.trim() && win.action.trim() && win.why.trim());
    const waitingForWebsiteAnalysis = needsWebsiteAnalysis(draftLead);
    const nextAction = workflowNextAction(draftLead);
    const clientOutputNeedsReview = draftLead.clientOutputStatus === 'draft-needs-review' || ['needs-idea-review', 'needs-evidence-review', 'needs-contact-review'].includes(nextAction);
    const checklist = [
        { label: 'alespon 1 verejny link', done: publicLinks.some((link) => link.url.trim()) },
        { label: 'alespon 1 silna stranka', done: Boolean(draftLead.strengths.trim()) },
        { label: 'alespon 2 konkretni pozorovani', done: concreteObservationCount >= 2 || draftLead.evidenceLevel === 'screenshot-analysis' },
        { label: 'presne 3 quick wins s title/action/why', done: completeQuickWins.length === 3 },
    ];

    const updatePublicLink = <Field extends keyof PublicProfileLink>(linkId: string, field: Field, value: PublicProfileLink[Field]) => {
        onChange(
            'publicLinks',
            publicLinks.map((link) => (link.id === linkId ? { ...link, [field]: value } : link)),
        );
    };

    const addPublicLink = (sourceType: PublicProfileSourceType = 'other') => {
        onChange('publicLinks', [
            ...publicLinks,
            {
                ...emptyPublicLink(),
                sourceType,
                label: publicProfileSourceLabels[sourceType],
            },
        ]);
    };

    const removePublicLink = (linkId: string) => {
        onChange(
            'publicLinks',
            publicLinks.filter((link) => link.id !== linkId),
        );
    };

    const updateQuickWin = <Field extends keyof QuickWin>(quickWinId: string, field: Field, value: QuickWin[Field]) => {
        onChange(
            'structuredQuickWins',
            structuredQuickWins.map((quickWin) => (quickWin.id === quickWinId ? { ...quickWin, [field]: value } : quickWin)),
        );
    };

    const addQuickWin = () => {
        onChange('structuredQuickWins', [...structuredQuickWins, emptyQuickWin()]);
    };

    const removeQuickWin = (quickWinId: string) => {
        onChange(
            'structuredQuickWins',
            structuredQuickWins.filter((quickWin) => quickWin.id !== quickWinId),
        );
    };

    const updateSourceDraft = <Field extends keyof SourceMaterial>(field: Field, value: SourceMaterial[Field]) => {
        setSourceDraft((current) => ({ ...current, [field]: value }));
    };

    const addSourceMaterial = () => {
        if (!sourceDraft.content.trim()) {
            return;
        }

        onChange('sourceMaterials', [
            ...sourceMaterials,
            {
                ...sourceDraft,
                id: `source-${crypto.randomUUID()}`,
                title: sourceDraft.title.trim() || sourceMaterialTypeLabels[sourceDraft.type],
                content: sourceDraft.content.trim(),
                createdAt: new Date().toISOString(),
            },
        ]);
        onChange('extractionStatus', 'ready');
        setSourceDraft(emptySourceMaterial());
    };

    const removeSourceMaterial = (materialId: string) => {
        onChange(
            'sourceMaterials',
            sourceMaterials.filter((material) => material.id !== materialId),
        );
    };

    const addScreenshots = (files: FileList | null) => {
        if (!files?.length) return;

        const imageFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
        void Promise.all(imageFiles.map((file) => new Promise<LeadScreenshot>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(emptyScreenshot(file.name, String(reader.result || '')));
            reader.readAsDataURL(file);
        }))).then((newScreenshots) => {
            onChange('screenshots', [...screenshots, ...newScreenshots]);
            onChange('sourceLimitations', [...new Set([...draftLead.sourceLimitations, 'Nahrané screenshoty jsou analyzované pouze po spuštění vision analýzy.'])]);
        });
    };

    const updateScreenshot = <Field extends keyof LeadScreenshot>(screenshotId: string, field: Field, value: LeadScreenshot[Field]) => {
        onChange(
            'screenshots',
            screenshots.map((screenshot) => (screenshot.id === screenshotId ? { ...screenshot, [field]: value } : screenshot)),
        );
    };

    const removeScreenshot = (screenshotId: string) => {
        onChange(
            'screenshots',
            screenshots.filter((screenshot) => screenshot.id !== screenshotId),
        );
    };

    const canGenerateAudit = extractionStatus === 'completed' || completeQuickWins.length === 3;

    return (
        <section className="panel form-panel audit-workspace">
            <div className="panel-header">
                <div>
                    <p className="eyebrow">Bot workflow</p>
                    <h2>Veřejný audit</h2>
                </div>
            </div>

            <div className="scope-note">
                Odkaz slouží k otevření zdroje. OTA URL není automaticky přečtená, search snippet není kompletní OTA profil a screenshoty se analyzují jen po nahrání.
            </div>

            <div className="quality-grid">
                {checklist.map((item) => (
                    <div className={item.done ? 'quality-item done' : 'quality-item'} key={item.label}>
                        <span>{item.done ? 'OK' : 'Chybi'}</span>
                        {item.label}
                    </div>
                ))}
            </div>

            <section className="nested-section">
                <div className="panel-header compact-header">
                    <div>
                        <p className="eyebrow">Zdroj k rucni kontrole</p>
                        <h2>Verejne odkazy</h2>
                        <p className="section-help">Pridej Booking, Airbnb, Google profil, vlastni web nebo jiny verejny zdroj.</p>
                    </div>
                    <div className="button-group">
                        <button className="secondary-button compact-button" onClick={() => addPublicLink('booking')} type="button">Pridat Booking</button>
                        <button className="secondary-button compact-button" onClick={() => addPublicLink('airbnb')} type="button">Pridat Airbnb</button>
                        <button className="secondary-button compact-button" onClick={() => addPublicLink('google')} type="button">Pridat Google</button>
                        <button className="secondary-button compact-button" onClick={() => addPublicLink('website')} type="button">Pridat web</button>
                    </div>
                </div>

                <div className="link-list">
                    {publicLinks.length === 0 ? (
                        <div className="empty-inline">Zatim neni ulozeny zadny verejny link. Pridej vice zdroju nahore; aplikace URL necte automaticky.</div>
                    ) : (
                        publicLinks.map((link) => (
                            <div className="link-card" key={link.id}>
                                <label>
                                    Typ zdroje
                                    <select
                                        value={link.sourceType}
                                        onChange={(event) => updatePublicLink(link.id, 'sourceType', event.target.value as PublicProfileSourceType)}
                                    >
                                        {(Object.keys(publicProfileSourceLabels) as PublicProfileSourceType[]).map((sourceType) => (
                                            <option key={sourceType} value={sourceType}>
                                                {publicProfileSourceLabels[sourceType]}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    URL
                                    <input value={link.url} onChange={(event) => updatePublicLink(link.id, 'url', event.target.value)} />
                                </label>
                                <label>
                                    Label
                                    <input value={link.label} onChange={(event) => updatePublicLink(link.id, 'label', event.target.value)} />
                                </label>
                                <label>
                                    Interni poznamka
                                    <input value={link.notes} onChange={(event) => updatePublicLink(link.id, 'notes', event.target.value)} />
                                </label>
                                <div className="card-actions">
                                    <button className="secondary-button compact-button" disabled={!link.url.trim()} onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')} type="button">
                                        <ExternalLink size={16} aria-hidden="true" />
                                        Otevrit
                                    </button>
                                    <button className="secondary-button compact-button danger-button" onClick={() => removePublicLink(link.id)} type="button">
                                        <Trash2 size={16} aria-hidden="true" />
                                        Odebrat
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </section>

            <section className="nested-section screenshot-intake">
                <div className="panel-header compact-header">
                    <div>
                        <p className="eyebrow">Vision evidence</p>
                        <h2>Screenshoty a fotky veřejné prezentace</h2>
                        <p className="section-help">Nahraj screenshot Booking/Airbnb/Google/webu, recenze nebo galerii. Soubor se pro MVP uloží lokálně jako data URL.</p>
                    </div>
                    <span className={`status-pill extraction-${draftLead.screenshotAnalysisDiagnostic?.status ?? 'idle'}`}>{draftLead.screenshotAnalysisDiagnostic?.status ?? 'idle'}</span>
                </div>

                <div className="button-group">
                    <label className="secondary-button upload-button">
                        <Image size={18} aria-hidden="true" />
                        Nahrát screenshoty / fotky
                        <input accept="image/*" id="lead-screenshot-upload" multiple type="file" onChange={(event) => addScreenshots(event.target.files)} />
                    </label>
                    <button className="primary-button" disabled={screenshots.length === 0 || draftLead.screenshotAnalysisDiagnostic?.status === 'running'} onClick={() => onAnalyzeScreenshots?.(draftLead)} type="button">
                        <Sparkles size={18} aria-hidden="true" />
                        {draftLead.screenshotAnalysisDiagnostic?.status === 'running' ? 'Analyzuji...' : 'Analyzovat screenshoty'}
                    </button>
                </div>

                {draftLead.screenshotAnalysisDiagnostic?.userMessage ? (
                    <div className="diagnostic-box">
                        <p className="eyebrow">Vision diagnostika</p>
                        <span>{draftLead.screenshotAnalysisDiagnostic.userMessage}</span>
                        {draftLead.screenshotAnalysisDiagnostic.fallbackReason ? <span>Fallback reason: {draftLead.screenshotAnalysisDiagnostic.fallbackReason}</span> : null}
                        {draftLead.screenshotAnalysisDiagnostic.debugId ? <span>Debug ID: {draftLead.screenshotAnalysisDiagnostic.debugId}</span> : null}
                        {draftLead.screenshotAnalysisDiagnostic.model ? <span>Model: {draftLead.screenshotAnalysisDiagnostic.model}</span> : null}
                    </div>
                ) : null}

                <div className="screenshot-grid">
                    {screenshots.length === 0 ? (
                        <div className="empty-inline">Zatím nejsou uložené žádné screenshoty. Bez nich aplikace neumí hodnotit OTA profil ani fotogalerii.</div>
                    ) : screenshots.map((screenshot) => (
                        <div className="screenshot-card" key={screenshot.id}>
                            <img alt={screenshot.fileName} src={screenshot.dataUrl} />
                            <div className="form-grid compact-form-grid">
                                <label>
                                    Název
                                    <input value={screenshot.fileName} onChange={(event) => updateScreenshot(screenshot.id, 'fileName', event.target.value)} />
                                </label>
                                <label>
                                    Typ
                                    <select value={screenshot.type} onChange={(event) => updateScreenshot(screenshot.id, 'type', event.target.value as LeadScreenshotType)}>
                                        {(Object.keys(leadScreenshotTypeLabels) as LeadScreenshotType[]).map((type) => (
                                            <option key={type} value={type}>{leadScreenshotTypeLabels[type]}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="full-width">
                                    Poznámka
                                    <textarea value={screenshot.note} onChange={(event) => updateScreenshot(screenshot.id, 'note', event.target.value)} rows={3} />
                                </label>
                            </div>
                            <button className="secondary-button compact-button danger-button" onClick={() => removeScreenshot(screenshot.id)} type="button">
                                <Trash2 size={16} aria-hidden="true" />
                                Odebrat
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            <section className="nested-section source-intake">
                <div className="panel-header compact-header">
                    <div>
                        <p className="eyebrow">Podklady pro bota</p>
                        <h2>Source Intake</h2>
                        <p className="section-help">Vloz verejny text z Bookingu/Airbnb/Google/webu nebo vlastni poznamky. Z toho se predvyplni auditova pozorovani.</p>
                    </div>
                    <span className={`status-pill extraction-${extractionStatus}`}>{extractionStatus}</span>
                </div>

                <div className="form-grid two-column">
                    <label>
                        Verejny odkaz / zdroj
                        <select value={sourceDraft.sourceLinkId || ''} onChange={(event) => updateSourceDraft('sourceLinkId', event.target.value)}>
                            <option value="">Bez vazby na konkretni link</option>
                            {publicLinks.map((link) => (
                                <option key={link.id} value={link.id}>
                                    {link.label || publicProfileSourceLabels[link.sourceType]} - {link.url || 'URL chybi'}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Typ materialu
                        <select value={sourceDraft.type} onChange={(event) => updateSourceDraft('type', event.target.value as SourceMaterialType)}>
                            {(Object.keys(sourceMaterialTypeLabels) as SourceMaterialType[]).map((type) => (
                                <option key={type} value={type}>
                                    {sourceMaterialTypeLabels[type]}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="full-width">
                        Nazev podkladu
                        <input value={sourceDraft.title} onChange={(event) => updateSourceDraft('title', event.target.value)} placeholder="Napriklad Booking text, Google recenze, screenshot poznamka" />
                    </label>
                    <label className="full-width">
                        Vloz verejny text z Bookingu/Airbnb/Google/webu nebo vlastni poznamky
                        <textarea value={sourceDraft.content} onChange={(event) => updateSourceDraft('content', event.target.value)} rows={6} />
                    </label>
                </div>

                <div className="button-group">
                    <button className="secondary-button" disabled={!sourceDraft.content.trim()} onClick={addSourceMaterial} type="button">
                        <Plus size={18} aria-hidden="true" />
                        Pridat podklad
                    </button>
                    <button className="primary-button" disabled={sourceMaterials.length === 0} onClick={onPrepareAudit} type="button">
                        <Sparkles size={18} aria-hidden="true" />
                        Pripravit auditova pozorovani
                    </button>
                </div>

                <div className="material-list">
                    {sourceMaterials.length === 0 ? (
                        <div className="empty-inline">Zatim tu nejsou zadne podklady. URL otevri rucne a vloz verejny text nebo poznamku ze screenshotu.</div>
                    ) : (
                        sourceMaterials.map((material) => {
                            const linkedSource = publicLinks.find((link) => link.id === material.sourceLinkId);
                            return (
                                <div className="material-card" key={material.id}>
                                    <div>
                                        <strong>{material.title || sourceMaterialTypeLabels[material.type]}</strong>
                                        <small>{sourceMaterialTypeLabels[material.type]}{linkedSource ? ` · ${linkedSource.label || linkedSource.url}` : ''}</small>
                                    </div>
                                    <p>{material.content}</p>
                                    <button className="secondary-button compact-button danger-button" onClick={() => removeSourceMaterial(material.id)} type="button">
                                        <Trash2 size={16} aria-hidden="true" />
                                        Odebrat
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            </section>

            <section className="nested-section generation-controls">
                <div>
                    <p className="eyebrow">Vystupy</p>
                    <h2>Generovani z pripravenych pozorovani</h2>
                    {!canGenerateAudit ? <p className="section-help">Nejdriv vloz verejny text nebo poznamky a klikni na Pripravit auditova pozorovani.</p> : null}
                </div>
                <div className="button-group">
                    <button className="secondary-button" onClick={() => onGenerateText?.('internalAgentBrief')} type="button">
                        <ClipboardCheck size={18} aria-hidden="true" />
                        Vygenerovat interní poznámky agenta
                    </button>
                    <button className="secondary-button" onClick={() => onGenerateText?.('clientMiniAudit')} type="button">
                        <Sparkles size={18} aria-hidden="true" />
                        Vygenerovat 3 nápady zdarma
                    </button>
                    <button className="secondary-button" onClick={() => onGenerateText?.('generatedOutreach')} type="button">
                        <Mail size={18} aria-hidden="true" />
                        Vygenerovat prvni osloveni
                    </button>
                    <button className="secondary-button" onClick={() => onGenerateText?.('generatedFollowUp')} type="button">
                        <Send size={18} aria-hidden="true" />
                        Vygenerovat follow-up
                    </button>
                    <button className="secondary-button" onClick={() => onGenerateText?.('generatedOffer')} type="button">
                        <ClipboardCheck size={18} aria-hidden="true" />
                        Vygenerovat možnou placenou návaznost
                    </button>
                </div>
            </section>

            <section className="nested-section manual-tuning">
                <div>
                    <p className="eyebrow">Rucni doladeni</p>
                    <h2>Auditova pole</h2>
                </div>
                <div className="form-grid two-column">
                <label>
                    Prvni dojem z nabidky
                    <textarea value={draftLead.firstImpression} onChange={(event) => onChange('firstImpression', event.target.value)} rows={5} />
                </label>
                <label>
                    Co je na nabidce silne
                    <textarea value={draftLead.strengths} onChange={(event) => onChange('strengths', event.target.value)} rows={6} />
                </label>
                <label>
                    Hlavni fotka - verdikt
                    <select value={draftLead.mainPhotoVerdict} onChange={(event) => onChange('mainPhotoVerdict', event.target.value as Lead['mainPhotoVerdict'])}>
                        {(Object.keys(mainPhotoVerdictLabels) as Lead['mainPhotoVerdict'][]).map((verdict) => (
                            <option key={verdict} value={verdict}>
                                {mainPhotoVerdictLabels[verdict]}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Hlavni fotka - konkretni poznamka
                    <textarea
                        value={draftLead.mainPhotoObservation}
                        onChange={(event) => onChange('mainPhotoObservation', event.target.value)}
                        rows={6}
                    />
                </label>
                <label>
                    Pokud by se hlavni fotka menila: jaka a proc
                    <textarea
                        value={draftLead.betterPhotoSuggestion}
                        onChange={(event) => onChange('betterPhotoSuggestion', event.target.value)}
                        rows={6}
                    />
                </label>
                <label>
                    Poradi prvnich fotek - konkretni poznamka
                    <textarea
                        value={draftLead.photoOrderObservation}
                        onChange={(event) => onChange('photoOrderObservation', event.target.value)}
                        rows={6}
                    />
                </label>
                <label>
                    Popis nabidky - konkretni poznamka
                    <textarea
                        value={draftLead.descriptionObservation}
                        onChange={(event) => onChange('descriptionObservation', event.target.value)}
                        rows={6}
                    />
                </label>
                <label>
                    Check-in / prijezd / parkovani viditelne verejne
                    <textarea value={draftLead.checkInParkingInfo} onChange={(event) => onChange('checkInParkingInfo', event.target.value)} rows={6} />
                </label>
                <label>
                    Signaly z recenzi - citace nebo shrnuti
                    <textarea value={draftLead.reviewSignals} onChange={(event) => onChange('reviewSignals', event.target.value)} rows={6} />
                </label>
                <label>
                    Co muze host nepochopit
                    <textarea value={draftLead.guestConfusion} onChange={(event) => onChange('guestConfusion', event.target.value)} rows={6} />
                </label>
                <label>
                    Nejvetsi obchodni prilezitost
                    <textarea value={draftLead.businessOpportunity} onChange={(event) => onChange('businessOpportunity', event.target.value)} rows={6} />
                </label>
                <label>
                    Uhel osloveni
                    <select value={draftLead.selectedOfferAngle} onChange={(event) => onChange('selectedOfferAngle', event.target.value as OfferAngle)}>
                        {(Object.keys(offerAngleLabels) as OfferAngle[]).map((angle) => (
                            <option key={angle} value={angle}>
                                {offerAngleLabels[angle]}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="full-width">
                    Verejne signaly
                    <textarea
                        value={joinLines(draftLead.publicSignals)}
                        onChange={(event) => onChange('publicSignals', splitLines(event.target.value))}
                        rows={5}
                    />
                </label>
                </div>
            </section>

            <section className="nested-section">
                <div className="panel-header compact-header">
                    <div>
                        <p className="eyebrow">Doporuceni z evidence</p>
                        <h2>Quick wins</h2>
                    </div>
                    <button className="secondary-button" onClick={addQuickWin} type="button">
                        <Plus size={18} aria-hidden="true" />
                        Pridat quick win
                    </button>
                </div>
                <div className="quick-win-list">
                    {structuredQuickWins.length === 0 ? <div className="scope-note">{draftLead.needsAgentAnalysis ? 'Lead zatím nemá dost evidence pro quick wins. Spusť analýzu nebo přidej screenshoty/veřejné podklady.' : 'Dopln 3 hlavni quick wins. Bez nich generator nevytvori obecne rady.'}</div> : null}
                    {structuredQuickWins.map((quickWin, index) => (
                        <div className="quick-win-card" key={quickWin.id}>
                            <div className="label-row">
                                <strong>Quick win #{index + 1}</strong>
                                <button className="secondary-button compact-button danger-button" onClick={() => removeQuickWin(quickWin.id)} type="button">
                                    <Trash2 size={16} aria-hidden="true" />
                                    Odebrat
                                </button>
                            </div>
                            <div className="form-grid">
                                <label>
                                    Title
                                    <input value={quickWin.title} onChange={(event) => updateQuickWin(quickWin.id, 'title', event.target.value)} />
                                </label>
                                <label>
                                    Why
                                    <input value={quickWin.why} onChange={(event) => updateQuickWin(quickWin.id, 'why', event.target.value)} />
                                </label>
                                <label className="full-width">
                                    Action
                                    <textarea value={quickWin.action} onChange={(event) => updateQuickWin(quickWin.id, 'action', event.target.value)} rows={3} />
                                </label>
                                <label className="full-width">
                                    Source evidence
                                    <textarea value={quickWin.sourceEvidence} onChange={(event) => updateQuickWin(quickWin.id, 'sourceEvidence', event.target.value)} rows={3} />
                                </label>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {waitingForWebsiteAnalysis ? (
                <div className="scope-note warning-note">
                    <strong>Klientské výstupy čekají na obchodní analýzu.</strong>
                    <span>Nezobrazují se tu prázdné audity ani oslovení. Nejdřív klikni na „Analyzovat z extrahovaného webu“ v detailu leadu.</span>
                </div>
            ) : (
            <>
            {clientOutputNeedsReview ? (
                <div className="scope-note warning-note">
                    <strong>Výstup zatím není připravený k odeslání.</strong>
                    {(draftLead.notReadyReasons?.length ? draftLead.notReadyReasons : ['Klientské texty jsou uložené jen jako draft k ruční kontrole.']).map((reason) => <span key={reason}>{reason}</span>)}
                </div>
            ) : null}
            <div className="generated-grid">
                <GeneratedTextArea
                    copiedTextId={copiedTextId}
                    field="internalAgentBrief"
                    label="Interní poznámky agenta"
                    onChange={onChange}
                    onCopyText={onCopyText}
                    textId="internal-agent-brief"
                    value={draftLead.internalAgentBrief}
                />
                <GeneratedTextArea
                    copiedTextId={copiedTextId}
                    field="clientMiniAudit"
                    label="3 nápady zdarma"
                    onChange={onChange}
                    onCopyText={onCopyText}
                    textId="client-mini-audit"
                    value={draftLead.clientMiniAudit || draftLead.generatedMiniAudit}
                />
                <GeneratedTextArea
                    copiedTextId={copiedTextId}
                    field="generatedOutreach"
                    label="První oslovení"
                    onChange={onChange}
                    onCopyText={onCopyText}
                    textId="outreach"
                    value={draftLead.generatedOutreach}
                />
                <GeneratedTextArea
                    copiedTextId={copiedTextId}
                    field="generatedFollowUp"
                    label="Follow-up"
                    onChange={onChange}
                    onCopyText={onCopyText}
                    textId="follow-up"
                    value={draftLead.generatedFollowUp}
                />
                <GeneratedTextArea
                    copiedTextId={copiedTextId}
                    field="generatedOffer"
                    label="Možná placená návaznost"
                    onChange={onChange}
                    onCopyText={onCopyText}
                    textId="offer"
                    value={draftLead.generatedOffer}
                />
            </div>
            </>
            )}
        </section>
    );
}

interface GeneratedTextAreaProps {
    copiedTextId: string;
    field: 'internalAgentBrief' | 'clientMiniAudit' | 'generatedMiniAudit' | 'generatedOutreach' | 'generatedFollowUp' | 'generatedOffer';
    label: string;
    onChange: LeadEditorProps['onChange'];
    onCopyText?: (textId: string, value: string) => void;
    textId: string;
    value: string;
}

function GeneratedTextArea({ copiedTextId, field, label, onChange, onCopyText, textId, value }: GeneratedTextAreaProps) {
    const displayValue = value ?? '';
    const handleCopy = (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        onCopyText?.(textId, displayValue);
    };

    return (
        <div className="stacked-label generated-output">
            <div className="label-row">
                <span>{label}</span>
                <button className="copy-button" disabled={!displayValue.trim()} onClick={handleCopy} type="button">
                    <Clipboard size={16} aria-hidden="true" />
                    {copiedTextId === textId ? 'Zkopirovano' : 'Zkopirovat text'}
                </button>
            </div>
            <textarea
                aria-label={label}
                placeholder="Zatim neni nic vygenerovano. Vypln verejny audit a pouzij tlacitko pro generovani."
                value={displayValue}
                onChange={(event) => onChange(field, event.target.value)}
                rows={12}
            />
        </div>
    );
}

function EmptyState({ onCreateLead }: { onCreateLead: () => void }) {
    return (
        <section className="panel empty-state">
            <h2>Zatim tu neni zadny lead</h2>
            <button className="primary-button" onClick={onCreateLead} type="button">
                <Plus size={18} aria-hidden="true" />
                Pridat prvni lead
            </button>
        </section>
    );
}

export default App;