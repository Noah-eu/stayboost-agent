export type PhoneSource = 'website' | 'website-and-discovery' | 'discovery-fallback' | 'missing';

const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

const nonPhoneContextPattern = /latitude|longitude|gps|maps\.google\.com|\bi[čc]o\b|\bico\b|\bdi[čc]\b|\bdic\b|\bvat\b|copyright|©|all rights reserved|adresa|address|ps[čc]|postal|obec|firma|company|booking|roomid|hotelid|propertyid|data-|href=|src=/i;
const phoneContextPattern = /telefon|tel\.?|phone|call|mobil|mobile|kontakt|contact|recepce|reservation|rezervace/i;
const phoneCandidatePattern = /(?:\+\d{1,3}[\s()-]?)?(?:\d[\s()-]?){6,14}\d/g;

const normalizeSpaces = (value: string) => value.replace(/\s+/g, ' ').trim();

export const normalizePhoneDisplay = (value: string) => normalizeSpaces(value);

export const phoneDigits = (value: string) => value.replace(/\D/g, '');

export const isLikelyPhoneNumber = (value: string, context = '') => {
    const trimmed = normalizeSpaces(value);
    const digits = phoneDigits(trimmed);
    const combinedContext = `${context}\n${trimmed}`;

    if (!trimmed) return false;
    if (/\d{4}\s*-\s*\d{2,4}/.test(trimmed)) return false;
    if (/\d+\.\d+/.test(trimmed)) return false;
    if (/^2000000\d{2,3}$/.test(digits)) return false;
    if (/\b(cz)?\d{8}\b/i.test(trimmed) && !/[+\s()-]/.test(trimmed)) return false;

    if (trimmed.startsWith('+420')) return digits.length === 12 && /^[2-7]/.test(digits.slice(3));
    if (trimmed.startsWith('+')) return digits.length >= 10 && digits.length <= 15;
    if (nonPhoneContextPattern.test(combinedContext)) return false;
    if (digits.length !== 9) return false;
    if (!/^[2-7]/.test(digits)) return false;

    const compactPlain = !/[+\s()-]/.test(trimmed);
    return !compactPlain || phoneContextPattern.test(combinedContext);
};

export const extractPhoneCandidates = (text = '') => (text.match(phoneCandidatePattern) || [])
    .map(normalizePhoneDisplay)
    .filter(Boolean);

export const extractValidPhones = (text = '') => unique(extractPhoneCandidates(text).filter((phone) => {
    const index = text.indexOf(phone);
    const context = index >= 0 ? text.slice(Math.max(0, index - 60), Math.min(text.length, index + phone.length + 60)) : phone;
    return isLikelyPhoneNumber(phone, context);
})).slice(0, 8);

export const extractRejectedPhones = (text = '') => unique(extractPhoneCandidates(text).filter((phone) => {
    const index = text.indexOf(phone);
    const context = index >= 0 ? text.slice(Math.max(0, index - 60), Math.min(text.length, index + phone.length + 60)) : phone;
    return !isLikelyPhoneNumber(phone, context);
})).slice(0, 12);

export const mergePhones = (...groups: string[][]) => unique(groups.flat().map(normalizePhoneDisplay));
