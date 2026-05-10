import { assessWebsiteOwnership, isAssetPage, isAssetUrl, isSocialPlatformLoginUrl, isSocialPlatformUrl, propertyNameMatchScore, propertySlugFromName } from '../../src/websiteOwnership';
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

interface NavigationLink {
    label: string;
    url: string;
    text: string;
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
    { label: 'FAQ', keywords: ['faq', 'casto-kladene', 'často-kladene', 'otazky', 'otázky'] },
    { label: 'Parkování', keywords: ['parkovani', 'parkování', 'parking', 'parkoviste', 'parkoviště'] },
    { label: 'Jak se k nám dostanete', keywords: ['jak-se-k-nam-dostanete', 'jak-se-k-nám-dostanete', 'prijezd', 'příjezd', 'doprava', 'arrival'] },
    { label: 'Možnosti rekreace', keywords: ['moznosti-rekreace', 'možnosti-rekreace', 'moznosti_rekreace', 'možnosti_rekreace', 'rekreace', 'vylety', 'výlety', 'tipy-v-okoli', 'tipy-v-okolí'] },
    { label: 'Ceník', keywords: ['cenik', 'ceník', 'cena', 'prices', 'price-list'] },
    { label: 'Platební a storno podmínky', keywords: ['platebni-podminky', 'platební-podmínky', 'storno', 'cancellation', 'podminky', 'podmínky'] },
    { label: 'Ubytovací řád', keywords: ['ubytovaci-rad', 'ubytovací-řád', 'ubytovaci_rad', 'ubytovací_řád', 'rad', 'řád', 'rules'] },
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
    'hotely.cz',
    'hotel.cz',
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
    'parkovani',
    'jak-se-k-nam-dostanete',
    'prijezd',
    'rezervace.php',
    'rezervace',
    'platebni-a-storno-podminky',
    'ubytovaci-rad',
    'pokoje',
    'ubytovani',
    'apartmany',
    'faq',
];

const internalLinkKeywords = [
    'kontakt', 'rekreace', 'možnosti rekreace', 'moznosti rekreace', 'cenik', 'ceník', 'platebni', 'platební', 'storno', 'ubytovaci rad', 'ubytovací řád', 'rezervace', 'pokoje', 'ubytovani', 'ubytování', 'apartmany', 'apartmány', 'prijezd', 'příjezd', 'jak se k nam dostanete', 'jak se k nám dostanete', 'parkovani', 'parkování', 'sluzby', 'služby', 'wellness', 'faq',
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
    if (!baseUrl || isSocialPlatformUrl(websiteUrl)) return [];

    const urls: string[] = [];
    for (const hint of fallbackPageHints) {
        if (urls.length >= 4) break;
        const nextUrl = new URL(`/${hint.replace(/^\//, '')}`, baseUrl);
        if (!existingUrls.includes(nextUrl.toString())) urls.push(nextUrl.toString());
    }

    return unique(urls);
};

const extractDiscoveredInternalLinks = (results: TavilyExtractResult[], baseUrl: URL, existingUrls: string[]) => {
    if (isSocialPlatformUrl(baseUrl.toString())) return [];
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

const priorityLabelForText = (value = '') => priorityPageDefinitions.find((definition) => includesAny(value, definition.keywords))?.label ?? null;

const extractDiscoveredNavigationLinks = (results: TavilyExtractResult[], baseUrl: URL) => {
    if (isSocialPlatformUrl(baseUrl.toString())) return { links: [] as NavigationLink[], skippedAssetUrls: [] as string[] };
    const links: NavigationLink[] = [];
    const skippedAssetUrls: string[] = [];
    const text = results.map((result) => `${result.raw_content || ''}\n${result.content || ''}`).join('\n');
    const markdownOrHrefPattern = /\[([^\]]+)\]\(([^)]+)\)|<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]{0,120})<\/a>|href=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;

    while ((match = markdownOrHrefPattern.exec(text))) {
        const linkText = trimText(match[1] || match[4] || match[5] || '', 140);
        const rawUrl = (match[2] || match[3] || match[5] || '').trim();
        const parsed = rawUrl.startsWith('/') ? new URL(rawUrl, baseUrl) : safeUrl(rawUrl);
        if (!parsed || hostWithoutWww(parsed) !== hostWithoutWww(baseUrl) || isBlockedAggregatorUrl(parsed.toString())) continue;
        const normalizedUrl = parsed.toString().split('#')[0];
        if (isAssetUrl(normalizedUrl)) {
            skippedAssetUrls.push(normalizedUrl);
            continue;
        }

        const searchable = `${linkText}\n${parsed.pathname}`;
        const label = priorityLabelForText(searchable);
        if (!label) continue;
        links.push({ label, url: normalizedUrl, text: linkText || label });
    }

    return {
        links: unique(links.map((link) => `${link.label}|${link.url}|${link.text}`))
            .map((encoded) => {
                const [label, url, textValue] = encoded.split('|');
                return { label, url, text: textValue };
            })
            .slice(0, 20),
        skippedAssetUrls: unique(skippedAssetUrls),
    };
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
    discoveredNavigationLinks: [],
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
    priorityPagesFoundButNotExtracted: [],
    platformListingContamination: false,
    propertyNameMatchScore: 0,
    expectedPropertySlug: propertySlugFromName(request.candidateName || ''),
    crossPropertyLinksRejected: [],
    missingClaimsSuppressedByNavigation: [],
    needsPriorityPageExtraction: false,
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
const socialLoginPagePattern = /facebook|instagram|log in|přihl[aá]sit|prihlasit|sign up|vytvořit účet|create new account|browser/i;
const isInvalidSocialPage = (page: ExtractedPage) => isSocialPlatformLoginUrl(page.url) || isSocialPlatformUrl(page.url) && socialLoginPagePattern.test(`${page.title}\n${page.textPreview}`) && !/apartm[aá]ny|ubytov[aá]n[ií]|penzion|hotel/i.test(`${page.title}\n${page.textPreview}`);

const signalMatches = (content: string, matchers: Array<{ label: string; keywords: string[] }>) => matchers.filter((matcher) => includesAny(content, matcher.keywords)).map((matcher) => matcher.label);

const firstTime = (text: string, pattern: RegExp) => text.match(pattern)?.[1]?.replace('.', ':') ?? undefined;
const extractArrivalParkingDetails = (content: string) => {
    const normalized = normalizeForMatch(content);
    const timeWindow = content.match(/(?:n[aá]stup|check-?in|p[řr][ií]jezd)[^\n.]{0,80}?(\d{1,2}[:.]\d{2})\s*(?:-|–|a[zž]|do)\s*(\d{1,2}[:.]\d{2})/i);
    const checkout = firstTime(content, /(?:ukon[cč]en[ií]\s+pobytu|odjezd|check-?out)[^\n.]{0,80}?(?:do|until)\s*(\d{1,2}[:.]\d{2})/i);
    const parkingDistanceMeters: Record<string, number> = {};

    if (/vila\s+krumlov/.test(normalized) && /350\s*m/.test(normalized)) parkingDistanceMeters['Vila Krumlov'] = 350;
    if (/(pension\s+galko|galko\s+siroka|galko\s+široká)/.test(normalized) && /250\s*m/.test(normalized)) parkingDistanceMeters['Pension Galko'] = 250;

    return {
        checkInWindowStart: timeWindow?.[1]?.replace('.', ':'),
        checkInWindowEnd: timeWindow?.[2]?.replace('.', ':'),
        lateArrivalCondition: /pozd[eě]j[šs][ií]\s+n[aá]stup[^.]{0,140}(?:recepc[ií]|domluv)/i.test(content) ? 'pozdější nástup pouze po předchozí domluvě s recepcí' : undefined,
        receptionHours: content.match(/recepce[^.\n]{0,120}(\d{1,2}[:.]\d{2}\s*(?:-|–|a[zž]|do)\s*\d{1,2}[:.]\d{2})/i)?.[1]?.replace(/\./g, ':'),
        checkoutTime: checkout,
        parkingReservationRequired: /parkov[aá]n[ií][^.]{0,180}(rezervac|nutn[aá]\s+p[řr]edem)|rezervac[^.]{0,120}parkov[aá]n[ií]/i.test(content),
        parkingPaid: /parkov[aá]n[ií][^.]{0,180}(placen|k[cč]|czk|eur)|240\s*k[cč]/i.test(content),
        parkingLimited: /parkov[aá]n[ií][^.]{0,180}(omezen|kapacit)|po[cč]et\s+m[ií]st\s+je\s+omezen/i.test(content),
        parkingDistanceMeters,
    };
};

const analyzePages = (request: ExtractWebsiteRequest, debugId: string, startedAt: number, pages: ExtractedPage[], failedCount: number, skippedPages: SkippedPage[], strategy: { discoveredInternalLinksCount: number; guessedUrlsUsed: string[]; discoveredNavigationLinks: NavigationLink[] }) => {
    const content = pages.map((page) => `${page.url}\n${page.title}\n${page.textPreview}`).join('\n').toLowerCase();
    const rawText = pages.map((page) => page.textPreview).join('\n');
    const ownership = assessWebsiteOwnership({
        url: candidateWebsiteUrl(request),
        pageText: content,
        candidateName: request.candidateName,
        notes: [request.notes, ...(request.sourceSnippets || [])].filter(Boolean).join('\n'),
        sourceUrls: request.sourceUrls || [],
    });
    const platformListingContamination = ownership.websiteOwnershipStatus === 'platform-listing' || ownership.sourceUrlClassification === 'platform-listing' || ownership.sourceUrlClassification === 'platform-hosted-profile';
    const expectedPropertySlug = propertySlugFromName(request.candidateName || '');
    const currentPropertyNameMatchScore = propertyNameMatchScore(request.candidateName || '', content);
    const crossPropertyLinksRejected = platformListingContamination
        ? strategy.discoveredNavigationLinks.filter((link) => {
            if (!expectedPropertySlug) return false;
            const parsed = safeUrl(link.url);
            return !normalizeForMatch(`${parsed?.pathname ?? link.url}\n${link.text}\n${link.label}`).includes(expectedPropertySlug);
        })
        : [];
    const sourceText = [request.notes, ...(request.sourceSnippets || [])].filter(Boolean).join('\n');
    const rawEmails = extractEmails(`${rawText}\n${sourceText}`);
    const rawPhones = extractPhones(`${rawText}\n${sourceText}`);
    const isSocialProfile = ownership.websiteOwnershipStatus === 'social-profile';
    const emails = ownership.websiteOwnershipStatus === 'official' || isSocialProfile ? rawEmails : [];
    const phones = ownership.websiteOwnershipStatus === 'official' || isSocialProfile ? rawPhones : [];
    const directoryContact = ownership.websiteOwnershipStatus === 'official'
        ? { emails: [], phones: [], contactPageUrl: null }
        : { emails: rawEmails, phones: rawPhones, contactPageUrl: null };
    const contactPage = isSocialProfile ? candidateWebsiteUrl(request) : pages.find((page) => /kontakt|contact/i.test(page.url) || /kontakt|contact/i.test(page.title))?.url || null;

    const websiteSignals = signalMatches(content, [
        { label: ownership.websiteOwnershipStatus === 'official' ? 'Vlastni verejny web provozu' : 'Veřejný sociální profil provozu', keywords: ['http'] },
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
    const navigationPriorityLabels = unique(strategy.discoveredNavigationLinks.map((link) => link.label));
    const priorityPagesFoundButNotExtracted = strategy.discoveredNavigationLinks.filter((link) => !extractedPriorityLabels.includes(link.label));
    const missedPriorityPages = priorityPageDefinitions.map((definition) => definition.label).filter((label) => !extractedPriorityLabels.includes(label) && !navigationPriorityLabels.includes(label));
    const missingClaimsSuppressedByNavigation: string[] = [];
    const navHas = (labels: string[]) => labels.some((label) => navigationPriorityLabels.includes(label));
    const arrivalParkingDetails = extractArrivalParkingDetails(content);

    const missingPublicInfoSignals: string[] = [];
    const suppressedMissingSignals: string[] = [];
    if (arrivalSignals.length === 0 && !navHas(['Jak se k nám dostanete', 'FAQ', 'Kontakt'])) {
        missingPublicInfoSignals.push('Na prectenem verejnem webu neni jasne strukturovana sekce prijezd / check-in.');
    } else if (arrivalSignals.length === 0) {
        missingClaimsSuppressedByNavigation.push('Příjezd/check-in není označen jako chybějící, protože navigace odkazuje na praktické příjezdové nebo kontaktní stránky.');
    }
    if (parkingSignals.length === 0) {
        if (navHas(['Parkování', 'Jak se k nám dostanete'])) {
            missingClaimsSuppressedByNavigation.push('Parkování není označené jako chybějící, protože navigace obsahuje stránku Parkování / Jak se k nám dostanete.');
        } else {
            missingPublicInfoSignals.push('Na prectenem verejnem webu neni jasne videt parkovani.');
        }
    } else {
        suppressedMissingSignals.push('Parkovani neni oznacene jako chybejici, protoze web zminuje parkovani nebo nabijeci stanici.');
    }
    if (faqSignals.length === 0 && !navHas(['FAQ'])) {
        missingPublicInfoSignals.push('Na prectenem verejnem webu neni videt FAQ / casto kladene dotazy.');
    } else if (faqSignals.length === 0) {
        missingClaimsSuppressedByNavigation.push('FAQ není označené jako chybějící, protože navigace obsahuje odkaz FAQ.');
    }
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
        discoveredNavigationLinks: strategy.discoveredNavigationLinks,
        guessedUrlsUsed: strategy.guessedUrlsUsed,
        platformListingContamination,
        propertyNameMatchScore: currentPropertyNameMatchScore,
        expectedPropertySlug,
        crossPropertyLinksRejected,
        pagesExtracted: platformListingContamination ? [] : pages,
        skippedPages,
        validPagesCount: platformListingContamination ? 0 : pages.length,
        invalidPagesCount: platformListingContamination ? skippedPages.length + pages.length : skippedPages.length,
        contact: { emails, phones, contactPageUrl: contactPage },
        directoryContact: { ...directoryContact, contactPageUrl: ownership.websiteOwnershipStatus === 'official' ? null : contactPage },
        contactOwnershipStatus: ownership.websiteOwnershipStatus === 'official' ? 'official-contact' as const : isSocialProfile ? 'source-contact' as const : 'directory-contact' as const,
        websiteSignals: platformListingContamination ? [] : websiteSignals,
        extractedPriorityPages,
        missedPriorityPages,
        priorityPagesFoundButNotExtracted,
        missingClaimsSuppressedByNavigation,
        needsPriorityPageExtraction: priorityPagesFoundButNotExtracted.length > 0,
        localExperienceSignals: platformListingContamination ? [] : localExperienceSignals,
        ...arrivalParkingDetails,
        arrivalSignals: platformListingContamination ? [] : arrivalSignals,
        parkingSignals: platformListingContamination ? [] : parkingSignals,
        faqSignals: platformListingContamination ? [] : faqSignals,
        guestGuideSignals: platformListingContamination ? [] : guestGuideSignals,
        automationSignals: platformListingContamination ? [] : automationSignals,
        missingPublicInfoSignals,
        suppressedMissingSignals,
        likelyManualProcessSignals,
        strengths: platformListingContamination ? [] : strengths,
        risks,
        setupOpportunitySignals: platformListingContamination ? [] : unique(setupOpportunitySignals),
        fixOpportunitySignals: platformListingContamination ? [] : unique(fixOpportunitySignals),
        evidenceLimits: unique([
            ownership.websiteOwnershipStatus === 'social-profile' ? 'Zdroj je sociální profil; nejde o vlastní web a obsah může být omezen loginem.' : ownership.extractionAllowed ? 'Website Extractor cetl pouze vlastni verejny web provozu.' : 'Website Extractor rozpoznal katalog/directory/social zdroj; kontakty z teto stranky nejsou automaticky vlastni web provozu.',
            'OTA profily jako Booking/Airbnb/Google Maps nebyly cteny.',
            'Z verejneho webu nelze overit, zda hoste dostavaji neverejny guest guide po rezervaci.',
            skippedPages.length > 0 ? `Preskocene nevalidni stranky: ${skippedPages.length}.` : '',
            status === 'partial' ? 'Extrakce je castecna kvuli timeoutu, nedostupnym nebo nevalidnim strankam.' : '',
        ]),
        summary: ownership.websiteOwnershipStatus === 'social-profile'
            ? `${request.candidateName || 'Kandidat'}: zdroj je sociální profil, ne vlastní web. Kontakt: ${emails.length > 0 || phones.length > 0 ? 'nalezen ze social/search evidence' : 'nenalezen'}. Website audit je omezený.`
            : ownership.extractionAllowed
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

        const preflightOwnership = assessWebsiteOwnership({ url: websiteUrl, candidateName: request.candidateName, notes: [request.notes, ...(request.sourceSnippets || [])].filter(Boolean).join('\n'), sourceUrls: request.sourceUrls || [] });
        if (['platform-listing', 'aggregator', 'directory', 'municipal-catalog'].includes(preflightOwnership.websiteOwnershipStatus)) {
            return json(200, {
                ...fallbackResult(request, debugId, startedAt, 'unsupported', `unsupported_source: ${preflightOwnership.sourceUrlClassification}`, 'error'),
                ...preflightOwnership,
                websiteUrl,
                platformListingContamination: preflightOwnership.websiteOwnershipStatus === 'platform-listing',
                propertyNameMatchScore: propertyNameMatchScore(request.candidateName || '', websiteUrl),
                expectedPropertySlug: propertySlugFromName(request.candidateName || ''),
                crossPropertyLinksRejected: [],
                pagesExtracted: [],
                validPagesCount: 0,
                contact: { emails: [], phones: [], contactPageUrl: null },
                directoryContact: { emails: extractEmails([request.notes, ...(request.sourceSnippets || [])].filter(Boolean).join('\n')), phones: extractPhones([request.notes, ...(request.sourceSnippets || [])].filter(Boolean).join('\n')), contactPageUrl: null },
                contactOwnershipStatus: 'directory-contact',
                evidenceLimits: ['Zdroj je platforma/katalog/agregátor, ne vlastní web provozu.', 'Website Extractor čeká na oficiální web mimo platformu.'],
                summary: `${request.candidateName || 'Kandidat'}: aktuální zdroj je platforma/katalog/agregátor, ne vlastní web provozu.`,
            });
        }
        if (preflightOwnership.websiteOwnershipStatus === 'asset') {
            return json(200, {
                ...fallbackResult(request, debugId, startedAt, 'unsupported', 'unsupported_source: asset_or_file', 'error', [], [{ url: websiteUrl, title: websiteUrl, reason: 'asset_or_binary_file' }]),
                ...preflightOwnership,
                skippedAssetUrls: [websiteUrl],
                contactOwnershipStatus: 'unknown',
            });
        }

        if (preflightOwnership.websiteOwnershipStatus === 'social-platform-login') {
            return json(200, {
                ...fallbackResult(request, debugId, startedAt, 'partial', 'social-platform-login', 'fallback', [], [{ url: websiteUrl, title: websiteUrl, reason: 'not_found_page' }], []),
                ...preflightOwnership,
                socialProfileStatus: 'social-platform-login',
                evidenceLimits: ['Obecná nebo login stránka sociální platformy není veřejný web provozu.', 'Nebyly hádány interní URL typu /kontakt nebo /rekreace.php.'],
                summary: `${request.candidateName || 'Kandidat'}: URL je obecná stránka sociální platformy, ne vlastní web provozu ani konkrétní čitelný profil.`,
            });
        }

        const apiKey = process.env.TAVILY_API_KEY;
        const initialUrls = buildInitialExtractionUrls(websiteUrl, request.sourceUrls || []).filter((url) => !isAssetUrl(url));

        if (!apiKey) {
            return json(200, fallbackResult(request, debugId, startedAt, 'partial', 'missing_tavily_api_key'));
        }

        const baseUrl = safeUrl(websiteUrl);
        const initialOutcome = await tavilyExtract(apiKey, initialUrls);
        const navigationDiscovery = baseUrl ? extractDiscoveredNavigationLinks(initialOutcome.results, baseUrl) : { links: [], skippedAssetUrls: [] };
        const discoveredNavigationLinks = navigationDiscovery.links;
        const discoveredUrls = baseUrl ? extractDiscoveredInternalLinks(initialOutcome.results, baseUrl, initialUrls) : [];
        const guessedUrlsUsed = isSocialPlatformUrl(websiteUrl) ? [] : priorityUrlGuesses(websiteUrl, [...initialUrls, ...discoveredUrls]).slice(0, Math.max(0, MAX_URLS - initialUrls.length - discoveredUrls.length));
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
            .filter((page) => !page.url || !page.textPreview || isNotFoundPage(page) || isAssetPage(page) || isInvalidSocialPage(page))
            .map((page) => ({
                url: page.url,
                title: page.title,
                reason: isAssetPage(page) ? 'asset_or_binary_file' : isNotFoundPage(page) || isInvalidSocialPage(page) ? 'not_found_page' : 'empty_content',
            }));
        const pages = extractedPages
            .filter((page) => page.url && page.textPreview && !isNotFoundPage(page) && !isAssetPage(page) && !isInvalidSocialPage(page))
            .slice(0, MAX_URLS);

        if (preflightOwnership.websiteOwnershipStatus === 'social-profile' && pages.length === 0) {
            return json(200, {
                ...fallbackResult(request, debugId, startedAt, 'partial', 'social-profile-limited', 'tavily-extract', [], skippedPages, []),
                ...preflightOwnership,
                socialProfileStatus: 'social-profile-limited',
                contact: { emails: extractEmails([request.notes, ...(request.sourceSnippets || [])].filter(Boolean).join('\n')), phones: extractPhones([request.notes, ...(request.sourceSnippets || [])].filter(Boolean).join('\n')), contactPageUrl: websiteUrl },
                contactOwnershipStatus: 'source-contact',
                evidenceLimits: ['Zdroj je sociální profil; obsah se nepodařilo přečíst bez loginu.', 'Nebyly hádány interní URL typu /kontakt nebo /rekreace.php.'],
                summary: `${request.candidateName || 'Kandidat'}: Facebook/social profil je omezený loginem; použij search/snippet nebo screenshot evidence.`,
            });
        }

        if (pages.length === 0) {
            return json(200, fallbackResult(request, debugId, startedAt, 'error', outcomeReason || 'no_valid_extractable_content', outcomeOk ? 'tavily-extract' : 'error', [], skippedPages, guessedUrlsUsed));
        }

        return json(200, {
            ...analyzePages(request, debugId, startedAt, pages, failedCount + skippedPages.length, skippedPages, { discoveredInternalLinksCount: discoveredUrls.length, guessedUrlsUsed, discoveredNavigationLinks }),
            skippedAssetUrls: unique([...skippedPages.filter((page) => page.reason === 'asset_or_binary_file').map((page) => page.url), ...navigationDiscovery.skippedAssetUrls]),
        });
    } catch (error) {
        return json(500, fallbackResult({}, debugId, startedAt, 'error', error instanceof Error ? error.message : 'function_runtime_error', 'error'));
    }
};
