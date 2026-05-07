declare const process: { env: Record<string, string | undefined> };

type ExtractionStatus = 'completed' | 'partial' | 'unsupported' | 'error';
type ExtractionProvider = 'tavily-extract' | 'fallback' | 'error';

interface ExtractWebsiteRequest {
    candidateId?: string;
    candidateName?: string;
    location?: string;
    websiteUrl?: string;
    sourceUrls?: string[];
    notes?: string;
}

interface ExtractedPage {
    url: string;
    title: string;
    textPreview: string;
    contentLength: number;
}

interface SkippedPage {
    url: string;
    title: string;
    reason: 'not_found_page' | 'empty_content' | 'invalid_content';
}

interface TavilyExtractResult {
    url?: string;
    raw_content?: string;
    content?: string;
    title?: string;
}

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
};

const MAX_FUNCTION_MS = 17500;
const TAVILY_TIMEOUT_MS = 10500;
const MAX_URLS = 8;
const MAX_PREVIEW = 1200;

const blockedAggregatorHosts = [
    'booking.com',
    'airbnb.',
    'google.',
    'maps.google.',
    'tripadvisor.',
    'expedia.',
    'agoda.',
    'trivago.',
    'slevomat.',
    'hotelscombined.',
    'hotels.com',
    'vrbo.',
    'hostelworld.',
    'hrs.',
    'ebookers.',
    'kayak.',
    'momondo.',
    'skyscanner.',
    'trip.com',
];

const pageHints = [
    '',
    'kontakt',
    'contact',
    'pokoje',
    'rooms',
    'apartmany',
    'apartments',
    'faq',
    'casto-kladene-dotazy',
    'prijezd',
    'arrival',
    'check-in',
    'parking',
    'parkovani',
    'rules',
    'house-rules',
];

const json = (statusCode: number, body: unknown) => ({ statusCode, headers, body: JSON.stringify(body) });
const makeDebugId = () => `website-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const elapsed = (startedAt: number) => Date.now() - startedAt;
const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const bounded = (value: number) => Math.max(0, Math.min(100, value));
const includesAny = (value: string, keywords: string[]) => keywords.some((keyword) => value.includes(keyword));
const trimText = (value = '', maxLength = MAX_PREVIEW) => value.replace(/\s+/g, ' ').trim().slice(0, maxLength);

const safeUrl = (value = '') => {
    try {
        const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
        return new URL(withProtocol);
    } catch {
        return null;
    }
};

const hostWithoutWww = (url: URL) => url.hostname.toLowerCase().replace(/^www\./, '');
const isBlockedAggregatorUrl = (value = '') => {
    const parsed = safeUrl(value);
    const host = parsed ? hostWithoutWww(parsed) : value.toLowerCase();
    const fullValue = value.toLowerCase();

    return blockedAggregatorHosts.some((blockedHost) => host.includes(blockedHost) || fullValue.includes(blockedHost));
};

const sameHostUrl = (baseUrl: URL, rawUrl: string) => {
    const parsed = safeUrl(rawUrl);
    return Boolean(parsed && hostWithoutWww(parsed) === hostWithoutWww(baseUrl));
};

const candidateWebsiteUrl = (request: ExtractWebsiteRequest) => {
    const candidates = [request.websiteUrl, ...(request.sourceUrls || [])].filter(Boolean) as string[];
    return candidates.find((url) => !isBlockedAggregatorUrl(url)) || candidates[0] || '';
};

const buildExtractionUrls = (websiteUrl: string, sourceUrls: string[]) => {
    const baseUrl = safeUrl(websiteUrl);
    if (!baseUrl) return [];

    const urls = [baseUrl.toString()];
    for (const sourceUrl of sourceUrls) {
        if (sameHostUrl(baseUrl, sourceUrl) && !isBlockedAggregatorUrl(sourceUrl)) urls.push(safeUrl(sourceUrl)?.toString() || sourceUrl);
    }

    for (const hint of pageHints) {
        if (urls.length >= MAX_URLS) break;
        if (!hint) continue;
        const nextUrl = new URL(`/${hint.replace(/^\//, '')}`, baseUrl);
        urls.push(nextUrl.toString());
    }

    return unique(urls).slice(0, MAX_URLS);
};

const fallbackResult = (request: ExtractWebsiteRequest, debugId: string, startedAt: number, status: ExtractionStatus, reason: string, provider: ExtractionProvider = 'fallback', pages: ExtractedPage[] = [], skippedPages: SkippedPage[] = []) => ({
    provider,
    status,
    websiteUrl: candidateWebsiteUrl(request),
    pagesExtracted: pages,
    skippedPages,
    validPagesCount: pages.length,
    invalidPagesCount: skippedPages.length,
    contact: { emails: [], phones: [], contactPageUrl: null },
    websiteSignals: [],
    arrivalSignals: [],
    parkingSignals: [],
    faqSignals: [],
    guestGuideSignals: [],
    automationSignals: [],
    missingPublicInfoSignals: status === 'unsupported' ? ['Zdroj je OTA/agregator, Website Extractor ho necte.'] : ['Web se nepodarilo precist automaticky.'],
    likelyManualProcessSignals: [],
    strengths: [],
    risks: [reason],
    setupOpportunitySignals: [],
    fixOpportunitySignals: [],
    evidenceLimits: [reason, 'Website Extractor cte pouze vlastni verejne weby provozu.', 'Z verejneho webu nelze overit, zda hoste dostavaji neverejny guest guide po rezervaci.'],
    summary: reason,
    debug: {
        debugId,
        elapsedMs: elapsed(startedAt),
        partial: status === 'partial',
        reason,
    },
});

const extractEmails = (text: string) => unique((text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).map((email) => email.toLowerCase())).slice(0, 8);

export const isLikelyPhoneNumber = (value: string) => {
    const trimmed = value.trim();
    const digits = trimmed.replace(/\D/g, '');
    const normalized = trimmed.toLowerCase();

    if (!trimmed || digits.length < 7) return false;
    if (/\d+\.\d+/.test(trimmed)) return false;
    if (/\b(cz)?\d{8}\b/i.test(trimmed) && !/[+\s()-]/.test(trimmed)) return false;
    if (normalized.includes('ičo') || normalized.includes('ico') || normalized.includes('dič') || normalized.includes('dic') || normalized.includes('vat')) return false;
    if (normalized.includes('latitude') || normalized.includes('longitude') || normalized.includes('gps') || normalized.includes('maps.google.com')) return false;
    if (trimmed.startsWith('+420')) return digits.length === 12;
    if (trimmed.startsWith('+')) return digits.length >= 10 && digits.length <= 15;
    if (!/[\s()-]/.test(trimmed) && digits.length !== 9) return false;

    return digits.length >= 7 && digits.length <= 15;
};

export const phoneExtractionDeterministicChecks = {
    valid: ['+420 311 600 900', '+420311600900', '224920604'].map((value) => ({ value, accepted: isLikelyPhoneNumber(value) })),
    invalid: ['49.937910833333', '14.188455555556', '27156460', 'CZ27156460'].map((value) => ({ value, accepted: isLikelyPhoneNumber(value) })),
};

const contextHasNonPhoneLabel = (context: string) => /latitude|longitude|gps|maps\.google\.com|\bi[čc]o\b|\bdi[čc]\b|\bvat\b/i.test(context);

const extractPhones = (text: string) => unique((text.match(/(?:\+\d{1,3}[\s()-]?)?(?:\d[\s()-]?){6,14}\d/g) || [])
    .map((phone) => phone.replace(/\s+/g, ' ').trim())
    .filter((phone) => {
        const index = text.indexOf(phone);
        const context = index >= 0 ? text.slice(Math.max(0, index - 45), Math.min(text.length, index + phone.length + 45)) : phone;
        return isLikelyPhoneNumber(phone) && !contextHasNonPhoneLabel(context);
    })).slice(0, 8);

const notFoundPagePattern = /str[aá]nka nenalezena|page not found|\b404\b|po[zž]adovan[aá] str[aá]nka nebyla nalezena|not found|str[aá]nka byla p[řr]em[ií]st[eě]na nebo odstran[eě]na/i;
const isNotFoundPage = (page: ExtractedPage) => notFoundPagePattern.test(`${page.title}\n${page.textPreview}`);

const signalMatches = (content: string, matchers: Array<{ label: string; keywords: string[] }>) => matchers.filter((matcher) => includesAny(content, matcher.keywords)).map((matcher) => matcher.label);

const analyzePages = (request: ExtractWebsiteRequest, debugId: string, startedAt: number, pages: ExtractedPage[], failedCount: number, skippedPages: SkippedPage[]) => {
    const content = pages.map((page) => `${page.url}\n${page.title}\n${page.textPreview}`).join('\n').toLowerCase();
    const rawText = pages.map((page) => page.textPreview).join('\n');
    const emails = extractEmails(rawText);
    const phones = extractPhones(rawText);
    const contactPage = pages.find((page) => /kontakt|contact/i.test(page.url) || /kontakt|contact/i.test(page.title))?.url || null;

    const websiteSignals = signalMatches(content, [
        { label: 'Vlastni verejny web provozu', keywords: ['http'] },
        { label: 'Rezervacni nebo poptavkovy kontakt je videt', keywords: ['rezervace', 'reservation', 'book now', 'kontakt', 'contact'] },
        { label: 'Ubytovani popisuje pokoje nebo apartmany', keywords: ['pokoje', 'rooms', 'apartmany', 'apartments', 'ubytovani'] },
    ]);
    const arrivalSignals = signalMatches(content, [
        { label: 'Web obsahuje informace k prijezdu', keywords: ['prijezd', 'arrival', 'jak se k nam dostanete', 'check-in', 'check in'] },
        { label: 'Web zminuje cas check-inu nebo check-outu', keywords: ['check-in', 'check in', 'check-out', 'check out'] },
    ]);
    const parkingSignals = signalMatches(content, [
        { label: 'Web obsahuje parkovani', keywords: ['parkovani', 'parking', 'garage', 'garaz'] },
    ]);
    const faqSignals = signalMatches(content, [
        { label: 'Web obsahuje FAQ nebo casto kladene dotazy', keywords: ['faq', 'casto kladene', 'často kladené', 'otazky', 'questions'] },
    ]);
    const guestGuideSignals = signalMatches(content, [
        { label: 'Web verejne zminuje guest guide nebo pruvodce pro hosty', keywords: ['guest guide', 'pruvodce pro hosty', 'průvodce pro hosty', 'online guide', 'qr guide'] },
    ]);
    const automationSignals = signalMatches(content, [
        { label: 'Web verejne zminuje online check-in nebo self check-in', keywords: ['online check-in', 'self check-in', 'self checkin', 'automaticky check-in', 'keybox', 'schranka na klice'] },
        { label: 'Web zminuje QR nebo digitalni instrukce', keywords: ['qr', 'digitalni', 'digitální', 'online guide'] },
    ]);

    const missingPublicInfoSignals: string[] = [];
    if (arrivalSignals.length === 0) missingPublicInfoSignals.push('Na prectenem verejnem webu neni jasne strukturovana sekce prijezd / check-in.');
    if (parkingSignals.length === 0) missingPublicInfoSignals.push('Na prectenem verejnem webu neni jasne videt parkovani.');
    if (faqSignals.length === 0) missingPublicInfoSignals.push('Na prectenem verejnem webu neni videt FAQ / casto kladene dotazy.');
    if (guestGuideSignals.length === 0) missingPublicInfoSignals.push('Z verejneho webu nelze overit, zda hoste dostavaji neverejny guest guide po rezervaci.');

    const likelyManualProcessSignals = signalMatches(content, [
        { label: 'Maly lokalni provoz / penzion / apartmany', keywords: ['penzion', 'apartmany', 'rodinny', 'rodinný', 'guesthouse', 'pension'] },
        { label: 'Rezervace nebo dotazy pravdepodobne pres telefon/e-mail', keywords: ['volejte', 'napište', 'napiste', 'email', 'e-mail', 'telefon'] },
    ]);
    const strengths = unique([
        ...websiteSignals,
        emails.length > 0 ? 'Na webu je dohledatelny e-mail.' : '',
        phones.length > 0 ? 'Na webu je dohledatelny telefon.' : '',
        arrivalSignals.length > 0 ? 'Prijezd/check-in je na webu alespon castecne popsany.' : '',
        parkingSignals.length > 0 ? 'Parkovani je na webu zminene.' : '',
        faqSignals.length > 0 ? 'FAQ nebo odpovedi hostum jsou verejne strukturovane.' : '',
    ]);
    const setupOpportunitySignals = missingPublicInfoSignals.filter((signal) => !signal.includes('guest guide')).concat(
        likelyManualProcessSignals.length > 0 && (arrivalSignals.length === 0 || faqSignals.length === 0) ? ['Maly provoz s kontaktem a bez jasne verejne struktury praktickych informaci muze byt setup opportunity.'] : [],
    );
    const fixOpportunitySignals = signalMatches(content, [
        { label: 'Web muze mit roztrousene nebo nejasne prakticke informace.', keywords: ['informace', 'kontakt', 'prijezd', 'parkovani'] },
    ]).filter(() => arrivalSignals.length > 0 && (parkingSignals.length === 0 || faqSignals.length === 0));
    const risks = unique([
        failedCount > 0 ? `Nektere URL se nepodarilo extrahovat (${failedCount}).` : '',
        pages.length <= 1 ? 'Prectena je jen mala cast webu.' : '',
        emails.length === 0 ? 'Na prectenem textu neni nalezen e-mail.' : '',
        missingPublicInfoSignals.length > 2 ? 'Prakticke informace pro hosta nejsou na verejnem webu jasne strukturovane.' : '',
    ]);
    const status: ExtractionStatus = pages.length > 0 && (failedCount > 0 || elapsed(startedAt) > MAX_FUNCTION_MS - 2500) ? 'partial' : 'completed';

    return {
        provider: 'tavily-extract' as const,
        status,
        websiteUrl: candidateWebsiteUrl(request),
        pagesExtracted: pages,
        skippedPages,
        validPagesCount: pages.length,
        invalidPagesCount: skippedPages.length,
        contact: { emails, phones, contactPageUrl: contactPage },
        websiteSignals,
        arrivalSignals,
        parkingSignals,
        faqSignals,
        guestGuideSignals,
        automationSignals,
        missingPublicInfoSignals,
        likelyManualProcessSignals,
        strengths,
        risks,
        setupOpportunitySignals: unique(setupOpportunitySignals),
        fixOpportunitySignals: unique(fixOpportunitySignals),
        evidenceLimits: unique([
            'Website Extractor cetl pouze vlastni verejny web provozu.',
            'OTA profily jako Booking/Airbnb/Google Maps nebyly cteny.',
            'Z verejneho webu nelze overit, zda hoste dostavaji neverejny guest guide po rezervaci.',
            skippedPages.length > 0 ? `Preskocene nevalidni stranky: ${skippedPages.length}.` : '',
            status === 'partial' ? 'Extrakce je castecna kvuli timeoutu, nedostupnym nebo nevalidnim strankam.' : '',
        ]),
        summary: `${request.candidateName || 'Kandidat'}: precteno ${pages.length} stranek vlastniho webu. Kontakt: ${emails.length > 0 || phones.length > 0 ? 'nalezen' : 'nenalezen'}. Setup signaly: ${setupOpportunitySignals.length}. Fix signaly: ${fixOpportunitySignals.length}.`,
        debug: {
            debugId,
            elapsedMs: elapsed(startedAt),
            partial: status === 'partial',
            reason: status === 'partial' ? 'partial_extract_or_timeout_guard' : null,
        },
    };
};

const tavilyExtract = async (apiKey: string, urls: string[]) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TAVILY_TIMEOUT_MS);

    try {
        const response = await fetch('https://api.tavily.com/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: apiKey, urls, extract_depth: 'basic', include_images: false }),
            signal: controller.signal,
        });

        if (!response.ok) {
            return { ok: false, results: [] as TavilyExtractResult[], failedCount: urls.length, reason: `tavily_http_${response.status}` };
        }

        const payload = await response.json() as { results?: TavilyExtractResult[]; failed_results?: unknown[] };
        return { ok: true, results: payload.results || [], failedCount: payload.failed_results?.length || 0, reason: null };
    } catch (error) {
        return {
            ok: false,
            results: [] as TavilyExtractResult[],
            failedCount: urls.length,
            reason: error instanceof Error && error.name === 'AbortError' ? 'tavily_extract_timeout' : 'tavily_extract_network_error',
        };
    } finally {
        clearTimeout(timeout);
    }
};

export const handler = async (event: { httpMethod: string; body?: string | null }) => {
    const startedAt = Date.now();
    const debugId = makeDebugId();

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { message: 'Use POST.' });

    try {
        const request = JSON.parse(event.body || '{}') as ExtractWebsiteRequest;
        const websiteUrl = candidateWebsiteUrl(request);

        if (!websiteUrl) {
            return json(400, fallbackResult(request, debugId, startedAt, 'error', 'missing_website_url', 'error'));
        }

        if (isBlockedAggregatorUrl(websiteUrl)) {
            return json(200, {
                ...fallbackResult(request, debugId, startedAt, 'unsupported', 'unsupported_source: ota_or_aggregator', 'error'),
                websiteUrl,
            });
        }

        const apiKey = process.env.TAVILY_API_KEY;
        const urls = buildExtractionUrls(websiteUrl, request.sourceUrls || []);

        if (!apiKey) {
            return json(200, fallbackResult(request, debugId, startedAt, 'partial', 'missing_tavily_api_key'));
        }

        const outcome = await tavilyExtract(apiKey, urls);
        const extractedPages = outcome.results
            .map((result) => {
                const text = result.raw_content || result.content || '';
                return {
                    url: result.url || '',
                    title: trimText(result.title || result.url || 'Website page', 160),
                    textPreview: trimText(text, MAX_PREVIEW),
                    contentLength: text.length,
                };
            })
            .slice(0, MAX_URLS);
        const skippedPages: SkippedPage[] = extractedPages
            .filter((page) => !page.url || !page.textPreview || isNotFoundPage(page))
            .map((page) => ({
                url: page.url,
                title: page.title,
                reason: isNotFoundPage(page) ? 'not_found_page' : 'empty_content',
            }));
        const pages = extractedPages
            .filter((page) => page.url && page.textPreview && !isNotFoundPage(page))
            .slice(0, MAX_URLS);

        if (pages.length === 0) {
            return json(200, fallbackResult(request, debugId, startedAt, 'error', outcome.reason || 'no_valid_extractable_content', outcome.ok ? 'tavily-extract' : 'error', [], skippedPages));
        }

        return json(200, analyzePages(request, debugId, startedAt, pages, outcome.failedCount + skippedPages.length, skippedPages));
    } catch (error) {
        return json(500, fallbackResult({}, debugId, startedAt, 'error', error instanceof Error ? error.message : 'function_runtime_error', 'error'));
    }
};
