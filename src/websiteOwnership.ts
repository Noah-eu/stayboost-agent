import type { DirectoryCandidate, SourceUrlClassification, WebsiteExtractedPage, WebsiteOwnershipStatus } from './types';

const normalize = (value = '') => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const assetExtensionPattern = /\.(gif|png|jpe?g|webp|svg|ico|pdf|css|js|map|woff2?)(?:[?#].*)?$/i;
const assetPathPattern = /\/icons?\/|\/assets?\/|\/images?\/|\/img\//i;
const directoryHostPattern = /(^|\.)(katalog|catalog|directory)\.|seznam\.|firmy\.|najisto\./i;
const municipalCatalogPattern = /praha\d*\.cz\/.*(?:katalog|redakce\/index\.php|hlkat)|(?:mesto|mestsk|obec|obecn)[^\n]{0,80}(?:katalog|portal)|oficialni internetove stranky mestske casti|městská část|mestska cast|hlkat|redakce\/index\.php/i;
const directoryContentPattern = /\bkatalog\b|\bdirectory\b|hlkat|redakce\/index\.php|firemn[ií] katalog|seznam firem/i;
const otaPattern = /booking\.com|airbnb\.|google\.|maps\.google\.|tripadvisor\.|expedia\.|agoda\.|trivago\.|slevomat\.|hotelscombined\.|hotels\.com|vrbo\.|hostelworld\.|hrs\.|ebookers\.|kayak\.|momondo\.|skyscanner\.|trip\.com/i;
const binaryPreviewPattern = /^(GIF89a|GIF87a|PNG\r?\n|%PDF-|PNG)/;

const safeUrl = (value = '') => {
    try {
        return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    } catch {
        return null;
    }
};

const withProtocol = (value = '') => /^https?:\/\//i.test(value) ? value : `https://${value}`;

export const isAssetUrl = (value = '') => assetExtensionPattern.test(value) || assetPathPattern.test(value);

export const isAssetPage = (page: Pick<WebsiteExtractedPage, 'url' | 'title' | 'textPreview' | 'contentLength'>) => {
    const titleLooksLikeAsset = assetExtensionPattern.test(page.title || '') || assetPathPattern.test(page.title || '');
    const preview = page.textPreview || '';
    const binaryPreview = binaryPreviewPattern.test(preview) || preview.charCodeAt(0) === 0 || preview.charCodeAt(0) === 65533;
    const tinyBinary = (page.contentLength ?? 0) > 0 && (page.contentLength ?? 0) < 120 && [...preview].some((char) => {
        const code = char.charCodeAt(0);
        return code < 32 && ![9, 10, 13].includes(code);
    });

    return isAssetUrl(page.url) || titleLooksLikeAsset || binaryPreview || tinyBinary;
};

export const classifySourceUrl = (url = '', pageText = ''): SourceUrlClassification => {
    const combined = `${url}\n${pageText}`;
    const parsed = safeUrl(url);
    const host = parsed?.hostname || '';
    const pathname = parsed?.pathname || '';

    if (isAssetUrl(url)) return 'asset-or-file';
    if (otaPattern.test(`${host}${pathname}${url}`)) return 'ota-or-aggregator';
    if (municipalCatalogPattern.test(`${host}${pathname}`) || /praha\d*\.cz/i.test(host) && /(katalog|redakce\/index\.php|hlkat)/i.test(pathname)) return 'municipal-catalog';
    if (directoryHostPattern.test(host)) return 'directory-listing';
    if (parsed && !/\.(gif|png|jpe?g|webp|svg|ico|pdf|css|js|map|woff2?)$/i.test(pathname)) return 'official-property-website';
    if (municipalCatalogPattern.test(combined)) return 'municipal-catalog';
    if (directoryContentPattern.test(combined)) return 'directory-listing';
    return 'unknown';
};

export const ownershipStatusForClassification = (classification: SourceUrlClassification): WebsiteOwnershipStatus => {
    if (classification === 'official-property-website') return 'official';
    if (classification === 'municipal-catalog') return 'municipal-catalog';
    if (classification === 'directory-listing') return 'directory';
    if (classification === 'ota-or-aggregator') return 'aggregator';
    if (classification === 'asset-or-file') return 'asset';
    return 'unknown';
};

export const extractionAllowedForOwnership = (status: WebsiteOwnershipStatus) => status === 'official' || status === 'unknown';

export const ownershipReason = (status: WebsiteOwnershipStatus, url = '') => {
    if (status === 'official') return 'URL nevypadá jako katalog, agregátor ani soubor; může se číst jako kandidát na vlastní web provozu.';
    if (status === 'municipal-catalog') return 'URL nebo obsah odpovídá městskému katalogu / portálu, ne vlastnímu webu ubytování.';
    if (status === 'directory') return 'URL nebo obsah odpovídá katalogu / directory listingu, ne vlastnímu webu ubytování.';
    if (status === 'aggregator') return 'URL odpovídá OTA nebo agregátoru, Website Extractor ji nečte jako vlastní web.';
    if (status === 'asset') return `URL je soubor nebo asset (${url}), nelze ji analyzovat jako web.`;
    return 'Původ URL nejde bezpečně určit; před obchodním výstupem je potřeba ověřit vlastní web.';
};

const emailPattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const phonePattern = /(?:\+\d{1,3}[\s()-]?)?(?:\d[\s()-]?){6,14}\d/;
const websitePattern = /(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/[A-Za-z0-9_./?=&%#-]*)?/;
const addressPattern = /(?:[A-ZÁ-Ž][A-Za-zÁ-ž.-]+(?:\s+[A-ZÁ-Ž]?[A-Za-zÁ-ž.-]+){0,3}\s+\d+\/\d+|[A-ZÁ-Ž][A-Za-zÁ-ž.-]+(?:\s+[A-ZÁ-Ž]?[A-Za-zÁ-ž.-]+){0,3}\s+\d{1,4})/;
const nameStopPattern = /^(tel|telefon|email|e-mail|www|http|kontakt|apartmany|ubytovani|pension|penzion)$/i;

const candidateNameFromSegment = (segment: string) => {
    const beforeEmail = segment.split(emailPattern)[0] || segment;
    const beforePhone = beforeEmail.split(phonePattern)[0] || beforeEmail;
    const beforeWebsite = beforePhone.split(websitePattern)[0] || beforePhone;
    const cleaned = beforeWebsite
        .replace(/[·|•]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^[,;:.-]+|[,;:.-]+$/g, '');
    const parts = cleaned.split(',').map((part) => part.trim()).filter(Boolean);
    const name = parts.find((part) => /pension|penzion|apartm[aá]ny|hotel|ubytov[aá]n[ií]/i.test(part)) || parts[0] || cleaned;

    return name && !nameStopPattern.test(name) ? name.slice(0, 90) : '';
};

const confidenceForCandidate = (candidate: DirectoryCandidate): DirectoryCandidate['confidence'] => {
    const score = [candidate.websiteUrl, candidate.email, candidate.phone, candidate.address].filter(Boolean).length;
    if (score >= 3) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
};

export const extractDirectoryCandidates = (text = '', sourceUrl = ''): DirectoryCandidate[] => {
    const normalizedText = text.replace(/\s+/g, ' ').replace(/\s*·\s*/g, ' · ');
    const chunks = normalizedText.split(/(?=(?:Pension|Penzion|Apartm[aá]ny|Hotel|Ubytov[aá]n[ií])\s+[A-ZÁ-Ž])/g);
    const candidates = chunks.flatMap((chunk) => {
        const searchable = chunk.slice(0, 450);
        const email = searchable.match(emailPattern)?.[0];
        const phone = searchable.match(phonePattern)?.[0]?.trim();
        const website = searchable.match(websitePattern)?.[0];
        const address = searchable.match(addressPattern)?.[0];
        const name = candidateNameFromSegment(searchable);

        if (!name || (!email && !phone && !website)) return [];
        const websiteUrl = website && !emailPattern.test(website) ? withProtocol(website.replace(/[.,;]+$/g, '')) : undefined;
        const candidate: DirectoryCandidate = {
            name,
            websiteUrl,
            email,
            phone,
            address,
            sourceUrl,
            confidence: 'low',
        };
        candidate.confidence = confidenceForCandidate(candidate);
        return [candidate];
    });

    return [...new Map(candidates.map((candidate) => [`${normalize(candidate.name)}|${candidate.email || candidate.websiteUrl || candidate.phone}`, candidate])).values()].slice(0, 12);
};

export const assessWebsiteOwnership = (input: { url?: string; pageText?: string; candidateName?: string; notes?: string; sourceUrls?: string[] }) => {
    const combinedText = [input.pageText, input.notes, ...(input.sourceUrls ?? [])].filter(Boolean).join('\n');
    const classification = classifySourceUrl(input.url || '', combinedText);
    const websiteOwnershipStatus = ownershipStatusForClassification(classification);
    const directoryExtractedCandidates = ['directory', 'municipal-catalog'].includes(websiteOwnershipStatus)
        ? extractDirectoryCandidates(combinedText, input.url || '')
        : [];
    const officialWebsiteCandidateUrl = directoryExtractedCandidates.find((candidate) => candidate.websiteUrl)?.websiteUrl;

    return {
        sourceUrlClassification: classification,
        websiteOwnershipStatus,
        websiteOwnershipReason: ownershipReason(websiteOwnershipStatus, input.url || ''),
        extractionAllowed: extractionAllowedForOwnership(websiteOwnershipStatus),
        officialWebsiteCandidateUrl,
        directoryExtractedCandidates,
    };
};
