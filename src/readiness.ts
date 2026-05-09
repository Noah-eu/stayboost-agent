import { clientTextSanitizerDiagnostics } from './clientCopy';
import { validateEvidenceClaims } from './evidenceClaimValidator';
import { freeIdeaSpecificityDiagnostics } from './ideaSpecificity';
import type { ClientOutputStatus, GuestGuidePreviewStatus, Lead, LeadStatus, QuickWin } from './types';

export type LeadNextRecommendedAction =
    | 'needs-evidence-review'
    | 'needs-idea-review'
    | 'needs-extraction-review'
    | 'needs-official-website'
    | 'needs-owned-website-or-screenshot-review'
    | 'needs-contact-review'
    | 'analyze-from-extracted-website'
    | 'extract-website-or-add-evidence'
    | 'complete-agent-analysis'
    | 'generate-client-outputs'
    | 'needs-copy-review'
    | 'ready-to-review';

export interface LeadWorkflowReadiness {
    hasWebsiteExtraction: boolean;
    hasAgentAnalysis: boolean;
    hasQuickWins: boolean;
    hasClientOutputs: boolean;
    rawClientTextReady: boolean;
    clientTextReady: boolean;
    freeIdeasReady: boolean;
    evidenceClaimReady: boolean;
    guestGuidePreviewReady: boolean;
    contactReady: boolean;
    clientOutputStatus: ClientOutputStatus;
    guestGuidePreviewStatus: GuestGuidePreviewStatus;
    nextRecommendedAction: LeadNextRecommendedAction;
    notReadyReasons: string[];
    statusLabel: LeadStatus;
    unsupportedClientClaims: string[];
    unsupportedSignalClaims: string[];
    freeIdeaStructuralIssues: string[];
}

const uniqueStrings = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const isSocialOwnershipStatus = (status?: string) => ['social-profile', 'social-platform-login', 'no-owned-website-detected'].includes(status ?? '');
const completeIdea = (idea: QuickWin) => Boolean(idea.title?.trim() && idea.why?.trim() && idea.action?.trim() && idea.sourceEvidence?.trim());

const ideaSetForLead = (lead: Pick<Lead, 'freeIdeas' | 'structuredQuickWins'>) => (lead.freeIdeas?.length ? lead.freeIdeas : lead.structuredQuickWins ?? []).slice(0, 3);

const freeIdeaStructuralIssuesForLead = (lead: Pick<Lead, 'freeIdeas' | 'structuredQuickWins' | 'websiteExtraction' | 'strengths' | 'publicSignals' | 'checkInParkingInfo'>) => {
    const ideas = ideaSetForLead(lead);
    const issues = ideas.flatMap((idea, index) => [
        !idea.title?.trim() ? `free idea ${index + 1}: chybí title` : '',
        !idea.why?.trim() ? `free idea ${index + 1}: chybí why` : '',
        !idea.action?.trim() ? `free idea ${index + 1}: chybí action` : '',
        !idea.sourceEvidence?.trim() ? `free idea ${index + 1}: chybí sourceEvidence` : '',
        idea.candidateSpecificity === 'generic' ? `free idea ${index + 1}: candidateSpecificity je generic` : '',
    ]);

    if (ideas.length !== 3) issues.push(`free ideas: očekávány 3, aktuálně ${ideas.length}`);

    return uniqueStrings(issues);
};

const freeIdeaUnsupportedClaims = (lead: Lead) => ideaSetForLead(lead).flatMap((idea) => {
    const diagnostics = validateEvidenceClaims({
        ...lead,
        clientMiniAudit: '',
        generatedMiniAudit: '',
        freeIdeaPurpose: '',
        paidNextStep: '',
        generatedOutreach: '',
        generatedOffer: '',
        guestGuideSecondEmail: '',
        guestGuidePreview: undefined,
        structuredQuickWins: [idea],
        freeIdeas: [idea],
    });

    return [...diagnostics.unsupportedClientClaims, ...diagnostics.unsupportedSignalClaims];
});

export function computeLeadWorkflowReadiness(lead: Lead): LeadWorkflowReadiness {
    const clientOutputs = [lead.clientMiniAudit || lead.generatedMiniAudit, lead.generatedOutreach, lead.generatedFollowUp, lead.generatedOffer];
    const clientDiagnostics = clientTextSanitizerDiagnostics(clientOutputs);
    const ideaDiagnostics = freeIdeaSpecificityDiagnostics(lead);
    const evidenceDiagnostics = validateEvidenceClaims(lead);
    const ownershipStatus = lead.websiteExtraction?.websiteOwnershipStatus ?? lead.websiteOwnershipStatus;
    const isSocialSource = isSocialOwnershipStatus(ownershipStatus);
    const hasWebsiteExtraction = Boolean(lead.websiteExtraction && ['completed', 'partial'].includes(lead.websiteExtraction.status));
    const hasAgentAnalysis = Boolean(lead.createdFromAgentAnalysis && !lead.needsAgentAnalysis);
    const hasClientOutputs = Boolean(clientOutputs[0].trim() && lead.generatedOutreach.trim() && lead.generatedFollowUp.trim() && lead.generatedOffer.trim());
    const freeIdeaStructuralIssues = freeIdeaStructuralIssuesForLead(lead);
    const unsupportedFreeIdeaClaims = uniqueStrings(freeIdeaUnsupportedClaims(lead));
    const hasQuickWins = ideaSetForLead(lead).length === 3 && freeIdeaStructuralIssues.length === 0;
    const freeIdeasReady = ideaDiagnostics.freeIdeasReady
        && hasQuickWins
        && unsupportedFreeIdeaClaims.length === 0
        && ideaSetForLead(lead).every((idea) => completeIdea(idea) && idea.candidateSpecificity !== 'generic');
    const unsupportedClientClaims = uniqueStrings([...(lead.unsupportedClientClaims ?? []), ...evidenceDiagnostics.unsupportedClientClaims]);
    const unsupportedSignalClaims = uniqueStrings([...(lead.unsupportedSignalClaims ?? []), ...evidenceDiagnostics.unsupportedSignalClaims]);
    const evidenceClaimReady = evidenceDiagnostics.evidenceClaimReady && unsupportedClientClaims.length === 0 && unsupportedSignalClaims.length === 0;
    const guestGuidePreviewDiagnostics = lead.guestGuidePreview || lead.guestGuideSecondEmail
        ? validateEvidenceClaims({
            ...lead,
            clientMiniAudit: '',
            generatedMiniAudit: '',
            freeIdeaPurpose: '',
            paidNextStep: '',
            generatedOutreach: '',
            generatedOffer: '',
            freeIdeas: [],
            structuredQuickWins: [],
        })
        : { evidenceClaimReady: true, unsupportedClientClaims: [], unsupportedSignalClaims: [] };
    const guestGuidePreviewReady = guestGuidePreviewDiagnostics.evidenceClaimReady;
    const contactReady = lead.contactQuality?.contactReady ?? Boolean((lead.websiteExtraction?.contact.emails.length ?? 0) + (lead.websiteExtraction?.contact.phones.length ?? 0));
    const needsOfficialWebsite = Boolean(lead.websiteExtraction && (lead.websiteExtraction.extractionAllowed === false || ownershipStatus && ownershipStatus !== 'official'));
    const rawClientTextReady = clientDiagnostics.clientTextReady;
    const clientTextReady = rawClientTextReady && evidenceClaimReady && freeIdeasReady && guestGuidePreviewReady;
    const notReadyReasons = uniqueStrings([
        !evidenceClaimReady ? 'Výstup obsahuje tvrzení bez evidence.' : '',
        unsupportedClientClaims.length > 0 ? `chybí evidence pro klientské signály: ${unsupportedClientClaims.join(', ')}` : '',
        unsupportedSignalClaims.length > 0 ? `chybí evidence pro interní signály: ${unsupportedSignalClaims.join(', ')}` : '',
        !freeIdeasReady ? 'free ideas nejsou kompletní nebo dost konkrétní' : '',
        ...freeIdeaStructuralIssues,
        unsupportedFreeIdeaClaims.length > 0 ? `free ideas obsahují nepodložené claimy: ${unsupportedFreeIdeaClaims.join(', ')}` : '',
        ideaDiagnostics.repeatedTemplateWarning ? 'free ideas opakují šablonu' : '',
        ideaDiagnostics.repeatedConceptWarning ? 'free ideas opakují stejný koncept' : '',
        ideaDiagnostics.localExperienceExtractionReady === false ? 'Chybí stránka Možnosti rekreace, která je pro tento lead důležitá.' : '',
        !guestGuidePreviewReady ? `Guest Guide Preview obsahuje tvrzení bez evidence: ${[...guestGuidePreviewDiagnostics.unsupportedClientClaims, ...guestGuidePreviewDiagnostics.unsupportedSignalClaims].join(', ')}` : '',
        !rawClientTextReady ? 'klientský text obsahuje interní nebo nevhodné formulace' : '',
        !contactReady ? 'kontakt není připravený' : '',
    ]);

    let nextRecommendedAction: LeadNextRecommendedAction = 'ready-to-review';
    if (!evidenceClaimReady || !guestGuidePreviewReady) nextRecommendedAction = 'needs-evidence-review';
    else if (!freeIdeasReady || ideaDiagnostics.repeatedConceptWarning) nextRecommendedAction = 'needs-idea-review';
    else if (isSocialSource && !contactReady) nextRecommendedAction = 'needs-owned-website-or-screenshot-review';
    else if (needsOfficialWebsite) nextRecommendedAction = 'needs-official-website';
    else if (ideaDiagnostics.localExperienceExtractionReady === false) nextRecommendedAction = 'needs-extraction-review';
    else if (hasWebsiteExtraction && lead.contactQuality?.emailSource === 'discovery-fallback') nextRecommendedAction = contactReady ? 'needs-contact-review' : 'needs-extraction-review';
    else if (hasWebsiteExtraction && !contactReady) nextRecommendedAction = 'needs-contact-review';
    else if (hasWebsiteExtraction && lead.needsAgentAnalysis && !hasAgentAnalysis) nextRecommendedAction = 'analyze-from-extracted-website';
    else if (!hasWebsiteExtraction) nextRecommendedAction = 'extract-website-or-add-evidence';
    else if (!hasQuickWins) nextRecommendedAction = 'complete-agent-analysis';
    else if (!hasClientOutputs) nextRecommendedAction = 'generate-client-outputs';
    else if (!rawClientTextReady) nextRecommendedAction = 'needs-copy-review';

    const clientOutputStatus: ClientOutputStatus = clientTextReady && notReadyReasons.length === 0 ? 'ready' : 'draft-needs-review';
    const guestGuidePreviewStatus: GuestGuidePreviewStatus = lead.guestGuidePreview || lead.guestGuideSecondEmail
        ? guestGuidePreviewReady && evidenceClaimReady ? lead.guestGuidePreviewStatus === 'not-created' ? 'created' : lead.guestGuidePreviewStatus ?? 'created' : 'draft-needs-review'
        : lead.guestGuidePreviewStatus ?? 'not-created';
    const statusLabel: LeadStatus = clientOutputStatus === 'ready' && nextRecommendedAction === 'ready-to-review'
        ? 'Audit pripraven'
        : lead.status === 'Audit pripraven' ? 'Novy' : lead.status;

    return {
        hasWebsiteExtraction,
        hasAgentAnalysis,
        hasQuickWins,
        hasClientOutputs,
        rawClientTextReady,
        clientTextReady,
        freeIdeasReady,
        evidenceClaimReady,
        guestGuidePreviewReady,
        contactReady,
        clientOutputStatus,
        guestGuidePreviewStatus,
        nextRecommendedAction,
        notReadyReasons,
        statusLabel,
        unsupportedClientClaims,
        unsupportedSignalClaims,
        freeIdeaStructuralIssues,
    };
}
