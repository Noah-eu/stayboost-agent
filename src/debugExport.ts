import type { LeadAgentAnalysis, LeadAgentCandidate, LeadAgentDiagnostic, LeadAgentSession } from './leadAgentTypes';
import { cleanLeadDisplayName, clientTextSanitizerDiagnostics } from './clientCopy';
import { validateEvidenceClaims } from './evidenceClaimValidator';
import { freeIdeaSpecificityDiagnostics } from './ideaSpecificity';
import { extractRejectedPhones, extractValidPhones, isLikelyPhoneNumber, mergePhones } from './phoneValidation';
import { recommendProductForLead } from './productRecommendation';
import type { ContactQuality, Lead, LeadScreenshot, WebsiteExtractionResult } from './types';

export type DebugExportType = 'run' | 'candidate' | 'lead' | 'website-extraction';

export interface DebugExportOptions {
    includeScreenshotDataUrls?: boolean;
}

const sensitiveKeyPattern = /(apiKey|token|secret|authorization|password|bearer)/i;
const appName = 'StayBoost Agent';
const privacyNote = 'Secrets are redacted. Screenshot data URLs are omitted unless explicitly included.';

const isPlainObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const estimateDataUrlBytes = (dataUrl = '') => {
    const base64 = dataUrl.split(',')[1] || dataUrl;
    return Math.round((base64.length * 3) / 4);
};

const sanitizeScreenshot = (screenshot: LeadScreenshot, options: DebugExportOptions) => {
    const base = {
        id: screenshot.id,
        fileName: screenshot.fileName,
        type: screenshot.type,
        note: screenshot.note,
        sizeEstimateBytes: estimateDataUrlBytes(screenshot.dataUrl),
        hasDataUrl: Boolean(screenshot.dataUrl),
        previewOmittedReason: options.includeScreenshotDataUrls ? null : 'Screenshot dataUrl omitted by default to keep debug JSON small.',
    };

    return options.includeScreenshotDataUrls ? { ...base, dataUrl: screenshot.dataUrl } : base;
};

export function sanitizeForExport(value: unknown, options: DebugExportOptions = {}): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => sanitizeForExport(item, options));
    }

    if (!isPlainObject(value)) {
        return value;
    }

    const maybeScreenshot = value as Partial<LeadScreenshot>;
    if (typeof maybeScreenshot.id === 'string' && typeof maybeScreenshot.fileName === 'string' && typeof maybeScreenshot.dataUrl === 'string') {
        return sanitizeScreenshot(maybeScreenshot as LeadScreenshot, options);
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, entryValue]) => {
            if (sensitiveKeyPattern.test(key)) return [key, '[REDACTED]'];
            if (key === 'dataUrl' && typeof entryValue === 'string' && !options.includeScreenshotDataUrls) {
                return [key, '[OMITTED: screenshot dataUrl omitted by default]'];
            }
            return [key, sanitizeForExport(entryValue, options)];
        }),
    );
}

export function slugifyForFileName(value = 'export') {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80) || 'export';
}

const dateStamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const emailPattern = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const uniqueStrings = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const discoveryPhoneText = (lead: Pick<Lead, 'sourceMaterials' | 'notes'>) => [lead.notes, ...(lead.sourceMaterials ?? []).flatMap((material) => [material.title, material.content])].filter(Boolean).join('\n');
const isSocialOwnershipStatus = (status?: string) => ['social-profile', 'social-platform-login', 'no-owned-website-detected'].includes(status ?? '');
const extractAddressFromEvidence = (text = '') => text.match(/Pod\s+Kamenem\s+170(?:,\s*Český\s+Krumlov|,\s*Cesky\s+Krumlov)?/i)?.[0] || '';
const contactQualityForLead = (lead: Lead): ContactQuality => {
    const ownershipStatus = lead.websiteExtraction?.websiteOwnershipStatus ?? lead.websiteOwnershipStatus ?? 'official';
    const allPhones = lead.websiteExtraction?.contact.phones ?? [];
    const websitePhones = uniqueStrings(allPhones.filter((phone) => isLikelyPhoneNumber(phone)));
    const evidenceText = discoveryPhoneText(lead);
    const discoveryPhones = extractValidPhones(evidenceText);
    const validPhones = mergePhones(websitePhones, discoveryPhones);
    const rejectedPhones = uniqueStrings([...allPhones.filter((phone) => !isLikelyPhoneNumber(phone)), ...extractRejectedPhones(evidenceText)]);
    const socialEmails = uniqueStrings([...(evidenceText.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []), lead.email].map((email) => email.trim().toLowerCase()).filter((email) => emailPattern.test(email)));
    const address = extractAddressFromEvidence(evidenceText);
    if (isSocialOwnershipStatus(ownershipStatus)) {
        return {
            validEmails: socialEmails,
            validPhones,
            rejectedPhones,
            address,
            emailSource: socialEmails.length > 0 ? 'search-or-social-profile' : 'missing',
            phoneSource: validPhones.length > 0 ? 'search-or-social-profile' : 'missing',
            addressSource: address ? 'search-or-social-profile' : 'missing',
            contactReady: socialEmails.length > 0 || validPhones.length > 0,
        };
    }
    if (ownershipStatus !== 'official') {
        return {
            validEmails: [],
            validPhones: [],
            rejectedPhones,
            address,
            emailSource: 'missing',
            phoneSource: 'missing',
            addressSource: address ? 'search-or-social-profile' : 'missing',
            contactReady: false,
        };
    }
    const websiteEmails = uniqueStrings((lead.websiteExtraction?.contact.emails ?? []).map((email) => email.trim().toLowerCase()).filter((email) => emailPattern.test(email)));
    const fallbackEmail = (lead.email || '').trim().toLowerCase();
    const validEmails = websiteEmails.length > 0 ? websiteEmails : emailPattern.test(fallbackEmail) ? [fallbackEmail] : [];

    return {
        validEmails,
        validPhones,
        rejectedPhones,
        address,
        emailSource: websiteEmails.length > 0 ? 'website' : validEmails.length > 0 ? 'discovery-fallback' : 'missing',
        phoneSource: websitePhones.length > 0 && discoveryPhones.length > 0 ? 'website-and-discovery' : websitePhones.length > 0 ? 'website' : discoveryPhones.length > 0 ? 'discovery-fallback' : 'missing',
        addressSource: address ? 'search-or-social-profile' : 'missing',
        contactReady: validEmails.length > 0 || validPhones.length > 0,
    };
};

const leadWorkflowState = (lead: Lead) => {
    const hasWebsiteExtraction = Boolean(lead.websiteExtraction && ['completed', 'partial'].includes(lead.websiteExtraction.status));
    const hasAgentAnalysis = Boolean(lead.createdFromAgentAnalysis && !lead.needsAgentAnalysis);
    const hasQuickWins = (lead.structuredQuickWins ?? []).filter((win) => win.title?.trim() && win.why?.trim() && win.action?.trim()).length === 3;
    const clientOutputs = [lead.clientMiniAudit || lead.generatedMiniAudit, lead.generatedOutreach, lead.generatedFollowUp, lead.generatedOffer];
    const hasClientOutputs = Boolean(clientOutputs[0].trim() && lead.generatedOutreach.trim() && lead.generatedFollowUp.trim() && lead.generatedOffer.trim());
    const clientDiagnostics = clientTextSanitizerDiagnostics(clientOutputs);
    const ideaDiagnostics = freeIdeaSpecificityDiagnostics(lead);
    const contactQuality = lead.contactQuality ?? contactQualityForLead(lead);
    const evidenceDiagnostics = validateEvidenceClaims(lead);
    const ownershipStatus = lead.websiteExtraction?.websiteOwnershipStatus ?? lead.websiteOwnershipStatus;
    const isSocialSource = isSocialOwnershipStatus(ownershipStatus);
    const needsOfficialWebsite = Boolean(lead.websiteExtraction && (lead.websiteExtraction.extractionAllowed === false || ownershipStatus && ownershipStatus !== 'official'));

    return {
        hasWebsiteExtraction,
        hasAgentAnalysis,
        hasQuickWins,
        hasClientOutputs,
        clientTextReady: clientDiagnostics.clientTextReady,
        contactReady: contactQuality.contactReady,
        contactQuality,
        sourceUrlClassification: lead.websiteExtraction?.sourceUrlClassification ?? lead.sourceUrlClassification,
        socialProfileStatus: lead.websiteExtraction?.socialProfileStatus ?? lead.socialProfileStatus ?? 'none',
        ownedWebsiteDetected: lead.websiteExtraction?.ownedWebsiteDetected ?? lead.ownedWebsiteDetected ?? ownershipStatus === 'official',
        needsOwnedWebsite: lead.websiteExtraction?.needsOwnedWebsite ?? lead.needsOwnedWebsite ?? isSocialSource,
        needsScreenshotAnalysis: lead.needsScreenshotAnalysis ?? isSocialSource,
        freeIdeasSpecificEnough: ideaDiagnostics.freeIdeasReady && !ideaDiagnostics.repeatedConceptWarning,
        leadPlaybook: ideaDiagnostics.leadPlaybook,
        leadPlaybookReason: ideaDiagnostics.leadPlaybookReason,
        playbookSignals: ideaDiagnostics.playbookSignals,
        freeIdeasDiversityScore: ideaDiagnostics.freeIdeasDiversityScore,
        repeatedConceptWarning: ideaDiagnostics.repeatedConceptWarning,
        localExperienceExtractionReady: ideaDiagnostics.localExperienceExtractionReady,
        extractedPriorityPages: lead.websiteExtraction?.extractedPriorityPages ?? [],
        missedPriorityPages: lead.websiteExtraction?.missedPriorityPages ?? [],
        discoveredNavigationLinks: lead.websiteExtraction?.discoveredNavigationLinks ?? [],
        priorityPagesFoundButNotExtracted: lead.websiteExtraction?.priorityPagesFoundButNotExtracted ?? [],
        missingClaimsSuppressedByNavigation: lead.websiteExtraction?.missingClaimsSuppressedByNavigation ?? [],
        needsPriorityPageExtraction: lead.websiteExtraction?.needsPriorityPageExtraction ?? false,
        localExperienceSignals: lead.websiteExtraction?.localExperienceSignals ?? [],
        arrivalDeadlineSignals: {
            checkInWindowStart: lead.websiteExtraction?.checkInWindowStart,
            checkInWindowEnd: lead.websiteExtraction?.checkInWindowEnd,
            lateArrivalCondition: lead.websiteExtraction?.lateArrivalCondition,
            receptionHours: lead.websiteExtraction?.receptionHours,
            checkoutTime: lead.websiteExtraction?.checkoutTime,
            parkingReservationRequired: lead.websiteExtraction?.parkingReservationRequired,
            parkingPaid: lead.websiteExtraction?.parkingPaid,
            parkingLimited: lead.websiteExtraction?.parkingLimited,
            parkingDistanceMeters: lead.websiteExtraction?.parkingDistanceMeters,
        },
        unsupportedClientClaims: lead.unsupportedClientClaims ?? evidenceDiagnostics.unsupportedClientClaims,
        unsupportedSignalClaims: lead.unsupportedSignalClaims ?? evidenceDiagnostics.unsupportedSignalClaims,
        evidenceBlockedClaims: uniqueStrings([...(lead.unsupportedClientClaims ?? evidenceDiagnostics.unsupportedClientClaims), ...(lead.unsupportedSignalClaims ?? evidenceDiagnostics.unsupportedSignalClaims)]),
        evidenceClaimReady: lead.evidenceClaimReady ?? evidenceDiagnostics.evidenceClaimReady,
        clientOutputStatus: lead.clientOutputStatus ?? (ideaDiagnostics.freeIdeasReady && evidenceDiagnostics.evidenceClaimReady ? 'ready' : 'draft-needs-review'),
        notReadyReasons: lead.notReadyReasons ?? [],
        positiveSignalsUsedCount: ideaDiagnostics.positiveSignalsUsedCount,
        missingSignalsUsedCount: ideaDiagnostics.missingSignalsUsedCount,
        nextRecommendedAction: isSocialSource
            ? contactQuality.contactReady ? 'ready-to-review' : 'needs-owned-website-or-screenshot-review'
            : needsOfficialWebsite
                ? 'needs-official-website'
            : ideaDiagnostics.localExperienceExtractionReady === false
                ? 'needs-extraction-review'
            : (lead.evidenceClaimReady ?? evidenceDiagnostics.evidenceClaimReady) === false
                ? 'needs-evidence-review'
            : hasWebsiteExtraction && contactQuality.emailSource === 'discovery-fallback'
            ? contactQuality.contactReady ? 'needs-contact-review' : 'needs-extraction-review'
            : hasWebsiteExtraction && !contactQuality.contactReady
                ? 'needs-contact-review'
                : hasWebsiteExtraction && !hasAgentAnalysis
            ? 'analyze-from-extracted-website'
            : !hasWebsiteExtraction
                ? 'extract-website-or-add-evidence'
                : !hasQuickWins
                    ? 'complete-agent-analysis'
                    : !hasClientOutputs
                        ? 'generate-client-outputs'
                        : !clientDiagnostics.clientTextReady
                            ? 'needs-copy-review'
                            : !ideaDiagnostics.freeIdeasReady || ideaDiagnostics.repeatedConceptWarning
                                ? 'needs-idea-review'
                                : 'ready-to-review',
    };
};

const candidateWorkflowState = (candidate: LeadAgentCandidate, analysis?: LeadAgentAnalysis) => ({
    hasWebsiteExtraction: Boolean(candidate.websiteExtraction && ['completed', 'partial'].includes(candidate.websiteExtraction.status)),
    hasAgentAnalysis: Boolean(analysis),
    hasQuickWins: (analysis?.quickWins ?? []).filter((win) => win.title?.trim() && win.why?.trim() && win.action?.trim()).length === 3,
    hasClientOutputs: false,
    nextRecommendedAction: candidate.websiteExtraction && (candidate.websiteExtraction.extractionAllowed === false || candidate.websiteExtraction.websiteOwnershipStatus && candidate.websiteExtraction.websiteOwnershipStatus !== 'official')
        ? 'needs-official-website'
        : candidate.websiteExtraction && !analysis ? 'analyze-from-extracted-website' : analysis ? 'add-analyzed-lead-to-crm' : 'extract-website-or-run-analysis',
});

export const debugFileNames = {
    run: (runId: string) => `stayboost-run-${slugifyForFileName(runId)}-${dateStamp()}.json`,
    candidate: (name: string) => `stayboost-candidate-${slugifyForFileName(name)}-${dateStamp()}.json`,
    lead: (name: string) => `stayboost-lead-${slugifyForFileName(name)}-${dateStamp()}.json`,
    websiteExtraction: (name: string) => `stayboost-website-extraction-${slugifyForFileName(name)}-${dateStamp()}.json`,
};

function withMetadata(exportType: DebugExportType, payload: Record<string, unknown>, options: DebugExportOptions = {}) {
    return sanitizeForExport({
        exportVersion: 1,
        exportedAt: new Date().toISOString(),
        app: appName,
        exportType,
        source: 'browser-local-export',
        privacyNote,
        options: {
            includeScreenshotDataUrls: Boolean(options.includeScreenshotDataUrls),
        },
        ...payload,
    }, options);
}

export function createRunDebugExport(session: LeadAgentSession, options: DebugExportOptions = {}) {
    return withMetadata('run', {
        run: {
            runId: session.runId,
            createdAt: session.createdAt,
            status: session.status,
            message: session.message,
            isMock: session.isMock,
            request: session.request,
            candidateFilter: session.candidateFilter,
            candidateSort: session.candidateSort,
            loadedFromStorage: session.loadedFromStorage,
            storedBannerDismissed: session.storedBannerDismissed,
        },
        providerInfo: {
            discoveryProvider: session.diagnostic?.discoverProvider ?? 'unknown',
            source: session.diagnostic?.source ?? (session.isMock ? 'demo fallback' : 'unknown'),
            health: session.health,
            healthMessage: session.healthMessage,
        },
        diagnostics: session.diagnostic,
        latestAnalysisDiagnostic: session.diagnostic?.analyzeProvider ? session.diagnostic : undefined,
        websiteExtractionDiagnostic: undefined,
        candidates: session.candidates,
        analyses: session.analyses,
        dismissedCandidateIds: session.dismissedCandidateIds,
    }, options);
}

export function createCandidateDebugExport(candidate: LeadAgentCandidate, context: { session?: LeadAgentSession; analysis?: LeadAgentAnalysis; diagnostic?: LeadAgentDiagnostic } = {}, options: DebugExportOptions = {}) {
    return withMetadata('candidate', {
        candidate,
        analysis: context.analysis,
        diagnostics: context.diagnostic ?? context.session?.diagnostic,
        latestAnalysisDiagnostic: context.analysis ? context.diagnostic ?? context.session?.diagnostic : undefined,
        websiteExtractionDiagnostic: candidate.websiteExtraction?.debug,
        workflowState: candidateWorkflowState(candidate, context.analysis),
        run: context.session ? {
            runId: context.session.runId,
            createdAt: context.session.createdAt,
            status: context.session.status,
            isMock: context.session.isMock,
            candidateFilter: context.session.candidateFilter,
            candidateSort: context.session.candidateSort,
        } : undefined,
        fallbackReason: (context.diagnostic ?? context.session?.diagnostic)?.fallbackReason ?? null,
    }, options);
}

export function createLeadDebugExport(lead: Lead, context: { diagnostics?: LeadAgentDiagnostic; analysis?: LeadAgentAnalysis } = {}, options: DebugExportOptions = {}) {
    const clientOutputs = [lead.clientMiniAudit || lead.generatedMiniAudit, lead.generatedOutreach, lead.generatedFollowUp, lead.generatedOffer];
    const latestDiagnostic = lead.latestAnalysisDiagnostic as { fallbackReason?: string } | undefined;
    const ideaDiagnostics = freeIdeaSpecificityDiagnostics(lead);
    const productRecommendation = recommendProductForLead(lead);
    const contactQuality = lead.contactQuality ?? contactQualityForLead(lead);
    const evidenceDiagnostics = validateEvidenceClaims(lead);

    return withMetadata('lead', {
        lead,
        cleanedLeadDisplayName: cleanLeadDisplayName(lead.name),
        outreachIntent: lead.outreachIntent ?? 'ask-permission-to-send-free-ideas',
        outreachTone: lead.outreachTone ?? 'humble-transparent-low-pressure',
        freeIdeaTeaser: lead.freeIdeaTeaser ?? '',
        freeIdeas: lead.freeIdeas ?? lead.structuredQuickWins ?? [],
        paidNextStep: lead.paidNextStep ?? lead.generatedOffer ?? '',
        recommendedProduct: lead.recommendedProduct ?? productRecommendation.recommendedProduct,
        recommendedProductReason: lead.recommendedProductReason ?? productRecommendation.recommendedProductReason,
        productRecommendationSignals: lead.productRecommendationSignals ?? productRecommendation.productRecommendationSignals,
        paidOfferShort: lead.paidOfferShort ?? productRecommendation.paidOfferShort,
        paidOfferDetails: lead.paidOfferDetails ?? productRecommendation.paidOfferDetails,
        clientOutputStatus: lead.clientOutputStatus ?? (ideaDiagnostics.freeIdeasReady && evidenceDiagnostics.evidenceClaimReady ? 'ready' : 'draft-needs-review'),
        notReadyReasons: lead.notReadyReasons ?? [],
        unsupportedClientClaims: lead.unsupportedClientClaims ?? evidenceDiagnostics.unsupportedClientClaims,
        unsupportedSignalClaims: lead.unsupportedSignalClaims ?? evidenceDiagnostics.unsupportedSignalClaims,
        evidenceBlockedClaims: uniqueStrings([...(lead.unsupportedClientClaims ?? evidenceDiagnostics.unsupportedClientClaims), ...(lead.unsupportedSignalClaims ?? evidenceDiagnostics.unsupportedSignalClaims)]),
        evidenceClaimReady: lead.evidenceClaimReady ?? evidenceDiagnostics.evidenceClaimReady,
        extractedPriorityPages: lead.websiteExtraction?.extractedPriorityPages ?? [],
        missedPriorityPages: lead.websiteExtraction?.missedPriorityPages ?? [],
        discoveredNavigationLinks: lead.websiteExtraction?.discoveredNavigationLinks ?? [],
        priorityPagesFoundButNotExtracted: lead.websiteExtraction?.priorityPagesFoundButNotExtracted ?? [],
        missingClaimsSuppressedByNavigation: lead.websiteExtraction?.missingClaimsSuppressedByNavigation ?? [],
        needsPriorityPageExtraction: lead.websiteExtraction?.needsPriorityPageExtraction ?? false,
        localExperienceSignals: lead.websiteExtraction?.localExperienceSignals ?? [],
        arrivalDeadlineSignals: {
            checkInWindowStart: lead.websiteExtraction?.checkInWindowStart,
            checkInWindowEnd: lead.websiteExtraction?.checkInWindowEnd,
            lateArrivalCondition: lead.websiteExtraction?.lateArrivalCondition,
            receptionHours: lead.websiteExtraction?.receptionHours,
            checkoutTime: lead.websiteExtraction?.checkoutTime,
            parkingReservationRequired: lead.websiteExtraction?.parkingReservationRequired,
            parkingPaid: lead.websiteExtraction?.parkingPaid,
            parkingLimited: lead.websiteExtraction?.parkingLimited,
            parkingDistanceMeters: lead.websiteExtraction?.parkingDistanceMeters,
        },
        guestGuidePreviewStatus: lead.guestGuidePreviewStatus ?? 'not-created',
        guestGuidePreview: lead.guestGuidePreview,
        guestGuideSecondEmail: lead.guestGuideSecondEmail ?? '',
        contactQuality,
        sourceUrlClassification: lead.websiteExtraction?.sourceUrlClassification ?? lead.sourceUrlClassification,
        socialProfileStatus: lead.websiteExtraction?.socialProfileStatus ?? lead.socialProfileStatus ?? 'none',
        ownedWebsiteDetected: lead.websiteExtraction?.ownedWebsiteDetected ?? lead.ownedWebsiteDetected ?? (lead.websiteExtraction?.websiteOwnershipStatus ?? lead.websiteOwnershipStatus) === 'official',
        needsOwnedWebsite: lead.websiteExtraction?.needsOwnedWebsite ?? lead.needsOwnedWebsite ?? isSocialOwnershipStatus(lead.websiteExtraction?.websiteOwnershipStatus ?? lead.websiteOwnershipStatus),
        needsScreenshotAnalysis: lead.needsScreenshotAnalysis ?? isSocialOwnershipStatus(lead.websiteExtraction?.websiteOwnershipStatus ?? lead.websiteOwnershipStatus),
        socialProfileEvidence: isSocialOwnershipStatus(lead.websiteExtraction?.websiteOwnershipStatus ?? lead.websiteOwnershipStatus) ? {
            sourceUrl: lead.websiteExtraction?.websiteUrl ?? lead.websiteOrOtaUrl ?? lead.publicProfileUrl,
            contactQuality,
            publicSignals: lead.publicSignals ?? [],
            sourceMaterials: (lead.sourceMaterials ?? []).map((material) => ({ title: material.title, type: material.type, preview: material.content.slice(0, 500) })),
        } : undefined,
        analysisSource: lead.websiteExtraction?.analysisSource ?? lead.analysisSource ?? 'unknown',
        extractionAllowedForWebsiteAudit: lead.websiteExtraction?.extractionAllowedForWebsiteAudit ?? lead.extractionAllowedForWebsiteAudit ?? false,
        websiteOwnershipStatus: lead.websiteExtraction?.websiteOwnershipStatus ?? lead.websiteOwnershipStatus ?? 'unknown',
        websiteOwnershipReason: lead.websiteExtraction?.websiteOwnershipReason ?? lead.websiteOwnershipReason ?? '',
        extractionAllowed: lead.websiteExtraction?.extractionAllowed ?? lead.extractionAllowed ?? true,
        officialWebsiteCandidateUrl: lead.websiteExtraction?.officialWebsiteCandidateUrl ?? lead.officialWebsiteCandidateUrl ?? '',
        directoryExtractedCandidates: lead.websiteExtraction?.directoryExtractedCandidates ?? lead.directoryExtractedCandidates ?? [],
        skippedAssetUrls: lead.websiteExtraction?.skippedAssetUrls ?? lead.skippedAssetUrls ?? [],
        directoryContact: lead.websiteExtraction?.directoryContact ?? lead.directoryContact,
        contactOwnershipStatus: lead.websiteExtraction?.contactOwnershipStatus ?? lead.contactOwnershipStatus ?? 'unknown',
        nextRecommendedAction: leadWorkflowState(lead).nextRecommendedAction,
        ...ideaDiagnostics,
        suppressedMissingSignals: lead.websiteExtraction?.suppressedMissingSignals ?? [],
        canonicalizationApplied: lead.evidenceCanonicalizationDiagnostic?.canonicalizationApplied ?? Boolean(lead.websiteExtraction),
        removedInvalidSignals: lead.evidenceCanonicalizationDiagnostic?.removedInvalidSignals ?? [],
        removedInvalidPhones: lead.evidenceCanonicalizationDiagnostic?.removedInvalidPhones ?? [],
        removedStaleSourceMaterials: lead.evidenceCanonicalizationDiagnostic?.removedStaleSourceMaterials ?? 0,
        staleSourceMaterialTitlesRemoved: lead.evidenceCanonicalizationDiagnostic?.staleSourceMaterialTitlesRemoved ?? [],
        ...clientTextSanitizerDiagnostics(clientOutputs),
        openAIIncomplete: latestDiagnostic?.fallbackReason === 'openai_incomplete' || context.diagnostics?.fallbackReason === 'openai_incomplete',
        diagnostics: context.diagnostics,
        latestAnalysisDiagnostic: lead.latestAnalysisDiagnostic ?? context.diagnostics,
        websiteExtractionDiagnostic: lead.websiteExtractionDiagnostic ?? lead.websiteExtraction?.debug,
        workflowState: leadWorkflowState(lead),
        analysis: context.analysis,
        sourceLimitations: lead.sourceLimitations,
        agentMetadata: {
            leadAgentRunId: lead.leadAgentRunId,
            agentAnalysisProvider: lead.agentAnalysisProvider,
            agentLeadStatus: lead.agentLeadStatus,
            evidenceLevel: lead.evidenceLevel,
            needsAgentAnalysis: lead.needsAgentAnalysis,
            opportunityType: lead.opportunityType,
            fitVerdict: lead.fitVerdict,
            confidence: lead.confidence,
            opportunityScore: lead.opportunityScore,
            automationNeedScore: lead.automationNeedScore,
            reviewFrictionScore: lead.reviewFrictionScore,
            publicMaturityScore: lead.publicMaturityScore,
        },
    }, options);
}

export function createWebsiteExtractionDebugExport(extraction: WebsiteExtractionResult, context: { candidate?: LeadAgentCandidate; lead?: Lead; diagnostic?: LeadAgentDiagnostic } = {}, options: DebugExportOptions = {}) {
    return withMetadata('website-extraction', {
        websiteExtraction: extraction,
        websiteExtractionDiagnostic: context.lead?.websiteExtractionDiagnostic ?? extraction.debug,
        workflowState: context.lead ? leadWorkflowState(context.lead) : context.candidate ? candidateWorkflowState(context.candidate) : undefined,
        candidate: context.candidate,
        lead: context.lead,
        diagnostics: context.diagnostic,
    }, options);
}

export function downloadJsonFile(fileName: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
