import type { LeadAgentAnalysis, LeadAgentCandidate, LeadAgentDiagnostic, LeadAgentSession } from './leadAgentTypes';
import type { Lead, LeadScreenshot, WebsiteExtractionResult } from './types';

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
    return withMetadata('lead', {
        lead,
        diagnostics: context.diagnostics,
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
