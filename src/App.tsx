import { Clipboard, ClipboardCheck, ExternalLink, LayoutDashboard, Mail, Plus, Save, Search, Send, Sparkles, Trash2, Users } from 'lucide-react';
import { FormEvent, MouseEvent, useEffect, useMemo, useState } from 'react';
import { generateFirstOutreach, generateFollowUp, generateMiniAudit, generateOffer } from './generators';
import { leadFinderMockText, parseLeadCandidates, recommendedSearchQueries } from './leadScoring';
import { mockLeads } from './mockData';
import {
    accommodationTypes,
    Lead,
    LeadCandidate,
    LeadSearchSession,
    leadStatuses,
    LeadStatus,
    mainPhotoVerdictLabels,
    offerAngleLabels,
    OfferAngle,
    publicProfileSourceLabels,
    PublicProfileLink,
    PublicProfileSourceType,
    QuickWin,
} from './types';

type Screen = 'dashboard' | 'finder' | 'leads' | 'detail' | 'audit' | 'outreach' | 'offer';

const storageKey = 'stayboost-agent-leads';
const finderStorageKey = 'stayboost-agent-lead-finder';

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
    publicProfileUrl: '',
    publicLinks: [],
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
    publicSignals: lead.publicSignals ?? [],
    quickWins: lead.quickWins ?? [],
    proposedQuickWins: lead.proposedQuickWins ?? lead.quickWins ?? [],
    structuredQuickWins: migrateQuickWins(lead),
    selectedOfferAngle: lead.selectedOfferAngle ?? 'main-photo',
});

const emptyLeadSearchSession = (): LeadSearchSession => ({
    cityOrArea: '',
    accommodationType: '',
    targetSegment: '',
    notes: '',
    sourceText: leadFinderMockText,
    candidates: [],
});

const normalizeSearchSession = (session: Partial<LeadSearchSession>): LeadSearchSession => ({
    ...emptyLeadSearchSession(),
    ...session,
    candidates: session.candidates ?? [],
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
    const [leadSearchSession, setLeadSearchSession] = useState<LeadSearchSession>(() => {
        const storedSession = localStorage.getItem(finderStorageKey);

        if (!storedSession) {
            return emptyLeadSearchSession();
        }

        try {
            return normalizeSearchSession(JSON.parse(storedSession) as Partial<LeadSearchSession>);
        } catch {
            return emptyLeadSearchSession();
        }
    });

    useEffect(() => {
        localStorage.setItem(storageKey, JSON.stringify(leads));
    }, [leads]);

    useEffect(() => {
        localStorage.setItem(finderStorageKey, JSON.stringify(leadSearchSession));
    }, [leadSearchSession]);

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

    const updateLeadSearchSession = <Field extends keyof LeadSearchSession>(field: Field, value: LeadSearchSession[Field]) => {
        setLeadSearchSession((currentSession) => ({ ...currentSession, [field]: value }));
    };

    const parseCandidates = () => {
        setLeadSearchSession((currentSession) => ({
            ...currentSession,
            candidates: parseLeadCandidates(currentSession.sourceText, currentSession),
        }));
    };

    const loadMockCandidates = () => {
        setLeadSearchSession((currentSession) => ({
            ...currentSession,
            cityOrArea: currentSession.cityOrArea || 'Praha / Cesky Krumlov / Brno',
            accommodationType: currentSession.accommodationType || 'Apartman',
            targetSegment: currentSession.targetSegment || 'mensi ubytovani s verejnym kontaktem a operacnimi signaly',
            sourceText: leadFinderMockText,
            candidates: parseLeadCandidates(leadFinderMockText, currentSession),
        }));
    };

    const addCandidateToLeads = (candidate: LeadCandidate) => {
        const nextLead: Lead = {
            ...emptyLead(),
            id: `lead-${crypto.randomUUID()}`,
            name: candidate.name,
            accommodationType: candidate.accommodationType,
            city: candidate.city,
            websiteOrOtaUrl: candidate.url,
            publicProfileUrl: candidate.url,
            publicLinks: candidate.url
                ? [
                      {
                          id: `link-${crypto.randomUUID()}`,
                          sourceType: detectSourceType(candidate.url),
                          url: candidate.url,
                          label: publicProfileSourceLabels[detectSourceType(candidate.url)],
                          notes: 'Vytvoreno z Lead Finder kandidata. Link je pouze zdroj pro rucni kontrolu.',
                      },
                  ]
                : [],
            email: candidate.email,
            status: 'Novy',
            notes: `Lead Finder kandidat. Segment: ${leadSearchSession.targetSegment || 'neuvedeno'}. ${candidate.sourceNotes}`,
            publicSignals: candidate.signals,
            quickWins: [
                'Zkontrolovat prvni dojem verejne nabidky.',
                'Projit prvnich pet fotografii a hlavni popis.',
                'Overit, jestli jsou jasne instrukce k prijezdu, parkovani a check-inu.',
            ],
            proposedQuickWins: [
                'Zkontrolovat prvni dojem verejne nabidky.',
                'Projit prvnich pet fotografii a hlavni popis.',
                'Overit, jestli jsou jasne instrukce k prijezdu, parkovani a check-inu.',
            ],
            firstImpression: candidate.sourceNotes,
            mainPhotoVerdict: 'unknown',
            reviewSignals: candidate.reviewSnippets,
            guestFrictionSignals: candidate.signals.join('\n'),
            guestConfusion: candidate.signals.join('\n'),
            risks: candidate.sourceNotes,
            structuredQuickWins: [
                {
                    id: `quick-win-${crypto.randomUUID()}`,
                    title: 'Zkontrolovat prvni dojem verejne nabidky',
                    why: 'Audit musi vychazet z konkretniho verejneho dojmu, ne z domnenek.',
                    action: 'Otevrit ulozeny verejny link a rucne zapsat prvni dojem, silne stranky a slabsi mista.',
                    sourceEvidence: candidate.sourceNotes,
                },
            ],
            selectedOfferAngle: candidate.recommendedOfferAngle,
        };

        setLeads((currentLeads) => [nextLead, ...currentLeads]);
        setSelectedLeadId(nextLead.id);
        setDraftLead(nextLead);
        setIsCreating(false);
        setLeadSearchSession((currentSession) => ({
            ...currentSession,
            candidates: currentSession.candidates.map((currentCandidate) =>
                currentCandidate.id === candidate.id ? { ...currentCandidate, addedLeadId: nextLead.id } : currentCandidate,
            ),
        }));
        setActiveScreen('leads');
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
                    onAddCandidate={addCandidateToLeads}
                    onLoadMockCandidates={loadMockCandidates}
                    onParseCandidates={parseCandidates}
                    onUpdateSession={updateLeadSearchSession}
                    session={leadSearchSession}
                />
            );
        }

        if (activeScreen === 'leads') {
            return <LeadList leads={leads} onCreateLead={startNewLead} onSelectLead={selectLead} selectedLeadId={selectedLeadId} />;
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
                onGenerateText={generateText}
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
    session: LeadSearchSession;
    onUpdateSession: <Field extends keyof LeadSearchSession>(field: Field, value: LeadSearchSession[Field]) => void;
    onParseCandidates: () => void;
    onLoadMockCandidates: () => void;
    onAddCandidate: (candidate: LeadCandidate) => void;
}

function LeadFinderPanel({ onAddCandidate, onLoadMockCandidates, onParseCandidates, onUpdateSession, session }: LeadFinderPanelProps) {
    return (
        <section className="finder-layout">
            <div className="panel form-panel finder-form">
                <div className="panel-header">
                    <div>
                        <p className="eyebrow">Rucni/poloautomaticky vstup</p>
                        <h2>Lead Finder</h2>
                    </div>
                    <div className="button-group">
                        <button className="secondary-button" onClick={onLoadMockCandidates} type="button">
                            <Sparkles size={18} aria-hidden="true" />
                            Nacist mock priklady
                        </button>
                        <button className="primary-button" onClick={onParseCandidates} type="button">
                            <Search size={18} aria-hidden="true" />
                            Vytvorit kandidaty
                        </button>
                    </div>
                </div>

                <div className="scope-note">
                    Kandidati jsou pouze navrhy ke schvaleni clovekem. Aplikace nic nescrapuje, nikam se nepripojuje a nikoho automaticky nekontaktuje.
                </div>

                <div className="form-grid">
                    <label>
                        Mesto / oblast
                        <input value={session.cityOrArea} onChange={(event) => onUpdateSession('cityOrArea', event.target.value)} />
                    </label>
                    <label>
                        Typ ubytovani
                        <select
                            value={session.accommodationType}
                            onChange={(event) => onUpdateSession('accommodationType', event.target.value as LeadSearchSession['accommodationType'])}
                        >
                            <option value="">Libovolny</option>
                            {accommodationTypes.map((type) => (
                                <option key={type} value={type}>
                                    {type}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Cilovy segment
                        <input value={session.targetSegment} onChange={(event) => onUpdateSession('targetSegment', event.target.value)} />
                    </label>
                    <label>
                        Poznamky
                        <input value={session.notes} onChange={(event) => onUpdateSession('notes', event.target.value)} />
                    </label>
                    <label className="full-width">
                        Zdrojovy text nebo rucne vlozene vysledky hledani
                        <textarea
                            value={session.sourceText}
                            onChange={(event) => onUpdateSession('sourceText', event.target.value)}
                            rows={14}
                        />
                    </label>
                </div>
            </div>

            <aside className="panel query-box">
                <p className="eyebrow">Inspirace</p>
                <h2>Doporucene vyhledavaci dotazy</h2>
                <div className="query-list">
                    {recommendedSearchQueries.map((query) => (
                        <button
                            className="query-chip"
                            key={query}
                            onClick={() => onUpdateSession('notes', `${session.notes ? `${session.notes}\n` : ''}${query}`)}
                            type="button"
                        >
                            {query}
                        </button>
                    ))}
                </div>
            </aside>

            <div className="panel finder-results">
                <div className="panel-header">
                    <div>
                        <p className="eyebrow">Kandidati ke schvaleni</p>
                        <h2>Vyhodnocene nalezy</h2>
                    </div>
                    <span className="status-pill">{session.candidates.length} kandidatu</span>
                </div>

                {session.candidates.length === 0 ? (
                    <div className="empty-state compact-empty">
                        <h2>Zatim nejsou vytvoreni zadni kandidati</h2>
                        <p>Vloz zdrojovy text nebo nacti mock priklady a spust vytvoreni kandidatu.</p>
                    </div>
                ) : (
                    <div className="table-wrap">
                        <table className="candidate-table">
                            <thead>
                                <tr>
                                    <th>Nazev</th>
                                    <th>Mesto</th>
                                    <th>Typ</th>
                                    <th>Kontakt</th>
                                    <th>URL</th>
                                    <th>Signaly</th>
                                    <th>Skore</th>
                                    <th>Uhel</th>
                                    <th>Akce</th>
                                </tr>
                            </thead>
                            <tbody>
                                {session.candidates.map((candidate) => (
                                    <tr key={candidate.id}>
                                        <td>
                                            <strong>{candidate.name}</strong>
                                            <small>{candidate.sourceNotes.slice(0, 120)}</small>
                                        </td>
                                        <td>{candidate.city || 'Neuvedeno'}</td>
                                        <td>{candidate.accommodationType}</td>
                                        <td>{candidate.email || 'Nenalezen'}</td>
                                        <td>{candidate.url || 'Nenalezeno'}</td>
                                        <td>
                                            <div className="signal-list">
                                                {candidate.signals.length > 0 ? candidate.signals.map((signal) => <span key={signal}>{signal}</span>) : <span>Bez signalu</span>}
                                            </div>
                                        </td>
                                        <td>
                                            <strong className="score-value">{candidate.score}</strong>
                                        </td>
                                        <td>{offerAngleLabels[candidate.recommendedOfferAngle]}</td>
                                        <td>
                                            <button
                                                className="secondary-button compact-button"
                                                disabled={Boolean(candidate.addedLeadId)}
                                                onClick={() => onAddCandidate(candidate)}
                                                type="button"
                                            >
                                                <Plus size={16} aria-hidden="true" />
                                                {candidate.addedLeadId ? 'Pridano' : 'Pridat do leadu'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}

interface LeadListProps {
    leads: Lead[];
    selectedLeadId: string;
    onCreateLead: () => void;
    onSelectLead: (leadId: string, nextScreen?: Screen) => void;
}

function LeadList({ leads, selectedLeadId, onCreateLead, onSelectLead }: LeadListProps) {
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
    onGenerateText?: (field: 'generatedMiniAudit' | 'generatedOutreach' | 'generatedFollowUp' | 'generatedOffer') => void;
    onSave: (event?: FormEvent) => void;
    copiedTextId?: string;
}

function LeadDetail({ copiedTextId = '', draftLead, isCreating = false, onChange, onCopyText, onGenerateText, onSave }: LeadEditorProps) {
    return (
        <form className="detail-stack" onSubmit={onSave}>
            <section className="panel form-panel">
                <div className="panel-header">
                    <div>
                        <p className="eyebrow">{isCreating ? 'Novy zaznam' : 'Editace'}</p>
                        <h2>{isCreating ? 'Pridat lead' : draftLead.name}</h2>
                    </div>
                    <button className="primary-button" type="submit">
                        <Save size={18} aria-hidden="true" />
                        Ulozit
                    </button>
                </div>

                <LeadCoreFields draftLead={draftLead} onChange={onChange} />
            </section>

            <PublicAuditWorkspace
                copiedTextId={copiedTextId}
                draftLead={draftLead}
                onChange={onChange}
                onCopyText={onCopyText}
                onGenerateText={onGenerateText}
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
                Web / OTA odkaz
                <input value={draftLead.websiteOrOtaUrl} onChange={(event) => onChange('websiteOrOtaUrl', event.target.value)} />
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
        </div>
    );
}

function AuditPanel({ copiedTextId = '', draftLead, onChange, onCopyText, onGenerateText, onSave }: LeadEditorProps) {
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

function PublicAuditWorkspace({ copiedTextId = '', draftLead, onChange, onCopyText, onGenerateText }: LeadEditorProps) {
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
    const completeQuickWins = draftLead.structuredQuickWins.filter((win) => win.title.trim() && win.action.trim() && win.why.trim());
    const checklist = [
        { label: 'alespon 1 verejny link', done: draftLead.publicLinks.some((link) => link.url.trim()) },
        { label: 'alespon 1 silna stranka', done: Boolean(draftLead.strengths.trim()) },
        { label: 'alespon 2 konkretni pozorovani', done: concreteObservationCount >= 2 },
        { label: 'presne 3 quick wins s title/action/why', done: completeQuickWins.length === 3 },
    ];

    const updatePublicLink = <Field extends keyof PublicProfileLink>(linkId: string, field: Field, value: PublicProfileLink[Field]) => {
        onChange(
            'publicLinks',
            draftLead.publicLinks.map((link) => (link.id === linkId ? { ...link, [field]: value } : link)),
        );
    };

    const addPublicLink = () => {
        onChange('publicLinks', [...draftLead.publicLinks, emptyPublicLink()]);
    };

    const removePublicLink = (linkId: string) => {
        onChange(
            'publicLinks',
            draftLead.publicLinks.filter((link) => link.id !== linkId),
        );
    };

    const updateQuickWin = <Field extends keyof QuickWin>(quickWinId: string, field: Field, value: QuickWin[Field]) => {
        onChange(
            'structuredQuickWins',
            draftLead.structuredQuickWins.map((quickWin) => (quickWin.id === quickWinId ? { ...quickWin, [field]: value } : quickWin)),
        );
    };

    const addQuickWin = () => {
        onChange('structuredQuickWins', [...draftLead.structuredQuickWins, emptyQuickWin()]);
    };

    const removeQuickWin = (quickWinId: string) => {
        onChange(
            'structuredQuickWins',
            draftLead.structuredQuickWins.filter((quickWin) => quickWin.id !== quickWinId),
        );
    };

    return (
        <section className="panel form-panel audit-workspace">
            <div className="panel-header">
                <div>
                    <p className="eyebrow">Rucni / poloautomaticky audit</p>
                    <h2>Veřejný audit</h2>
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
            </div>

            <div className="scope-note">
                V teto verzi aplikace odkazy necte automaticky. Otevri link, dopln konkretni pozorovani a z nich se vygeneruje audit.
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
                    </div>
                    <button className="secondary-button" onClick={addPublicLink} type="button">
                        <Plus size={18} aria-hidden="true" />
                        Pridat link
                    </button>
                </div>

                <div className="link-list">
                    {draftLead.publicLinks.length === 0 ? (
                        <div className="scope-note">Zatim neni ulozeny zadny verejny link. Link slouzi jen jako zdroj pro rucni kontrolu.</div>
                    ) : (
                        draftLead.publicLinks.map((link) => (
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

            <div className="form-grid two-column">
                <label className="full-width">
                    Legacy verejny profil / OTA odkaz
                    <input value={draftLead.publicProfileUrl} onChange={(event) => onChange('publicProfileUrl', event.target.value)} />
                </label>
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
                    {draftLead.structuredQuickWins.length === 0 ? <div className="scope-note">Dopln 3 hlavni quick wins. Bez nich generator nevytvori obecne rady.</div> : null}
                    {draftLead.structuredQuickWins.map((quickWin, index) => (
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