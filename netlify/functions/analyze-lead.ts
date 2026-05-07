type CandidateInput = {
    runId?: string;
    name?: string;
    signals?: string[];
    risks?: string[];
    opportunityScore?: number;
    opportunityType?: OpportunityType;
    automationNeedScore?: number;
    publicMaturityScore?: number;
    reviewFrictionScore?: number;
    fitVerdict?: FitVerdict;
    confidence?: Confidence;
    painSignals?: string[];
    positiveSolvedSignals?: string[];
    noPainReason?: string;
    targetOffer?: TargetOffer;
    offerHypothesis?: string;
    websiteSignals?: string[];
    contactSignals?: string[];
    missingAutomationSignals?: string[];
    likelyManualProcessSignals?: string[];
    qualificationReason?: string;
    alreadySolvedSignals?: string[];
    missingEvidence?: string[];
    contradictionWarnings?: string[];
    sourceSnippets?: string[];
    evidenceSummary?: string;
    websiteExtraction?: {
        status?: string;
        websiteUrl?: string;
        pagesExtracted?: Array<{ url?: string; title?: string; textPreview?: string; contentLength?: number }>;
        contact?: { emails?: string[]; phones?: string[]; contactPageUrl?: string | null };
        websiteSignals?: string[];
        arrivalSignals?: string[];
        parkingSignals?: string[];
        faqSignals?: string[];
        guestGuideSignals?: string[];
        automationSignals?: string[];
        missingPublicInfoSignals?: string[];
        likelyManualProcessSignals?: string[];
        strengths?: string[];
        risks?: string[];
        setupOpportunitySignals?: string[];
        fixOpportunitySignals?: string[];
        evidenceLimits?: string[];
        summary?: string;
    };
    isMock?: boolean;
};

type FitVerdict = 'strong-opportunity' | 'moderate-opportunity' | 'weak-opportunity' | 'not-enough-evidence' | 'skip';
type Confidence = 'low' | 'medium' | 'high';
type TargetOffer = 'guest-communication-fix' | 'guest-guide' | 'ota-profile-audit' | 'review-response-improvement' | 'self-checkin-setup' | 'skip';
type OpportunityType = 'fix-existing-process' | 'setup-automation' | 'ota-profile-audit' | 'benchmark' | 'skip';

declare const process: { env: Record<string, string | undefined> };

type FallbackReason =
    | 'missing_openai_api_key'
    | 'openai_401_auth'
    | 'openai_403_access'
    | 'openai_429_rate_limit'
    | 'openai_400_bad_request_or_model'
    | 'openai_504_from_provider'
    | 'openai_5xx_provider_error'
    | 'openai_http_error'
    | 'openai_timeout'
    | 'openai_network_error'
    | 'openai_json_parse_error'
    | 'openai_refusal'
    | 'openai_incomplete'
    | 'openai_json_schema_error'
    | 'netlify_function_timeout_risk'
    | 'function_runtime_error';

type RawOutputKind = 'output_text' | 'output_message_content' | 'unknown';

const OPENAI_TIMEOUT_MS = 20000;
const MAX_SNIPPETS = 4;
const MAX_SNIPPET_LENGTH = 800;
const MAX_FIELD_LENGTH = 600;

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
};

const json = (statusCode: number, body: unknown) => ({ statusCode, headers, body: JSON.stringify(body) });

const makeDebugId = () => `analyze-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const safeSample = (value: string, maxLength = 500) => value
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
    .slice(0, maxLength);

const analysisJsonSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
        'firstImpression',
        'strengths',
        'risks',
        'guestFrictionSignals',
        'quickWins',
        'miniAudit',
        'outreachEmail',
        'followUp',
        'offerRecommendation',
        'confidence',
        'fitVerdict',
        'opportunityType',
        'opportunityScore',
        'reviewFrictionScore',
        'automationNeedScore',
        'publicMaturityScore',
        'painSignals',
        'positiveSolvedSignals',
        'alreadySolvedSignals',
        'missingEvidence',
        'missingAutomationSignals',
        'likelyManualProcessSignals',
        'contradictionWarnings',
        'targetOffer',
        'qualificationReason',
        'offerHypothesis',
        'evidenceLimits',
    ],
    properties: {
        firstImpression: { type: 'string' },
        strengths: { type: 'array', items: { type: 'string' } },
        risks: { type: 'array', items: { type: 'string' } },
        guestFrictionSignals: { type: 'array', items: { type: 'string' } },
        quickWins: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['title', 'why', 'action', 'sourceEvidence'],
                properties: {
                    title: { type: 'string' },
                    why: { type: 'string' },
                    action: { type: 'string' },
                    sourceEvidence: { type: 'string' },
                },
            },
        },
        miniAudit: { type: 'string' },
        outreachEmail: { type: 'string' },
        followUp: { type: 'string' },
        offerRecommendation: { type: 'string' },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        fitVerdict: { type: 'string', enum: ['strong-opportunity', 'moderate-opportunity', 'weak-opportunity', 'not-enough-evidence', 'skip'] },
        opportunityType: { type: 'string', enum: ['fix-existing-process', 'setup-automation', 'ota-profile-audit', 'benchmark', 'skip'] },
        opportunityScore: { type: 'number' },
        reviewFrictionScore: { type: 'number' },
        automationNeedScore: { type: 'number' },
        publicMaturityScore: { type: 'number' },
        painSignals: { type: 'array', items: { type: 'string' } },
        positiveSolvedSignals: { type: 'array', items: { type: 'string' } },
        alreadySolvedSignals: { type: 'array', items: { type: 'string' } },
        missingEvidence: { type: 'array', items: { type: 'string' } },
        missingAutomationSignals: { type: 'array', items: { type: 'string' } },
        likelyManualProcessSignals: { type: 'array', items: { type: 'string' } },
        contradictionWarnings: { type: 'array', items: { type: 'string' } },
        targetOffer: { type: 'string', enum: ['guest-communication-fix', 'guest-guide', 'ota-profile-audit', 'review-response-improvement', 'self-checkin-setup', 'skip'] },
        qualificationReason: { type: 'string' },
        offerHypothesis: { type: 'string' },
        evidenceLimits: { type: 'array', items: { type: 'string' } },
    },
};

const fallbackReasonForStatus = (status: number): FallbackReason => {
    if (status === 401) return 'openai_401_auth';
    if (status === 403) return 'openai_403_access';
    if (status === 429) return 'openai_429_rate_limit';
    if (status === 400) return 'openai_400_bad_request_or_model';
    if (status === 504) return 'openai_504_from_provider';
    if (status >= 500) return 'openai_5xx_provider_error';
    return 'openai_http_error';
};

const trimText = (value = '', maxLength = MAX_FIELD_LENGTH) => value.replace(/\s+/g, ' ').trim().slice(0, maxLength);

const trimList = (values: string[] = [], maxItems = MAX_SNIPPETS, maxLength = MAX_SNIPPET_LENGTH) => values
    .filter(Boolean)
    .slice(0, maxItems)
    .map((value) => trimText(value, maxLength));

const compactCandidate = (candidate: CandidateInput, sourceSnippets: string[] = []) => ({
    name: trimText(candidate.name, 160),
    evidenceSummary: trimText(candidate.evidenceSummary, 500),
    signals: trimList(candidate.signals, 8, 120),
    risks: trimList(candidate.risks, 6, 140),
    opportunityScore: candidate.opportunityScore ?? 0,
    opportunityType: candidate.opportunityType ?? 'skip',
    automationNeedScore: candidate.automationNeedScore ?? 0,
    publicMaturityScore: candidate.publicMaturityScore ?? 0,
    reviewFrictionScore: candidate.reviewFrictionScore ?? 0,
    fitVerdict: candidate.fitVerdict ?? 'not-enough-evidence',
    confidence: candidate.confidence ?? 'low',
    painSignals: trimList(candidate.painSignals, 8, 180),
    positiveSolvedSignals: trimList(candidate.positiveSolvedSignals, 6, 180),
    noPainReason: trimText(candidate.noPainReason, 220),
    targetOffer: candidate.targetOffer ?? 'skip',
    offerHypothesis: trimText(candidate.offerHypothesis, 300),
    websiteSignals: trimList(candidate.websiteSignals, 6, 140),
    contactSignals: trimList(candidate.contactSignals, 6, 140),
    missingAutomationSignals: trimList(candidate.missingAutomationSignals, 8, 160),
    likelyManualProcessSignals: trimList(candidate.likelyManualProcessSignals, 8, 160),
    qualificationReason: trimText(candidate.qualificationReason, 260),
    alreadySolvedSignals: trimList(candidate.alreadySolvedSignals, 6, 160),
    missingEvidence: trimList(candidate.missingEvidence, 6, 160),
    contradictionWarnings: trimList(candidate.contradictionWarnings, 4, 180),
    sourceSnippets: trimList(sourceSnippets.length > 0 ? sourceSnippets : candidate.sourceSnippets, MAX_SNIPPETS, MAX_SNIPPET_LENGTH),
    websiteExtraction: candidate.websiteExtraction ? {
        status: trimText(candidate.websiteExtraction.status, 60),
        websiteUrl: trimText(candidate.websiteExtraction.websiteUrl, 220),
        summary: trimText(candidate.websiteExtraction.summary, 700),
        pagesExtracted: (candidate.websiteExtraction.pagesExtracted || []).slice(0, 6).map((page) => ({
            url: trimText(page.url, 220),
            title: trimText(page.title, 120),
            textPreview: trimText(page.textPreview, 900),
            contentLength: page.contentLength || 0,
        })),
        contact: {
            emails: trimList(candidate.websiteExtraction.contact?.emails, 6, 120),
            phones: trimList(candidate.websiteExtraction.contact?.phones, 6, 80),
            contactPageUrl: trimText(candidate.websiteExtraction.contact?.contactPageUrl || '', 220),
        },
        websiteSignals: trimList(candidate.websiteExtraction.websiteSignals, 8, 160),
        arrivalSignals: trimList(candidate.websiteExtraction.arrivalSignals, 8, 160),
        parkingSignals: trimList(candidate.websiteExtraction.parkingSignals, 6, 160),
        faqSignals: trimList(candidate.websiteExtraction.faqSignals, 6, 160),
        guestGuideSignals: trimList(candidate.websiteExtraction.guestGuideSignals, 6, 160),
        automationSignals: trimList(candidate.websiteExtraction.automationSignals, 6, 160),
        missingPublicInfoSignals: trimList(candidate.websiteExtraction.missingPublicInfoSignals, 8, 180),
        likelyManualProcessSignals: trimList(candidate.websiteExtraction.likelyManualProcessSignals, 8, 160),
        strengths: trimList(candidate.websiteExtraction.strengths, 8, 160),
        risks: trimList(candidate.websiteExtraction.risks, 8, 180),
        setupOpportunitySignals: trimList(candidate.websiteExtraction.setupOpportunitySignals, 8, 180),
        fixOpportunitySignals: trimList(candidate.websiteExtraction.fixOpportunitySignals, 8, 180),
        evidenceLimits: trimList(candidate.websiteExtraction.evidenceLimits, 8, 180),
    } : null,
});

const fallbackAnalysis = (candidate: CandidateInput) => {
    const name = candidate.name || 'Vybrany kandidat';
    const signals = candidate.signals || [];
    const risks = candidate.risks || [];
    const evidence = candidate.sourceSnippets?.[0] || candidate.evidenceSummary || 'Omezeny verejny search snippet.';
    const fitVerdict = candidate.fitVerdict || 'not-enough-evidence';
    const painSignals = candidate.painSignals || [];
    const positiveSolvedSignals = candidate.positiveSolvedSignals || [];
    const targetOffer = candidate.targetOffer || 'skip';
    const opportunityType = candidate.opportunityType || 'skip';
    const qualificationReason = candidate.qualificationReason || 'Chybi pain qualification metadata.';
    const isSetup = opportunityType === 'setup-automation';
    const isBenchmarkOrSkip = ['benchmark', 'skip'].includes(opportunityType);
    const isLowFit = ['weak-opportunity', 'not-enough-evidence', 'skip'].includes(fitVerdict) || isBenchmarkOrSkip;
    const solvedSignals = candidate.alreadySolvedSignals || [];
    const firstImpression = isSetup
        ? `${name} vypada jako setup opportunity: z verejne prezentace neni jasne, zda host dostava jednoduchy predprijezdovy guide. Guest guide muze existovat neverejne.`
        : isLowFit
        ? `${name} neni podle dostupnych snippetu jasna priorita. Evidence neukazuje konkretni obchodni bolest, kterou by mel StayBoost resit.`
        : `${name} vypada z verejnych snippetu jako relevantni lead, ale evidence je omezena na search vysledky.`;
    const practicalAction = solvedSignals.length > 0
        ? 'Neprodavat obecne self check-in. Overit jen to, zda jsou verejne instrukce opravdu srozumitelne a kompletni.'
        : 'Pridat kratky blok: prijezd, check-in, parkovani a kde host najde instrukce.';
    const primaryPain = painSignals[0] || 'verejny pain signal';

    const quickWins = isSetup ? [
        {
            title: 'Ověřit a případně zjednodušit host guide',
            why: 'Z veřejné prezentace není jasné, zda host dostává jednoduchý předpříjezdový guide; guest guide může existovat neveřejně.',
            action: 'Pokud ještě nemají host guide, nabídnout jednoduchý QR / předpříjezdový guide; pokud ho mají, zkontrolovat, zda je jasně napojený na zprávy hostům.',
            sourceEvidence: evidence,
        },
        {
            title: 'Zprehlednit predprijezdove informace',
            why: 'Setup opportunity je o modernizaci komunikace, ne o fixu spatnych recenzi.',
            action: 'Navrhnout sablony pro prijezd, parkovani, check-in a caste dotazy.',
            sourceEvidence: evidence,
        },
        {
            title: 'Rucne overit mezeru',
            why: (candidate.missingAutomationSignals || []).join(', ') || 'Předpříjezdový guide nelze veřejně ověřit.',
            action: 'Před kontaktem ověřit dostupné veřejné podklady a formulovat to jako opatrnou setup příležitost, ne jako jistý problém.',
            sourceEvidence: evidence,
        },
    ] : isLowFit ? [
        {
            title: isBenchmarkOrSkip ? 'Pouzit jako benchmark' : 'Neoslovovat zatim',
            why: 'Z dostupnych snippetu nevyplyva konkretni prodejni bolest ani setup mezera.',
            action: 'Neposilat obchodni e-mail bez dalsiho verejneho nebo manualne overeneho duvodu.',
            sourceEvidence: evidence,
        },
        {
            title: 'Doplnit evidenci',
            why: 'Self-check-in nebo provozni komplexita sama o sobe neni problem.',
            action: 'Hledat konkrétní pain nebo veřejný důkaz, že předpříjezdové informace nejsou jasné; guest guide může existovat neveřejně.',
            sourceEvidence: evidence,
        },
        {
            title: 'Neprepisovat pozitivni signal',
            why: 'Kandidat muze ukazovat dobre vyreseny proces bez verejneho guest friction.',
            action: 'Pouzit jen jako srovnani pro slabsi provozy.',
            sourceEvidence: evidence,
        },
    ] : [
        {
            title: 'Resit konkretni guest friction',
            why: `Search/review snippet ukazuje: ${primaryPain}.`,
            action: practicalAction,
            sourceEvidence: evidence,
        },
        {
            title: 'Zpresnit predprijezdove instrukce',
            why: 'Pain signal se tyka prijezdu, orientace, kodu, klicu, parkovani nebo komunikace.',
            action: 'Udelat kontrolni blok pro hosta: kde prijet, kde zaparkovat, kde je vstup, kdy dorazi kod a co delat pri problemu.',
            sourceEvidence: evidence,
        },
        {
            title: 'Navazat nabidku na pain',
            why: 'Nabidka ma byt o odstraneni dolozeneho treni, ne o obecném self-check-inu.',
            action: `Nabidnout ${targetOffer === 'skip' ? 'manualni overeni problemu' : targetOffer} jen jako reakci na dolozeny pain signal.`,
            sourceEvidence: evidence,
        },
    ];

    return {
        firstImpression: painSignals.length > 0 ? `${firstImpression} Konkretni pain: ${painSignals[0]}.` : firstImpression,
        strengths: signals.slice(0, 3),
        risks: risks.length > 0 ? risks : ['Omezeny verejny nahled, neni potvrzen detail nabidky.'],
        guestFrictionSignals: isSetup ? candidate.likelyManualProcessSignals || [] : painSignals.length > 0 ? painSignals : ['Neni dost konkretni evidence o treni hosta.'],
        quickWins,
        miniAudit: `Mini-audit veřejné nabídky: ${name}\n\nPrvní dojem: veřejná prezentace působí relevantně, ale zaslouží si krátké zpřesnění prvního dojmu.\n\nCo působí dobře: ${signals.slice(0, 3).join(', ') || 'základní veřejná prezentace je dohledatelná'}.\n\nCo bych zlepšil: vybrat nejsilnější první fotky, zpřesnit praktické informace a dát hostovi rychlejší důvod pokračovat v rezervaci.\n\nDalší krok: poslat krátké 3 body, které půjde ověřit proti veřejné nabídce.`,
        outreachEmail: isBenchmarkOrSkip
            ? 'Interni poznamka: Neoslovovat zatim, chybi duvod. Bez verejneho pain signalu negenerovat obchodni e-mail.'
            : isSetup
                ? `Dobrý den,\n\nnarazil jsem na veřejnou prezentaci ${name} a první dojem působí dobře. Zaujalo mě hlavně: ${signals[0] || 'ubytování je veřejně dobře dohledatelné'}.\n\nVšiml jsem si ale jedné drobnosti: první fotky a praktické informace by šly poskládat tak, aby host rychleji pochopil hlavní výhodu pobytu.\n\nNejde o kritiku, spíš o rychlý pohled zvenku. Můžu vám zdarma poslat 3 krátké návrhy v bodech. Má smysl vám to poslat?\n\nDavid`
            : `Dobrý den,\n\nnarazil jsem na veřejnou prezentaci ${name}. Zaujalo mě hlavně: ${signals[0] || 'ubytování je dobře dohledatelné'}.\n\nVšiml jsem si ale i tématu, které může hostovi zbytečně komplikovat první dojem: ${primaryPain}.\n\nNejde o kritiku, spíš o rychlý pohled zvenku. Můžu vám zdarma poslat 3 konkrétní návrhy, jak tenhle detail zpřehlednit v nabídce nebo komunikaci před příjezdem. Má smysl vám to poslat?\n\nDavid`,
        followUp: `Dobrý den,\n\njen krátce navazuji na předchozí zprávu. Šlo mi hlavně o pár rychlých návrhů k prvnímu dojmu z veřejné nabídky ${name}.\n\nPokud to teď není aktuální, vůbec nevadí. Kdyby se vám hodilo, pošlu 3 konkrétní body zdarma.\n\nDavid`,
        offerRecommendation: isLowFit ? 'Nejdřív doplnit lepší veřejný důvod k oslovení.' : 'Začít rychlým auditem veřejné nabídky, potom případně řešit galerii, popis a předpříjezdové informace pro hosta.',
        confidence: candidate.confidence || 'low',
        fitVerdict,
        opportunityScore: candidate.opportunityScore || 0,
        opportunityType,
        automationNeedScore: candidate.automationNeedScore || 0,
        publicMaturityScore: candidate.publicMaturityScore || 0,
        reviewFrictionScore: candidate.reviewFrictionScore || 0,
        painSignals,
        positiveSolvedSignals,
        noPainReason: candidate.noPainReason,
        targetOffer,
        offerHypothesis: candidate.offerHypothesis || '',
        websiteSignals: candidate.websiteSignals || [],
        contactSignals: candidate.contactSignals || [],
        missingAutomationSignals: candidate.missingAutomationSignals || [],
        likelyManualProcessSignals: candidate.likelyManualProcessSignals || [],
        qualificationReason,
        alreadySolvedSignals: candidate.alreadySolvedSignals || [],
        missingEvidence: [...new Set([...(candidate.missingEvidence || ['Fallback analyza nema dost evidence pro jistou obchodni bolest.']), 'Nelze verejne overit, zda maji guest guide.', 'Guest guide muze existovat neverejne.'])],
        contradictionWarnings: candidate.contradictionWarnings || [],
        evidenceLimits: ['Omezeno na search snippety a dodane verejne texty.', 'Netvrdi, ze byla prectena Booking/Airbnb/Google stranka.', 'Neviditelny guest guide neni automaticky pain signal.', 'E-maily se automaticky neposilaji.'],
    };
};

const cleanJsonText = (value: string) => {
    const trimmed = value.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : trimmed;
};

const parseJsonObject = (value: string) => {
    const trimmed = cleanJsonText(value);
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
        throw new Error('OpenAI response did not contain JSON object.');
    }

    return JSON.parse(trimmed.slice(start, end + 1));
};

const extractTextContent = (payload: unknown): { text: string; rawOutputKind: RawOutputKind; parsedObject?: unknown; refusal?: string; incomplete?: boolean } => {
    const response = payload as {
        status?: string;
        incomplete_details?: unknown;
        output_text?: string;
        output?: Array<{ content?: Array<{ text?: string; value?: string; parsed?: unknown; json?: unknown; refusal?: string; type?: string }> }>;
    };

    if (typeof response.output_text === 'string' && response.output_text.trim()) {
        return { text: response.output_text, rawOutputKind: 'output_text', incomplete: response.status === 'incomplete' || Boolean(response.incomplete_details) };
    }

    const content = response.output?.flatMap((item) => item.content || []) || [];
    const parsedContent = content.find((item) => item.parsed || item.json);
    const refusal = content.find((item) => item.refusal)?.refusal;
    const text = content
        .map((contentItem) => contentItem.text || contentItem.value || '')
        .filter(Boolean)
        .join('\n') || '';

    return {
        text,
        rawOutputKind: text ? 'output_message_content' : 'unknown',
        parsedObject: parsedContent?.parsed || parsedContent?.json,
        refusal,
        incomplete: response.status === 'incomplete' || Boolean(response.incomplete_details),
    };
};

const isFitVerdict = (value: unknown): value is FitVerdict => ['strong-opportunity', 'moderate-opportunity', 'weak-opportunity', 'not-enough-evidence', 'skip'].includes(String(value));
const isTargetOffer = (value: unknown): value is TargetOffer => ['guest-communication-fix', 'guest-guide', 'ota-profile-audit', 'review-response-improvement', 'self-checkin-setup', 'skip'].includes(String(value));
const isOpportunityType = (value: unknown): value is OpportunityType => ['fix-existing-process', 'setup-automation', 'ota-profile-audit', 'benchmark', 'skip'].includes(String(value));

const validateAnalysis = (value: unknown) => {
    const analysis = value as { quickWins?: unknown[]; miniAudit?: unknown; outreachEmail?: unknown; confidence?: unknown; fitVerdict?: unknown; opportunityScore?: unknown; opportunityType?: unknown; automationNeedScore?: unknown; publicMaturityScore?: unknown; reviewFrictionScore?: unknown; painSignals?: unknown; targetOffer?: unknown; offerHypothesis?: unknown; qualificationReason?: unknown };

    if (!analysis || !Array.isArray(analysis.quickWins) || analysis.quickWins.length < 3 || typeof analysis.miniAudit !== 'string' || typeof analysis.outreachEmail !== 'string') {
        throw new Error('Invalid analysis JSON shape.');
    }

    if (!['low', 'medium', 'high'].includes(String(analysis.confidence))) {
        throw new Error('Invalid confidence value.');
    }

    if (!isFitVerdict(analysis.fitVerdict)) {
        throw new Error('Invalid fitVerdict value.');
    }

    if (typeof analysis.opportunityScore !== 'number') {
        throw new Error('Invalid opportunityScore value.');
    }

    if (!isOpportunityType(analysis.opportunityType)) {
        throw new Error('Invalid opportunityType value.');
    }

    if (typeof analysis.automationNeedScore !== 'number') {
        throw new Error('Invalid automationNeedScore value.');
    }

    if (typeof analysis.publicMaturityScore !== 'number') {
        throw new Error('Invalid publicMaturityScore value.');
    }

    if (typeof analysis.reviewFrictionScore !== 'number') {
        throw new Error('Invalid reviewFrictionScore value.');
    }

    if (!Array.isArray(analysis.painSignals)) {
        throw new Error('Invalid painSignals value.');
    }

    if (!isTargetOffer(analysis.targetOffer)) {
        throw new Error('Invalid targetOffer value.');
    }

    if (typeof analysis.offerHypothesis !== 'string') {
        throw new Error('Invalid offerHypothesis value.');
    }

    if (typeof analysis.qualificationReason !== 'string') {
        throw new Error('Invalid qualificationReason value.');
    }

    return value;
};

const logFallback = (details: { debugId: string; status: number; fallbackReason: string; model: string; hasOpenAIKey: boolean; elapsedMs?: number }) => {
    console.error('[stayboost-agent] analyze-lead fallback', details);
};

const fallbackMessage = (fallbackReason: FallbackReason) => {
    if (fallbackReason === 'openai_timeout') return 'OpenAI analýza vypršela. Zkuste menší model gpt-5.4-mini nebo kratší vstup.';
    if (fallbackReason === 'netlify_function_timeout_risk') return 'OpenAI analýza pravděpodobně narazila na limit Netlify Function. Zkuste menší model gpt-5.4-mini nebo kratší vstup.';
    if (fallbackReason === 'openai_refusal') return 'OpenAI structured output vratil refusal misto analyzy.';
    if (fallbackReason === 'openai_incomplete') return 'OpenAI structured output se nedokoncil v limitu odpovedi.';
    if (fallbackReason === 'openai_json_schema_error') return 'OpenAI structured output schema nebylo prijato nebo validovano.';
    return `OpenAI analyza nebezela: ${fallbackReason}`;
};

const fallbackResponse = ({ candidate, debugId, elapsedMs, fallbackReason, hasOpenAIKey, httpStatus, message, model, rawOutputKind, sanitizedOutputSample, sanitizedSample, statusCode = 200 }: {
    candidate: CandidateInput;
    debugId: string;
    elapsedMs?: number;
    fallbackReason: FallbackReason;
    hasOpenAIKey: boolean;
    httpStatus?: number;
    message: string;
    model: string;
    rawOutputKind?: RawOutputKind;
    sanitizedOutputSample?: string;
    sanitizedSample?: string;
    statusCode?: number;
}) => {
    logFallback({ debugId, status: httpStatus || statusCode, fallbackReason, model, hasOpenAIKey, elapsedMs });

    return json(statusCode, {
        status: fallbackReason === 'missing_openai_api_key' ? 'needs-config' : 'completed',
        message,
        isMock: true,
        provider: 'fallback',
        fallbackReason,
        diagnostic: {
            mode: 'demo-fallback',
            analyzeProvider: 'demo-fallback',
            fallbackReason,
            httpStatus: httpStatus || statusCode,
            debugId,
            userMessage: fallbackMessage(fallbackReason),
            runtime: 'netlify-function',
            hasOpenAIKey,
            model,
            elapsedMs,
            rawOutputKind,
            sanitizedOutputSample: sanitizedOutputSample || sanitizedSample,
            sanitizedSample: sanitizedSample || sanitizedOutputSample,
        },
        analysis: {
            ...fallbackAnalysis(candidate || {}),
            runId: candidate?.runId || 'legacy-run',
            analyzedAt: new Date().toISOString(),
            provider: 'demo-fallback',
            model,
            isMock: true,
        },
    });
};

export const handler = async (event: { httpMethod: string; body?: string | null }) => {
    const debugId = makeDebugId();

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { message: 'Use POST.' });

    const openAiKey = process.env.OPENAI_API_KEY;
    const hasOpenAIKey = Boolean(openAiKey);
    const model = process.env.OPENAI_MODEL || 'gpt-5.4-mini';

    try {
        const body = JSON.parse(event.body || '{}') as { candidate?: unknown; sourceSnippets?: string[]; sourceUrls?: string[]; userNotes?: string };
        const candidate = body.candidate as CandidateInput;

        if (!openAiKey) {
            return fallbackResponse({
                candidate,
                debugId,
                fallbackReason: 'missing_openai_api_key',
                hasOpenAIKey,
                httpStatus: 501,
                message: 'OpenAI analyza nebezela: missing_openai_api_key. Nastav OPENAI_API_KEY ve Functions environment scope.',
                model,
                statusCode: 501,
            });
        }

        const compactInput = compactCandidate(candidate, body.sourceSnippets || []);
        const prompt = `Vrat pouze JSON bez markdownu a bez uvah. Vytvor kratkou obchodni analyzu leadu pro StayBoost z verejnych podkladu. Pokud je prilozeno websiteExtraction, preferuj ji pred search snippety: je to kvalitnejsi evidence z verejneho vlastniho webu provozu.
    Pravidla: nesmis tvrdit, ze vidis interni instrukce; nesmis tvrdit, ze jsi scrapoval Booking/Airbnb/Google; pokud jsou zdroje jen snippety, uved evidenceLimits. Internalni pole jako evidenceLimits, missingEvidence, contradictionWarnings, scoring a quickWins.sourceEvidence mohou obsahovat limity evidence. Klientska pole miniAudit, outreachEmail, followUp a offerRecommendation musi byt napsana pro majitele ubytovani: bez slov OpenAI, Tavily, fallback, evidenceLimits, sourceEvidence, setup automation, public snippet, search snippet, aplikace odkazy necetla, interni analyza, Vychodisko, FIX, SETUP.
    V internich polich evidenceLimits/missingEvidence jasne rozlis: "Vychazime z verejneho vlastniho webu a search snippetu." pokud websiteExtraction existuje, jinak "Vychazime jen ze search snippetu." Klientske oslovení tohle nevysvetluje.
    Guest guide neni casto verejny: pokud neni videt, nesmis psat "nemaji guest guide" ani to davat do painSignals. Pouzij missingEvidence: "Z verejneho webu nelze overit, zda hoste dostavaji neverejny guest guide po rezervaci." nebo "Guest guide muze existovat neverejne." Jako obchodni prilezitost to formuluj jen opatrne: "Z verejne prezentace neni jasne, zda host dostava jednoduchy predprijezdovy guide." Quick win nesmi byt jiste "Zavest guest guide"; pouzij prirozenou podminenou cestinu: "Pokud hoste nedostavaji pred prijezdem jednoduchy prehled, pripravil bych kratky QR/pruvodce; pokud ho uz maji, zkontroloval bych, jestli je dobre napojeny na zpravy hostum." V outreachEmail guest guide nezminuj, pokud hlavni evidence mluvi hlavne o fotkach, galerii, popisu nebo recenzich.
    Pokud websiteExtraction ukazuje jasnou FAQ/prijezd/parkovani/check-in sekci, neprodavej obecne "zlepsit instrukce", pokud neni konkretni mezera. Pokud vlastni web nema zadne prakticke prijezdove informace, muze to byt setup opportunity. Pokud je web moderni a dobre strukturovany, kandidat muze byt benchmark/weak.
    Presne 3 quickWins. miniAudit je klientsky mini-audit max 5-7 kratkych bodu nebo kratkych odstavcu, bez technickych disclaimeru. outreachEmail je skutecny studeny prvni kontakt 120-160 slov: neodpovida na poptavku, zacina prirozene, obsahuje jednu pozitivni konkretni observaci, jeden konkretni navrh, vetu "Nejde o kritiku" nebo podobnou, a konci lehkou otazkou typu "Ma smysl vam to poslat?" followUp ma 60-90 slov a neni natlakovy. offerRecommendation je klientsky citelny dalsi krok. Limity: miniAudit max 1200 znaku, outreachEmail max 900, followUp max 500, offerRecommendation max 700.
    Nejdriv klasifikuj opportunityType: fix-existing-process, setup-automation, ota-profile-audit, benchmark, nebo skip.
    FIX: pouzij jen kdyz existuje painSignals / reviewFrictionScore: spatny check-in, nejasny prijezd, parkovani, komunikace, recenzni problem. Outreach muze pojmenovat konkretni pain signal.
    SETUP: muze byt strong/moderate i bez painu, pokud jde o maly penzion/apartman s vlastnim webem nebo kontaktem a z verejne prezentace neni jasne, zda host dostava jednoduchy predprijezdovy guide / QR instrukce / FAQ / automatizovany predprijezdovy workflow. Setup outreach nesmi tvrdit, ze maji problem nebo ze neco delaji spatne. Pouzij formulaci: "Z verejne prezentace neni jasne, zda hoste dostavaji jednoduchy predprijezdovy guide; ten muze existovat neverejne po rezervaci. U podobnych penzionu casto pomaha overit, jestli je dobre napojeny na zpravy hostum."
    BENCHMARK/SKIP: pokud je vse zjevne vyresene nebo chybi kontakt/web/evidence, outreachEmail je interni poznamka, ne obchodni email. Self-check-in bez painu neni fix lead; muze byt benchmark nebo slaby setup jen pri jasne setup mezere.
    JSON shape: {"firstImpression":string,"strengths":string[],"risks":string[],"guestFrictionSignals":string[],"quickWins":[{"title":string,"why":string,"action":string,"sourceEvidence":string}],"miniAudit":string,"outreachEmail":string,"followUp":string,"offerRecommendation":string,"confidence":"low"|"medium"|"high","fitVerdict":"strong-opportunity"|"moderate-opportunity"|"weak-opportunity"|"not-enough-evidence"|"skip","opportunityScore":number,"opportunityType":"fix-existing-process"|"setup-automation"|"ota-profile-audit"|"benchmark"|"skip","automationNeedScore":number,"publicMaturityScore":number,"reviewFrictionScore":number,"painSignals":string[],"positiveSolvedSignals":string[],"noPainReason":string,"targetOffer":"guest-communication-fix"|"guest-guide"|"ota-profile-audit"|"review-response-improvement"|"self-checkin-setup"|"skip","offerHypothesis":string,"websiteSignals":string[],"contactSignals":string[],"missingAutomationSignals":string[],"likelyManualProcessSignals":string[],"qualificationReason":string,"alreadySolvedSignals":string[],"missingEvidence":string[],"contradictionWarnings":string[],"evidenceLimits":string[]}.
Lead: ${JSON.stringify(compactInput)}
Poznamky: ${trimText(body.userNotes || '', 400)}`;

        const startedAt = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
        const baseRequestBody: { model: string; input: string; max_output_tokens: number; reasoning?: { effort: 'low' } } = {
            model,
            input: prompt,
            max_output_tokens: 1800,
        };

        if (model.startsWith('gpt-5')) {
            baseRequestBody.reasoning = { effort: 'low' };
        }

        const structuredRequestBody = {
            ...baseRequestBody,
            text: {
                format: {
                    type: 'json_schema',
                    name: 'stayboost_lead_analysis',
                    strict: true,
                    schema: analysisJsonSchema,
                },
            },
        };

        const requestBodies = [structuredRequestBody, baseRequestBody];

        let response: Response | undefined;
        let usedStructuredOutput = true;
        let schemaErrorSample = '';

        try {
            for (let attemptIndex = 0; attemptIndex < requestBodies.length; attemptIndex += 1) {
                response = await fetch('https://api.openai.com/v1/responses', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${openAiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBodies[attemptIndex]),
                    signal: controller.signal as AbortSignal,
                });

                usedStructuredOutput = attemptIndex === 0;

                if (response.status !== 400 || attemptIndex === requestBodies.length - 1) {
                    break;
                }

                const errorText = await response.text();
                schemaErrorSample = safeSample(errorText);
            }
        } catch (error) {
            const elapsedMs = Date.now() - startedAt;
            clearTimeout(timeoutId);
            const fallbackReason = error instanceof Error && error.name === 'AbortError' ? 'openai_timeout' : 'openai_network_error';

            return fallbackResponse({
                candidate,
                debugId,
                elapsedMs,
                fallbackReason,
                hasOpenAIKey,
                httpStatus: fallbackReason === 'openai_timeout' ? 408 : 502,
                message: fallbackMessage(fallbackReason),
                model,
            });
        } finally {
            clearTimeout(timeoutId);
        }

        const elapsedMs = Date.now() - startedAt;

        if (!response) {
            return fallbackResponse({
                candidate,
                debugId,
                elapsedMs,
                fallbackReason: 'openai_network_error',
                hasOpenAIKey,
                httpStatus: 502,
                message: fallbackMessage('openai_network_error'),
                model,
            });
        }

        if (!response.ok) {
            const errorText = await response.text();
            const fallbackReason = response.status === 400 && usedStructuredOutput ? 'openai_json_schema_error' : fallbackReasonForStatus(response.status);

            return fallbackResponse({
                candidate,
                debugId,
                elapsedMs,
                fallbackReason,
                hasOpenAIKey,
                httpStatus: response.status,
                message: fallbackMessage(fallbackReason),
                model,
                rawOutputKind: 'unknown',
                sanitizedOutputSample: safeSample(errorText || schemaErrorSample),
            });
        }

        const payload = await response.json();
        const output = extractTextContent(payload);

        if (output.refusal) {
            return fallbackResponse({
                candidate,
                debugId,
                elapsedMs,
                fallbackReason: 'openai_refusal',
                hasOpenAIKey,
                httpStatus: 200,
                message: fallbackMessage('openai_refusal'),
                model,
                rawOutputKind: output.rawOutputKind,
                sanitizedOutputSample: safeSample(output.refusal),
            });
        }

        if (output.incomplete) {
            return fallbackResponse({
                candidate,
                debugId,
                elapsedMs,
                fallbackReason: 'openai_incomplete',
                hasOpenAIKey,
                httpStatus: 200,
                message: fallbackMessage('openai_incomplete'),
                model,
                rawOutputKind: output.rawOutputKind,
                sanitizedOutputSample: safeSample(output.text || JSON.stringify(payload).slice(0, 500)),
            });
        }

        try {
            const parsed = validateAnalysis(output.parsedObject || (typeof output.text === 'string' ? parseJsonObject(output.text) : output.text));

            return json(200, {
                status: 'completed',
                message: 'OpenAI analyza dokoncena z dodanych verejnych snippetu a odkazu.',
                isMock: false,
                provider: 'openai',
                fallbackReason: null,
                diagnostic: {
                    mode: 'real-api',
                    analyzeProvider: 'openai',
                    debugId,
                    userMessage: 'OpenAI analyza probehla pres realne API.',
                    runtime: 'netlify-function',
                    hasOpenAIKey,
                    model,
                    elapsedMs,
                    rawOutputKind: output.rawOutputKind,
                },
                analysis: {
                    ...(parsed as Record<string, unknown>),
                    runId: candidate.runId || 'legacy-run',
                    analyzedAt: new Date().toISOString(),
                    provider: 'openai',
                    model,
                    isMock: false,
                },
            });
        } catch {
            return fallbackResponse({
                candidate,
                debugId,
                elapsedMs,
                fallbackReason: 'openai_json_parse_error',
                hasOpenAIKey,
                httpStatus: 200,
                message: fallbackMessage('openai_json_parse_error'),
                model,
                rawOutputKind: output.rawOutputKind,
                sanitizedOutputSample: safeSample(output.text || JSON.stringify(output.parsedObject || payload)),
            });
        }
    } catch {
        return fallbackResponse({
            candidate: {},
            debugId,
            fallbackReason: 'function_runtime_error',
            hasOpenAIKey,
            httpStatus: 500,
            message: 'OpenAI analyza nebezela: function_runtime_error',
            model,
            statusCode: 500,
        });
    }
};
