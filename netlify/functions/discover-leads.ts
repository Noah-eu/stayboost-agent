type OfferAngle = 'main-photo' | 'photo-order' | 'description' | 'reviews' | 'guest-communication' | 'guest-guide';

declare const process: { env: Record<string, string | undefined> };
declare const Buffer: { from(value: string): { toString(encoding: string): string } };

type AccommodationType = 'Hotel' | 'Penzion' | 'Apartman' | 'Glamping' | 'Jine';
type FitVerdict = 'strong-opportunity' | 'moderate-opportunity' | 'weak-opportunity' | 'not-enough-evidence' | 'skip';
type Confidence = 'low' | 'medium' | 'high';

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

const scoreCandidate = (content: string, hasUrl: boolean, hasEmail: boolean, type: AccommodationType, snippetCount: number) => {
    const signals: string[] = [];
    const risks: string[] = [];
    const alreadySolvedSignals: string[] = [];
    const missingEvidence: string[] = [];
    const contradictionWarnings: string[] = [];
    let score = 0;
    let opportunityScore = 0;

    if (hasUrl) {
        score += 12;
        signals.push('Verejny web nebo verejny vysledek hledani');
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

    const hasSolvedCheckIn = includesAny(content, ['pohodlny online check-in', 'online check-in', 'self check-in', 'self checkin', 'keybox', 'bez recepce', 'automaticky check-in']);
    const hasCheckInPain = includesAny(content, ['nejasny check-in', 'problem s check-in', 'tezke najit vstup', 'unclear check-in', 'hard to find entrance', 'spatne instrukce']);

    if (hasSolvedCheckIn) {
        score += 14;
        signals.push('Self check-in / keybox / bez recepce');
        alreadySolvedSignals.push('Zdroj naznacuje, ze online/self check-in je uz pravdepodobne vyreseny');
        contradictionWarnings.push('Nedoporucovat obecne zavadet nebo zlepsovat self check-in bez konkretniho problemoveho signalu');
    }

    if (includesAny(content, ['parking', 'parkovani'])) {
        score += 10;
        signals.push('Parkovani');
    }

    if (includesAny(content, ['apartmany', 'apartments', 'vice jednotek', 'rooms'])) {
        score += 8;
        signals.push('Vice jednotek nebo apartmanovy provoz');
    }

    if (hasCheckInPain || includesAny(content, ['unclear', 'nejasn', 'hard to find', 'tezke najit', 'problem', 'stiznost', 'review mentions', 'complaint'])) {
        score += 14;
        signals.push('Snippet zminuje provozni tema nebo mozne treni hosta');
        opportunityScore += 28;
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
    }

    if (alreadySolvedSignals.length > 0 && !hasCheckInPain) {
        missingEvidence.push('Neni konkretni dukaz, ze check-in nebo predprijezdove instrukce jsou problem');
        opportunityScore -= 10;
    }

    if (hasEmail) opportunityScore += 14;
    if (['Apartman', 'Penzion'].includes(type)) opportunityScore += 12;
    if (risks.length === 0 && alreadySolvedSignals.length > 0) opportunityScore -= 10;

    const boundedLeadScore = Math.max(0, Math.min(100, score));
    const boundedOpportunityScore = Math.max(0, Math.min(100, opportunityScore));
    const confidence: Confidence = snippetCount <= 1 ? 'low' : boundedOpportunityScore >= 60 ? 'medium' : 'low';
    const fitVerdict: FitVerdict = !hasUrl || includesAny(content, ['marriott', 'hilton', 'accor'])
        ? 'skip'
        : boundedOpportunityScore >= 70 && hasEmail
            ? 'strong-opportunity'
            : boundedOpportunityScore >= 50 && hasEmail
                ? 'moderate-opportunity'
                : snippetCount <= 1
                    ? 'not-enough-evidence'
                    : 'weak-opportunity';

    return {
        leadScore: boundedLeadScore,
        opportunityScore: boundedOpportunityScore,
        fitVerdict,
        confidence,
        contactMissing: !hasEmail,
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
            opportunityScore: 34,
            fitVerdict: 'not-enough-evidence',
            confidence: 'low',
            contactMissing: false,
            alreadySolvedSignals: ['Demo snippet rika, ze self check-in a keybox uz existuji'],
            missingEvidence: ['Demo fallback nema realny problemovy signal'],
            contradictionWarnings: ['Nedoporucovat zavadet self check-in, kdyz snippet tvrdi, ze existuje'],
            recommendedAngle: 'guest-guide',
            evidenceSummary: 'Demo kandidat z fallback rezimu; URL nebyla automaticky ctena.',
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
        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: tavilyApiKey, query, max_results: Math.max(1, Math.min(5, request.maxResults || 5)), search_depth: 'basic' }),
        });
        const payload = await response.json() as { results?: SearchResult[] };
        results.push(...(payload.results || []));
    }

    const seen = new Set<string>();
    const candidates = results
        .filter((result) => result.url && !seen.has(result.url) && seen.add(result.url))
        .slice(0, Math.max(1, Math.min(20, request.maxResults || 10)))
        .map((result, index) => {
            const snippet = result.content || result.snippet || '';
            const title = result.title || `Lead kandidat ${index + 1}`;
            const content = `${title} ${snippet} ${result.url}`.toLowerCase();
            const possibleEmail = content.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i)?.[0] || '';
            const type = inferType(content);
            const scoring = scoreCandidate(content, Boolean(result.url), Boolean(possibleEmail), type, [snippet].filter(Boolean).length);

            return {
                id: `agent-${index}-${Buffer.from(result.url || title).toString('base64url').slice(0, 16)}`,
                name: title,
                location: request.location,
                type,
                websiteUrl: result.url || '',
                sourceUrls: result.url ? [result.url] : [],
                sourceSnippets: [snippet].filter(Boolean),
                possibleEmail,
                signals: scoring.signals,
                risks: scoring.risks,
                leadScore: scoring.leadScore,
                opportunityScore: scoring.opportunityScore,
                fitVerdict: scoring.fitVerdict,
                confidence: scoring.confidence,
                contactMissing: scoring.contactMissing,
                alreadySolvedSignals: scoring.alreadySolvedSignals,
                missingEvidence: scoring.missingEvidence,
                contradictionWarnings: scoring.contradictionWarnings,
                recommendedAngle: inferAngle(content),
                evidenceSummary: `Vytvoreno z Tavily search vysledku/snippetu. URL nebyla scrapovana ani automaticky prochazena: ${snippet.slice(0, 240)}`,
                isMock: false,
            };
        });

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
