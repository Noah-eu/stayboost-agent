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

    if (request.knownTargetName?.trim() || request.knownTargetWebsiteUrl?.trim()) {
        const name = request.knownTargetName?.trim() || 'Znamy cil';

        return [{
            ...candidateBase,
            id: stableId('agent-candidate', `${location}-${name}-known-target`),
            name: name.startsWith('DEMO') ? name : `DEMO — ${name}`,
            location: request.knownTargetCity || location,
            type: request.accommodationType.toLowerCase().includes('penzion') ? 'Penzion' : 'Apartman',
            websiteUrl: request.knownTargetWebsiteUrl || 'https://example.com/known-target',
            sourceUrls: [request.knownTargetWebsiteUrl || 'https://example.com/known-target'],
            sourceSnippets: [
                `${name} ${request.knownTargetCity || location} znamy cil z manualniho zadani. ${request.knownTargetNote || 'Verejna prezentace se overuje pres search dotazy.'}`,
                'Demo known-target fallback: web/kontakt je zadan uzivatelem, guest guide ani FAQ nejsou v zadani videt.',
            ],
            possibleEmail: request.knownTargetEmail || '',
            contactMissing: !request.knownTargetEmail,
            signals: ['Manualne zadany cil', request.knownTargetWebsiteUrl ? 'Zadany web' : 'Web bude treba dohledat', request.knownTargetEmail ? 'Zadany e-mail' : 'E-mail nezadan'],
            risks: ['Demo fallback: konkretni Tavily enrichment nebezel lokalne pres Vite'],
            leadScore: request.knownTargetEmail ? 76 : 58,
            opportunityScore: request.knownTargetEmail ? 72 : 48,
            opportunityType: request.knownTargetEmail || request.knownTargetWebsiteUrl ? 'setup-automation' : 'ota-profile-audit',
            automationNeedScore: 78,
            publicMaturityScore: 30,
            reviewFrictionScore: 0,
            fitVerdict: request.knownTargetEmail || request.knownTargetWebsiteUrl ? 'moderate-opportunity' : 'not-enough-evidence',
            painSignals: [],
            positiveSolvedSignals: [],
            noPainReason: 'No public review pain found; qualification is setup automation, not a fix claim.',
            targetOffer: 'self-checkin-setup',
            offerHypothesis: 'Known target setup: zadany provoz ma web/kontakt, ale neni videt online guest guide, FAQ ani predprijezdova stranka.',
            websiteSignals: request.knownTargetWebsiteUrl ? ['Uzivatelem zadany vlastni web'] : [],
            contactSignals: request.knownTargetEmail ? ['Uzivatelem zadany e-mail'] : [],
            missingAutomationSignals: ['Neni videt online guest guide', 'Neni videt FAQ / arrival guide', 'Neni videt predprijezdova stranka'],
            likelyManualProcessSignals: ['Manualne znamy lokalni provoz', 'Setup mezera vyzaduje rucni overeni'],
            qualificationReason: 'Known Target Mode: jeden konkretni provoz zadan uzivatelem; demo fallback vytvari setup kandidata bez tvrzeni painu.',
            alreadySolvedSignals: [],
            missingEvidence: ['Lokalni Vite fallback nepouzil Tavily enrichment', 'Pred oslovenim overit realny web a guest guide'],
            contradictionWarnings: [],
            recommendedAngle: 'guest-guide',
            evidenceSummary: 'Kandidat vznikl z Known Target Mode. Bez Netlify Functions jde o demo fallback, ne realne vyhledani.',
            isMock: true,
        }];
    }

    const candidates: LeadAgentCandidate[] = [
        {
            ...candidateBase,
            id: stableId('agent-candidate', `${location}-river-gate`),
            name: 'DEMO — Apartmany River Gate',
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
            opportunityType: 'fix-existing-process',
            automationNeedScore: 42,
            publicMaturityScore: 64,
            reviewFrictionScore: 76,
            fitVerdict: 'strong-opportunity',
            painSignals: ['Public snippet mentions key or keybox problem', 'Public snippet mentions unclear arrival or entrance'],
            positiveSolvedSignals: ['Keybox or arrival process appears already documented'],
            noPainReason: undefined,
            targetOffer: 'guest-guide',
            offerHypothesis: 'Fix existujiciho procesu: zpresnit instrukce kolem prijezdu/keyboxu podle verejneho pain signalu.',
            websiteSignals: ['Vlastni web'],
            contactSignals: ['Verejny e-mail'],
            missingAutomationSignals: ['Neni videt jednotna predprijezdova stranka'],
            likelyManualProcessSignals: ['Verejne instrukce pusobi roztrousene'],
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
            name: 'DEMO — Old Town Stay Apartments',
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
            opportunityScore: 74,
            opportunityType: 'setup-automation',
            automationNeedScore: 82,
            publicMaturityScore: 38,
            reviewFrictionScore: 0,
            fitVerdict: 'strong-opportunity',
            painSignals: [],
            positiveSolvedSignals: ['Vlastni web a verejny kontakt jsou videt'],
            noPainReason: 'No public review pain found; qualification is setup automation, not a fix claim.',
            targetOffer: 'self-checkin-setup',
            offerHypothesis: 'Setup automatizace: z verejne prezentace neni videt guest guide, FAQ ani predprijezdova stranka.',
            websiteSignals: ['Vlastni web mimo OTA', 'Rezervacni prezentace'],
            contactSignals: ['Verejny e-mail'],
            missingAutomationSignals: ['Neni videt online guest guide', 'Neni videt FAQ / arrival guide', 'Neni videt predprijezdova stranka'],
            likelyManualProcessSignals: ['Tradicni verejna prezentace', 'Prakticke instrukce nejsou v ukazce strukturovane'],
            qualificationReason: 'Demo setup lead: maly apartmanovy provoz s webem a kontaktem, ale bez viditelne moderni guest komunikace.',
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
            name: 'DEMO — Penzion U Parku',
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
            opportunityType: 'fix-existing-process',
            automationNeedScore: 40,
            publicMaturityScore: 34,
            reviewFrictionScore: 34,
            fitVerdict: 'weak-opportunity',
            confidence: 'low',
            contactMissing: true,
            painSignals: ['Public snippet mentions bad communication'],
            positiveSolvedSignals: ['Parking appears presented as an amenity, not a pain'],
            noPainReason: undefined,
            targetOffer: 'guest-communication-fix',
            offerHypothesis: 'Fix lead je slaby, protoze chybi kontakt; nejdriv dohledat vlastni web/e-mail.',
            websiteSignals: ['Mozny vlastni web'],
            contactSignals: [],
            missingAutomationSignals: ['Neni videt guest guide'],
            likelyManualProcessSignals: ['Rodinna atmosfera muze znamenat manualni komunikaci'],
            qualificationReason: 'Demo weak lead: pain signal existuje, ale kontakt chybi a evidence je slaba.',
            alreadySolvedSignals: ['Parkovani a snidane jsou pravdepodobne komunikovane'],
            missingEvidence: ['Chybi verejny e-mail', 'Neni dost konkretni evidence o obchodni bolesti'],
            contradictionWarnings: ['Nevymyslet problem, pokud snippet ukazuje jen pozitivni signaly'],
            recommendedAngle: 'guest-communication',
            evidenceSummary: 'Demo kandidat ukazuje provozni signaly, ale kontakt neni v ukazce nalezen.',
            isMock: true,
        },
        {
            ...candidateBase,
            id: stableId('agent-candidate', `${location}-self-checkin-benchmark`),
            name: 'DEMO — Penzion Digital Arrival',
            location,
            type: 'Penzion',
            websiteUrl: 'https://example.com/digital-arrival',
            sourceUrls: ['https://example.com/digital-arrival'],
            sourceSnippets: [
                `${location} penzion s pohodlnym online check-inem, QR instrukcemi a jasnou predprijezdovou komunikaci.`,
                'Snippet popisuje guest guide, parkovani a prehledne instrukce bez negativniho signalu.',
            ],
            possibleEmail: 'info@digitalarrival.example',
            signals: ['Vlastni web', 'Verejny kontakt', 'Online guest guide', 'QR instrukce', 'Self check-in pozitivne prezentovan'],
            risks: ['Demo benchmark: neni videt obchodni mezera'],
            leadScore: 78,
            opportunityScore: 20,
            opportunityType: 'benchmark',
            automationNeedScore: 12,
            publicMaturityScore: 86,
            reviewFrictionScore: 0,
            fitVerdict: 'weak-opportunity',
            painSignals: [],
            positiveSolvedSignals: ['Self-check-in appears already solved and presented positively', 'Online guest guide appears visible'],
            noPainReason: 'Self-check-in and guest guide look solved; no public pain found.',
            targetOffer: 'skip',
            offerHypothesis: 'Benchmark: neoslovovat, ulozit jako inspiraci pro dobre prezentovanou automatizaci.',
            websiteSignals: ['Vlastni web', 'Guest guide / QR instrukce jsou videt'],
            contactSignals: ['Verejny e-mail'],
            missingAutomationSignals: [],
            likelyManualProcessSignals: [],
            qualificationReason: 'Demo benchmark: self-check-in ma dobre signaly a chybi pain i setup mezera.',
            alreadySolvedSignals: ['Online guest guide', 'QR instrukce', 'Self check-in'],
            missingEvidence: ['Neni treba oslovovat bez dalsi rucni hypotezy'],
            contradictionWarnings: ['Neprevadet dobry self-check-in signal na fix lead'],
            recommendedAngle: 'guest-guide',
            evidenceSummary: 'Demo benchmark kandidat ukazuje self-check-in bez painu a bez setup mezery.',
            isMock: true,
        },
    ];

    return candidates.slice(0, Math.max(1, request.maxResults || 3));
};

const mockAnalysis = (candidate: LeadAgentCandidate): LeadAgentAnalysis => {
    const evidence = candidate.sourceSnippets[0] || candidate.evidenceSummary;
    const mainFriction = candidate.risks[0] || 'Verejne informace jsou omezeny na search snippet.';
    const isSetup = candidate.opportunityType === 'setup-automation';
    const isBenchmarkOrSkip = ['benchmark', 'skip'].includes(candidate.opportunityType);
    const isLowFit = ['weak-opportunity', 'not-enough-evidence', 'skip'].includes(candidate.fitVerdict) || isBenchmarkOrSkip;
    const primaryPain = candidate.painSignals[0] || 'verejny pain signal';
    const firstImpression = isSetup
        ? `${candidate.name} vypada jako setup lead: z verejne prezentace je videt kontakt/web, ale neni jasne, zda maji online guest guide, QR instrukce nebo predprijezdovou stranku.`
        : isLowFit
            ? `${candidate.name} neni podle dostupnych verejnych snippetů jasna priorita. Evidence zatim neukazuje konkretni obchodni bolest ani setup mezeru.`
            : `${candidate.name} pusobi z dostupnych verejnych snippetů jako fix lead, ale jde jen o omezeny verejny nahled, ne analyzu cele OTA stranky.`;
    const quickWins = isSetup ? [
        {
            id: `quick-win-${crypto.randomUUID()}`,
            title: 'Navrhnout online guest guide',
            why: 'Z verejne prezentace neni videt jednotna stranka s prijezdem, parkovanim, Wi-Fi a odpovedmi na caste dotazy.',
            action: 'Nabidnout jednoduchy QR guest guide a predprijezdovou stranku bez tvrzeni, ze dnes delaji neco spatne.',
            sourceEvidence: evidence,
        },
        {
            id: `quick-win-${crypto.randomUUID()}`,
            title: 'Zjednodusit predprijezdove zpravy',
            why: 'Maly lokalni provoz s kontaktem muze cast komunikace resit rucne.',
            action: 'Pripravit sadu sablon pro prijezd, parkovani, check-in a nejcastejsi odpovedi.',
            sourceEvidence: candidate.evidenceSummary,
        },
        {
            id: `quick-win-${crypto.randomUUID()}`,
            title: 'Overit setup mezeru',
            why: candidate.missingAutomationSignals.join(', ') || 'Neni videt moderni guest komunikace.',
            action: 'Pred oslovenim jeste rucne zkontrolovat, zda na webu neni skryty guest guide nebo FAQ.',
            sourceEvidence: candidate.sourceSnippets[1] || evidence,
        },
    ] : isLowFit ? [
        {
            id: `quick-win-${crypto.randomUUID()}`,
            title: isBenchmarkOrSkip ? 'Pouzit jako benchmark' : 'Neoslovovat zatim',
            why: 'Z dostupnych snippetů nevyplyva konkretni prodejni bolest ani setup mezera.',
            action: 'Neposilat obchodni e-mail bez dalsiho verejneho nebo manualne overeneho duvodu.',
            sourceEvidence: evidence,
        },
        {
            id: `quick-win-${crypto.randomUUID()}`,
            title: 'Doplnit evidenci',
            why: 'Self-check-in nebo provozni komplexita sama o sobe neni problem.',
            action: 'Hledat konkretni recenzni pain nebo chybejici guest guide / FAQ / predprijezdovou stranku.',
            sourceEvidence: evidence,
        },
        {
            id: `quick-win-${crypto.randomUUID()}`,
            title: 'Neprepisovat pozitivni signal',
            why: 'Kandidat muze ukazovat dobre vyreseny proces bez verejneho guest friction.',
            action: 'Pouzit jako srovnani pro slabsi provozy, ne jako fix lead.',
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
    ];

    return {
        runId: candidate.runId,
        analyzedAt: new Date().toISOString(),
        provider: candidate.isMock ? 'demo-fallback' : 'legacy',
        model: null,
        firstImpression,
        strengths: candidate.signals.slice(0, 3),
        risks: candidate.risks,
        guestFrictionSignals: isSetup ? candidate.likelyManualProcessSignals : isLowFit ? [mainFriction, 'Neni dost konkretni evidence o treni hosta.'] : [mainFriction, 'Pred rezervaci muze chybet jasny blok s prijezdem, check-inem a praktickymi instrukcemi.'],
        quickWins,
        miniAudit: `Mini-audit pro ${candidate.name}\n\nVychodisko: pracujeme jen s verejnymi search snippety a ulozenymi odkazy, ne s internimi daty ani automaticky prectenou OTA strankou.\n\nCo funguje: ${candidate.signals.slice(0, 3).join(', ')}.\n\nRiziko: ${candidate.risks.join(' ')}\n\nDoporuceny prvni krok: ${isSetup ? 'opatrne nabidnout setup online guest guide / QR instrukci bez tvrzeni problemu.' : isLowFit ? 'nebrat jako prioritu bez dalsi evidence.' : `resit dolozeny pain signal: ${primaryPain}.`}`,
        outreachEmail: isBenchmarkOrSkip
            ? 'Interni poznamka: Neoslovovat zatim, chybi duvod. Bez verejneho pain signalu negenerovat obchodni e-mail.'
            : isSetup
            ? `Dobry den,\n\nvsiml jsem si verejne prezentace ${candidate.name}. Z verejne prezentace neni videt, zda hoste maji jednoduchy online guest guide, QR instrukce nebo predprijezdovou stranku.\n\nU podobnych penzionu a apartmanu to casto pomaha snizit pocet dotazu a zprehlednit prijezd, aniz bych tvrdil, ze dnes neco delate spatne. Poslal bych vam zdarma 3 konkretni napady vychazejici jen z verejnych informaci.\n\nDavid`
            : `Dobry den,\n\nvsiml jsem si verejne prezentace ${candidate.name}. Z verejnych search snippetů me zaujal konkretni signal: ${primaryPain}.\n\nPoslal bych vam zdarma 3 navrhy zamerene jen na tento dolozeny problem v prijezdu, instrukcich, parkovani nebo komunikaci. Nehodnotim interni komunikaci ani automaticky neprochazim OTA stranky.\n\nDavid`,
        followUp: `Dobry den, jen kratce navazuji k ${candidate.name}. Pokud chcete, poslu mini-audit verejne prezentace ve 3 bodech; nic neposilam automaticky hostum ani nehodnotim interni komunikaci.`,
        offerRecommendation: isLowFit ? 'Neposilat jako prioritni obchodni lead; nejdrive ziskat lepsi dukaz o problemu.' : 'Zacit bezplatnym mini-auditem verejne prezentace a potom nabidnout placeny audit guest guide / komunikace pred prijezdem.',
        confidence: candidate.isMock ? 'medium' : 'low',
        fitVerdict: candidate.fitVerdict,
        opportunityScore: candidate.opportunityScore,
        opportunityType: candidate.opportunityType,
        automationNeedScore: candidate.automationNeedScore,
        publicMaturityScore: candidate.publicMaturityScore,
        reviewFrictionScore: candidate.reviewFrictionScore,
        painSignals: candidate.painSignals,
        positiveSolvedSignals: candidate.positiveSolvedSignals,
        noPainReason: candidate.noPainReason,
        targetOffer: candidate.targetOffer,
        offerHypothesis: candidate.offerHypothesis,
        websiteSignals: candidate.websiteSignals,
        contactSignals: candidate.contactSignals,
        missingAutomationSignals: candidate.missingAutomationSignals,
        likelyManualProcessSignals: candidate.likelyManualProcessSignals,
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

const clientDiscoveryMessage = (fallbackReason: string) => `Reálné hledání neběželo. Discovery function selhala: ${fallbackReason}. Demo kandidáti nejsou skuteční klienti.`;

export async function discoverLeads(request: LeadAgentSearchRequest): Promise<LeadAgentDiscoverResponse> {
    try {
        const response = await postJson<LeadAgentDiscoverResponse>('/.netlify/functions/discover-leads', request);
        return response;
    } catch (error) {
        const httpStatus = error instanceof ApiError ? error.status : undefined;
        const fallbackReason = httpStatus === 404 ? 'function_404' : httpStatus === 504 ? 'netlify_function_timeout_risk' : 'network_error';
        const message = clientDiscoveryMessage(fallbackReason);

        return {
            status: httpStatus === 404 ? 'needs-config' : 'error',
            message,
            isMock: false,
            diagnostic: {
                mode: 'error',
                discoverProvider: 'error',
                source: 'error',
                fallbackReason,
                httpStatus,
                userMessage: message,
            },
            candidates: [],
        };
    }
}

export async function discoverDemoLeads(request: LeadAgentSearchRequest): Promise<LeadAgentDiscoverResponse> {
    return {
        status: 'found',
        message: 'Demo režim: tito kandidáti jsou fiktivní a slouží pouze pro test UI.',
        isMock: true,
        diagnostic: {
            mode: 'demo-fallback',
            discoverProvider: 'demo',
            source: 'demo fallback',
            fallbackReason: 'manual_demo_mode',
            httpStatus: 200,
            userMessage: 'Demo kandidáti byli zobrazeni po explicitním kliknutí uživatele.',
        },
        candidates: mockCandidates(request),
    };
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
