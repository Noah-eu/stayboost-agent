import { Clipboard, ClipboardCheck, ExternalLink, LayoutDashboard, Mail, Plus, Save, Search, Send, Sparkles, Trash2, Users } from 'lucide-react';
import { FormEvent, MouseEvent, useEffect, useMemo, useState } from 'react';
import { analyzeLead, discoverLeads } from './agentApi';
import { extractAuditObservations } from './auditExtractor';
import { generateFirstOutreach, generateFollowUp, generateMiniAudit, generateOffer } from './generators';
import { mockLeads } from './mockData';
import { LeadAgentAnalysis, LeadAgentCandidate, LeadAgentSearchRequest, LeadAgentSession } from './leadAgentTypes';
import {
    accommodationTypes,
    Lead,
    leadStatuses,
    LeadStatus,
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
} from './types';

type Screen = 'dashboard' | 'finder' | 'leads' | 'detail' | 'audit' | 'outreach' | 'offer';

const storageKey = 'stayboost-agent-leads';
const agentStorageKey = 'stayboost-agent-lead-agent';

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
    publicProfileUrl: '',
    publicLinks: [],
    sourceMaterials: [],
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
    generatedMiniAudit: '',
    generatedOutreach: '',
    generatedFollowUp: '',
    generatedOffer: '',
    lastContactDate: '',
    nextFollowUpDate: '',
});

const screenLabels: Record<Screen, string> = {
    dashboard: 'Dashboard',
    finder: 'Lead Finder',
    leads: 'Leady',
    detail: 'Detail leadu',
    audit: 'Mini-audit',
    outreach: 'Osloveni',
    offer: 'Nabidka / dalsi krok',
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

const splitLines = (value: string) =>
    value
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

const joinLines = (value: string[]) => value.join('\n');

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

    return normalizedUrl ? 'other' : 'website';
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
});

const emptySourceMaterial = (): SourceMaterial => ({
    id: `source-${crypto.randomUUID()}`,
    type: 'pasted-text',
    sourceLinkId: '',
    title: '',
    content: '',
    createdAt: new Date().toISOString(),
});

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

const normalizeLead = (lead: Partial<Lead>): Lead => ({
    ...emptyLead(),
    ...lead,
    publicLinks: migratePublicLinks(lead),
    sourceMaterials: lead.sourceMaterials ?? [],
    extractionStatus: lead.extractionStatus ?? 'idle',
    publicSignals: lead.publicSignals ?? [],
    quickWins: lead.quickWins ?? [],
    proposedQuickWins: lead.proposedQuickWins ?? lead.quickWins ?? [],
    structuredQuickWins: migrateQuickWins(lead),
    selectedOfferAngle: lead.selectedOfferAngle ?? 'main-photo',
});

const emptyAgentRequest = (): LeadAgentSearchRequest => ({
    location: 'Praha',
    accommodationType: 'apartmany',
    segment: 'self check-in / bez recepce',
    maxResults: 10,
    notes: '',
});

const emptyAgentSession = (): LeadAgentSession => ({
    request: emptyAgentRequest(),
    status: 'idle',
    message: '',
    isMock: false,
    candidates: [],
    analyses: {},
});

const normalizeAgentSession = (session: Partial<LeadAgentSession>): LeadAgentSession => ({
    ...emptyAgentSession(),
    ...session,
    request: { ...emptyAgentRequest(), ...session.request },
    candidates: session.candidates ?? [],
    analyses: session.analyses ?? {},
});

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
    const [leadAgentSession, setLeadAgentSession] = useState<LeadAgentSession>(() => {
        const storedSession = localStorage.getItem(agentStorageKey);

        if (!storedSession) {
            return emptyAgentSession();
        }

        try {
            return normalizeAgentSession(JSON.parse(storedSession) as Partial<LeadAgentSession>);
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
        setDraftLead((current) => ({ ...current, [field]: value }));
    };

    const persistLead = (lead: Lead) => {
        if (!lead.name.trim()) {
            setDraftLead(lead);
            return;
        }

        setDraftLead(lead);
        setLeads((currentLeads) => {
            const exists = currentLeads.some((currentLead) => currentLead.id === lead.id);
            return exists ? currentLeads.map((currentLead) => (currentLead.id === lead.id ? lead : currentLead)) : [lead, ...currentLeads];
        });
        setSelectedLeadId(lead.id);
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

    const runLeadAgentSearch = async () => {
        setLeadAgentSession((currentSession) => ({ ...currentSession, status: 'searching', message: 'Vyhledavam potencialni klienty...', candidates: [] }));

        try {
            const response = await discoverLeads(leadAgentSession.request);
            setLeadAgentSession((currentSession) => ({
                ...currentSession,
                status: response.status === 'needs-config' ? 'needs-config' : 'found',
                message: response.message,
                isMock: response.isMock,
                candidates: response.candidates,
            }));
        } catch (error) {
            setLeadAgentSession((currentSession) => ({
                ...currentSession,
                status: 'error',
                message: error instanceof Error ? error.message : 'Lead Finder Agent selhal.',
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
                isMock: response.isMock,
                analyses: response.analysis ? { ...currentSession.analyses, [candidate.id]: response.analysis } : currentSession.analyses,
            }));
        } catch (error) {
            setLeadAgentSession((currentSession) => ({
                ...currentSession,
                status: 'error',
                message: error instanceof Error ? error.message : 'Analyza kandidata selhala.',
            }));
        }
    };

    const rejectAgentCandidate = (candidateId: string) => {
        setLeadAgentSession((currentSession) => ({
            ...currentSession,
            candidates: currentSession.candidates.map((candidate) => (candidate.id === candidateId ? { ...candidate, rejected: true } : candidate)),
        }));
    };

    const addAgentCandidateToLeads = (candidate: LeadAgentCandidate) => {
        const analysis = leadAgentSession.analyses[candidate.id];
        const candidateText = candidate.sourceSnippets.join('\n');
        const quickWins = (analysis?.quickWins ?? []).map((win) => ({
            ...win,
            id: win.id || `quick-win-${crypto.randomUUID()}`,
        }));
        const nextLead: Lead = {
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
            sourceMaterials: candidate.sourceSnippets.map((snippet, index) => ({
                id: `source-${crypto.randomUUID()}`,
                type: 'pasted-text',
                sourceLinkId: '',
                title: `Agent source snippet #${index + 1}`,
                content: snippet,
                createdAt: new Date().toISOString(),
            })),
            extractionStatus: analysis ? 'completed' : 'ready',
            email: candidate.possibleEmail,
            status: 'Novy',
            notes: `Lead Finder Agent kandidat. Skore: ${candidate.leadScore}. ${candidate.isMock ? 'Demo rezim.' : 'Search API rezim.'} ${candidate.evidenceSummary}`,
            leadScore: candidate.leadScore,
            publicSignals: candidate.signals,
            quickWins: quickWins.map((win) => win.title),
            proposedQuickWins: quickWins.map((win) => win.title),
            firstImpression: analysis?.firstImpression ?? candidate.evidenceSummary,
            mainPhotoVerdict: 'unknown',
            reviewSignals: candidateText,
            guestFrictionSignals: analysis?.guestFrictionSignals.join('\n') ?? candidate.risks.join('\n'),
            guestConfusion: analysis?.guestFrictionSignals.join('\n') ?? candidate.risks.join('\n'),
            strengths: analysis?.strengths.join('\n') ?? candidate.signals.join('\n'),
            risks: analysis?.risks.join('\n') ?? candidate.risks.join('\n'),
            businessOpportunity: analysis?.offerRecommendation ?? 'Pripravit mini-audit verejne prezentace a guest guide / komunikaci pred prijezdem.',
            structuredQuickWins: quickWins,
            generatedMiniAudit: analysis?.miniAudit ?? '',
            generatedOutreach: analysis?.outreachEmail ?? '',
            generatedFollowUp: analysis?.followUp ?? '',
            generatedOffer: analysis?.offerRecommendation ?? '',
            selectedOfferAngle: candidate.recommendedAngle,
        };

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
        setActiveScreen('leads');
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

    const generateText = (field: 'generatedMiniAudit' | 'generatedOutreach' | 'generatedFollowUp' | 'generatedOffer') => {
        const generators = {
            generatedMiniAudit: generateMiniAudit,
            generatedOutreach: generateFirstOutreach,
            generatedFollowUp: generateFollowUp,
            generatedOffer: generateOffer,
        };
        const nextLead = { ...draftLead, [field]: generators[field](draftLead) };

        persistLead(nextLead);
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

    const renderScreen = () => {
        if (activeScreen === 'dashboard') {
            return <Dashboard leads={leads} stats={stats} onSelectLead={selectLead} />;
        }

        if (activeScreen === 'finder') {
            return (
                <LeadFinderPanel
                    onAddCandidate={addAgentCandidateToLeads}
                    onAnalyzeCandidate={analyzeAgentCandidate}
                    onRejectCandidate={rejectAgentCandidate}
                    onRunSearch={runLeadAgentSearch}
                    onUpdateRequest={updateAgentRequest}
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
                onChange={updateDraft}
                onCopyText={copyText}
                onDeleteLead={deleteLead}
                onGenerateText={generateText}
                onPrepareAudit={prepareAuditObservations}
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
    onAnalyzeCandidate: (candidate: LeadAgentCandidate) => void;
    onAddCandidate: (candidate: LeadAgentCandidate) => void;
    onRejectCandidate: (candidateId: string) => void;
}

function LeadFinderPanel({ onAddCandidate, onAnalyzeCandidate, onRejectCandidate, onRunSearch, onUpdateRequest, session }: LeadFinderPanelProps) {
    const visibleCandidates = session.candidates.filter((candidate) => !candidate.rejected);

    return (
        <section className="finder-layout">
            <div className="panel form-panel finder-form">
                <div className="panel-header">
                    <div>
                        <p className="eyebrow">Agentni workflow</p>
                        <h2>Spustit Lead Finder Agenta</h2>
                    </div>
                    <div className="button-group">
                        <button className="primary-button" disabled={session.status === 'searching'} onClick={onRunSearch} type="button">
                            <Search size={18} aria-hidden="true" />
                            {session.status === 'searching' ? 'Hledam...' : 'Najit potencialni klienty'}
                        </button>
                    </div>
                </div>

                <div className="scope-note">
                    Autonomni hledani vyzaduje TAVILY_API_KEY a OPENAI_API_KEY v Netlify environment variables. Bez nich bezi demo rezim.
                    Aplikace nescrapuje Booking, Airbnb ani Google Maps a neposila e-maily automaticky.
                </div>

                {session.isMock || session.status === 'needs-config' ? <div className="scope-note demo-note">Demo rezim: vysledky nejsou z realneho API a jsou oznacene jako demo.</div> : null}

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
            </div>

            <aside className="panel query-box">
                <p className="eyebrow">Stav agenta</p>
                <h2>{session.status}</h2>
                <p className="section-help">{session.message || 'Zadej lokalitu a segment, potom spust hledani.'}</p>
            </aside>

            <div className="panel finder-results">
                <div className="panel-header">
                    <div>
                        <p className="eyebrow">Kandidati ke schvaleni</p>
                        <h2>Vyhodnocene nalezy</h2>
                    </div>
                    <span className="status-pill">{visibleCandidates.length} kandidatu</span>
                </div>

                {visibleCandidates.length === 0 ? (
                    <div className="empty-state compact-empty">
                        <h2>Zatim nejsou vytvoreni zadni kandidati</h2>
                        <p>Spust Lead Finder Agenta. Bez API klicu se zobrazi demo kandidati.</p>
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

                                    return (
                                    <tr key={candidate.id}>
                                        <td>
                                            <strong>{candidate.name}</strong>
                                            <small>{candidate.isMock ? 'DEMO vysledek' : candidate.possibleEmail || 'Kontakt neznamy'}</small>
                                        </td>
                                        <td>{candidate.location || 'Neuvedeno'}</td>
                                        <td>{candidate.type}</td>
                                        <td>
                                            <strong className="score-value">{candidate.leadScore}</strong>
                                        </td>
                                        <td>{candidate.evidenceSummary}</td>
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
                                        </td>
                                        <td>{offerAngleLabels[candidate.recommendedAngle]}</td>
                                        <td>
                                            <div className="table-actions">
                                                <button className="secondary-button compact-button" onClick={() => onAnalyzeCandidate(candidate)} type="button">
                                                    <Sparkles size={16} aria-hidden="true" />
                                                    Analyzovat
                                                </button>
                                                <button className="secondary-button compact-button" disabled={Boolean(candidate.addedLeadId)} onClick={() => onAddCandidate(candidate)} type="button">
                                                    <Plus size={16} aria-hidden="true" />
                                                    {candidate.addedLeadId ? 'Pridano' : 'Pridat do leadu'}
                                                </button>
                                                <button className="secondary-button compact-button danger-button" onClick={() => onRejectCandidate(candidate.id)} type="button">
                                                    Zamítnout
                                                </button>
                                            </div>
                                            {analysis ? <AgentAnalysisPreview analysis={analysis} /> : null}
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

function AgentAnalysisPreview({ analysis }: { analysis: LeadAgentAnalysis }) {
    return (
        <div className="analysis-preview">
            <p className="eyebrow">Analyza</p>
            <strong>{analysis.firstImpression}</strong>
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
    onDeleteLead?: (leadId: string) => void;
    onGenerateText?: (field: 'generatedMiniAudit' | 'generatedOutreach' | 'generatedFollowUp' | 'generatedOffer') => void;
    onPrepareAudit?: () => void;
    onSave: (event?: FormEvent) => void;
    copiedTextId?: string;
}

function LeadDetail({ copiedTextId = '', draftLead, isCreating = false, onChange, onCopyText, onDeleteLead, onGenerateText, onPrepareAudit, onSave }: LeadEditorProps) {
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
                            <button className="secondary-button danger-button" onClick={() => onDeleteLead?.(draftLead.id)} type="button">
                                <Trash2 size={18} aria-hidden="true" />
                                Smazat lead
                            </button>
                        ) : null}
                        <button className="primary-button" type="submit">
                            <Save size={18} aria-hidden="true" />
                            Ulozit
                        </button>
                    </div>
                </div>

                <LeadCoreFields draftLead={draftLead} onChange={onChange} />
            </section>

            <PublicAuditWorkspace
                copiedTextId={copiedTextId}
                draftLead={draftLead}
                onChange={onChange}
                onCopyText={onCopyText}
                onGenerateText={onGenerateText}
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

function AuditPanel({ copiedTextId = '', draftLead, onChange, onCopyText, onGenerateText, onPrepareAudit, onSave }: LeadEditorProps) {
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
                        Vygenerovat nabidku dalsiho kroku
                    </button>
                    <button className="primary-button" type="submit">
                        <Save size={18} aria-hidden="true" />
                        Ulozit krok
                    </button>
                </div>
            </div>

            <div className="form-grid">
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

function PublicAuditWorkspace({ copiedTextId = '', draftLead, onChange, onCopyText, onGenerateText, onPrepareAudit }: LeadEditorProps) {
    const [sourceDraft, setSourceDraft] = useState<SourceMaterial>(emptySourceMaterial);
    const publicLinks = draftLead.publicLinks ?? [];
    const sourceMaterials = draftLead.sourceMaterials ?? [];
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
    const checklist = [
        { label: 'alespon 1 verejny link', done: publicLinks.some((link) => link.url.trim()) },
        { label: 'alespon 1 silna stranka', done: Boolean(draftLead.strengths.trim()) },
        { label: 'alespon 2 konkretni pozorovani', done: concreteObservationCount >= 2 },
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
                Odkaz slouzi k otevreni zdroje. Pro automaticke vyplneni vloz verejny text nebo screenshoty.
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
                    <button className="secondary-button" onClick={() => onGenerateText?.('generatedMiniAudit')} type="button">
                        <Sparkles size={18} aria-hidden="true" />
                        Vygenerovat mini-audit
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
                        Vygenerovat nabidku dalsiho kroku
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
                    {structuredQuickWins.length === 0 ? <div className="scope-note">Dopln 3 hlavni quick wins. Bez nich generator nevytvori obecne rady.</div> : null}
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

            <div className="generated-grid">
                <GeneratedTextArea
                    copiedTextId={copiedTextId}
                    field="generatedMiniAudit"
                    label="Vygenerovany mini-audit"
                    onChange={onChange}
                    onCopyText={onCopyText}
                    textId="mini-audit"
                    value={draftLead.generatedMiniAudit}
                />
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
                <GeneratedTextArea
                    copiedTextId={copiedTextId}
                    field="generatedOffer"
                    label="Navrh placene nabidky / dalsiho kroku"
                    onChange={onChange}
                    onCopyText={onCopyText}
                    textId="offer"
                    value={draftLead.generatedOffer}
                />
            </div>
        </section>
    );
}

interface GeneratedTextAreaProps {
    copiedTextId: string;
    field: 'generatedMiniAudit' | 'generatedOutreach' | 'generatedFollowUp' | 'generatedOffer';
    label: string;
    onChange: LeadEditorProps['onChange'];
    onCopyText?: (textId: string, value: string) => void;
    textId: string;
    value: string;
}

function GeneratedTextArea({ copiedTextId, field, label, onChange, onCopyText, textId, value }: GeneratedTextAreaProps) {
    const handleCopy = (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        onCopyText?.(textId, value);
    };

    return (
        <div className="stacked-label generated-output">
            <div className="label-row">
                <span>{label}</span>
                <button className="copy-button" disabled={!value.trim()} onClick={handleCopy} type="button">
                    <Clipboard size={16} aria-hidden="true" />
                    {copiedTextId === textId ? 'Zkopirovano' : 'Zkopirovat text'}
                </button>
            </div>
            <textarea
                aria-label={label}
                placeholder="Zatim neni nic vygenerovano. Vypln verejny audit a pouzij tlacitko pro generovani."
                value={value}
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