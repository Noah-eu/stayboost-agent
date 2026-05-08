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
        suppressedMissingSignals?: string[];
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
                required: ['title', 'why', 'action', 'sourceEvidence', 'candidateSpecificity', 'uniqueBusinessAngle', 'usedSignals'],
                properties: {
                    title: { type: 'string' },
                    why: { type: 'string' },
                    action: { type: 'string' },
                    sourceEvidence: { type: 'string' },
                    candidateSpecificity: { type: 'string', enum: ['specific', 'generic'] },
                    uniqueBusinessAngle: { type: 'string' },
                    usedSignals: { type: 'array', items: { type: 'string' } },
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
    if (normalized.includes('rezervacni nebo poptavkovy kontakt')) return 'kontakt je na webu snadno dohledatelný';
    if (normalized.includes('ubytovani popisuje pokoje') || normalized.includes('ubytovani popisuje apartmany')) return 'web přehledně popisuje pokoje';
    if (normalized.includes('na webu je dohledatelny e mail') || normalized.includes('e mail nalezen na vlastnim webu')) return 'e-mail je na webu viditelný';
    if (normalized.includes('na webu je dohledatelny telefon') || normalized.includes('telefon nalezen na vlastnim webu')) return 'telefon je na webu viditelný';
    if (normalized.includes('neni jasne strukturovana sekce prijezd check in') || normalized.includes('neni jasne videt kompletni predprijezdova orientace')) return 'praktické informace k příjezdu by mohly být lépe soustředěné na jednom místě';
    if (normalized.includes('neni jasne videt parkovani')) return 'informace k parkování nejsou ve veřejné prezentaci výrazně oddělené';
    if (normalized.includes('neni videt faq') || normalized.includes('casto kladene dotazy')) return 'krátká FAQ sekce často pomáhá hostům zorientovat se před příjezdem';

    return trimText(signal, 180);
};

const forbiddenClientTerms = ['Vlastni verejny web provozu', 'Vlastní veřejný web provozu', 'Rezervacni nebo poptavkovy kontakt', 'setup opportunity', 'setup automation', 'sourceEvidence', 'evidenceLimits', 'fallback', 'OpenAI', 'Tavily', 'Website Extractor', 'publicSignals', 'demo-fallback', 'function_404', 'aplikace', 'parser', 'extrakce', 'skóre', 'skore', 'fitVerdict', 'kontrola', 'hodnocení', 'hodnoceni', 'chyba', 'problém', 'problem', 'měli byste', 'meli byste', 'doporučuji vám', 'doporucuji vam'];
const forbiddenTermsFoundInClientOutputs = (outputs: string[]) => forbiddenClientTerms.filter((term) => outputs.join('\n').toLowerCase().includes(term.toLowerCase()));
const sentenceBoundaryPattern = /(?<=[.!?])\s+|\n+/g;

const sanitizeClientText = (value = '') => {
    let cleaned = value
        .replace(/Zaujalo mě hlavně: Vlastni verejny web provozu\./g, 'Zaujalo mě, že máte vlastní web s jasně dohledatelným kontaktem.')
        .replace(/Zaujalo mě hlavně: Vlastní veřejný web provozu\./g, 'Zaujalo mě, že máte vlastní web s jasně dohledatelným kontaktem.')
        .replace(/Vlastni verejny web provozu|Vlastní veřejný web provozu/g, 'mají vlastní web')
        .replace(/Rezervacni nebo poptavkovy kontakt je videt|Rezervační nebo poptávkový kontakt je vidět/g, 'kontakt je na webu snadno dohledatelný')
        .replace(/Ubytovani popisuje pokoje nebo apartmany|Ubytování popisuje pokoje nebo apartmány/g, 'web přehledně popisuje pokoje')
        .replace(/Na webu je dohledateln[yý] e-mail\.?/g, 'e-mail je na webu viditelný.')
        .replace(/Na webu je dohledateln[yý] telefon\.?/g, 'telefon je na webu viditelný.')
        .replace(/Na p[řr]e[čc]ten[eé]m ve[řr]ejn[eé]m webu nen[ií] jasn[eě] strukturovan[aá] sekce p[řr][ií]jezd \/ check-in\.?/g, 'praktické informace k příjezdu by mohly být lépe soustředěné na jednom místě.')
        .replace(/To m[ůu][žz]e zbyte[čc]n[eě] p[řr]id[aá]vat dotazy na recepci\.?/gi, 'Taková sekce u podobných ubytování často pomáhá snížit počet opakovaných dotazů před příjezdem.')
        .replace(/bez jasn[eé]ho n[aá]vodu volaj[ií] zbyte[čc]n[eě] na recepci/gi, 'jasný návod může snížit nejistotu hosta a omezit opakované dotazy před příjezdem')
        .replace(/volaj[ií] zbyte[čc]n[eě]/gi, 'mohou posílat opakované dotazy')
        .replace(/zbyte[čc]n[eě] p[řr]id[aá]v[aá] dotazy/gi, 'může vést k opakovaným dotazům')
        .replace(/zp[ůu]sobuje probl[eé]m/gi, 'může vytvářet nejistotu')
        .replace(/host[eé] jsou zmaten[ií]/gi, 'host nemusí hned najít potřebné informace')
        .replace(/Parkov[aá]n[ií] b[yý]v[aá] [čc]ast[yý] dotaz a jeho nejasnost zvy[šs]uje stres hosta je[šs]t[eě] p[řr]ed p[řr][ií]jezdem\.?/gi, 'Jasně popsané parkování pomáhá hostovi rychleji najít praktické informace před příjezdem.')
        .replace(/Kr[aá]tk[eé] odpov[eě]di na nej[čc]ast[eě]j[šs][ií] dotazy sn[ií][žz][ií] po[čc]et opakovan[yý]ch zpr[aá]v a telefon[aá]t[ůu]\.?/gi, 'Krátké odpovědi mohou omezit opakované dotazy a pomoci hostovi rychleji se zorientovat před příjezdem.')
        .replace(/Pro hotel tohoto typu jde o mal[yý] z[aá]sah s rychl[yý]m efektem na m[eé]n[eě] dotaz[ůu] a hlad[šs][ií] p[řr][ií]jezd host[ůu]\.?/gi, 'Pro hotel tohoto typu jde o malý zásah, který může omezit opakované dotazy a zpřehlednit příjezd hostů.')
        .replace(/V[šs]iml jsem si jedn[eé] drobnosti/gi, 'Napadlo mě')
        .replace(/praktick[eé] informace nejsou jasn[eě]/gi, 'praktické informace by možná šly ještě lépe')
        .replace(/m[eě]li byste/gi, 'možná by se hodilo')
        .replace(/doporu[čc]uji v[aá]m/gi, 'možná by se hodilo')
        .replace(/kontrola/gi, 'pohled')
        .replace(/hodnocen[ií]/gi, 'pohled')
        .replace(/chyba/gi, 'detail')
        .replace(/probl[eé]m/gi, 'téma');

    forbiddenClientTerms.forEach((term) => {
        cleaned = cleaned.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
    });

    if (forbiddenTermsFoundInClientOutputs([cleaned]).length > 0) {
        cleaned = cleaned.split(sentenceBoundaryPattern).filter((sentence) => forbiddenTermsFoundInClientOutputs([sentence]).length === 0).join(' ');
    }

    return cleaned.replace(/\s+([,.!?;:])/g, '$1').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ').trim();
};

const sanitizeQuickWinWhy = (title = '', why = '') => {
    if (normalizeForMatch(title).includes('prijezd na jednu stranku')) {
        return 'Jasně soustředěné informace k příjezdu mohou snížit nejistotu hosta a omezit opakované dotazy před příjezdem.';
    }

    return sanitizeClientText(why);
};

type SpecificSignalKey = 'parking' | 'ev' | 'contact' | 'restaurant' | 'terrace' | 'relax' | 'river' | 'island' | 'wedding' | 'conference' | 'romantic' | 'castle' | 'barbora' | 'jesuitCollege' | 'kutnaHora' | 'vrchlice' | 'gardenGrill' | 'families' | 'quietPrivacy' | 'fourApartments' | 'historicHouse' | 'zizkov' | 'pragueCentre' | 'sklepRestaurant' | 'roomTypes' | 'kitchen' | 'tram' | 'cityArrival';
const specificSignalMatchers: Array<{ key: SpecificSignalKey; label: string; keywords: string[] }> = [
    { key: 'barbora', label: 'Chrám sv. Barbory', keywords: ['chram sv barbory', 'chrám sv barbory', 'sv barbory', 'saint barbara'] },
    { key: 'jesuitCollege', label: 'Jezuitská kolej', keywords: ['jezuitska kolej', 'jesuit college'] },
    { key: 'kutnaHora', label: 'Kutná Hora / 5 minut od památek', keywords: ['kutna hora', 'kutne hory', '5 minut chuze', 'pamatky kutne hory', 'unesco'] },
    { key: 'vrchlice', label: 'říčka Vrchlice', keywords: ['vrchlice', 'ricka vrchlice'] },
    { key: 'gardenGrill', label: 'zahrádka s grilem', keywords: ['zahradka s grilem', 'zahrada s grilem', 'zahradka', 'zahrada', 'gril', 'grill'] },
    { key: 'families', label: 'rodiny s dětmi', keywords: ['rodiny s detmi', 'rodina s detmi', 'deti', 'children', 'families'] },
    { key: 'quietPrivacy', label: 'klid a soukromí', keywords: ['klid a soukromi', 'soukromi', 'klid', 'privacy', 'quiet'] },
    { key: 'fourApartments', label: 'čtyři apartmány', keywords: ['ctyri apartmany', '4 apartmany', 'four apartments'] },
    { key: 'historicHouse', label: 'historický dům', keywords: ['historicky dum', 'historical house', 'historic house'] },
    { key: 'zizkov', label: 'Žižkov / Praha 3', keywords: ['zizkov', 'praha 3', 'prague 3', 'seifertova'] },
    { key: 'pragueCentre', label: 'centrum Prahy', keywords: ['centrum prahy', 'centre of prague', 'city centre', 'center of prague', 'v centru prahy'] },
    { key: 'sklepRestaurant', label: 'Restaurace Sklep', keywords: ['restaurace sklep', 'restaurant sklep', 'sklep restaurant'] },
    { key: 'roomTypes', label: 'více typů apartmánů a pokojů', keywords: ['apartmany a pokoje', 'apartments and rooms', 'studio', 'family room', 'typy apartmanu', 'typy pokoju'] },
    { key: 'kitchen', label: 'kuchyň v apartmánech', keywords: ['kuchyn', 'kitchen', 'kitchenette'] },
    { key: 'tram', label: 'tramvaj / městská doprava', keywords: ['tramvaj', 'tram', 'public transport', 'mhd'] },
    { key: 'cityArrival', label: 'městský příjezd', keywords: ['city centre', 'centrum prahy', 'seifertova', 'praha 3', 'zizkov'] },
    { key: 'parking', label: 'parkoviště', keywords: ['parkoviste', 'parkovani', 'parking'] },
    { key: 'ev', label: 'nabíjecí stanice pro elektromobily', keywords: ['nabijeci stanice', 'elektromobil', 'ev charging', 'charging station'] },
    { key: 'contact', label: 'kontakt / recepce', keywords: ['recepce', 'kontakt', 'telefon', 'e-mail', 'email'] },
    { key: 'restaurant', label: 'restaurace', keywords: ['restaurace', 'restaurant'] },
    { key: 'terrace', label: 'terasa', keywords: ['terasa', 'terrace'] },
    { key: 'relax', label: 'relax centrum', keywords: ['relax centrum', 'wellness', 'spa'] },
    { key: 'river', label: 'Berounka', keywords: ['berounka'] },
    { key: 'island', label: 'soukromý ostrov', keywords: ['soukromy ostrov', 'ostrov'] },
    { key: 'wedding', label: 'svatební altán', keywords: ['svatebni altan', 'svatba', 'party stan', 'gril'] },
    { key: 'conference', label: 'konferenční prostory', keywords: ['konferencni prostory', 'konference', 'firemni akce', 'skoleni'] },
    { key: 'romantic', label: 'romantický hotel', keywords: ['romanticky hotel', 'romanticky vikend'] },
    { key: 'castle', label: 'Karlštejn', keywords: ['karlstejn', 'hrad karlstejn', 'pod hradem'] },
];

const candidateSpecificSignals = (candidate: CandidateInput) => {
    const website = candidate.websiteExtraction;
    const text = normalizeForMatch([
        website?.summary,
        ...(website?.pagesExtracted || []).flatMap((page) => [page.url, page.title, page.textPreview]),
        ...(website?.websiteSignals || []),
        ...(website?.arrivalSignals || []),
        ...(website?.parkingSignals || []),
        ...(website?.strengths || []),
        ...(candidate.signals || []),
    ].filter(Boolean).join('\n'));
    const signals = specificSignalMatchers.filter((matcher) => matcher.keywords.some((keyword) => text.includes(normalizeForMatch(keyword))));
    return [...new Map(signals.map((signal) => [signal.key, signal])).values()];
};

const hasSignal = (signals: ReturnType<typeof candidateSpecificSignals>, keys: SpecificSignalKey[]) => signals.some((signal) => keys.includes(signal.key));
const labelsFor = (signals: ReturnType<typeof candidateSpecificSignals>, keys: SpecificSignalKey[]) => signals.filter((signal) => keys.includes(signal.key)).map((signal) => signal.label);
const evidenceFor = (signals: ReturnType<typeof candidateSpecificSignals>, keys: SpecificSignalKey[], fallback: string) => labelsFor(signals, keys).join(', ') || fallback;

const specificFallbackQuickWins = (name: string, candidate: CandidateInput) => {
    const signals = candidateSpecificSignals(candidate);
    const website = candidate.websiteExtraction;
    const pages = (website?.pagesExtracted || []).map((page) => page.url).join(', ') || website?.websiteUrl || candidate.evidenceSummary || name;
    const wins: Array<{ title: string; why: string; action: string; sourceEvidence: string; candidateSpecificity: 'specific' | 'generic'; uniqueBusinessAngle: string; usedSignals: string[] }> = [];

    if (hasSignal(signals, ['barbora', 'jesuitCollege', 'kutnaHora'])) {
        const usedSignals = labelsFor(signals, ['barbora', 'jesuitCollege', 'kutnaHora']);
        wins.push({
            title: 'Postavit průvodce kolem památek Kutné Hory',
            why: `Web staví pobyt na konkrétní lokalitě: ${usedSignals.join(', ')}. To je silnější motiv než obecná informace o příjezdu.`,
            action: 'V předpříjezdové zprávě přidat krátký blok „co stihnout pěšky“: Chrám sv. Barbory, Jezuitská kolej a rychlá orientace po Kutné Hoře.',
            sourceEvidence: evidenceFor(signals, ['barbora', 'jesuitCollege', 'kutnaHora'], pages),
            candidateSpecificity: 'specific',
            uniqueBusinessAngle: 'pobyt jako klidná základna u památek Kutné Hory',
            usedSignals,
        });
    }

    if (hasSignal(signals, ['gardenGrill', 'families', 'quietPrivacy', 'vrchlice'])) {
        const usedSignals = labelsFor(signals, ['gardenGrill', 'families', 'quietPrivacy', 'vrchlice']);
        wins.push({
            title: 'Předem naladit rodiny na zahradu a klid',
            why: `Konkrétní signály jako ${usedSignals.join(', ')} pomáhají ukázat, proč je pobyt vhodný pro rodiny a klidnější návštěvu.`,
            action: 'Do průvodce přidat sekci „po příjezdu“: kde je zahrada/gril, jak ji mohou hosté používat a co je dobré vzít dětem ven.',
            sourceEvidence: evidenceFor(signals, ['gardenGrill', 'families', 'quietPrivacy', 'vrchlice'], pages),
            candidateSpecificity: 'specific',
            uniqueBusinessAngle: 'rodinný pobyt s venkovním zázemím a klidem',
            usedSignals,
        });
    }

    if (hasSignal(signals, ['zizkov', 'pragueCentre', 'tram', 'cityArrival'])) {
        const usedSignals = labelsFor(signals, ['zizkov', 'pragueCentre', 'tram', 'cityArrival']);
        wins.push({
            title: 'Udělat městskou orientaci pro příjezd do Prahy',
            why: `U městského ubytování jsou klíčové signály ${usedSignals.join(', ')}. Host potřebuje rychle pochopit čtvrť, dopravu a příjezd.`,
            action: 'Do zprávy před příjezdem přidat mini-orientaci: Žižkov/Praha 3, nejbližší tramvaj, cesta z centra a co čekat při příjezdu do ulice.',
            sourceEvidence: evidenceFor(signals, ['zizkov', 'pragueCentre', 'tram', 'cityArrival'], pages),
            candidateSpecificity: 'specific',
            uniqueBusinessAngle: 'městský příjezd a orientace v Praze',
            usedSignals,
        });
    }

    if (hasSignal(signals, ['sklepRestaurant', 'restaurant'])) {
        const usedSignals = labelsFor(signals, ['sklepRestaurant', 'restaurant']);
        wins.push({
            title: 'Propojit ubytování s Restaurací Sklep',
            why: `Restaurace je konkrétní výhoda webu: ${usedSignals.join(', ')}. Může být součástí předpobytového naladění, ne jen samostatná informace.`,
            action: 'Přidat blok „jídlo po příjezdu“: kdy se hodí Restaurace Sklep, jestli je potřeba rezervace a jak ji host najde z pokoje/apartmánu.',
            sourceEvidence: evidenceFor(signals, ['sklepRestaurant', 'restaurant'], pages),
            candidateSpecificity: 'specific',
            uniqueBusinessAngle: 'ubytování spojené s konkrétní restaurací v místě',
            usedSignals,
        });
    }

    if (hasSignal(signals, ['roomTypes', 'kitchen'])) {
        const usedSignals = labelsFor(signals, ['roomTypes', 'kitchen']);
        wins.push({
            title: 'Vysvětlit rozdíl mezi pokoji a apartmány',
            why: `Web pracuje s více typy ubytování: ${usedSignals.join(', ')}. Praktické informace by měly odpovídat tomu, co si host rezervoval.`,
            action: 'V host guide rozdělit informace pro pokoj a apartmán: kuchyň, vybavení, délka pobytu, co si host nemusí vozit a co platí jen pro apartmán.',
            sourceEvidence: evidenceFor(signals, ['roomTypes', 'kitchen'], pages),
            candidateSpecificity: 'specific',
            uniqueBusinessAngle: 'personalizace podle rezervovaného typu pokoje/apartmánu',
            usedSignals,
        });
    }

    if (hasSignal(signals, ['parking', 'ev', 'contact'])) {
        wins.push({
            title: 'Předpříjezdový přehled pro hosty',
            why: `Web už zmiňuje ${evidenceFor(signals, ['parking', 'ev', 'contact'], 'praktické kontaktní informace')}; hostovi může pomoct dostat tyto body pohromadě ještě před cestou.`,
            action: `Spojit adresu, cestu, recepci, ${hasSignal(signals, ['parking']) ? 'parkování' : 'příjezd'}, ${hasSignal(signals, ['ev']) ? 'EV nabíjení, ' : ''}kontakt a časové informace do krátkého přehledu před pobytem.`,
            sourceEvidence: evidenceFor(signals, ['parking', 'ev', 'contact'], pages),
            candidateSpecificity: 'specific',
            uniqueBusinessAngle: 'praktická orientace před příjezdem navázaná na parkování, EV nabíjení a kontakt',
            usedSignals: labelsFor(signals, ['parking', 'ev', 'contact']),
        });
    }

    if (hasSignal(signals, ['restaurant', 'terrace', 'relax', 'river', 'island', 'wedding'])) {
        wins.push({
            title: 'Využít silné stránky areálu před pobytem',
            why: `Web má silné pobytové motivy: ${evidenceFor(signals, ['restaurant', 'terrace', 'relax', 'river', 'island', 'wedding'], 'služby a okolí')}. Ty mohou hosta naladit ještě před příjezdem.`,
            action: `Do zprávy před příjezdem přidat krátké připomenutí toho, co lze využít na místě: ${labelsFor(signals, ['restaurant', 'relax', 'river', 'island', 'wedding']).join(', ') || 'služby, okolí a tipy před pobytem'}.`,
            sourceEvidence: evidenceFor(signals, ['restaurant', 'terrace', 'relax', 'river', 'island', 'wedding'], pages),
            candidateSpecificity: 'specific',
            uniqueBusinessAngle: 'předpobytové naladění hosta přes konkrétní služby a místo',
            usedSignals: labelsFor(signals, ['restaurant', 'terrace', 'relax', 'river', 'island', 'wedding']),
        });
    }

    if (hasSignal(signals, ['romantic', 'wedding', 'conference', 'castle', 'river'])) {
        wins.push({
            title: 'Rozdělit informace podle typu pobytu',
            why: `Web oslovuje více situací: ${evidenceFor(signals, ['romantic', 'wedding', 'conference', 'castle', 'river'], 'různé typy pobytu')}. Každý host může před příjezdem potřebovat trochu jiný kontext.`,
            action: 'Připravit varianty předpříjezdového přehledu pro romantický víkend, svatbu nebo akci, firemní pobyt a výlet na Karlštejn podle toho, co si host rezervoval.',
            sourceEvidence: evidenceFor(signals, ['romantic', 'wedding', 'conference', 'castle', 'river'], pages),
            candidateSpecificity: 'specific',
            uniqueBusinessAngle: 'segmentace komunikace podle motivu pobytu',
            usedSignals: labelsFor(signals, ['romantic', 'wedding', 'conference', 'castle', 'river']),
        });
    }

    return wins.slice(0, 3);
};

const fallbackClientMiniAudit = (name: string, candidate: CandidateInput) => {
    const displayName = cleanLeadDisplayName(name);
    const signals = candidateSpecificSignals(candidate).map((signal) => signal.label).slice(0, 6);
    const ideas = specificFallbackQuickWins(name, candidate);
    const ideaText = ideas.length >= 3 ? ideas.slice(0, 3).map((idea, index) => `${index + 1}. ${idea.title}: ${idea.action}`).join('\n') : '1. Předpříjezdový přehled pro hosty\n2. Využít silné stránky areálu před pobytem\n3. Rozdělit informace podle typu pobytu';

    return sanitizeClientText(`3 nápady zdarma pro ${displayName}\n\nCo už působí dobře\n${signals.length ? `Web ukazuje konkrétní prvky: ${signals.join(', ')}.` : 'Web dává dobrý základ pro předpříjezdovou komunikaci.'}\n\n3 konkrétní nápady\n${ideaText}\n\nProč by to mohlo pomoct hostovi\nHost dostane praktické věci i důvody těšit se na pobyt na jednom místě.\n\nCo by mohl být placený další krok\nNavázat jednoduchou sadou předpříjezdových zpráv podle typu pobytu.`);
};

const fallbackOutreach = (name: string, candidate: CandidateInput) => {
    const displayName = cleanLeadDisplayName(name);
    const signals = candidateSpecificSignals(candidate).map((signal) => signal.label);
    const examples = signals.some((signal) => /restaurace|relax|parkovi|nabíjecí/i.test(signal)) ? 'příjezd, parkování, restauraci, relax nebo tipy před pobytem' : 'příjezd, parkování, check-in a nejčastější dotazy';
    return sanitizeClientText(`Dobrý den,\n\nomlouvám se za nevyžádanou zprávu. Pohybuji se kolem ubytování a narazil jsem na váš web ${displayName}.\n\nNevidím samozřejmě, co hostům posíláte po rezervaci, takže nechci dělat žádné velké závěry. Jen mě napadlo, že bych vám mohl zdarma poslat 3 krátké nápady k tomu, jak hostům ještě víc zpřehlednit informace před příjezdem — například ${examples}.\n\nBeru to jen jako malou ukázku. Když se vám to bude zdát užitečné, můžeme se pak domluvit na větší úpravě za úplatu. Když ne, vůbec se nic neděje.\n\nMá smysl vám ty 3 body poslat?\n\nDavid`);
};

const websiteOnlyOutreach = (name: string, candidate: CandidateInput) => {
    const displayName = cleanLeadDisplayName(name);
    return fallbackOutreach(displayName, candidate);
};

const fallbackFollowUp = (name: string) => sanitizeClientText(`Dobrý den,\n\njen krátce navazuji na předchozí zprávu. Šlo mi o pár konkrétních návrhů k webu ${cleanLeadDisplayName(name)}, hlavně k příjezdu, parkování a častým otázkám hostů.\n\nPokud to teď není aktuální, vůbec nevadí. Kdyby se vám hodilo, pošlu 3 body zdarma.\n\nDavid`);
const recommendedProductForCandidate = (candidate: CandidateInput) => {
    const website = candidate.websiteExtraction;
    const text = normalizeForMatch([
        website?.summary,
        ...(website?.pagesExtracted || []).flatMap((page) => [page.title, page.textPreview]),
        ...(website?.strengths || []),
        ...(website?.risks || []),
        ...(candidate.signals || []),
        ...(candidate.risks || []),
    ].filter(Boolean).join('\n'));
    const contactFound = Boolean((website?.contact?.emails?.length || 0) + (website?.contact?.phones?.length || 0));
    const missingArrivalStructure = (website?.arrivalSignals?.length || 0) === 0 || normalizeForMatch((website?.missingPublicInfoSignals || []).join('\n')).includes('prijezd');
    const operations = [
        /restaurace|restaurant|bar|terasa/.test(text),
        /wellness|relax|sauna|spa|jacuzzi/.test(text),
        /svatba|svatebni|wedding|altan|party stan/.test(text),
        /konferenc|meeting|firemni|skoleni/.test(text),
        /parkoviste|parkovani|parking|nabijeci|charging|elektromobil/.test(text),
        /romantick|rodin|svatba|konferenc|vylet|karlstejn/.test(text),
    ].filter(Boolean).length;
    const weakAreas = [
        (website?.missingPublicInfoSignals?.length || 0) >= 3,
        (website?.risks?.length || 0) >= 2,
        (candidate.risks?.length || 0) >= 2,
    ].filter(Boolean).length;
    const mature = (candidate.publicMaturityScore || 0) >= 75 && (website?.arrivalSignals?.length || 0) > 0 && (website?.parkingSignals?.length || 0) > 0 && ((website?.faqSignals?.length || 0) > 0 || (website?.guestGuideSignals?.length || 0) > 0);

    if (weakAreas >= 2) return 'ops-audit';
    if (operations >= 3) return 'guest-communication-setup';
    if (contactFound && missingArrivalStructure) return 'guest-guide-starter';
    if (mature) return 'skip';
    return 'guest-guide-starter';
};

const fallbackOffer = (name: string, candidate?: CandidateInput) => {
    const product = candidate ? recommendedProductForCandidate(candidate) : 'guest-guide-starter';
    if (product === 'guest-communication-setup') return sanitizeClientText(`Pokud by jim 3 nápady dávaly smysl, další placený krok může být Guest Communication Setup: úprava předpříjezdové komunikace a hostovského průvodce pro různé typy hostů. Když ne, vůbec se nic neděje.`);
    if (product === 'ops-audit') return sanitizeClientText(`Pokud by jim 3 nápady dávaly smysl, další placený krok může být Ops Audit: rychlý pohled na to, kde hosté mohou ztrácet informace nebo opakovaně psát stejné dotazy. Když ne, vůbec se nic neděje.`);
    if (product === 'skip') return sanitizeClientText('Pokud by jim 3 nápady dávaly smysl, nechal bych to zatím bez placené nabídky; z veřejné evidence není vidět dost silný důvod pokračovat.');
    return sanitizeClientText(`Pokud by jim 3 nápady dávaly smysl, další placený krok může být Guest Guide Starter: jednoduchý online průvodce pro hosty s příjezdem, parkováním, check-inem, kontaktem, Wi-Fi a FAQ pro ${cleanLeadDisplayName(name)}. Když ne, vůbec se nic neděje.`);
};

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
        suppressedMissingSignals: trimList(candidate.websiteExtraction.suppressedMissingSignals, 8, 180),
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
        const fallbackQuickWins = specificFallbackQuickWins(name, candidate);
        const placeholderQuickWin = {
            title: 'Ověřit jednu stránku před příjezdem',
            why: 'Z veřejné evidence zatím není dost konkrétních pozitivních signálů pro plně personalizované tři nápady.',
            action: 'Použít jen jako pracovní placeholder a před odesláním doplnit konkrétní signály z webu nebo ruční kontroly.',
            sourceEvidence: websiteExtraction.summary || pages,
            candidateSpecificity: 'generic' as const,
            uniqueBusinessAngle: 'placeholder pro ruční doplnění evidence',
            usedSignals: [],
        };
        const reviewPlaceholders = [
            placeholderQuickWin,
            { ...placeholderQuickWin, title: 'Doplnit pozitivní signály z webu', action: 'Před odesláním dohledat konkrétní služby, lokalitu, typy pokojů nebo provozní výhody a navázat nápad přímo na ně.' },
            { ...placeholderQuickWin, title: 'Neposílat obecné FAQ jako hotový nápad', action: 'Pokud konkrétní signály chybí, nechat lead ve stavu k ruční kontrole místo generování hotových šablon.' },
        ];

        return {
            leadDisplayName: displayName,
            firstImpression: `${displayName} má vlastní veřejný web a dohledatelný kontakt. Obchodní hypotéza je opatrná setup analýza z veřejných stránek, ne důkaz provozního problému.`,
            strengths: [...new Set([...(websiteExtraction.strengths || []), ...contactSignals, ...(candidate.signals || [])])].slice(0, 5),
            risks: [...new Set([...(websiteExtraction.risks || []), 'Fallback analýza: OpenAI nebylo dostupné, výstup je interní návrh s nízkou jistotou.'])],
            guestFrictionSignals: (websiteExtraction.missingPublicInfoSignals || []).length > 0 ? websiteExtraction.missingPublicInfoSignals : ['Z přečtených veřejných stránek není jasně vidět kompletní předpříjezdová orientace hosta.'],
            quickWins: [...fallbackQuickWins, ...reviewPlaceholders].slice(0, 3),
            miniAudit: fallbackClientMiniAudit(name, candidate),
            outreachEmail: fallbackOutreach(name, candidate),
            followUp: fallbackFollowUp(name),
            offerRecommendation: fallbackOffer(name, candidate),
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
            candidateSpecificity: 'generic' as const,
            uniqueBusinessAngle: 'ověření neveřejného předpříjezdového průvodce',
            usedSignals: [],
        },
        {
            title: 'Zprehlednit predprijezdove informace',
            why: 'Jasný předpříjezdový přehled může snížit nejistotu hosta a omezit opakované dotazy před příjezdem.',
            action: 'Navrhnout sablony pro prijezd, parkovani, check-in a caste dotazy.',
            sourceEvidence: evidence,
            candidateSpecificity: 'generic' as const,
            uniqueBusinessAngle: 'obecné předpříjezdové informace',
            usedSignals: [],
        },
        {
            title: 'Rucne overit mezeru',
            why: (candidate.missingAutomationSignals || []).join(', ') || 'Předpříjezdový guide nelze veřejně ověřit.',
            action: 'Před kontaktem ověřit dostupné veřejné podklady a formulovat to jako opatrnou setup příležitost, ne jako jistý problém.',
            sourceEvidence: evidence,
            candidateSpecificity: 'generic' as const,
            uniqueBusinessAngle: 'ruční ověření mezery před oslovením',
            usedSignals: [],
        },
    ] : isLowFit ? [
        {
            title: isBenchmarkOrSkip ? 'Pouzit jako benchmark' : 'Neoslovovat zatim',
            why: 'Z dostupnych snippetu nevyplyva konkretni prodejni bolest ani setup mezera.',
            action: 'Neposilat obchodni e-mail bez dalsiho verejneho nebo manualne overeneho duvodu.',
            sourceEvidence: evidence,
            candidateSpecificity: 'generic' as const,
            uniqueBusinessAngle: 'benchmark bez oslovení',
            usedSignals: [],
        },
        {
            title: 'Doplnit evidenci',
            why: 'Self-check-in nebo provozni komplexita sama o sobe neni problem.',
            action: 'Hledat konkrétní pain nebo veřejný důkaz, že předpříjezdové informace nejsou jasné; guest guide může existovat neveřejně.',
            sourceEvidence: evidence,
            candidateSpecificity: 'generic' as const,
            uniqueBusinessAngle: 'doplnění evidence před obchodním krokem',
            usedSignals: [],
        },
        {
            title: 'Neprepisovat pozitivni signal',
            why: 'Kandidat muze ukazovat dobre vyreseny proces bez verejneho guest friction.',
            action: 'Pouzit jen jako srovnani pro slabsi provozy.',
            sourceEvidence: evidence,
            candidateSpecificity: 'generic' as const,
            uniqueBusinessAngle: 'nepřepisovat pozitivně vyřešený proces',
            usedSignals: [],
        },
    ] : [
        {
            title: 'Resit konkretni guest friction',
            why: `Search/review snippet ukazuje: ${primaryPain}.`,
            action: practicalAction,
            sourceEvidence: evidence,
            candidateSpecificity: 'specific' as const,
            uniqueBusinessAngle: primaryPain,
            usedSignals: [primaryPain],
        },
        {
            title: 'Zpresnit predprijezdove instrukce',
            why: 'Pain signal se tyka prijezdu, orientace, kodu, klicu, parkovani nebo komunikace.',
            action: 'Udelat kontrolni blok pro hosta: kde prijet, kde zaparkovat, kde je vstup, kdy dorazi kod a co delat pri problemu.',
            sourceEvidence: evidence,
            candidateSpecificity: 'generic' as const,
            uniqueBusinessAngle: 'předpříjezdová instrukce podle doloženého pain signálu',
            usedSignals: painSignals.slice(0, 2),
        },
        {
            title: 'Navazat nabidku na pain',
            why: 'Nabidka ma byt o odstraneni dolozeneho treni, ne o obecném self-check-inu.',
            action: `Nabidnout ${targetOffer === 'skip' ? 'manualni overeni problemu' : targetOffer} jen jako reakci na dolozeny pain signal.`,
            sourceEvidence: evidence,
            candidateSpecificity: 'specific' as const,
            uniqueBusinessAngle: primaryPain,
            usedSignals: [primaryPain],
        },
    ];

    return {
        firstImpression: painSignals.length > 0 ? `${firstImpression} Konkretni pain: ${painSignals[0]}.` : firstImpression,
        strengths: signals.slice(0, 3),
        risks: risks.length > 0 ? risks : ['Omezeny verejny nahled, neni potvrzen detail nabidky.'],
        guestFrictionSignals: isSetup ? candidate.likelyManualProcessSignals || [] : painSignals.length > 0 ? painSignals : ['Neni dost konkretni evidence o treni hosta.'],
        quickWins,
        miniAudit: fallbackClientMiniAudit(name, candidate),
        outreachEmail: isBenchmarkOrSkip
            ? 'Interni poznamka: Neoslovovat zatim, chybi duvod. Bez verejneho pain signalu negenerovat obchodni e-mail.'
            : isSetup
                ? fallbackOutreach(name, candidate)
            : fallbackOutreach(name, candidate),
        followUp: `Dobrý den,\n\njen krátce navazuji na předchozí zprávu. Šlo mi hlavně o pár rychlých návrhů k prvnímu dojmu z veřejné nabídky ${name}.\n\nPokud to teď není aktuální, vůbec nevadí. Kdyby se vám hodilo, pošlu 3 konkrétní body zdarma.\n\nDavid`,
        offerRecommendation: isLowFit ? 'Nejdřív doplnit lepší veřejný důvod k oslovení.' : fallbackOffer(name, candidate),
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
    const hasWebsiteOnlyEvidence = Boolean(website && ['completed', 'partial'].includes(String(website.status || '')));
    const opportunityType: OpportunityType = candidate.opportunityType && isOpportunityType(candidate.opportunityType) ? candidate.opportunityType : website ? 'setup-automation' : 'skip';
    const quickWins = analysis.quickWins.map((quickWin) => quickWin as { title?: string; why?: string; action?: string; sourceEvidence?: string; candidateSpecificity?: string; uniqueBusinessAngle?: string; usedSignals?: string[] });

    return {
        leadDisplayName: cleanLeadDisplayName(analysis.leadDisplayName),
        firstImpression: trimText(String(analysis.internalSummary), 700),
        strengths: [...new Set([...(website?.strengths || []), ...(candidate.signals || []), ...(hasWebsiteContact ? ['Kontakt je nalezený na vlastním webu'] : [])])].slice(0, 5),
        risks: website?.risks || candidate.risks || [],
        guestFrictionSignals: website?.missingPublicInfoSignals?.length ? website.missingPublicInfoSignals : candidate.risks || [],
        quickWins: quickWins.map((quickWin) => ({
            title: trimText(quickWin.title, 120),
            why: trimText(sanitizeQuickWinWhy(quickWin.title, quickWin.why), 180),
            action: trimText(quickWin.action, 180),
            sourceEvidence: trimText(quickWin.sourceEvidence, 180),
            candidateSpecificity: quickWin.candidateSpecificity === 'specific' ? 'specific' as const : 'generic' as const,
            uniqueBusinessAngle: trimText(quickWin.uniqueBusinessAngle, 160),
            usedSignals: Array.isArray(quickWin.usedSignals) ? quickWin.usedSignals.map((signal) => trimText(String(signal), 80)).filter(Boolean).slice(0, 6) : [],
        })),
        miniAudit: sanitizeClientText(String(analysis.clientMiniAudit)),
        outreachEmail: hasWebsiteOnlyEvidence ? websiteOnlyOutreach(String(analysis.leadDisplayName), candidate) : sanitizeClientText(String(analysis.outreachEmail)),
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
    Klientske texty musi byt lidske pro majitele ubytovani. Prvni outreach musi byt jemna zadost o souhlas se 3 napady zdarma, ne audit ani hodnoceni. Slovo audit pouzij jen v nazvu produktu Ops Audit, pokud je to doporuceny dalsi produkt. Nepouzivej slova: OpenAI, Tavily, Website Extractor, fallback, evidenceLimits, sourceEvidence, setup automation, setup opportunity, publicSignals, aplikace, parser, extrakce, skore, fitVerdict, kontrola, hodnoceni, chyba, problem, meli byste, doporucuji vam.
    Pokud web nasel e-mail/telefon, netvrd, ze kontakt chybi. Pokud neni videt guest guide, pis opatrne: muze existovat neverejne po rezervaci.
    Pokud websiteExtraction.parkingSignals obsahuje parkovani nebo nabijeci stanici, nesmis tvrdit, ze parkovani neni jasne videt a nesmis delat quick win typu "doplnit parkovani". Ber parkovani/EV jako pozitivni signal a pouzij ho jako soucast konkretniho predprijezdoveho prehledu.
    Pokud evidence obsahuje websiteExtraction a neobsahuje screenshoty/fotky, outreach a quick wins nesmi mluvit o poradi fotek, hlavni fotce, mobilni galerii, redesignu ani recenzich v prvnich sekundach. Drz se prijezdu, parkovani, check-inu, FAQ, kontaktu a predprijezdoveho prehledu.
    QuickWins nesmi byt stejna sablona pro kazdy hotel. Kazdy quickWin musi mit candidateSpecificity "specific" nebo "generic", sourceEvidence s konkretnim prvkem z webu, uniqueBusinessAngle a usedSignals jako seznam konkretnich pozitivnich signalu pouzitych v napadu. Pokud pouzivas jen obecne tema prijezd/check-in/FAQ bez konkretni evidence z webu, oznac ho jako generic a usedSignals nech prazdne. Preferuj konkretni prvky webu jako Chram sv. Barbory, Jezuitska kolej, Kutna Hora, zahrada/gril, rodiny, klid, Zizkov/Praha 3, Restaurace Sklep, typy pokoju/apartmanu, kuchyn, tramvaj, restaurace, relax centrum, reka, ostrov, svatebni altan, konferencni prostory, romanticky hotel, lokalita pod hradem, parkoviste nebo EV nabijeni. Alespon 2 ze 3 quickWins maji byt specific, pokud evidence obsahuje aspon 3 konkretni signaly. Nepouzivej generic FAQ jako treti napad, pokud existuji konkretni hotelove signaly.
    Outreach musi obsahovat omluvu za nevyzadanou zpravu, vetu ze nevidime interní komunikaci po rezervaci, nabidku 3 napadu zdarma, transparentni zminku ze se pak muzeme domluvit treba na jednoduchem online pruvodci pro hosty nebo vetsi uprave komunikace za uplatu, a nenatlakovou otazku na konci. Nesmí tvrdit, ze maji problem nebo ze je hodnotime zvenku.
    OfferRecommendation ma byt nenatlakovy dalsi produkt: Guest Guide Starter, Guest Communication Setup, Ops Audit, nebo Skip/nepokracovat. Guest Guide Starter pouzij pro jednoduchy online pruvodce hosta. Guest Communication Setup pouzij pro hotely s vice provoznimi tematy a vice typy hostu. Ops Audit pouzij pro sirsi chaos/slabe oblasti. Skip pouzij, kdyz neni jasna prilezitost.
    Bez review/pain evidence nesmis tvrdit: "volaji zbytecne", "zbytecne pridava dotazy", "zpusobuje problem", "hoste jsou zmateni". Pro website-only setup lead pis opatrne: "muze snizit nejistotu hosta", "casto pomaha omezit opakovane dotazy", "pomaha hostovi rychleji najit prakticke informace", "muze usetrit cas recepci".
    Pokud quick win title je "Příjezd na jednu stránku", why musi byt presne: "Jasně soustředěné informace k příjezdu mohou snížit nejistotu hosta a omezit opakované dotazy před příjezdem."
    Limits: internalSummary max 700 znaku, clientMiniAudit max 700 znaku, outreachEmail 120-150 slov, followUp max 70 slov, offerRecommendation max 400 znaku. quickWins presne 3; kazde why/action max 180 znaku.
    leadDisplayName ocisti od titulku stranky, prefixu Kontakt/Contact/Rooms/Pokoje a suffixu po |.
    JSON fields: leadDisplayName, internalSummary, clientMiniAudit, quickWins[{title,why,action,sourceEvidence,candidateSpecificity,uniqueBusinessAngle,usedSignals}], outreachEmail, followUp, offerRecommendation, confidence, fitVerdict, qualificationReason, evidenceLimits.
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
