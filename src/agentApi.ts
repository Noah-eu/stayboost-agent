import type { LeadAgentAnalysis, LeadAgentAnalyzeResponse, LeadAgentCandidate, LeadAgentDiscoverResponse, LeadAgentHealth, LeadAgentSearchRequest } from './leadAgentTypes';

const jsonHeaders = { 'Content-Type': 'application/json' };

const stableId = (prefix: string, value: string) => `${prefix}-${value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || crypto.randomUUID()}`;
const legacyRunId = 'local-demo-run';

const candidateBase = {
    runId: legacyRunId,
    createdAt: new Date().toISOString(),
    confidence: 'medium' as const,
    contactMissing: false,
    isLegacy: false,
};

const mockCandidates = (request: LeadAgentSearchRequest): LeadAgentCandidate[] => {
    const location = request.location || 'Praha';
    const segment = request.segment || 'self check-in / bez recepce';

    const candidates: LeadAgentCandidate[] = [
        {
            ...candidateBase,
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
            opportunityScore: 84,
            reviewFrictionScore: 76,
            fitVerdict: 'strong-opportunity',
            painSignals: ['Public snippet mentions key or keybox problem', 'Public snippet mentions unclear arrival or entrance'],
            positiveSolvedSignals: ['Keybox or arrival process appears already documented'],
            noPainReason: undefined,
            targetOffer: 'guest-guide',
            qualificationReason: 'Demo pain lead: provozni komplexita plus verejny pain signal kolem keyboxu/prijezdu.',
            alreadySolvedSignals: ['Self check-in / keybox je pravdepodobne zavedeno'],
            missingEvidence: ['Neni overena struktura predprijezdove komunikace mimo snippet'],
            contradictionWarnings: ['Nedoporucovat obecne zavadet self check-in, zdroj ho uz zminuje'],
            recommendedAngle: 'guest-guide',
            evidenceSummary: `Demo kandidat pro ${location}: odpovida segmentu ${segment}; zdrojem jsou mock search snippety, ne prectena OTA stranka.`,
            isMock: true,
        },
        {
            ...candidateBase,
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
            opportunityScore: 24,
            reviewFrictionScore: 0,
            fitVerdict: 'weak-opportunity',
            painSignals: [],
            positiveSolvedSignals: ['Vlastni web a verejny kontakt jsou videt'],
            noPainReason: 'self-check-in appears already solved; no public guest friction found',
            targetOffer: 'skip',
            qualificationReason: 'Demo benchmark: viditelna prezentace bez verejneho pain signalu.',
            alreadySolvedSignals: ['Vlastni web a verejny kontakt jsou videt'],
            missingEvidence: ['Chybi konkretni verejny signal o predprijezdovych instrukcich'],
            contradictionWarnings: [],
            recommendedAngle: 'description',
            evidenceSummary: 'Demo kandidat ma silny verejny prvni dojem, ale jen omezeny snippet k praktickym informacim.',
            isMock: true,
        },
        {
            ...candidateBase,
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
            opportunityScore: 44,
            reviewFrictionScore: 34,
            fitVerdict: 'weak-opportunity',
            confidence: 'low',
            contactMissing: true,
            painSignals: ['Public snippet mentions bad communication'],
            positiveSolvedSignals: ['Parking appears presented as an amenity, not a pain'],
            noPainReason: undefined,
            targetOffer: 'guest-communication-fix',
            qualificationReason: 'Demo weak lead: pain signal existuje, ale kontakt chybi a evidence je slaba.',
            alreadySolvedSignals: ['Parkovani a snidane jsou pravdepodobne komunikovane'],
            missingEvidence: ['Chybi verejny e-mail', 'Neni dost konkretni evidence o obchodni bolesti'],
            contradictionWarnings: ['Nevymyslet problem, pokud snippet ukazuje jen pozitivni signaly'],
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
    const isLowFit = ['weak-opportunity', 'not-enough-evidence', 'skip'].includes(candidate.fitVerdict);
    const primaryPain = candidate.painSignals[0] || 'verejny pain signal';
    const firstImpression = isLowFit
        ? `${candidate.name} neni podle dostupnych verejnych snippetů jasna priorita. Evidence zatim neukazuje konkretni obchodni bolest.`
        : `${candidate.name} pusobi z dostupnych verejnych snippetů jako relevantni lead, ale jde jen o omezeny verejny nahled, ne analyzu cele OTA stranky.`;

    return {
        runId: candidate.runId,
        analyzedAt: new Date().toISOString(),
        provider: candidate.isMock ? 'demo-fallback' : 'legacy',
        model: null,
        firstImpression,
        strengths: candidate.signals.slice(0, 3),
        risks: candidate.risks,
        guestFrictionSignals: isLowFit ? [mainFriction, 'Neni dost konkretni evidence o treni hosta.'] : [mainFriction, 'Pred rezervaci muze chybet jasny blok s prijezdem, check-inem a praktickymi instrukcemi.'],
        quickWins: isLowFit ? [
            {
                id: `quick-win-${crypto.randomUUID()}`,
                title: 'Neoslovovat zatim',
                why: 'Z dostupnych snippetů nevyplyva konkretni prodejni bolest.',
                action: 'Neposilat obchodni e-mail bez dalsiho verejneho nebo manualne overeneho pain signalu.',
                sourceEvidence: evidence,
            },
            {
                id: `quick-win-${crypto.randomUUID()}`,
                title: 'Doplnit evidenci',
                why: 'Self-check-in nebo provozni komplexita sama o sobe neni problem.',
                action: 'Hledat konkretni recenzni/search signal: problem s kodem, vstupem, parkovanim, prijezdem nebo komunikaci.',
                sourceEvidence: evidence,
            },
            {
                id: `quick-win-${crypto.randomUUID()}`,
                title: 'Pouzit jako benchmark',
                why: 'Kandidat muze ukazovat dobre vyreseny proces bez verejneho guest friction.',
                action: 'Neprepisovat pozitivni self-check-in signal na problem; pouzit jen jako srovnani pro slabsi provozy.',
                sourceEvidence: evidence,
            },
        ] : [
            {
                id: `quick-win-${crypto.randomUUID()}`,
                title: 'Resit konkretni guest friction',
                why: `Search/review snippet ukazuje: ${primaryPain}.`,
                action: candidate.alreadySolvedSignals.length > 0 ? 'Neprodavat obecne self check-in; nejdriv overit, zda jsou verejne instrukce skutecne nekompletni.' : 'Pridat do verejne prezentace kratky blok: prijezd, check-in, parkovani a kde host najde instrukce.',
                sourceEvidence: evidence,
            },
            {
                id: `quick-win-${crypto.randomUUID()}`,
                title: 'Zpresnit predprijezdove instrukce',
                why: 'Pain signal se tyka prijezdu, orientace, kodu, klicu, parkovani nebo komunikace.',
                action: 'Udelat kontrolni blok pro hosta: kde prijet, kde zaparkovat, kde je vstup, kdy dorazi kod a co delat pri problemu.',
                sourceEvidence: candidate.evidenceSummary,
            },
            {
                id: `quick-win-${crypto.randomUUID()}`,
                title: 'Navazat nabidku na pain',
                why: 'Nabidka ma byt o odstraneni dolozeneho treni, ne o obecném self-check-inu.',
                action: `Nabidnout ${candidate.targetOffer === 'skip' ? 'manualni overeni problemu' : candidate.targetOffer} jen jako reakci na dolozeny pain signal.`,
                sourceEvidence: candidate.sourceSnippets[1] || evidence,
            },
        ],
        miniAudit: `Mini-audit pro ${candidate.name}\n\nVychodisko: pracujeme jen s verejnymi search snippety a ulozenymi odkazy, ne s internimi daty ani automaticky prectenou OTA strankou.\n\nCo funguje: ${candidate.signals.slice(0, 3).join(', ')}.\n\nRiziko: ${candidate.risks.join(' ')}\n\nDoporuceny prvni krok: ${isLowFit ? 'nebrat jako prioritu bez dalsi evidence.' : `resit dolozeny pain signal: ${primaryPain}.`}`,
        outreachEmail: isLowFit
            ? 'Interni poznamka: Neoslovovat zatim, chybi duvod. Bez verejneho pain signalu negenerovat obchodni e-mail.'
            : `Dobry den,\n\nvsiml jsem si verejne prezentace ${candidate.name}. Z verejnych search snippetů me zaujal konkretni signal: ${primaryPain}.\n\nPoslal bych vam zdarma 3 navrhy zamerene jen na tento dolozeny problem v prijezdu, instrukcich, parkovani nebo komunikaci. Nehodnotim interni komunikaci ani automaticky neprochazim OTA stranky.\n\nDavid`,
        followUp: `Dobry den, jen kratce navazuji k ${candidate.name}. Pokud chcete, poslu mini-audit verejne prezentace ve 3 bodech; nic neposilam automaticky hostum ani nehodnotim interni komunikaci.`,
        offerRecommendation: isLowFit ? 'Neposilat jako prioritni obchodni lead; nejdrive ziskat lepsi dukaz o problemu.' : 'Zacit bezplatnym mini-auditem verejne prezentace a potom nabidnout placeny audit guest guide / komunikace pred prijezdem.',
        confidence: candidate.isMock ? 'medium' : 'low',
        fitVerdict: candidate.fitVerdict,
        opportunityScore: candidate.opportunityScore,
        reviewFrictionScore: candidate.reviewFrictionScore,
        painSignals: candidate.painSignals,
        positiveSolvedSignals: candidate.positiveSolvedSignals,
        noPainReason: candidate.noPainReason,
        targetOffer: candidate.targetOffer,
        qualificationReason: candidate.qualificationReason,
        alreadySolvedSignals: candidate.alreadySolvedSignals,
        missingEvidence: candidate.missingEvidence,
        contradictionWarnings: candidate.contradictionWarnings,
        evidenceLimits: ['Vystup vychazi ze search snippetů a ulozenych URL.', 'Netvrdi, ze byla prectena Booking/Airbnb/Google stranka.', 'E-maily se automaticky neposilaji.'],
        isMock: candidate.isMock,
    };
};

class ApiError extends Error {
    data: unknown;
    status: number;

    constructor(message: string, status: number, data: unknown) {
        super(message);
        this.data = data;
        this.status = status;
    }
}

async function postJson<ResponseType>(url: string, body: unknown): Promise<ResponseType> {
    const response = await fetch(url, {
        method: 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => null) as ResponseType | null;

    if (!response.ok) {
        throw new ApiError(`HTTP ${response.status}`, response.status, data);
    }

    return data as ResponseType;
}

async function getJson<ResponseType>(url: string): Promise<ResponseType> {
    const response = await fetch(url);
    const data = await response.json().catch(() => null) as ResponseType | null;

    if (!response.ok) {
        throw new ApiError(`HTTP ${response.status}`, response.status, data);
    }

    if (!data) {
        throw new ApiError('Invalid JSON response', response.status, data);
    }

    return data as ResponseType;
}

const isAgentHealth = (value: unknown): value is LeadAgentHealth => {
    const health = value as Partial<LeadAgentHealth> | null;
    return Boolean(
        health
        && health.ok === true
        && typeof health.runtime === 'string'
        && typeof health.hasTavilyKey === 'boolean'
        && typeof health.hasOpenAIKey === 'boolean'
        && typeof health.timestamp === 'string',
    );
};

const clientFallbackReason = (httpStatus?: number) => {
    if (httpStatus === 404) return 'function_404';
    if (httpStatus === 504) return 'netlify_function_timeout_risk';
    return 'network_error';
};

const clientAnalyzeMessage = (fallbackReason: string) => {
    if (fallbackReason === 'openai_timeout') return 'OpenAI analýza vypršela. Zkuste menší model gpt-5.4-mini nebo kratší vstup.';
    if (fallbackReason === 'netlify_function_timeout_risk') return 'OpenAI analýza pravděpodobně narazila na limit Netlify Function. Zkuste menší model gpt-5.4-mini nebo kratší vstup.';
    return `OpenAI analyza nebezela: ${fallbackReason}`;
};

export async function discoverLeads(request: LeadAgentSearchRequest): Promise<LeadAgentDiscoverResponse> {
    try {
        const response = await postJson<LeadAgentDiscoverResponse>('/.netlify/functions/discover-leads', request);
        return response;
    } catch (error) {
        const httpStatus = error instanceof ApiError ? error.status : undefined;
        return {
            status: 'needs-config',
            message: httpStatus === 404 ? 'Discovery fallback: function_404' : 'Discovery fallback: network_error',
            isMock: true,
            diagnostic: {
                mode: 'demo-fallback',
                discoverProvider: 'demo',
                fallbackReason: httpStatus === 404 ? 'function_404' : 'network_error',
                httpStatus,
                userMessage: httpStatus === 404 ? 'Discovery function neni dostupna: function_404' : 'Discovery function neni dostupna: network_error',
            },
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
    } catch (error) {
        if (error instanceof ApiError && error.data) {
            return error.data as LeadAgentAnalyzeResponse;
        }

        const httpStatus = error instanceof ApiError ? error.status : undefined;
        const fallbackReason = clientFallbackReason(httpStatus);
        const message = clientAnalyzeMessage(fallbackReason);

        return {
            status: 'completed',
            message,
            isMock: true,
            diagnostic: {
                mode: 'demo-fallback',
                analyzeProvider: 'demo-fallback',
                fallbackReason,
                httpStatus,
                userMessage: message,
            },
            analysis: mockAnalysis(candidate),
        };
    }
}

export async function checkAgentHealth(): Promise<LeadAgentHealth> {
    const health = await getJson<LeadAgentHealth>('/.netlify/functions/agent-health');

    if (!isAgentHealth(health)) {
        throw new Error('Invalid agent health response');
    }

    return health;
}
