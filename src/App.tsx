import { ClipboardCheck, LayoutDashboard, Mail, Plus, Save, Send, Sparkles, Users } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { mockLeads } from './mockData';
import { accommodationTypes, Lead, leadStatuses, LeadStatus } from './types';

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
  generatedOutreach: '',
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

function App() {
  const [leads, setLeads] = useState<Lead[]>(() => {
    const storedLeads = localStorage.getItem(storageKey);

    if (!storedLeads) {
      return mockLeads;
    }

    try {
      return JSON.parse(storedLeads) as Lead[];
    } catch {
      return mockLeads;
    }
  });
  const [activeScreen, setActiveScreen] = useState<Screen>('dashboard');
  const [selectedLeadId, setSelectedLeadId] = useState(leads[0]?.id ?? '');
  const [draftLead, setDraftLead] = useState<Lead>(() => leads[0] ?? emptyLead());
  const [isCreating, setIsCreating] = useState(false);

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

  const saveDraft = (event?: FormEvent) => {
    event?.preventDefault();

    if (!draftLead.name.trim()) {
      return;
    }

    setLeads((currentLeads) => {
      const exists = currentLeads.some((lead) => lead.id === draftLead.id);
      return exists ? currentLeads.map((lead) => (lead.id === draftLead.id ? draftLead : lead)) : [draftLead, ...currentLeads];
    });
    setSelectedLeadId(draftLead.id);
    setIsCreating(false);
  };

  const generateOutreach = () => {
    const intro = `Dobry den, narazil jsem na ${draftLead.name || 'vase ubytovani'} a pripravil jsem kratky pohled na prvni dojem hosta.`;
    const signal = draftLead.publicSignals[0]
      ? `Vsiml jsem si hlavne: ${draftLead.publicSignals[0].toLowerCase()}`
      : 'Vsiml jsem si nekolika mist, ktera mohou ovlivnit prime rezervace.';
    const win = draftLead.quickWins[0]
      ? `Jedna rychla prilezitost je: ${draftLead.quickWins[0].toLowerCase()}`
      : 'Rad bych poslal par konkretnich quick wins bez zavazku.';
    const closing = 'Pokud chcete, poslu vam mini-audit ve 3 bodech a muzete se rozhodnout, jestli dava smysl jit dal.';

    updateDraft('generatedOutreach', `${intro}\n\n${signal}\n${win}\n\n${closing}`);
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
      return <AuditPanel draftLead={draftLead} onChange={updateDraft} onSave={saveDraft} />;
    }

    if (activeScreen === 'outreach') {
      return <OutreachPanel draftLead={draftLead} onChange={updateDraft} onGenerate={generateOutreach} onSave={saveDraft} />;
    }

    if (activeScreen === 'offer') {
      return <OfferPanel draftLead={draftLead} onChange={updateDraft} onSave={saveDraft} />;
    }

    return <LeadDetail draftLead={draftLead} isCreating={isCreating} onChange={updateDraft} onSave={saveDraft} />;
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
  onSave: (event?: FormEvent) => void;
}

function LeadDetail({ draftLead, isCreating = false, onChange, onSave }: LeadEditorProps) {
  return (
    <form className="panel form-panel" onSubmit={onSave}>
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
    </form>
  );
}

function AuditPanel({ draftLead, onChange, onSave }: LeadEditorProps) {
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

      <div className="form-grid two-column">
        <label>
          Verejne signaly
          <textarea
            value={joinLines(draftLead.publicSignals)}
            onChange={(event) => onChange('publicSignals', splitLines(event.target.value))}
            rows={10}
          />
        </label>
        <label>
          Navrzene quick wins
          <textarea
            value={joinLines(draftLead.quickWins)}
            onChange={(event) => onChange('quickWins', splitLines(event.target.value))}
            rows={10}
          />
        </label>
      </div>
    </form>
  );
}

interface OutreachPanelProps extends LeadEditorProps {
  onGenerate: () => void;
}

function OutreachPanel({ draftLead, onChange, onGenerate, onSave }: OutreachPanelProps) {
  return (
    <form className="panel form-panel" onSubmit={onSave}>
      <div className="panel-header">
        <div>
          <p className="eyebrow">Text ke schvaleni</p>
          <h2>{draftLead.name || 'Osloveni'}</h2>
        </div>
        <div className="button-group">
          <button className="secondary-button" onClick={onGenerate} type="button">
            <Sparkles size={18} aria-hidden="true" />
            Navrhnout text
          </button>
          <button className="primary-button" type="submit">
            <Save size={18} aria-hidden="true" />
            Ulozit
          </button>
        </div>
      </div>

      <label className="stacked-label">
        Vygenerovane osloveni
        <textarea
          value={draftLead.generatedOutreach}
          onChange={(event) => onChange('generatedOutreach', event.target.value)}
          rows={14}
        />
      </label>
    </form>
  );
}

function OfferPanel({ draftLead, onChange, onSave }: LeadEditorProps) {
  return (
    <form className="panel form-panel" onSubmit={onSave}>
      <div className="panel-header">
        <div>
          <p className="eyebrow">Rucni workflow</p>
          <h2>Nabidka a dalsi krok</h2>
        </div>
        <button className="primary-button" type="submit">
          <Save size={18} aria-hidden="true" />
          Ulozit krok
        </button>
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
    </form>
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