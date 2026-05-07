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

const OPENAI_TIMEOUT_MS = 22000;
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
        'leadDisplayName',
        'internalSummary',
        'clientMiniAudit',
        'quickWins',
        'outreachEmail',
        'followUp',
        'offerRecommendation',
        'confidence',
        'fitVerdict',
        'qualificationReason',
        'evidenceLimits',
    ],
    properties: {
        leadDisplayName: { type: 'string' },
        internalSummary: { type: 'string' },
        clientMiniAudit: { type: 'string' },
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
        outreachEmail: { type: 'string' },
        followUp: { type: 'string' },
        offerRecommendation: { type: 'string' },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        fitVerdict: { type: 'string', enum: ['strong-opportunity', 'moderate-opportunity', 'weak-opportunity', 'not-enough-evidence', 'skip'] },
        qualificationReason: { type: 'string' },
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

const normalizeForMatch = (value = '') => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const cleanLeadDisplayName = (name = '') => {
    const withoutPrefix = name.replace(/^(kontakt|contact|rooms|pokoje)\s*[-:|]\s*/i, '').split('|')[0].trim();
    const normalized = normalizeForMatch(withoutPrefix || name);

    if (normalized.includes('pension city center')) {
        return normalized.includes('prague') || normalizeForMatch(name).includes('prague') ? 'Pension City Center Prague' : 'Pension City Center';
    }

    return (withoutPrefix || name).replace(/\s+/g, ' ').trim() || 'vybrane ubytovani';
};

const humanizeSignal = (signal = '') => {
    const normalized = normalizeForMatch(signal);

    if (normalized.includes('vlastni verejny web provozu')) return 'mají vlastní web';
    if (normalized.includes('rezervacni nebo poptavkovy kontakt')) return 'kontakt je snadno dohledatelný';
    if (normalized.includes('ubytovani popisuje pokoje') || normalized.includes('ubytovani popisuje apartmany')) return 'web popisuje nabídku pokojů';
    if (normalized.includes('na webu je dohledatelny e mail') || normalized.includes('e mail nalezen na vlastnim webu')) return 'e-mail je na webu dobře dostupný';
    if (normalized.includes('na webu je dohledatelny telefon') || normalized.includes('telefon nalezen na vlastnim webu')) return 'telefonický kontakt je vidět';
    if (normalized.includes('neni jasne strukturovana sekce prijezd check in') || normalized.includes('neni jasne videt kompletni predprijezdova orientace')) return 'praktické informace k příjezdu by mohly být lépe soustředěné na jednom místě';
    if (normalized.includes('neni jasne videt parkovani')) return 'informace k parkování nejsou ve veřejné prezentaci výrazně oddělené';
    if (normalized.includes('neni videt faq') || normalized.includes('casto kladene dotazy')) return 'krátká FAQ sekce by mohla hostům ušetřit dotazy';

    return trimText(signal, 180);
};

const forbiddenClientTerms = ['Vlastni verejny web provozu', 'Vlastní veřejný web provozu', 'Rezervacni nebo poptavkovy kontakt', 'setup opportunity', 'setup automation', 'sourceEvidence', 'evidenceLimits', 'fallback', 'OpenAI', 'Tavily', 'Website Extractor', 'publicSignals', 'demo-fallback', 'function_404', 'aplikace', 'parser', 'extrakce', 'skóre', 'skore', 'fitVerdict'];

const sanitizeClientText = (value = '') => {
    let cleaned = value
        .replace(/Vlastni verejny web provozu|Vlastní veřejný web provozu/g, 'mají vlastní web')
        .replace(/Rezervacni nebo poptavkovy kontakt je videt|Rezervační nebo poptávkový kontakt je vidět/g, 'kontakt je snadno dohledatelný')
        .replace(/Ubytovani popisuje pokoje nebo apartmany|Ubytování popisuje pokoje nebo apartmány/g, 'web popisuje nabídku pokojů')
        .replace(/Na webu je dohledateln[yý] e-mail\.?/g, 'e-mail je na webu dobře dostupný.')
        .replace(/Na webu je dohledateln[yý] telefon\.?/g, 'telefonický kontakt je vidět.')
        .replace(/Na p[řr]e[čc]ten[eé]m ve[řr]ejn[eé]m webu nen[ií] jasn[eě] strukturovan[aá] sekce p[řr][ií]jezd \/ check-in\.?/g, 'praktické informace k příjezdu by mohly být lépe soustředěné na jednom místě.');

    forbiddenClientTerms.forEach((term) => {
        cleaned = cleaned.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
    });

    return cleaned.replace(/\s+([,.!?;:])/g, '$1').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ').trim();
};

const bestHumanSignals = (signals: string[]) => [...new Set(signals.map(humanizeSignal).filter(Boolean))].slice(0, 3);

const fallbackClientMiniAudit = (name: string, candidate: CandidateInput) => {
    const displayName = cleanLeadDisplayName(name);
    const website = candidate.websiteExtraction;
    const positives = bestHumanSignals([...(candidate.signals || []), ...(website?.strengths || []), ...(website?.websiteSignals || []), ...(website?.contact?.emails?.length ? ['Na webu je dohledatelný e-mail.'] : []), ...(website?.contact?.phones?.length ? ['Na webu je dohledatelný telefon.'] : [])]);
    const goodList = positives.length ? positives : ['mají vlastní web', 'kontakt je snadno dohledatelný', 'web popisuje nabídku pokojů'];

    return sanitizeClientText(`Mini-audit veřejného webu: ${displayName}\n\nPrvní dojem:\nWeb působí jako funkční prezentace menšího ubytování v centru Prahy. Kontakt i nabídka pokojů jsou dohledatelné.\n\nCo funguje dobře:\n${goodList.map((item) => `- ${item}`).join('\n')}\n\nCo bych zlepšil:\n- soustředit praktické informace před příjezdem na jedno místo\n- doplnit krátkou FAQ sekci\n- u kontaktu jasně říct, kdy ho host použije\n\nDalší krok:\nPoslat 3 konkrétní návrhy, jak by mohla vypadat jednoduchá předpříjezdová sekce.`);
};

const fallbackOutreach = (name: string, candidate: CandidateInput) => {
    const displayName = cleanLeadDisplayName(name);
    const positives = bestHumanSignals([...(candidate.signals || []), ...(candidate.websiteExtraction?.strengths || [])]);
    const positiveLine = positives.length ? positives.join(' a ') : 'web má jasně viditelný kontakt a základní informace o pokojích';

    return sanitizeClientText(`Dobrý den,\n\nnarazil jsem na web ${displayName}. První dojem působí dobře - ${positiveLine}.\n\nVšiml jsem si jedné drobnosti: praktické informace pro hosty před příjezdem by podle mě šly soustředit víc na jedno místo. Například příjezd, parkování, check-in a nejčastější otázky by mohly být v krátké přehledné sekci.\n\nNejde o kritiku, spíš o rychlý pohled zvenku. Můžu vám zdarma poslat 3 konkrétní návrhy v bodech?\n\nDavid`);
};

const fallbackFollowUp = (name: string) => sanitizeClientText(`Dobrý den,\n\njen krátce navazuji na předchozí zprávu. Šlo mi o pár konkrétních návrhů k webu ${cleanLeadDisplayName(name)}, hlavně k příjezdu, parkování a častým otázkám hostů.\n\nPokud to teď není aktuální, vůbec nevadí. Kdyby se vám hodilo, pošlu 3 body zdarma.\n\nDavid`);
const fallbackOffer = (name: string) => sanitizeClientText(`Další krok pro ${cleanLeadDisplayName(name)}: připravit krátký audit veřejného webu a ukázat 3 konkrétní úpravy předpříjezdové sekce, FAQ a kontaktu pro hosty.`);

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
    const websiteExtraction = candidate.websiteExtraction;
    if (websiteExtraction && ['completed', 'partial'].includes(websiteExtraction.status)) {
        const displayName = cleanLeadDisplayName(name);
        const contactSignals = [
            ...(websiteExtraction.contact?.emails || []).map((email) => `E-mail nalezen na vlastním webu: ${email}`),
            ...(websiteExtraction.contact?.phones || []).map((phone) => `Telefon nalezen na vlastním webu: ${phone}`),
        ];
        const allWebsiteText = [
            websiteExtraction.summary,
            ...(websiteExtraction.automationSignals || []),
            ...(websiteExtraction.guestGuideSignals || []),
            ...(candidate.sourceSnippets || []),
        ].join(' ').toLowerCase();
        const targetOffer: TargetOffer = candidate.targetOffer === 'self-checkin-setup' && !allWebsiteText.includes('self check-in')
            ? 'guest-guide'
            : candidate.targetOffer === 'skip' || !candidate.targetOffer ? 'guest-guide' : candidate.targetOffer;
        const pages = (websiteExtraction.pagesExtracted || []).map((page) => page.url).join(', ') || websiteExtraction.websiteUrl;

        return {
            leadDisplayName: displayName,
            firstImpression: `${displayName} má vlastní veřejný web a dohledatelný kontakt. Obchodní hypotéza je opatrná setup analýza z veřejných stránek, ne důkaz provozního problému.`,
            strengths: [...new Set([...(websiteExtraction.strengths || []), ...contactSignals, ...(candidate.signals || [])])].slice(0, 5),
            risks: [...new Set([...(websiteExtraction.risks || []), 'Fallback analýza: OpenAI nebylo dostupné, výstup je interní návrh s nízkou jistotou.'])],
            guestFrictionSignals: (websiteExtraction.missingPublicInfoSignals || []).length > 0 ? websiteExtraction.missingPublicInfoSignals : ['Z přečtených veřejných stránek není jasně vidět kompletní předpříjezdová orientace hosta.'],
            quickWins: [
                {
                    title: 'Zpřehlednit stránku „Před příjezdem“',
                    why: 'Z přečtených veřejných stránek není jasně vidět jeden kompaktní blok pro příjezd, check-in, parkování a první kontakt.',
                    action: 'Přidat krátkou stránku nebo sekci s tím, kdy host dostane instrukce, kde zaparkuje a koho kontaktuje v den příjezdu.',
                    sourceEvidence: websiteExtraction.summary,
                },
                {
                    title: 'Dodat krátkou FAQ sekci pro hosty',
                    why: 'Z přečtených veřejných stránek není jasně vidět přehled nejčastějších předpříjezdových otázek.',
                    action: 'Sepsat 5 až 7 odpovědí: příjezd, parkování, check-in, pozdní příjezd, kontakt, platba a vybavení pokoje.',
                    sourceEvidence: pages,
                },
                {
                    title: 'Zviditelnit praktické informace u kontaktu',
                    why: (websiteExtraction.contact?.emails || []).length > 0 ? 'E-mail je na vlastním webu nalezený; hostovi může pomoct vědět, kdy ho použít.' : 'Z přečtených veřejných stránek není jasně vidět praktický kontakt pro den příjezdu.',
                    action: 'Vedle kontaktu doplnit krátkou větu pro situace jako příjezd, parkování, změna času příjezdu nebo dotaz k rezervaci.',
                    sourceEvidence: websiteExtraction.contact?.contactPageUrl || websiteExtraction.websiteUrl,
                },
            ],
            miniAudit: fallbackClientMiniAudit(name, candidate),
            outreachEmail: fallbackOutreach(name, candidate),
            followUp: fallbackFollowUp(name),
            offerRecommendation: fallbackOffer(name),
            confidence: 'low' as const,
            fitVerdict: candidate.fitVerdict === 'strong-opportunity' ? 'moderate-opportunity' : candidate.fitVerdict || 'moderate-opportunity',
            opportunityScore: Math.min(candidate.opportunityScore || 58, 64),
            opportunityType: 'setup-automation' as const,
            automationNeedScore: Math.max(candidate.automationNeedScore || 0, 58),
            publicMaturityScore: candidate.publicMaturityScore || 0,
            reviewFrictionScore: 0,
            painSignals: [],
            positiveSolvedSignals: [...(websiteExtraction.strengths || []), ...(websiteExtraction.arrivalSignals || []), ...(websiteExtraction.parkingSignals || []), ...(websiteExtraction.faqSignals || [])],
            noPainReason: 'Website extraction nenašla jednoznačný veřejný pain signal; jde o opatrný setup lead.',
            targetOffer,
            offerHypothesis: 'Setup příležitost: z veřejného webu lze navrhnout zpřehlednění předpříjezdových informací a FAQ, bez tvrzení, že proces neexistuje interně.',
            websiteSignals: [...new Set([...(candidate.websiteSignals || []), ...(websiteExtraction.websiteSignals || []), ...(websiteExtraction.arrivalSignals || []), ...(websiteExtraction.faqSignals || [])])],
            contactSignals,
            missingAutomationSignals: websiteExtraction.missingPublicInfoSignals || [],
            likelyManualProcessSignals: websiteExtraction.likelyManualProcessSignals || [],
            qualificationReason: 'Fallback analýza z Website Extractoru: vlastní web a kontakt existují, ale konkrétní obchodní výstup má nízkou jistotu bez OpenAI nebo ručního ověření.',
            alreadySolvedSignals: [...(websiteExtraction.arrivalSignals || []), ...(websiteExtraction.parkingSignals || []), ...(websiteExtraction.faqSignals || []), ...(websiteExtraction.guestGuideSignals || [])],
            missingEvidence: websiteExtraction.evidenceLimits || [],
            contradictionWarnings: [],
            evidenceLimits: ['Fallback analýza bez OpenAI; výstup je interní návrh s nízkou jistotou.', 'Website Extractor četl pouze vlastní veřejný web provozu.', 'Guest guide může existovat neveřejně po rezervaci.', 'E-maily se automaticky neposílají.'],
        };
    }
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

const deterministicTargetOffer = (candidate: CandidateInput): TargetOffer => {
    const sourceText = [candidate.websiteExtraction?.summary, ...(candidate.websiteExtraction?.automationSignals || []), ...(candidate.websiteExtraction?.guestGuideSignals || []), ...(candidate.sourceSnippets || [])].join(' ').toLowerCase();

    if (candidate.targetOffer === 'self-checkin-setup' && !sourceText.includes('self check-in')) return 'guest-guide';
    if (candidate.targetOffer && isTargetOffer(candidate.targetOffer) && candidate.targetOffer !== 'skip') return candidate.targetOffer;
    return candidate.opportunityType === 'ota-profile-audit' ? 'ota-profile-audit' : 'guest-guide';
};

const expandCompactAnalysis = (value: unknown, candidate: CandidateInput) => {
    const analysis = value as { leadDisplayName?: unknown; internalSummary?: unknown; clientMiniAudit?: unknown; quickWins?: unknown[]; outreachEmail?: unknown; followUp?: unknown; offerRecommendation?: unknown; confidence?: unknown; fitVerdict?: unknown; qualificationReason?: unknown; evidenceLimits?: unknown };

    if (!analysis || typeof analysis.leadDisplayName !== 'string' || typeof analysis.internalSummary !== 'string' || typeof analysis.clientMiniAudit !== 'string' || !Array.isArray(analysis.quickWins) || analysis.quickWins.length !== 3 || typeof analysis.outreachEmail !== 'string' || typeof analysis.followUp !== 'string' || typeof analysis.offerRecommendation !== 'string') {
        throw new Error('Invalid compact analysis JSON shape.');
    }

    if (!['low', 'medium', 'high'].includes(String(analysis.confidence))) {
        throw new Error('Invalid confidence value.');
    }

    if (!isFitVerdict(analysis.fitVerdict)) {
        throw new Error('Invalid fitVerdict value.');
    }

    if (typeof analysis.qualificationReason !== 'string') {
        throw new Error('Invalid qualificationReason value.');
    }

    if (!Array.isArray(analysis.evidenceLimits)) {
        throw new Error('Invalid evidenceLimits value.');
    }

    const website = candidate.websiteExtraction;
    const hasWebsiteContact = Boolean((website?.contact?.emails?.length || 0) + (website?.contact?.phones?.length || 0));
    const opportunityType: OpportunityType = candidate.opportunityType && isOpportunityType(candidate.opportunityType) ? candidate.opportunityType : website ? 'setup-automation' : 'skip';
    const quickWins = analysis.quickWins.map((quickWin) => quickWin as { title?: string; why?: string; action?: string; sourceEvidence?: string });

    return {
        leadDisplayName: cleanLeadDisplayName(analysis.leadDisplayName),
        firstImpression: trimText(String(analysis.internalSummary), 700),
        strengths: [...new Set([...(website?.strengths || []), ...(candidate.signals || []), ...(hasWebsiteContact ? ['Kontakt je nalezený na vlastním webu'] : [])])].slice(0, 5),
        risks: website?.risks || candidate.risks || [],
        guestFrictionSignals: website?.missingPublicInfoSignals?.length ? website.missingPublicInfoSignals : candidate.risks || [],
        quickWins: quickWins.map((quickWin) => ({
            title: trimText(quickWin.title, 120),
            why: trimText(quickWin.why, 180),
            action: trimText(quickWin.action, 180),
            sourceEvidence: trimText(quickWin.sourceEvidence, 180),
        })),
        miniAudit: sanitizeClientText(String(analysis.clientMiniAudit)),
        outreachEmail: sanitizeClientText(String(analysis.outreachEmail)),
        followUp: sanitizeClientText(String(analysis.followUp)),
        offerRecommendation: sanitizeClientText(String(analysis.offerRecommendation)),
        confidence: analysis.confidence,
        fitVerdict: analysis.fitVerdict,
        opportunityScore: candidate.opportunityScore || (hasWebsiteContact ? 58 : 40),
        opportunityType,
        automationNeedScore: candidate.automationNeedScore || (website ? 58 : 0),
        publicMaturityScore: candidate.publicMaturityScore || 0,
        reviewFrictionScore: candidate.reviewFrictionScore || 0,
        painSignals: candidate.painSignals || [],
        positiveSolvedSignals: [...(candidate.positiveSolvedSignals || []), ...(website?.arrivalSignals || []), ...(website?.parkingSignals || []), ...(website?.faqSignals || [])],
        noPainReason: candidate.noPainReason || 'No clear public review pain found; this is a setup analysis from website evidence.',
        targetOffer: deterministicTargetOffer(candidate),
        offerHypothesis: trimText(String(analysis.qualificationReason), 500),
        websiteSignals: [...new Set([...(candidate.websiteSignals || []), ...(website?.websiteSignals || []), ...(website?.arrivalSignals || []), ...(website?.faqSignals || [])])],
        contactSignals: [...(candidate.contactSignals || []), ...(website?.contact?.emails || []).map((email) => `E-mail nalezen na vlastním webu: ${email}`), ...(website?.contact?.phones || []).map((phone) => `Telefon nalezen na vlastním webu: ${phone}`)],
        missingAutomationSignals: website?.missingPublicInfoSignals || candidate.missingAutomationSignals || [],
        likelyManualProcessSignals: website?.likelyManualProcessSignals || candidate.likelyManualProcessSignals || [],
        qualificationReason: trimText(String(analysis.qualificationReason), 700),
        alreadySolvedSignals: candidate.alreadySolvedSignals || [],
        missingEvidence: candidate.missingEvidence || [],
        contradictionWarnings: candidate.contradictionWarnings || [],
        evidenceLimits: (analysis.evidenceLimits as string[]).map((item) => trimText(item, 180)),
    };
};

const logFallback = (details: { debugId: string; status: number; fallbackReason: string; model: string; hasOpenAIKey: boolean; elapsedMs?: number }) => {
    console.error('[stayboost-agent] analyze-lead fallback', details);
};

const fallbackMessage = (fallbackReason: FallbackReason) => {
    if (fallbackReason === 'openai_timeout') return 'OpenAI analýza vypršela. Zkuste menší model gpt-5.4-mini nebo kratší vstup.';
    if (fallbackReason === 'netlify_function_timeout_risk') return 'OpenAI analýza pravděpodobně narazila na limit Netlify Function. Zkuste menší model gpt-5.4-mini nebo kratší vstup.';
    if (fallbackReason === 'openai_refusal') return 'OpenAI structured output vratil refusal misto analyzy.';
    if (fallbackReason === 'openai_incomplete') return 'OpenAI odpověď byla nedokončená, použit fallback.';
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
        const prompt = `Vrat pouze validni JSON podle schematu. Zadny markdown, zadne uvahy.
    Ukol: kratka obchodni analyza StayBoost z verejneho vlastniho webu. Metadata a scoring dopocita aplikace, proto nevracej zadna dalsi pole.
    Klientske texty musi byt lidske pro majitele ubytovani. Nepouzivej slova: OpenAI, Tavily, Website Extractor, fallback, evidenceLimits, sourceEvidence, setup automation, setup opportunity, publicSignals, aplikace, parser, extrakce, skore, fitVerdict.
    Pokud web nasel e-mail/telefon, netvrd, ze kontakt chybi. Pokud neni videt guest guide, pis opatrne: muze existovat neverejne po rezervaci.
    Limits: internalSummary max 700 znaku, clientMiniAudit max 700 znaku, outreachEmail 120-150 slov, followUp max 70 slov, offerRecommendation max 400 znaku. quickWins presne 3; kazde why/action max 180 znaku.
    leadDisplayName ocisti od titulku stranky, prefixu Kontakt/Contact/Rooms/Pokoje a suffixu po |.
    JSON fields: leadDisplayName, internalSummary, clientMiniAudit, quickWins[{title,why,action,sourceEvidence}], outreachEmail, followUp, offerRecommendation, confidence, fitVerdict, qualificationReason, evidenceLimits.
Lead: ${JSON.stringify(compactInput)}
Poznamky: ${trimText(body.userNotes || '', 400)}`;

        const startedAt = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
        const baseRequestBody: { model: string; input: string; max_output_tokens: number; reasoning?: { effort: 'low' } } = {
            model,
            input: prompt,
            max_output_tokens: 2200,
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
            const parsed = expandCompactAnalysis(output.parsedObject || (typeof output.text === 'string' ? parseJsonObject(output.text) : output.text), candidate);

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
