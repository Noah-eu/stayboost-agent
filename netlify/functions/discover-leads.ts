type OfferAngle = 'main-photo' | 'photo-order' | 'description' | 'reviews' | 'guest-communication' | 'guest-guide';

declare const process: { env: Record<string, string | undefined> };
declare const Buffer: { from(value: string): { toString(encoding: string): string } };

type AccommodationType = 'Hotel' | 'Penzion' | 'Apartman' | 'Glamping' | 'Jine';
type FitVerdict = 'strong-opportunity' | 'moderate-opportunity' | 'weak-opportunity' | 'not-enough-evidence' | 'skip';
type Confidence = 'low' | 'medium' | 'high';
type TargetOffer = 'guest-communication-fix' | 'guest-guide' | 'ota-profile-audit' | 'review-response-improvement' | 'self-checkin-setup' | 'skip';

interface DiscoverRequest {
    location: string;
    accommodationType: string;
    segment: string;
    maxResults: number;
    notes: string;
}

interface SearchResult {
    title?: string;
    url?: string;
    content?: string;
    snippet?: string;
}

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
};

const json = (statusCode: number, body: unknown) => ({ statusCode, headers, body: JSON.stringify(body) });

const includesAny = (value: string, keywords: string[]) => keywords.some((keyword) => value.includes(keyword));
const bounded = (value: number) => Math.max(0, Math.min(100, value));

const painMatchers = [
    { label: 'Public snippet mentions check-in problem', keywords: ['check-in problem', 'checkin problem', 'problem s check-in', 'problem s checkinem', 'problemy s check-in', 'nejasny check-in', 'unclear check-in'] },
    { label: 'Public snippet mentions unclear arrival or entrance', keywords: ['nejasny prijezd', 'problem s prijezdem', 'spatne instrukce', 'hard to find entrance', 'tezke najit vstup', 'hoste nevedeli kde je vstup', 'unclear arrival', 'unclear instructions'] },
    { label: 'Public snippet mentions parking problem', keywords: ['parking problem', 'problem s parkovanim', 'parkovani problem', 'parkovani bylo problem', 'bad parking'] },
    { label: 'Public snippet mentions bad communication', keywords: ['bad communication', 'spatna komunikace', 'slaba komunikace', 'late instructions', 'pozdni instrukce', 'instructions came late', 'komunikace problem'] },
    { label: 'Public snippet mentions key or keybox problem', keywords: ['keybox problem', 'problem s keyboxem', 'problem s klici', 'code did not work', 'kod nefungoval', 'wrong code', 'problem s kodem'] },
    { label: 'Public snippet mentions guest confusion', keywords: ['confusion', 'confusing', 'unclear', 'nejasn', 'hard to find', 'complaint', 'stiznost'] },
];

const solvedMatchers = [
    { label: 'Self-check-in appears already solved and presented positively', keywords: ['pohodlny online check-in', 'easy self check-in', 'smooth self check-in', 'simple self check-in', 'online check-in', 'self check-in', 'self checkin', 'automaticky check-in'] },
    { label: 'Keybox or arrival process appears already documented', keywords: ['keybox', 'schranka na klice', 'jasne instrukce', 'detailed instructions', 'arrival instructions', 'bezproblemovy prijezd'] },
    { label: 'Parking appears presented as an amenity, not a pain', keywords: ['parkovani zdarma', 'private parking', 'free parking', 'parkovani ve dvore'] },
];

const uniqueMatches = (content: string, matchers: Array<{ label: string; keywords: string[] }>) => matchers
    .filter((matcher) => includesAny(content, matcher.keywords))
    .map((matcher) => matcher.label);

const hasOwnWebsite = (url: string) => Boolean(url) && !includesAny(url.toLowerCase(), ['booking.', 'airbnb.', 'google.', 'tripadvisor.', 'expedia.', 'hotels.com']);

const inferType = (text: string): AccommodationType => {
    const content = text.toLowerCase();

    if (includesAny(content, ['apartman', 'apartment'])) return 'Apartman';
    if (includesAny(content, ['penzion', 'pension'])) return 'Penzion';
    if (includesAny(content, ['hotel'])) return 'Hotel';
    if (includesAny(content, ['glamping'])) return 'Glamping';
    return 'Jine';
};

const inferAngle = (content: string): OfferAngle => {
    if (includesAny(content, ['review', 'recenze', 'hodnoceni'])) return 'reviews';
    if (includesAny(content, ['communication', 'komunikace', 'message', 'zpravy'])) return 'guest-communication';
    if (includesAny(content, ['check-in', 'checkin', 'keybox', 'prijezd', 'parking', 'parkovani'])) return 'guest-guide';
    if (includesAny(content, ['photo', 'fotka', 'galerie'])) return 'photo-order';
    if (includesAny(content, ['description', 'popis', 'text'])) return 'description';
    return 'main-photo';
};

const inferTargetOffer = (painSignals: string[], content: string): TargetOffer => {
    if (painSignals.length === 0) return 'skip';
    if (includesAny(content, ['bad communication', 'spatna komunikace', 'late instructions', 'pozdni instrukce', 'komunikace problem'])) return 'guest-communication-fix';
    if (includesAny(content, ['review', 'recenze', 'hodnoceni', 'complaint', 'stiznost'])) return 'review-response-improvement';
    if (includesAny(content, ['profile', 'ota', 'booking', 'airbnb', 'popis', 'description'])) return 'ota-profile-audit';
    if (includesAny(content, ['check-in problem', 'keybox problem', 'problem s keyboxem', 'code did not work', 'problem s kodem'])) return 'guest-guide';
    return 'guest-guide';
};

const scoreCandidate = (content: string, hasUrl: boolean, hasEmail: boolean, hasOwnPublicWebsite: boolean, type: AccommodationType, snippetCount: number) => {
    const signals: string[] = [];
    const risks: string[] = [];
    const alreadySolvedSignals: string[] = [];
    const missingEvidence: string[] = [];
    const contradictionWarnings: string[] = [];
    const painSignals = uniqueMatches(content, painMatchers);
    const positiveSolvedSignals = uniqueMatches(content, solvedMatchers);
    let score = 0;
    let opportunityScore = 0;
    let reviewFrictionScore = painSignals.length * 22;

    if (hasUrl) {
        score += 12;
        signals.push('Verejny web nebo verejny vysledek hledani');
    }

    if (hasOwnPublicWebsite) {
        score += 10;
        signals.push('Vlastni web mimo OTA agregator');
    } else {
        risks.push('Vysledek muze byt jen OTA/agregator bez vlastniho webu');
        opportunityScore -= 10;
    }

    if (hasEmail) {
        score += 16;
        signals.push('Verejny kontakt / e-mail');
    } else {
        risks.push('V search vysledku neni videt verejny e-mail');
        missingEvidence.push('Chybi verejny kontakt / e-mail');
        score -= 8;
        opportunityScore -= 12;
    }

    if (['Apartman', 'Penzion', 'Hotel'].includes(type)) {
        score += type === 'Hotel' ? 8 : 14;
        signals.push('Vhodny typ ubytovani');
    } else {
        risks.push('Neni jasne, ze jde o ubytovani');
        score -= 12;
    }

    const hasOperationalCheckIn = includesAny(content, ['online check-in', 'self check-in', 'self checkin', 'keybox', 'bez recepce', 'automaticky check-in', 'samostatny prijezd']);
    const hasParking = includesAny(content, ['parking', 'parkovani']);
    const hasMultipleUnits = includesAny(content, ['apartmany', 'apartments', 'vice jednotek', 'rooms']);
    const hasPain = painSignals.length > 0;

    if (hasOperationalCheckIn) {
        score += 8;
        signals.push('Self check-in / keybox / bez recepce');
        if (hasPain) {
            opportunityScore += 24;
            reviewFrictionScore += 18;
        } else {
            opportunityScore += 4;
        }
    }

    if (positiveSolvedSignals.length > 0) {
        alreadySolvedSignals.push(...positiveSolvedSignals);
        if (!hasPain) {
            contradictionWarnings.push('Self-check-in appears already solved; no public guest friction found');
        }
    }

    if (hasParking) {
        score += 6;
        signals.push('Parkovani');
        if (hasPain && includesAny(content, ['parking problem', 'problem s parkovanim', 'parkovani problem', 'bad parking'])) {
            opportunityScore += 14;
            reviewFrictionScore += 16;
        }
    }

    if (hasMultipleUnits) {
        score += 8;
        signals.push('Vice jednotek nebo apartmanovy provoz');
    }

    if (hasPain) {
        score += 18;
        signals.push('Review/search snippet zminuje konkretni guest friction');
        opportunityScore += 34;
    }

    if (includesAny(content, ['slaby web', 'neprehledny', 'chybi faq', 'chybi guest guide', 'roztrousene informace', 'unclear information'])) {
        opportunityScore += 24;
        risks.push('Snippet naznacuje slabsi verejnou strukturu informaci');
    }

    if (includesAny(content, ['chain', 'resort', 'marriott', 'hilton', 'accor'])) {
        score -= 20;
        opportunityScore -= 25;
        risks.push('Muze jit o velky hotelovy retezec');
    }

    if (snippetCount <= 1) {
        missingEvidence.push('K dispozici je jen jeden nebo zadny verejny snippet');
        opportunityScore -= 15;
        reviewFrictionScore -= 12;
    }

    if (!hasPain) {
        missingEvidence.push('Neni videt verejny review/pain signal');
        opportunityScore -= 26;
    }

    if (alreadySolvedSignals.length > 0 && !hasPain) {
        missingEvidence.push('Neni konkretni dukaz, ze check-in nebo predprijezdove instrukce jsou problem');
        opportunityScore -= 18;
    }

    if (hasEmail) opportunityScore += 14;
    if (['Apartman', 'Penzion'].includes(type)) opportunityScore += hasPain ? 16 : 6;
    if (risks.length === 0 && alreadySolvedSignals.length > 0) opportunityScore -= 10;

    const boundedLeadScore = bounded(score);
    const boundedOpportunityScore = bounded(opportunityScore);
    const boundedReviewFrictionScore = bounded(reviewFrictionScore);
    const confidence: Confidence = snippetCount <= 1 ? 'low' : boundedReviewFrictionScore >= 60 ? 'high' : boundedReviewFrictionScore >= 30 ? 'medium' : 'low';
    const isLargeChain = includesAny(content, ['marriott', 'hilton', 'accor']);
    const fitVerdict: FitVerdict = !hasUrl || isLargeChain || (!hasEmail && !hasOwnPublicWebsite)
        ? 'skip'
        : hasPain && boundedReviewFrictionScore >= 55 && ['Apartman', 'Penzion', 'Hotel'].includes(type) && hasEmail
            ? 'strong-opportunity'
            : hasPain && boundedReviewFrictionScore >= 30
                ? 'moderate-opportunity'
                : snippetCount <= 1 && positiveSolvedSignals.length === 0
                    ? 'not-enough-evidence'
                    : positiveSolvedSignals.length > 0 || hasOperationalCheckIn
                        ? 'weak-opportunity'
                        : 'not-enough-evidence';
    const noPainReason = hasPain ? undefined : 'self-check-in appears already solved; no public guest friction found';
    const targetOffer = inferTargetOffer(painSignals, content);
    const qualificationReason = hasPain
        ? `Qualified by ${painSignals.length} public pain signal(s) from search/review snippets; evidence is not full-page scraping.`
        : noPainReason;

    return {
        leadScore: boundedLeadScore,
        opportunityScore: boundedOpportunityScore,
        reviewFrictionScore: boundedReviewFrictionScore,
        fitVerdict,
        confidence,
        contactMissing: !hasEmail,
        painSignals,
        positiveSolvedSignals,
        noPainReason,
        targetOffer,
        qualificationReason,
        alreadySolvedSignals,
        missingEvidence,
        contradictionWarnings,
        signals,
        risks,
    };
};

const makeQueries = (request: DiscoverRequest) => {
    const location = request.location || 'Praha';
    const accommodationType = request.accommodationType || 'apartmany';
    const segment = request.segment || 'self check-in';

    return [
        `${location} ${accommodationType} ${segment} ubytovani`,
        `${location} penzion parkovani check-in`,
        `${location} apartmany Booking vlastni web`,
        `${location} ubytovani bez recepce`,
    ];
};

const makePainQueries = (candidateName: string) => [
    `${candidateName} check-in problem reviews`,
    `${candidateName} parking problem recenze`,
    `${candidateName} communication reviews hard to find entrance`,
];

const tavilySearch = async (apiKey: string, query: string, maxResults: number) => {
    const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, query, max_results: maxResults, search_depth: 'basic' }),
    });
    const payload = await response.json() as { results?: SearchResult[] };
    return payload.results || [];
};

const fallbackCandidates = (request: DiscoverRequest) => ({
    status: 'needs-config',
    message: 'TAVILY_API_KEY neni nakonfigurovany. Vracim demo kandidaty; nejde o realne vyhledani na webu.',
    isMock: true,
    diagnostic: {
        mode: 'demo-fallback',
        discoverProvider: 'demo',
        fallbackReason: 'missing_tavily_api_key',
        httpStatus: 200,
        userMessage: 'Discovery bezi v demo fallbacku: missing_tavily_api_key',
        runtime: 'netlify-function',
    },
    candidates: [
        {
            id: 'mock-agent-river-gate',
            name: 'Apartmany River Gate',
            location: request.location || 'Praha',
            type: 'Apartman',
            websiteUrl: 'https://example.com/river-gate',
            sourceUrls: ['https://example.com/river-gate'],
            sourceSnippets: ['Demo snippet: apartmany se self check-inem, keyboxem, parkovanim a vice jednotkami.'],
            possibleEmail: 'rezervace@rivergate.example',
            signals: ['Verejny web', 'Self check-in / keybox', 'Parkovani', 'Vice jednotek'],
            risks: ['Demo vysledek, ne realne API hledani'],
            leadScore: 86,
            opportunityScore: 78,
            reviewFrictionScore: 72,
            fitVerdict: 'strong-opportunity',
            confidence: 'high',
            contactMissing: false,
            painSignals: ['Public snippet mentions key or keybox problem', 'Public snippet mentions unclear arrival or entrance'],
            positiveSolvedSignals: ['Keybox or arrival process appears already documented'],
            noPainReason: undefined,
            targetOffer: 'guest-guide',
            qualificationReason: 'Demo pain lead: search/review snippet mentions keybox or arrival confusion; evidence is snippet-only.',
            alreadySolvedSignals: ['Keybox pravdepodobne existuje, ale demo pain signal rika, ze hoste maji problem s instrukcemi'],
            missingEvidence: ['Demo fallback nema realne review API vysledky'],
            contradictionWarnings: ['Resit konkretni zmatek kolem instrukci, ne obecne zavadeni self-check-inu'],
            recommendedAngle: 'guest-guide',
            evidenceSummary: 'Demo kandidat z fallback rezimu; URL nebyla automaticky ctena.',
            isMock: true,
        },
        {
            id: 'mock-agent-florian-solved',
            name: 'Apartmany Florian Benchmark',
            location: request.location || 'Praha',
            type: 'Apartman',
            websiteUrl: 'https://example.com/florian',
            sourceUrls: ['https://example.com/florian'],
            sourceSnippets: ['Demo snippet: apartmany prezentuji pohodlny online check-in, jasne instrukce pred prijezdem a parkovani ve dvore. Bez negativniho review signalu.'],
            possibleEmail: 'info@florian.example',
            signals: ['Verejny web', 'Self check-in / keybox', 'Parkovani', 'Vice jednotek'],
            risks: ['Demo benchmark: neni videt verejny pain signal'],
            leadScore: 70,
            opportunityScore: 18,
            reviewFrictionScore: 0,
            fitVerdict: 'weak-opportunity',
            confidence: 'low',
            contactMissing: false,
            painSignals: [],
            positiveSolvedSignals: ['Self-check-in appears already solved and presented positively', 'Parking appears presented as an amenity, not a pain'],
            noPainReason: 'self-check-in appears already solved; no public guest friction found',
            targetOffer: 'skip',
            qualificationReason: 'Demo benchmark: provozni komplexita existuje, ale chybi verejny pain signal.',
            alreadySolvedSignals: ['Online/self check-in a parkovani jsou prezentovane pozitivne'],
            missingEvidence: ['Chybi negativni review/search signal'],
            contradictionWarnings: ['Neposilat obchodni osloveni jen kvuli self-check-inu'],
            recommendedAngle: 'guest-guide',
            evidenceSummary: 'Demo benchmark kandidat: ukazuje rozdil mezi tematem self-check-in a skutecnym pain leadem.',
            isMock: true,
        },
    ],
});

export const handler = async (event: { httpMethod: string; body?: string | null }) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { message: 'Use POST.' });

    const tavilyApiKey = process.env.TAVILY_API_KEY;
    const request = JSON.parse(event.body || '{}') as DiscoverRequest;

    if (!tavilyApiKey) return json(200, fallbackCandidates(request));

    const queries = makeQueries(request);
    const results: SearchResult[] = [];

    for (const query of queries) {
        results.push(...await tavilySearch(tavilyApiKey, query, Math.max(1, Math.min(5, request.maxResults || 5))));
    }

    const seen = new Set<string>();
    const baseCandidates = results
        .filter((result) => result.url && !seen.has(result.url) && seen.add(result.url))
        .slice(0, Math.max(1, Math.min(20, request.maxResults || 10)))
        .map((result, index) => ({ result, index }));

    const candidates: Array<Record<string, unknown>> = [];
    const qualificationLimit = Math.min(8, baseCandidates.length);

    for (const { result, index } of baseCandidates) {
        const painResults = index < qualificationLimit
            ? (await Promise.all(makePainQueries(result.title || `Lead kandidat ${index + 1}`).map((query) => tavilySearch(tavilyApiKey, query, 2)))).flat()
            : [];
        const snippet = result.content || result.snippet || '';
        const painSnippets = painResults.map((painResult) => painResult.content || painResult.snippet || '').filter(Boolean).slice(0, 6);
        const title = result.title || `Lead kandidat ${index + 1}`;
        const content = `${title} ${snippet} ${painSnippets.join(' ')} ${result.url}`.toLowerCase();
        const possibleEmail = content.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] || '';
        const type = inferType(content);
        const scoring = scoreCandidate(content, Boolean(result.url), Boolean(possibleEmail), hasOwnWebsite(result.url || ''), type, [snippet, ...painSnippets].filter(Boolean).length);

        candidates.push({
            id: `agent-${index}-${Buffer.from(result.url || title).toString('base64url').slice(0, 16)}`,
            name: title,
            location: request.location,
            type,
            websiteUrl: result.url || '',
            sourceUrls: result.url ? [result.url] : [],
            sourceSnippets: [snippet, ...painSnippets].filter(Boolean),
            possibleEmail,
            signals: scoring.signals,
            risks: scoring.risks,
            leadScore: scoring.leadScore,
            opportunityScore: scoring.opportunityScore,
            reviewFrictionScore: scoring.reviewFrictionScore,
            fitVerdict: scoring.fitVerdict,
            confidence: scoring.confidence,
            contactMissing: scoring.contactMissing,
            painSignals: scoring.painSignals,
            positiveSolvedSignals: scoring.positiveSolvedSignals,
            noPainReason: scoring.noPainReason,
            targetOffer: scoring.targetOffer,
            qualificationReason: scoring.qualificationReason,
            alreadySolvedSignals: scoring.alreadySolvedSignals,
            missingEvidence: scoring.missingEvidence,
            contradictionWarnings: scoring.contradictionWarnings,
            recommendedAngle: inferAngle(content),
            evidenceSummary: `Vytvoreno z Tavily search vysledku/snippetu vcetne lehkych pain/review dotazu. URL nebyla scrapovana ani automaticky prochazena: ${[snippet, ...painSnippets].join(' ').slice(0, 240)}`,
            isMock: false,
        });
    }

    return json(200, {
        status: 'found',
        message: 'Kandidati vznikli z Tavily search vysledku a snippetů. Nejde o scraping Booking/Airbnb/Google stranek.',
        isMock: false,
        diagnostic: {
            mode: 'real-api',
            discoverProvider: 'tavily',
            httpStatus: 200,
            userMessage: 'Discovery provider: tavily',
            runtime: 'netlify-function',
        },
        candidates,
    });
};
