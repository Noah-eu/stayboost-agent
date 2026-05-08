import { assessWebsiteOwnership, isAssetPage, isAssetUrl } from '../../src/websiteOwnership';
import { extractValidPhones, isLikelyPhoneNumber } from '../../src/phoneValidation';

declare const process: { env: Record<string, string | undefined> };

type ExtractionStatus = 'completed' | 'partial' | 'unsupported' | 'error';
type ExtractionProvider = 'tavily-extract' | 'fallback' | 'error';

interface ExtractWebsiteRequest {
    candidateId?: string;
    candidateName?: string;
    location?: string;
    websiteUrl?: string;
    sourceUrls?: string[];
    sourceSnippets?: string[];
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
    reason: 'not_found_page' | 'empty_content' | 'invalid_content' | 'asset_or_binary_file';
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

const priorityPageDefinitions = [
    { label: 'Kontakt', keywords: ['kontakt', 'contact'] },
    { label: 'Možnosti rekreace', keywords: ['moznosti-rekreace', 'možnosti-rekreace', 'moznosti_rekreace', 'možnosti_rekreace', 'rekreace', 'vylety', 'výlety', 'tipy-v-okoli', 'tipy-v-okolí'] },
    { label: 'Ceník', keywords: ['cenik', 'ceník', 'cena', 'prices', 'price-list'] },
    { label: 'Rezervace', keywords: ['rezervace', 'reservation', 'booking'] },
    { label: 'Pokoje / apartmány', keywords: ['pokoje', 'pokoj', 'apartmany', 'apartmány', 'ubytovani', 'ubytování', 'rooms', 'apartments', 'accommodation'] },
];

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

const fallbackPageHints = [
    'kontakt',
    'kontakt.php',
    'rekreace.php',
    'moznosti-rekreace',
    'možnosti-rekreace',
    'cenik.php',
    'cenik',
    'rezervace.php',
    'rezervace',
    'pokoje',
    'ubytovani',
    'apartmany',
    'faq',
];

const internalLinkKeywords = [
    'kontakt', 'rekreace', 'možnosti rekreace', 'moznosti rekreace', 'cenik', 'ceník', 'rezervace', 'pokoje', 'ubytovani', 'ubytování', 'apartmany', 'apartmány', 'prijezd', 'příjezd', 'parkovani', 'parkování', 'sluzby', 'služby', 'wellness', 'faq',
    'contact', 'rooms', 'accommodation', 'apartments', 'arrival', 'parking', 'services', 'booking',
];

const json = (statusCode: number, body: unknown) => ({ statusCode, headers, body: JSON.stringify(body) });
const makeDebugId = () => `website-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const elapsed = (startedAt: number) => Date.now() - startedAt;
const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const bounded = (value: number) => Math.max(0, Math.min(100, value));
const normalizeForMatch = (value = '') => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const includesAny = (value: string, keywords: string[]) => {
    const normalizedValue = normalizeForMatch(value);
    return keywords.some((keyword) => normalizedValue.includes(normalizeForMatch(keyword)));
};
const trimText = (value = '', maxLength = MAX_PREVIEW) => value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
const priorityRank = (value = '') => {
    const normalizedValue = normalizeForMatch(value);
    const index = priorityPageDefinitions.findIndex((definition) => definition.keywords.some((keyword) => normalizedValue.includes(normalizeForMatch(keyword))));

    return index === -1 ? priorityPageDefinitions.length : index;
};

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
    return candidates.find((url) => !isBlockedAggregatorUrl(url) && !isAssetUrl(url)) || candidates[0] || '';
};

const originUrl = (url: URL) => `${url.protocol}//${url.host}/`;

const buildInitialExtractionUrls = (websiteUrl: string, sourceUrls: string[]) => {
    const baseUrl = safeUrl(websiteUrl);
    if (!baseUrl) return [];

    const urls = [baseUrl.toString(), originUrl(baseUrl)];
    for (const sourceUrl of sourceUrls) {
        if (sameHostUrl(baseUrl, sourceUrl) && !isBlockedAggregatorUrl(sourceUrl)) urls.push(safeUrl(sourceUrl)?.toString() || sourceUrl);
    }

    return unique(urls).slice(0, 3);
};

const buildFallbackGuessUrls = (websiteUrl: string, existingUrls: string[]) => {
    const baseUrl = safeUrl(websiteUrl);
    if (!baseUrl) return [];

    const urls: string[] = [];
    for (const hint of fallbackPageHints) {
        if (urls.length >= 4) break;
        const nextUrl = new URL(`/${hint.replace(/^\//, '')}`, baseUrl);
        if (!existingUrls.includes(nextUrl.toString())) urls.push(nextUrl.toString());
    }

    return unique(urls);
};

const extractDiscoveredInternalLinks = (results: TavilyExtractResult[], baseUrl: URL, existingUrls: string[]) => {
    const candidates: Array<{ url: string; score: number }> = [];
    const text = results.map((result) => `${result.raw_content || ''}\n${result.content || ''}`).join('\n');
    const linkPattern = /\[[^\]]+\]\(([^)]+)\)|href=["']([^"']+)["']|https?:\/\/[^\s)"']+|\s(\/[A-Za-z0-9_./?=&%#-]+)/g;
    let match: RegExpExecArray | null;

    while ((match = linkPattern.exec(text))) {
        const rawValue = (match[1] || match[2] || match[0] || '').trim().replace(/^\s+/, '');
        const parsed = rawValue.startsWith('/') ? new URL(rawValue, baseUrl) : safeUrl(rawValue);
        if (!parsed || hostWithoutWww(parsed) !== hostWithoutWww(baseUrl) || isBlockedAggregatorUrl(parsed.toString())) continue;

        const normalizedUrl = parsed.toString().split('#')[0];
        if (existingUrls.includes(normalizedUrl)) continue;
        const searchable = `${parsed.pathname} ${rawValue}`.toLowerCase();
        const score = internalLinkKeywords.reduce((sum, keyword) => sum + (searchable.includes(keyword.toLowerCase()) ? 1 : 0), 0);
        if (score > 0) candidates.push({ url: normalizedUrl, score: score * 10 + (priorityPageDefinitions.length - Math.min(priorityRank(searchable), priorityPageDefinitions.length)) });
    }

    return unique(candidates.sort((a, b) => b.score - a.score || priorityRank(a.url) - priorityRank(b.url)).map((candidate) => candidate.url)).slice(0, MAX_URLS - existingUrls.length);
};

const priorityPageLabel = (page: Pick<ExtractedPage, 'url' | 'title'>) => {
    const searchable = `${page.url}\n${page.title}`;
    return priorityPageDefinitions.find((definition) => includesAny(searchable, definition.keywords))?.label ?? null;
};

const priorityUrlGuesses = (websiteUrl: string, existingUrls: string[]) => buildFallbackGuessUrls(websiteUrl, existingUrls)
    .sort((a, b) => priorityRank(a) - priorityRank(b));

const fallbackResult = (request: ExtractWebsiteRequest, debugId: string, startedAt: number, status: ExtractionStatus, reason: string, provider: ExtractionProvider = 'fallback', pages: ExtractedPage[] = [], skippedPages: SkippedPage[] = [], guessedUrlsUsed: string[] = []) => ({
    ...assessWebsiteOwnership({ url: candidateWebsiteUrl(request), notes: [request.notes, ...(request.sourceSnippets || [])].filter(Boolean).join('\n'), sourceUrls: request.sourceUrls || [] }),
    provider,
    status,
    websiteUrl: candidateWebsiteUrl(request),
    extractionStrategy: 'homepage-first' as const,
    discoveredInternalLinksCount: 0,
    guessedUrlsUsed,
    pagesExtracted: pages,
    skippedPages,
    validPagesCount: pages.length,
    invalidPagesCount: skippedPages.length,
    contact: { emails: [], phones: [], contactPageUrl: null },
    directoryContact: { emails: [], phones: [], contactPageUrl: null },
    contactOwnershipStatus: 'unknown' as const,
    websiteSignals: [],
    extractedPriorityPages: [],
    missedPriorityPages: priorityPageDefinitions.map((definition) => definition.label),
    localExperienceSignals: [],
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

export const phoneExtractionDeterministicChecks = {
    valid: ['+420 311 600 900', '+420311600900', 'tel. 224 920 604'].map((value) => ({ value, accepted: isLikelyPhoneNumber(value) })),
    invalid: ['49.937910833333', '14.188455555556', '27156460', 'CZ27156460', '200000005', '200000012-0', '200000019', '92 381 01', '11 256 01', '2016-2026'].map((value) => ({ value, accepted: isLikelyPhoneNumber(value) })),
};

const extractPhones = (text: string) => extractValidPhones(text);

const notFoundPagePattern = /str[aá]nka nenalezena|page not found|\b404\b|po[zž]adovan[aá] str[aá]nka nebyla nalezena|not found|str[aá]nka byla p[řr]em[ií]st[eě]na nebo odstran[eě]na/i;
const isNotFoundPage = (page: ExtractedPage) => notFoundPagePattern.test(`${page.title}\n${page.textPreview}`);

const signalMatches = (content: string, matchers: Array<{ label: string; keywords: string[] }>) => matchers.filter((matcher) => includesAny(content, matcher.keywords)).map((matcher) => matcher.label);

const analyzePages = (request: ExtractWebsiteRequest, debugId: string, startedAt: number, pages: ExtractedPage[], failedCount: number, skippedPages: SkippedPage[], strategy: { discoveredInternalLinksCount: number; guessedUrlsUsed: string[] }) => {
    const content = pages.map((page) => `${page.url}\n${page.title}\n${page.textPreview}`).join('\n').toLowerCase();
    const rawText = pages.map((page) => page.textPreview).join('\n');
    const ownership = assessWebsiteOwnership({
        url: candidateWebsiteUrl(request),
        pageText: content,
        notes: [request.notes, ...(request.sourceSnippets || [])].filter(Boolean).join('\n'),
        sourceUrls: request.sourceUrls || [],
    });
    const rawEmails = extractEmails(rawText);
    const rawPhones = extractPhones(rawText);
    const emails = ownership.websiteOwnershipStatus === 'official' ? rawEmails : [];
    const phones = ownership.websiteOwnershipStatus === 'official' ? rawPhones : [];
    const directoryContact = ownership.websiteOwnershipStatus === 'official'
        ? { emails: [], phones: [], contactPageUrl: null }
        : { emails: rawEmails, phones: rawPhones, contactPageUrl: null };
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
        { label: 'Web zmiňuje parkování', keywords: ['parkoviště', 'parkoviste', 'parkování', 'parkovani', 'parking', 'garage', 'garaz'] },
        { label: 'Web zmiňuje parkování / nabíjecí stanici', keywords: ['nabíjecí stanice', 'nabijeci stanice', 'nabíjení elektromobilů', 'nabijeni elektromobilu', 'elektromobil', 'EV charging', 'charging station'] },
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
    const localExperienceSignals = signalMatches(content, [
        { label: 'historické centrum Českého Krumlova', keywords: ['historicke centrum', 'historickem centru', 'centrum ceskeho krumlova', 'centrum českého krumlova'] },
        { label: 'výhled na hrad a zámek', keywords: ['vyhled na hrad', 'výhled na hrad', 'hrad a zamek', 'hrad a zámek'] },
        { label: 'zahrádka u kanálu od Krumlovského mlýna', keywords: ['zahradka u kanalu', 'zahrádka u kanálu', 'krumlovskeho mlyna', 'krumlovského mlýna'] },
        { label: 'historické prvky domu', keywords: ['hradby', 'tramovy strop', 'trámový strop', 'drevene podlahy', 'dřevěné podlahy'] },
        { label: 'Možnosti rekreace', keywords: ['moznosti rekreace', 'možnosti rekreace', 'rekreace.php'] },
        { label: 'Zámek Český Krumlov', keywords: ['zamek cesky krumlov', 'zámek český krumlov'] },
        { label: 'Fotoateliér Seidl', keywords: ['fotoatelier seidl', 'fotoateliér seidl'] },
        { label: 'muzea', keywords: ['muzea'] },
        { label: 'otáčivé divadlo', keywords: ['otacive divadlo', 'otáčivé divadlo'] },
        { label: 'plavba vorů po Vltavě', keywords: ['plavba voru', 'plavba vorů', 'vltave', 'vltavě'] },
        { label: 'Lipno', keywords: ['lipno'] },
        { label: 'Kleť', keywords: ['klet', 'kleť'] },
        { label: 'Rožmberk', keywords: ['rozmberk', 'rožmberk'] },
        { label: 'Hluboká', keywords: ['hluboka', 'hluboká'] },
        { label: 'Holašovice', keywords: ['holasovice', 'holašovice'] },
    ]);
    const extractedPriorityPages = unique(pages.map((page) => priorityPageLabel(page) ? page.url : '').filter(Boolean));
    const extractedPriorityLabels = unique(pages.map((page) => priorityPageLabel(page) ?? '').filter(Boolean));
    const missedPriorityPages = priorityPageDefinitions.map((definition) => definition.label).filter((label) => !extractedPriorityLabels.includes(label));

    const missingPublicInfoSignals: string[] = [];
    const suppressedMissingSignals: string[] = [];
    if (arrivalSignals.length === 0) missingPublicInfoSignals.push('Na prectenem verejnem webu neni jasne strukturovana sekce prijezd / check-in.');
    if (parkingSignals.length === 0) {
        missingPublicInfoSignals.push('Na prectenem verejnem webu neni jasne videt parkovani.');
    } else {
        suppressedMissingSignals.push('Parkovani neni oznacene jako chybejici, protoze web zminuje parkovani nebo nabijeci stanici.');
    }
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
        parkingSignals.length > 0 ? 'Web zmiňuje parkování / nabíjecí stanici.' : '',
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
        ...ownership,
        provider: 'tavily-extract' as const,
        status,
        websiteUrl: candidateWebsiteUrl(request),
        extractionStrategy: 'homepage-first' as const,
        discoveredInternalLinksCount: strategy.discoveredInternalLinksCount,
        guessedUrlsUsed: strategy.guessedUrlsUsed,
        pagesExtracted: pages,
        skippedPages,
        validPagesCount: pages.length,
        invalidPagesCount: skippedPages.length,
        contact: { emails, phones, contactPageUrl: contactPage },
        directoryContact: { ...directoryContact, contactPageUrl: ownership.websiteOwnershipStatus === 'official' ? null : contactPage },
        contactOwnershipStatus: ownership.websiteOwnershipStatus === 'official' ? 'official-contact' as const : 'directory-contact' as const,
        websiteSignals,
        extractedPriorityPages,
        missedPriorityPages,
        localExperienceSignals,
        arrivalSignals,
        parkingSignals,
        faqSignals,
        guestGuideSignals,
        automationSignals,
        missingPublicInfoSignals,
        suppressedMissingSignals,
        likelyManualProcessSignals,
        strengths,
        risks,
        setupOpportunitySignals: unique(setupOpportunitySignals),
        fixOpportunitySignals: unique(fixOpportunitySignals),
        evidenceLimits: unique([
            ownership.extractionAllowed ? 'Website Extractor cetl pouze vlastni verejny web provozu.' : 'Website Extractor rozpoznal katalog/directory; kontakty z teto stranky nejsou kontakty provozu.',
            'OTA profily jako Booking/Airbnb/Google Maps nebyly cteny.',
            'Z verejneho webu nelze overit, zda hoste dostavaji neverejny guest guide po rezervaci.',
            skippedPages.length > 0 ? `Preskocene nevalidni stranky: ${skippedPages.length}.` : '',
            status === 'partial' ? 'Extrakce je castecna kvuli timeoutu, nedostupnym nebo nevalidnim strankam.' : '',
        ]),
        summary: ownership.extractionAllowed
            ? `${request.candidateName || 'Kandidat'}: přečteny ${pages.length} validní stránky vlastního webu, ${skippedPages.length} neplatné/404 stránky přeskočeny. Kontakt: ${emails.length > 0 || phones.length > 0 ? 'nalezen' : 'nenalezen'}. Setup signály: ${setupOpportunitySignals.length}. Fix signály: ${fixOpportunitySignals.length}.`
            : `${request.candidateName || 'Kandidat'}: zdroj vypadá jako katalog/directory, ne vlastní web provozu. Kontakty z katalogu nebyly použity jako kontakt leadu.`,
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

        const preflightOwnership = assessWebsiteOwnership({ url: websiteUrl, notes: [request.notes, ...(request.sourceSnippets || [])].filter(Boolean).join('\n'), sourceUrls: request.sourceUrls || [] });
        if (preflightOwnership.websiteOwnershipStatus === 'asset') {
            return json(200, {
                ...fallbackResult(request, debugId, startedAt, 'unsupported', 'unsupported_source: asset_or_file', 'error', [], [{ url: websiteUrl, title: websiteUrl, reason: 'asset_or_binary_file' }]),
                ...preflightOwnership,
                skippedAssetUrls: [websiteUrl],
                contactOwnershipStatus: 'unknown',
            });
        }

        const apiKey = process.env.TAVILY_API_KEY;
        const initialUrls = buildInitialExtractionUrls(websiteUrl, request.sourceUrls || []).filter((url) => !isAssetUrl(url));

        if (!apiKey) {
            return json(200, fallbackResult(request, debugId, startedAt, 'partial', 'missing_tavily_api_key'));
        }

        const baseUrl = safeUrl(websiteUrl);
        const initialOutcome = await tavilyExtract(apiKey, initialUrls);
        const discoveredUrls = baseUrl ? extractDiscoveredInternalLinks(initialOutcome.results, baseUrl, initialUrls) : [];
        const guessedUrlsUsed = priorityUrlGuesses(websiteUrl, [...initialUrls, ...discoveredUrls]).slice(0, Math.max(0, MAX_URLS - initialUrls.length - discoveredUrls.length));
        const secondaryUrls = [...discoveredUrls, ...guessedUrlsUsed].filter((url) => !isAssetUrl(url)).slice(0, Math.max(0, MAX_URLS - initialUrls.length));
        const secondaryOutcome = secondaryUrls.length > 0 && elapsed(startedAt) < MAX_FUNCTION_MS - 4500
            ? await tavilyExtract(apiKey, secondaryUrls)
            : { ok: true, results: [] as TavilyExtractResult[], failedCount: 0, reason: null };
        const allResults = [...initialOutcome.results, ...secondaryOutcome.results];
        const failedCount = initialOutcome.failedCount + secondaryOutcome.failedCount;
        const outcomeReason = initialOutcome.reason || secondaryOutcome.reason;
        const outcomeOk = initialOutcome.ok || secondaryOutcome.ok;
        const extractedPages = allResults
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
            .filter((page) => !page.url || !page.textPreview || isNotFoundPage(page) || isAssetPage(page))
            .map((page) => ({
                url: page.url,
                title: page.title,
                reason: isAssetPage(page) ? 'asset_or_binary_file' : isNotFoundPage(page) ? 'not_found_page' : 'empty_content',
            }));
        const pages = extractedPages
            .filter((page) => page.url && page.textPreview && !isNotFoundPage(page) && !isAssetPage(page))
            .slice(0, MAX_URLS);

        if (pages.length === 0) {
            return json(200, fallbackResult(request, debugId, startedAt, 'error', outcomeReason || 'no_valid_extractable_content', outcomeOk ? 'tavily-extract' : 'error', [], skippedPages, guessedUrlsUsed));
        }

        return json(200, {
            ...analyzePages(request, debugId, startedAt, pages, failedCount + skippedPages.length, skippedPages, { discoveredInternalLinksCount: discoveredUrls.length, guessedUrlsUsed }),
            skippedAssetUrls: skippedPages.filter((page) => page.reason === 'asset_or_binary_file').map((page) => page.url),
        });
    } catch (error) {
        return json(500, fallbackResult({}, debugId, startedAt, 'error', error instanceof Error ? error.message : 'function_runtime_error', 'error'));
    }
};
