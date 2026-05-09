import { classifySourceUrl } from './websiteOwnership';
import type { DirectoryCandidate, Lead, PublicProfileLink, SourceMaterial, SourceUrlClassification } from './types';

export type SelectedExtractionSource = 'official-public-link' | 'user-provided-official-url' | 'directory-candidate' | 'original-url' | 'none';

export interface OfficialWebsiteResolution {
    selectedExtractionUrl: string;
    selectedExtractionReason: string;
    selectedExtractionSource: SelectedExtractionSource;
    originalUrlClassification: SourceUrlClassification;
    officialWebsiteCandidateUrl?: string;
    directoryUrl?: string;
    shouldReextractOfficialWebsite: boolean;
    extractionBlockedReason?: string;
}

const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const directoryClassifications: SourceUrlClassification[] = ['directory-listing', 'municipal-catalog', 'ota-or-aggregator', 'platform-hosted-profile', 'platform-listing'];

const normalizeUrl = (value = '') => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

export const isDiscoverySourceClassification = (classification?: SourceUrlClassification) => directoryClassifications.includes(classification ?? 'unknown');

export const classifyPublicLinkLabel = (url = '') => {
    const classification = classifySourceUrl(url);
    if (classification === 'platform-hosted-profile' || classification === 'platform-listing') return 'Platforma / Hotely.cz profil';
    if (classification === 'directory-listing' || classification === 'municipal-catalog') return 'Katalog / directory';
    if (classification === 'ota-or-aggregator') return 'OTA / agregátor / recenze';
    if (classification === 'official-property-website') return 'Vlastní web';
    return '';
};

const officialUrlFromLinks = (links: PublicProfileLink[] = []) => links
    .map((link) => normalizeUrl(link.url))
    .find((url) => classifySourceUrl(url) === 'official-property-website') ?? '';

const officialUrlFromDirectoryCandidates = (candidates: DirectoryCandidate[] = []) => candidates
    .map((candidate) => normalizeUrl(candidate.websiteUrl ?? ''))
    .find((url) => classifySourceUrl(url) === 'official-property-website') ?? '';

const urlPattern = /(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:\/[A-Za-z0-9_./?=&%#-]*)?/g;
const sourceMaterialUrls = (materials: SourceMaterial[] = []) => {
    const text = materials.flatMap((material) => [material.title, material.content]).join('\n');
    return unique([...text.matchAll(urlPattern)]
        .filter((match) => text[Math.max(0, match.index ?? 0) - 1] !== '@')
        .map((match) => match[0]));
};

const officialUrlFromSourceMaterials = (materials: SourceMaterial[] = []) => sourceMaterialUrls(materials)
    .map(normalizeUrl)
    .find((url) => classifySourceUrl(url) === 'official-property-website') ?? '';

export const resolveOfficialWebsite = (lead: Partial<Lead>): OfficialWebsiteResolution => {
    const originalUrl = normalizeUrl(lead.websiteOrOtaUrl || lead.publicProfileUrl || lead.websiteExtraction?.websiteUrl || '');
    const originalUrlClassification = classifySourceUrl(originalUrl, [lead.notes, lead.websiteExtraction?.summary].filter(Boolean).join('\n'));
    const directoryUrl = isDiscoverySourceClassification(originalUrlClassification) ? originalUrl : undefined;
    const publicLinkCandidate = officialUrlFromLinks(lead.publicLinks ?? []);
    const directoryCandidate = officialUrlFromDirectoryCandidates([...(lead.directoryExtractedCandidates ?? []), ...(lead.websiteExtraction?.directoryExtractedCandidates ?? [])]);
    const sourceMaterialCandidate = officialUrlFromSourceMaterials(lead.sourceMaterials ?? []);
    const manualCandidate = lead.officialWebsiteCandidateUrl || lead.websiteExtraction?.officialWebsiteCandidateUrl || '';
    const officialWebsiteCandidateUrl = manualCandidate || publicLinkCandidate || directoryCandidate || sourceMaterialCandidate || '';

    if (isDiscoverySourceClassification(originalUrlClassification)) {
        if (officialWebsiteCandidateUrl) {
            return {
                selectedExtractionUrl: officialWebsiteCandidateUrl,
                selectedExtractionReason: `Původní URL je katalog/agregátor/platforma; pro analýzu použít oficiální web ${officialWebsiteCandidateUrl}.`,
                selectedExtractionSource: manualCandidate ? 'user-provided-official-url' : publicLinkCandidate ? 'official-public-link' : directoryCandidate ? 'directory-candidate' : sourceMaterialCandidate ? 'user-provided-official-url' : 'directory-candidate',
                originalUrlClassification,
                officialWebsiteCandidateUrl,
                directoryUrl,
                shouldReextractOfficialWebsite: true,
            };
        }

        return {
            selectedExtractionUrl: '',
            selectedExtractionReason: 'Původní URL je katalog/agregátor/platforma a zatím není známý oficiální web provozu.',
            selectedExtractionSource: 'none',
            originalUrlClassification,
            directoryUrl,
            shouldReextractOfficialWebsite: false,
            extractionBlockedReason: 'needs-official-website',
        };
    }

    return {
        selectedExtractionUrl: originalUrl,
        selectedExtractionReason: originalUrl ? 'Původní URL lze použít jako kandidáta na vlastní web.' : 'Není k dispozici URL pro extrakci.',
        selectedExtractionSource: originalUrl ? 'original-url' : 'none',
        originalUrlClassification,
        officialWebsiteCandidateUrl: officialWebsiteCandidateUrl || undefined,
        shouldReextractOfficialWebsite: false,
        extractionBlockedReason: originalUrl ? undefined : 'missing-url',
    };
};
