import type { LeadAgentAnalysis, LeadAgentAnalyzeResponse, LeadAgentCandidate, LeadAgentDiscoverResponse, LeadAgentSearchRequest } from './leadAgentTypes';

const jsonHeaders = { 'Content-Type': 'application/json' };

const stableId = (prefix: string, value: string) => `${prefix}-${value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || crypto.randomUUID()}`;

const mockCandidates = (request: LeadAgentSearchRequest): LeadAgentCandidate[] => {
    const location = request.location || 'Praha';
    const segment = request.segment || 'self check-in / bez recepce';

    const candidates: LeadAgentCandidate[] = [
        {
            id: stableId('agent-candidate', `${location}-river-gate`),
            name: 'Apartmany River Gate',
            location,
            type: 'Apartman',
            websiteUrl: 'https://example.com/river-gate',
            sourceUrls: ['https://example.com/river-gate', 'https://example.com/search/river-gate'],
            sourceSnippets: [
                `${location} apartmany se self check-inem, vice jednotek, parkovani ve dvore a kratkym verejnym popisem prijezdu.`,
                'Verejny snippet zminuje keybox, Wi-Fi a dotazy hostu na parkovani a check-in instrukce.',
            ],
            possibleEmail: 'rezervace@rivergate.example',
            signals: ['Verejny web', 'Self check-in / keybox', 'Parkovani', 'Vice jednotek', 'Snippet zminuje check-in instrukce'],
            risks: ['Prakticke informace muzou byt roztrousene', 'Snippet naznacuje dotazy na prijezd'],
            leadScore: 86,
            recommendedAngle: 'guest-guide',
            evidenceSummary: `Demo kandidat pro ${location}: odpovida segmentu ${segment}; zdrojem jsou mock search snippety, ne prectena OTA stranka.`,
            isMock: true,
        },
        {
            id: stableId('agent-candidate', `${location}-old-town-stay`),
            name: 'Old Town Stay Apartments',
            location,
            type: 'Apartman',
            websiteUrl: 'https://example.com/old-town-stay',
            sourceUrls: ['https://example.com/old-town-stay'],
            sourceSnippets: [
                `${location} ubytovani v centru, moderni apartmany, vlastni web a verejny kontakt.`,
                'Search snippet zduraznuje lokalitu a cistotu, ale prakticke informace pred prijezdem nejsou v ukazce videt.',
            ],
            possibleEmail: 'info@oldtownstay.example',
            signals: ['Vlastni web', 'Verejny kontakt', 'Centrum', 'Moderni apartmany'],
            risks: ['Ze snippetu neni jasny check-in', 'Slabsi evidence k provoznim detailum'],
            leadScore: 72,
            recommendedAngle: 'description',
            evidenceSummary: 'Demo kandidat ma silny verejny prvni dojem, ale jen omezeny snippet k praktickym informacim.',
            isMock: true,
        },
        {
            id: stableId('agent-candidate', `${location}-penzion-u-parku`),
            name: 'Penzion U Parku',
            location,
            type: 'Penzion',
            websiteUrl: 'https://example.com/penzion-u-parku',
            sourceUrls: ['https://example.com/penzion-u-parku'],
            sourceSnippets: [
                `${location} maly penzion, parkovani, klidna lokalita, snidane a rodinna atmosfera.`,
                'Verejny snippet zminuje prijezd autem a komunikaci s hosty pred pobytem.',
            ],
            possibleEmail: '',
            signals: ['Penzion', 'Parkovani', 'Snidane', 'Komunikace pred pobytem'],
            risks: ['Chybi verejny e-mail v demo vysledku', 'Prijezd autem muze vyzadovat jasne instrukce'],
            leadScore: 64,
            recommendedAngle: 'guest-communication',
            evidenceSummary: 'Demo kandidat ukazuje provozni signaly, ale kontakt neni v ukazce nalezen.',
            isMock: true,
        },
    ];

    return candidates.slice(0, Math.max(1, request.maxResults || 3));
};

const mockAnalysis = (candidate: LeadAgentCandidate): LeadAgentAnalysis => {
    const evidence = candidate.sourceSnippets[0] || candidate.evidenceSummary;
    const mainFriction = candidate.risks[0] || 'Verejne informace jsou omezeny na search snippet.';

    return {
        firstImpression: `${candidate.name} pusobi z dostupnych verejnych snippetů jako relevantni lead, ale jde jen o omezeny verejny nahled, ne analyzu cele OTA stranky.`,
        strengths: candidate.signals.slice(0, 3),
        risks: candidate.risks,
        guestFrictionSignals: [mainFriction, 'Pred rezervaci muze chybet jasny blok s prijezdem, check-inem a praktickymi instrukcemi.'],
        quickWins: [
            {
                id: `quick-win-${crypto.randomUUID()}`,
                title: 'Zviditelnit informace pred prijezdem',
                why: 'Kandidat ma provozni signaly jako check-in, parkovani nebo prijezd, ktere host resi pred rezervaci.',
                action: 'Pridat do verejne prezentace kratky blok: prijezd, check-in, parkovani a kde host najde instrukce.',
                sourceEvidence: evidence,
            },
            {
                id: `quick-win-${crypto.randomUUID()}`,
                title: 'Vytahnout nejsilnejsi verejny benefit',
                why: 'Search snippet ukazuje silne stranky, ktere maji byt videt v prvnich sekundach.',
                action: `V prvnim odstavci zminit: ${candidate.signals.slice(0, 2).join(' + ') || 'hlavni duvod k rezervaci'}.`,
                sourceEvidence: candidate.evidenceSummary,
            },
            {
                id: `quick-win-${crypto.randomUUID()}`,
                title: 'Oddelit pred prijezdem a behem pobytu',
                why: 'Host rychleji pochopi hodnotu guest guide, kdyz vidi, co dostane predem a co vyresi az na miste.',
                action: 'Rozdelit instrukce do dvou casti: pred prijezdem a behem pobytu, plus doplnit QR guest guide jako dalsi krok.',
                sourceEvidence: candidate.sourceSnippets[1] || evidence,
            },
        ],
        miniAudit: `Mini-audit pro ${candidate.name}\n\nVychodisko: pracujeme jen s verejnymi search snippety a ulozenymi odkazy, ne s internimi daty ani automaticky prectenou OTA strankou.\n\nCo funguje: ${candidate.signals.slice(0, 3).join(', ')}.\n\nRiziko: ${candidate.risks.join(' ')}\n\nDoporuceny prvni krok: zviditelnit prakticke informace pred prijezdem a navazat na nejsilnejsi verejny benefit.`,
        outreachEmail: `Dobry den,\n\nvsiml jsem si verejne prezentace ${candidate.name}. Z dostupnych verejnych snippetů na me pusobi zajimave hlavne ${candidate.signals.slice(0, 2).join(' a ') || 'prvni dojem nabidky'}.\n\nSoucasne bych videl rychly prostor v tom, jak host pred rezervaci pochopi prijezd, check-in a prakticke instrukce. Poslal bych vam zdarma 3 konkretni navrhy vychazejici jen z verejne dostupnych informaci.\n\nDavid`,
        followUp: `Dobry den, jen kratce navazuji k ${candidate.name}. Pokud chcete, poslu mini-audit verejne prezentace ve 3 bodech; nic neposilam automaticky hostum ani nehodnotim interni komunikaci.`,
        offerRecommendation: 'Zacit bezplatnym mini-auditem verejne prezentace a potom nabidnout placeny audit guest guide / komunikace pred prijezdem.',
        confidence: candidate.isMock ? 'medium' : 'low',
        evidenceLimits: ['Vystup vychazi ze search snippetů a ulozenych URL.', 'Netvrdi, ze byla prectena Booking/Airbnb/Google stranka.', 'E-maily se automaticky neposilaji.'],
        isMock: candidate.isMock,
    };
};

async function postJson<ResponseType>(url: string, body: unknown): Promise<ResponseType> {
    const response = await fetch(url, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return (await response.json()) as ResponseType;
}

export async function discoverLeads(request: LeadAgentSearchRequest): Promise<LeadAgentDiscoverResponse> {
    try {
        const response = await postJson<LeadAgentDiscoverResponse>('/.netlify/functions/discover-leads', request);
        return response;
    } catch {
        return {
            status: 'needs-config',
            message: 'Autonomni hledani vyzaduje TAVILY_API_KEY a OPENAI_API_KEY v Netlify environment variables. Bez nich bezi demo rezim.',
            isMock: true,
            candidates: mockCandidates(request),
        };
    }
}

export async function analyzeLead(candidate: LeadAgentCandidate, userNotes = ''): Promise<LeadAgentAnalyzeResponse> {
    try {
        const response = await postJson<LeadAgentAnalyzeResponse>('/.netlify/functions/analyze-lead', {
            candidate,
            sourceSnippets: candidate.sourceSnippets,
            sourceUrls: candidate.sourceUrls,
            userNotes,
        });
        return response;
    } catch {
        return {
            status: 'completed',
            message: 'AI analyza neni dostupna v lokalnim Vite rezimu nebo chybi konfigurace. Pouzivam demo analyzu ze search snippetů.',
            isMock: true,
            analysis: mockAnalysis(candidate),
        };
    }
}
