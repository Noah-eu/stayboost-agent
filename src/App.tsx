import { Clipboard, ClipboardCheck, LayoutDashboard, Mail, Plus, Save, Send, Sparkles, Users } from 'lucide-react';
import { FormEvent, MouseEvent, useEffect, useMemo, useState } from 'react';
import { generateFirstOutreach, generateFollowUp, generateMiniAudit, generateOffer } from './generators';
import { mockLeads } from './mockData';
import { accommodationTypes, Lead, leadStatuses, LeadStatus, offerAngleLabels, OfferAngle } from './types';

type Screen = 'dashboard' | 'leads' | 'detail' | 'audit' | 'outreach' | 'offer';

const storageKey = 'stayboost-agent-leads';

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
    mainPhotoObservation: '',
    betterPhotoSuggestion: '',
    photoOrderObservation: '',
    descriptionObservation: '',
    reviewSignals: '',
    guestFrictionSignals: '',
    strengths: '',
    risks: '',
    proposedQuickWins: [],
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
    leads: 'Leady',
    detail: 'Detail leadu',
    audit: 'Mini-audit',
    outreach: 'Osloveni',
    offer: 'Nabidka / dalsi krok',
};

const screenIcons: Record<Screen, typeof LayoutDashboard> = {
    dashboard: LayoutDashboard,
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

const normalizeLead = (lead: Partial<Lead>): Lead => ({
    ...emptyLead(),
    ...lead,
    publicSignals: lead.publicSignals ?? [],
    quickWins: lead.quickWins ?? [],
    proposedQuickWins: lead.proposedQuickWins ?? lead.quickWins ?? [],
    selectedOfferAngle: lead.selectedOfferAngle ?? 'main-photo',
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

    useEffect(() => {
        localStorage.setItem(storageKey, JSON.stringify(leads));
    }, [leads]);

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

            <div className="form-grid two-column">
                <label className="full-width">
                    Verejny profil / OTA odkaz
                    <input value={draftLead.publicProfileUrl} onChange={(event) => onChange('publicProfileUrl', event.target.value)} />
                </label>
                <label>
                    Co je na nabidce dobre
                    <textarea value={draftLead.strengths} onChange={(event) => onChange('strengths', event.target.value)} rows={6} />
                </label>
                <label>
                    Hlavni fotka - pozorovani
                    <textarea
                        value={draftLead.mainPhotoObservation}
                        onChange={(event) => onChange('mainPhotoObservation', event.target.value)}
                        rows={6}
                    />
                </label>
                <label>
                    Navrh lepsi hlavni fotky
                    <textarea
                        value={draftLead.betterPhotoSuggestion}
                        onChange={(event) => onChange('betterPhotoSuggestion', event.target.value)}
                        rows={6}
                    />
                </label>
                <label>
                    Poradi fotek - pozorovani
                    <textarea
                        value={draftLead.photoOrderObservation}
                        onChange={(event) => onChange('photoOrderObservation', event.target.value)}
                        rows={6}
                    />
                </label>
                <label>
                    Popis nabidky - pozorovani
                    <textarea
                        value={draftLead.descriptionObservation}
                        onChange={(event) => onChange('descriptionObservation', event.target.value)}
                        rows={6}
                    />
                </label>
                <label>
                    Signaly z recenzi
                    <textarea value={draftLead.reviewSignals} onChange={(event) => onChange('reviewSignals', event.target.value)} rows={6} />
                </label>
                <label>
                    Mozne treni hosta / nejasnosti
                    <textarea
                        value={draftLead.guestFrictionSignals}
                        onChange={(event) => onChange('guestFrictionSignals', event.target.value)}
                        rows={6}
                    />
                </label>
                <label>
                    Rizika prvniho dojmu
                    <textarea value={draftLead.risks} onChange={(event) => onChange('risks', event.target.value)} rows={6} />
                </label>
                <label>
                    3 quick wins
                    <textarea
                        value={joinLines(draftLead.proposedQuickWins)}
                        onChange={(event) => onChange('proposedQuickWins', splitLines(event.target.value))}
                        rows={6}
                    />
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