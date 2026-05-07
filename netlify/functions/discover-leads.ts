type OfferAngle = 'main-photo' | 'photo-order' | 'description' | 'reviews' | 'guest-communication' | 'guest-guide';

declare const process: { env: Record<string, string | undefined> };
declare const Buffer: { from(value: string): { toString(encoding: string): string } };

type AccommodationType = 'Hotel' | 'Penzion' | 'Apartman' | 'Glamping' | 'Jine';
type FitVerdict = 'strong-opportunity' | 'moderate-opportunity' | 'weak-opportunity' | 'not-enough-evidence' | 'skip';
type Confidence = 'low' | 'medium' | 'high';
type TargetOffer = 'guest-communication-fix' | 'guest-guide' | 'ota-profile-audit' | 'review-response-improvement' | 'self-checkin-setup' | 'skip';
type OpportunityType = 'fix-existing-process' | 'setup-automation' | 'ota-profile-audit' | 'benchmark' | 'skip';

interface DiscoverRequest {
    location: string;
    accommodationType: string;
    segment: string;
    maxResults: number;
    notes: string;
    knownTargetName?: string;
    knownTargetCity?: string;
    knownTargetWebsiteUrl?: string;
    knownTargetNote?: string;
    knownTargetEmail?: string;
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

const automationSolvedMatchers = [
    { label: 'Online guest guide appears visible', keywords: ['guest guide', 'online guide', 'digital guide', 'qr instrukce', 'qr guide', 'pruvodce pro hosty'] },
    { label: 'FAQ / arrival guide appears visible', keywords: ['faq', 'arrival guide', 'prijezdove instrukce', 'informace pred prijezdem', 'pokyny k prijezdu'] },
    { label: 'Automated self check-in process appears visible', keywords: ['online check-in', 'self check-in', 'self checkin', 'automaticky check-in', 'keybox', 'schranka na klice'] },
];

const uniqueMatches = (content: string, matchers: Array<{ label: string; keywords: string[] }>) => matchers
    .filter((matcher) => includesAny(content, matcher.keywords))
    .map((matcher) => matcher.label);

const hasOwnWebsite = (url: string) => Boolean(url) && !includesAny(url.toLowerCase(), ['booking.', 'airbnb.', 'google.', 'tripadvisor.', 'expedia.', 'hotels.com']);
const isBlockedAggregator = (url: string) => includesAny(url.toLowerCase(), ['booking.', 'airbnb.', 'google.']);

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
    const positiveSolvedSignals = uniqueMatches(content, [...solvedMatchers, ...automationSolvedMatchers]);
    const websiteSignals: string[] = [];
    const contactSignals: string[] = [];
    const missingAutomationSignals: string[] = [];
    const likelyManualProcessSignals: string[] = [];
    let score = 0;
    let fixScore = 0;
    let setupScore = 0;
    let publicMaturityScore = 0;
    let reviewFrictionScore = painSignals.length * 22;

    if (hasUrl) {
        score += 12;
        signals.push('Verejny web nebo verejny vysledek hledani');
    }

    if (hasOwnPublicWebsite) {
        score += 10;
        publicMaturityScore += 18;
        signals.push('Vlastni web mimo OTA agregator');
        websiteSignals.push('Vlastni web mimo OTA agregator');
    } else {
        risks.push('Vysledek muze byt jen OTA/agregator bez vlastniho webu');
        setupScore -= 15;
    }

    if (hasEmail) {
        score += 16;
        setupScore += 18;
        signals.push('Verejny kontakt / e-mail');
        contactSignals.push('Verejny e-mail nebo kontakt');
    } else {
        risks.push('V search vysledku neni videt verejny e-mail');
        missingEvidence.push('Chybi verejny kontakt / e-mail');
        score -= 8;
        setupScore -= 18;
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
    const isSmallLocal = ['Apartman', 'Penzion', 'Glamping'].includes(type) || includesAny(content, ['penzion', 'pension', 'guesthouse', 'rodinny penzion', 'apartmany', 'ubytovani v soukromi', 'privat']);
    const isLargeChain = includesAny(content, ['chain', 'resort', 'marriott', 'hilton', 'accor', 'orea hotel', 'clarion', 'ibis']);
    const hasGuestGuide = includesAny(content, ['guest guide', 'online guide', 'digital guide', 'qr instrukce', 'qr guide', 'pruvodce pro hosty']);
    const hasFaqArrivalGuide = includesAny(content, ['faq', 'arrival guide', 'pokyny k prijezdu', 'prijezdove instrukce', 'informace pred prijezdem']);
    const hasReservationLanguage = includesAny(content, ['rezervace', 'reservation', 'kontakt', 'contact', 'volejte', 'telefon', 'email', 'e-mail']);
    const hasPain = painSignals.length > 0;

    if (hasGuestGuide) publicMaturityScore += 26;
    if (hasFaqArrivalGuide) publicMaturityScore += 22;
    if (hasOperationalCheckIn) publicMaturityScore += 18;
    if (hasReservationLanguage) publicMaturityScore += 8;

    if (!hasGuestGuide) missingAutomationSignals.push('Neni videt online guest guide');
    if (!hasFaqArrivalGuide) missingAutomationSignals.push('Neni videt FAQ / arrival guide');
    if (!hasOperationalCheckIn) missingAutomationSignals.push('Neni videt automatizovany self check-in proces');

    if (isSmallLocal) likelyManualProcessSignals.push('Maly lokalni provoz / penzion / apartmany');
    if (hasReservationLanguage) likelyManualProcessSignals.push('Prezentace pracuje s rezervaci nebo kontaktem');
    if (includesAny(content, ['rodinny', 'family', 'soukromi', 'klidna lokalita'])) likelyManualProcessSignals.push('Rodinny nebo soukromy charakter provozu');

    if (hasOperationalCheckIn) {
        score += 8;
        signals.push('Self check-in / keybox / bez recepce');
        if (hasPain) {
            fixScore += 24;
            reviewFrictionScore += 18;
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
            fixScore += 14;
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
        fixScore += 34;
    }

    if (includesAny(content, ['slaby web', 'neprehledny', 'chybi faq', 'chybi guest guide', 'roztrousene informace', 'unclear information'])) {
        setupScore += 24;
        risks.push('Snippet naznacuje slabsi verejnou strukturu informaci');
    }

    if (isLargeChain) {
        score -= 20;
        setupScore -= 30;
        fixScore -= 25;
        risks.push('Muze jit o velky hotelovy retezec');
    }

    if (snippetCount <= 1) {
        missingEvidence.push('K dispozici je jen jeden nebo zadny verejny snippet');
        setupScore -= 10;
        fixScore -= 15;
        reviewFrictionScore -= 12;
    }

    if (!hasPain) {
        missingEvidence.push('Neni videt verejny review/pain signal');
    }

    const hasModernAutomation = hasGuestGuide || hasFaqArrivalGuide || (hasOperationalCheckIn && positiveSolvedSignals.length > 0);

    if (alreadySolvedSignals.length > 0 && !hasPain && hasModernAutomation) {
        missingEvidence.push('Neni konkretni dukaz, ze check-in nebo predprijezdove instrukce jsou problem');
        setupScore -= 30;
    }

    if (hasEmail) fixScore += 14;
    if (hasOwnPublicWebsite) setupScore += 14;
    if (['Apartman', 'Penzion'].includes(type)) {
        fixScore += hasPain ? 16 : 0;
        setupScore += 18;
    }
    setupScore += missingAutomationSignals.length * 15;
    setupScore += likelyManualProcessSignals.length * 9;
    setupScore -= Math.round(publicMaturityScore * 0.25);
    if (risks.length === 0 && alreadySolvedSignals.length > 0) fixScore -= 10;

    const automationNeedScore = bounded(setupScore + (hasOwnPublicWebsite ? 8 : 0) + (hasEmail ? 12 : 0));
    const setupQualified = !hasPain && isSmallLocal && !isLargeChain && (hasOwnPublicWebsite || hasEmail) && automationNeedScore >= 45 && missingAutomationSignals.length >= 2 && !hasModernAutomation;
    const fixQualified = hasPain && bounded(reviewFrictionScore) >= 30;
    const opportunityType: OpportunityType = fixQualified
        ? 'fix-existing-process'
        : setupQualified
            ? 'setup-automation'
            : hasModernAutomation && !hasPain
                ? 'benchmark'
                : !hasOwnPublicWebsite && !hasEmail
                    ? 'skip'
                    : 'ota-profile-audit';
    const opportunityScore = bounded(opportunityType === 'fix-existing-process' ? fixScore + bounded(reviewFrictionScore) : opportunityType === 'setup-automation' ? automationNeedScore : opportunityType === 'benchmark' ? 18 : setupScore);

    const boundedLeadScore = bounded(score);
    const boundedOpportunityScore = opportunityScore;
    const boundedReviewFrictionScore = bounded(reviewFrictionScore);
    const confidence: Confidence = snippetCount <= 1 ? 'low' : boundedReviewFrictionScore >= 60 || automationNeedScore >= 70 ? 'high' : boundedReviewFrictionScore >= 30 || automationNeedScore >= 45 ? 'medium' : 'low';
    const fitVerdict: FitVerdict = !hasUrl || isLargeChain || (!hasEmail && !hasOwnPublicWebsite)
        ? 'skip'
        : hasPain && boundedReviewFrictionScore >= 55 && ['Apartman', 'Penzion', 'Hotel'].includes(type) && hasEmail
            ? 'strong-opportunity'
            : hasPain && boundedReviewFrictionScore >= 30
                ? 'moderate-opportunity'
                : setupQualified && automationNeedScore >= 70 && hasEmail
                    ? 'strong-opportunity'
                    : setupQualified
                        ? 'moderate-opportunity'
                        : snippetCount <= 1 && positiveSolvedSignals.length === 0
                            ? 'not-enough-evidence'
                            : opportunityType === 'benchmark'
                                ? 'weak-opportunity'
                                : 'not-enough-evidence';
    const noPainReason = hasPain ? undefined : opportunityType === 'setup-automation' ? 'No public review pain found; qualification is setup automation, not a fix claim.' : 'No public review pain found.';
    const targetOffer = opportunityType === 'setup-automation' ? 'self-checkin-setup' : inferTargetOffer(painSignals, content);
    const offerHypothesis = opportunityType === 'fix-existing-process'
        ? `Fix existing process: ${painSignals[0] || 'public pain signal'} can be addressed with guest communication / arrival workflow.`
        : opportunityType === 'setup-automation'
            ? 'Setup automation: public presentation suggests a small local operation with contact, but no visible guest guide / FAQ / arrival guide.'
            : opportunityType === 'benchmark'
                ? 'Benchmark: public signals suggest automation or self check-in is already presented well; do not outreach by default.'
                : 'Skip or low priority until own website/contact or clearer evidence is found.';
    const qualificationReason = hasPain
        ? `Qualified by ${painSignals.length} public pain signal(s) from search/review snippets; evidence is not full-page scraping.`
        : opportunityType === 'setup-automation'
            ? `Qualified as setup lead by ${missingAutomationSignals.length} missing automation signal(s), ${likelyManualProcessSignals.length} likely manual-process signal(s), and contact/website evidence.`
            : offerHypothesis;

    return {
        leadScore: boundedLeadScore,
        opportunityScore: boundedOpportunityScore,
        opportunityType,
        automationNeedScore,
        publicMaturityScore: bounded(publicMaturityScore),
        reviewFrictionScore: boundedReviewFrictionScore,
        fitVerdict,
        confidence,
        contactMissing: !hasEmail,
        painSignals,
        positiveSolvedSignals,
        noPainReason,
        targetOffer,
        offerHypothesis,
        websiteSignals,
        contactSignals,
        missingAutomationSignals,
        likelyManualProcessSignals,
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
        `${location} penzion kontakt`,
        `${location} ubytovani penzion kontakt`,
        `${location} apartmany kontakt`,
        `${location} ubytovani vlastni web`,
        `${location} pension email`,
        `${location} guesthouse contact`,
        `${location} ubytovani bez recepce`,
        `${location} penzion rezervace`,
        `${location} apartmany rezervace`,
        `${location} ubytovani rodinny penzion`,
        `${location} penzion parkovani check-in`,
        `${location} apartmany Booking vlastni web`,
    ];
};

const makeKnownTargetQueries = (request: DiscoverRequest) => {
    const name = request.knownTargetName || request.knownTargetWebsiteUrl || '';
    const city = request.knownTargetCity || request.location || '';

    return [
        `${name} ${city} kontakt`,
        `${name} ${city} email`,
        `${name} official website`,
        `${name} penzion kontakt`,
        `${name} guesthouse contact`,
    ];
};

const makePainQueries = (candidateName: string) => [
    `${candidateName} check-in problem reviews`,
    `${candidateName} parking problem recenze`,
    `${candidateName} communication reviews hard to find entrance`,
];

const makeContactQueries = (candidateName: string, location: string) => [
    `${candidateName} ${location} kontakt`,
    `${candidateName} email`,
    `${candidateName} official website`,
    `${candidateName} penzion kontakt`,
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
            opportunityType: 'fix-existing-process',
            automationNeedScore: 44,
            publicMaturityScore: 60,
            reviewFrictionScore: 72,
            fitVerdict: 'strong-opportunity',
            confidence: 'high',
            contactMissing: false,
            painSignals: ['Public snippet mentions key or keybox problem', 'Public snippet mentions unclear arrival or entrance'],
            positiveSolvedSignals: ['Keybox or arrival process appears already documented'],
            noPainReason: undefined,
            targetOffer: 'guest-guide',
            offerHypothesis: 'Fix existing process: arrival/keybox confusion can be addressed with a clearer guest guide and pre-arrival workflow.',
            websiteSignals: ['Vlastni web mimo OTA agregator'],
            contactSignals: ['Verejny e-mail nebo kontakt'],
            missingAutomationSignals: ['Neni videt jednotna predprijezdova stranka'],
            likelyManualProcessSignals: ['Verejne instrukce pusobi roztrousene'],
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
            opportunityType: 'benchmark',
            automationNeedScore: 12,
            publicMaturityScore: 84,
            reviewFrictionScore: 0,
            fitVerdict: 'weak-opportunity',
            confidence: 'low',
            contactMissing: false,
            painSignals: [],
            positiveSolvedSignals: ['Self-check-in appears already solved and presented positively', 'Parking appears presented as an amenity, not a pain'],
            noPainReason: 'self-check-in appears already solved; no public guest friction found',
            targetOffer: 'skip',
            offerHypothesis: 'Benchmark: self check-in and arrival instructions already look well presented; do not outreach by default.',
            websiteSignals: ['Vlastni web mimo OTA agregator', 'Predprijezdove instrukce jsou videt'],
            contactSignals: ['Verejny e-mail nebo kontakt'],
            missingAutomationSignals: [],
            likelyManualProcessSignals: [],
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

    const isKnownTarget = Boolean(request.knownTargetName?.trim() || request.knownTargetWebsiteUrl?.trim());
    const queries = isKnownTarget ? makeKnownTargetQueries(request) : makeQueries(request);
    const results: SearchResult[] = [];

    if (isKnownTarget && request.knownTargetWebsiteUrl) {
        results.push({
            title: request.knownTargetName || request.knownTargetWebsiteUrl,
            url: request.knownTargetWebsiteUrl,
            content: `${request.knownTargetName || ''} ${request.knownTargetCity || request.location || ''} ${request.knownTargetEmail || ''} ${request.knownTargetNote || ''}`,
        });
    }

    for (const query of queries) {
        results.push(...await tavilySearch(tavilyApiKey, query, Math.max(1, Math.min(5, request.maxResults || 5))));
    }

    const seen = new Set<string>();
    const baseCandidates = results
        .filter((result) => result.url && !seen.has(result.url) && seen.add(result.url))
        .slice(0, isKnownTarget ? 1 : Math.max(1, Math.min(20, request.maxResults || 10)))
        .map((result, index) => ({ result, index }));

    const candidates: Array<Record<string, unknown>> = [];
    const qualificationLimit = Math.min(8, baseCandidates.length);

    for (const { result, index } of baseCandidates) {
        const title = isKnownTarget ? request.knownTargetName || result.title || `Lead kandidat ${index + 1}` : result.title || `Lead kandidat ${index + 1}`;
        const contactResults = index < qualificationLimit
            ? (await Promise.all(makeContactQueries(title, request.location || request.knownTargetCity || '').map((query) => tavilySearch(tavilyApiKey, query, 2)))).flat()
            : [];
        const painResults = index < qualificationLimit
            ? (await Promise.all(makePainQueries(title).map((query) => tavilySearch(tavilyApiKey, query, 2)))).flat()
            : [];
        const snippet = result.content || result.snippet || '';
        const contactSnippets = contactResults.map((contactResult) => contactResult.content || contactResult.snippet || '').filter(Boolean).slice(0, 6);
        const painSnippets = painResults.map((painResult) => painResult.content || painResult.snippet || '').filter(Boolean).slice(0, 6);
        const ownWebsiteResult = [result, ...contactResults].find((candidateResult) => hasOwnWebsite(candidateResult.url || ''));
        const websiteUrl = ownWebsiteResult?.url || result.url || '';
        const content = `${title} ${snippet} ${contactSnippets.join(' ')} ${painSnippets.join(' ')} ${result.url} ${websiteUrl} ${request.knownTargetEmail || ''} ${request.knownTargetNote || ''}`.toLowerCase();
        const possibleEmail = request.knownTargetEmail || content.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] || '';
        const type = inferType(`${content} ${request.accommodationType}`);
        const scoring = scoreCandidate(content, Boolean(result.url || websiteUrl), Boolean(possibleEmail), hasOwnWebsite(websiteUrl), type, [snippet, ...contactSnippets, ...painSnippets].filter(Boolean).length);
        const sourceUrls = [...new Set([websiteUrl, result.url, ...contactResults.map((contactResult) => contactResult.url || '')])]
            .filter(Boolean)
            .filter((url) => !isBlockedAggregator(url) || url === result.url)
            .slice(0, 8);

        candidates.push({
            id: `agent-${index}-${Buffer.from(websiteUrl || result.url || title).toString('base64url').slice(0, 16)}`,
            name: title,
            location: request.location,
            type,
            websiteUrl,
            sourceUrls,
            sourceSnippets: [snippet, ...contactSnippets, ...painSnippets].filter(Boolean),
            possibleEmail,
            signals: scoring.signals,
            risks: scoring.risks,
            leadScore: scoring.leadScore,
            opportunityScore: scoring.opportunityScore,
            opportunityType: scoring.opportunityType,
            automationNeedScore: scoring.automationNeedScore,
            publicMaturityScore: scoring.publicMaturityScore,
            reviewFrictionScore: scoring.reviewFrictionScore,
            fitVerdict: scoring.fitVerdict,
            confidence: scoring.confidence,
            contactMissing: scoring.contactMissing,
            painSignals: scoring.painSignals,
            positiveSolvedSignals: scoring.positiveSolvedSignals,
            noPainReason: scoring.noPainReason,
            targetOffer: scoring.targetOffer,
            offerHypothesis: scoring.offerHypothesis,
            websiteSignals: scoring.websiteSignals,
            contactSignals: scoring.contactSignals,
            missingAutomationSignals: scoring.missingAutomationSignals,
            likelyManualProcessSignals: scoring.likelyManualProcessSignals,
            qualificationReason: scoring.qualificationReason,
            alreadySolvedSignals: scoring.alreadySolvedSignals,
            missingEvidence: scoring.missingEvidence,
            contradictionWarnings: scoring.contradictionWarnings,
            recommendedAngle: inferAngle(content),
            evidenceSummary: `Vytvoreno z Tavily search vysledku/snippetu vcetne kontaktniho enrichmentu a lehkych pain/review dotazu. URL nebyla scrapovana ani automaticky prochazena: ${[snippet, ...contactSnippets, ...painSnippets].join(' ').slice(0, 240)}`,
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
