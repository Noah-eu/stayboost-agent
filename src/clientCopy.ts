import type { WebsiteExtractionResult } from './types';

const prefixPattern = /^(kontakt|contact|rooms|pokoje)\s*[-:|]\s*/i;

export const forbiddenClientTerms = [
    'Vlastni verejny web provozu',
    'Vlastní veřejný web provozu',
    'Rezervacni nebo poptavkovy kontakt',
    'Rezervační nebo poptávkový kontakt',
    'setup opportunity',
    'setup automation',
    'sourceEvidence',
    'evidenceLimits',
    'fallback',
    'OpenAI',
    'Tavily',
    'Website Extractor',
    'publicSignals',
    'demo-fallback',
    'function_404',
    'aplikace',
    'parser',
    'extrakce',
    'skóre',
    'skore',
    'fitVerdict',
];

const normalizeForMatch = (value = '') => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const trimSentence = (value = '') => value.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');

export function cleanLeadDisplayName(name = '') {
    const withoutPrefix = name.replace(prefixPattern, '').split('|')[0].trim();
    const normalized = normalizeForMatch(withoutPrefix || name);

    if (normalized.includes('pension city center')) {
        return normalized.includes('prague') || normalizeForMatch(name).includes('prague')
            ? 'Pension City Center Prague'
            : 'Pension City Center';
    }

    return (withoutPrefix || name)
        .replace(/\s+/g, ' ')
        .replace(/\s+-\s+$/, '')
        .trim() || 'vybrane ubytovani';
}

export function humanizeSignal(signal = '') {
    const normalized = normalizeForMatch(signal);

    if (!normalized) return '';
    if (normalized.includes('vlastni verejny web provozu')) return 'mají vlastní web';
    if (normalized.includes('rezervacni nebo poptavkovy kontakt')) return 'kontakt je snadno dohledatelný';
    if (normalized.includes('ubytovani popisuje pokoje') || normalized.includes('ubytovani popisuje apartmany')) return 'web popisuje nabídku pokojů';
    if (normalized.includes('na webu je dohledatelny e mail') || normalized.includes('e mail nalezen na vlastnim webu')) return 'e-mail je na webu dobře dostupný';
    if (normalized.includes('na webu je dohledatelny telefon') || normalized.includes('telefon nalezen na vlastnim webu')) return 'telefonický kontakt je vidět';
    if (normalized.includes('neni jasne strukturovana sekce prijezd check in') || normalized.includes('neni jasne videt kompletni predprijezdova orientace')) return 'praktické informace k příjezdu by mohly být lépe soustředěné na jednom místě';
    if (normalized.includes('neni jasne videt parkovani')) return 'informace k parkování nejsou ve veřejné prezentaci výrazně oddělené';
    if (normalized.includes('neni videt faq') || normalized.includes('casto kladene dotazy')) return 'krátká FAQ sekce by mohla hostům ušetřit dotazy';
    if (normalized.includes('kontakt je nalezeny') || normalized.includes('kontakt nalezen')) return 'kontakt je snadno dohledatelný';
    if (normalized.includes('pokoje') || normalized.includes('apartmany')) return 'web popisuje nabídku pokojů';

    return trimSentence(signal)
        .replace(/vlastni/gi, 'vlastní')
        .replace(/verejn/gi, 'veřejn')
        .replace(/ubytovani/gi, 'ubytování')
        .replace(/pokoju/gi, 'pokojů')
        .replace(/prijezd/gi, 'příjezd');
}

export function sanitizeClientText(text = '') {
    let cleaned = text;

    const replacements = [
        ['Vlastni verejny web provozu', 'mají vlastní web'],
        ['Vlastní veřejný web provozu', 'mají vlastní web'],
        ['Rezervacni nebo poptavkovy kontakt je videt', 'kontakt je snadno dohledatelný'],
        ['Rezervační nebo poptávkový kontakt je vidět', 'kontakt je snadno dohledatelný'],
        ['Ubytovani popisuje pokoje nebo apartmany', 'web popisuje nabídku pokojů'],
        ['Ubytování popisuje pokoje nebo apartmány', 'web popisuje nabídku pokojů'],
        ['Na webu je dohledatelny e-mail.', 'e-mail je na webu dobře dostupný.'],
        ['Na webu je dohledatelný e-mail.', 'e-mail je na webu dobře dostupný.'],
        ['Na webu je dohledatelny telefon.', 'telefonický kontakt je vidět.'],
        ['Na webu je dohledatelný telefon.', 'telefonický kontakt je vidět.'],
        ['Na prectenem verejnem webu neni jasne strukturovana sekce prijezd / check-in.', 'praktické informace k příjezdu by mohly být lépe soustředěné na jednom místě.'],
        ['Na přečteném veřejném webu není jasně strukturovaná sekce příjezd / check-in.', 'praktické informace k příjezdu by mohly být lépe soustředěné na jednom místě.'],
        ['Na prectenem verejnem webu neni jasne videt parkovani.', 'informace k parkování nejsou ve veřejné prezentaci výrazně oddělené.'],
        ['Na přečteném veřejném webu není jasně vidět parkování.', 'informace k parkování nejsou ve veřejné prezentaci výrazně oddělené.'],
        ['Na prectenem verejnem webu neni videt FAQ / casto kladene dotazy.', 'krátká FAQ sekce by mohla hostům ušetřit dotazy.'],
        ['Na přečteném veřejném webu není vidět FAQ / často kladené dotazy.', 'krátká FAQ sekce by mohla hostům ušetřit dotazy.'],
    ];

    replacements.forEach(([from, to]) => {
        cleaned = cleaned.split(from).join(to);
    });

    forbiddenClientTerms.forEach((term) => {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        cleaned = cleaned.replace(new RegExp(escaped, 'gi'), '');
    });

    return cleaned
        .replace(/\s+([,.!?;:])/g, '$1')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/ {2,}/g, ' ')
        .replace(/\s+\./g, '.')
        .trim();
}

export function forbiddenTermsFoundInClientOutputs(outputs: string[]) {
    const combined = outputs.join('\n');
    return forbiddenClientTerms.filter((term) => combined.toLowerCase().includes(term.toLowerCase()));
}

export function clientTextSanitizerDiagnostics(outputs: string[]) {
    return {
        clientTextSanitizerApplied: true,
        forbiddenTermsFoundInClientOutputs: forbiddenTermsFoundInClientOutputs(outputs),
    };
}

const bestHumanSignals = (signals: string[], maxItems = 3) => {
    const humanized = signals.map(humanizeSignal).filter(Boolean);
    return [...new Set(humanized)].slice(0, maxItems);
};

export function buildFallbackClientMiniAudit(input: { leadName: string; websiteExtraction?: WebsiteExtractionResult; signals?: string[] }) {
    const displayName = cleanLeadDisplayName(input.leadName);
    const website = input.websiteExtraction;
    const positives = bestHumanSignals([
        ...(input.signals ?? []),
        ...(website?.strengths ?? []),
        ...(website?.websiteSignals ?? []),
        ...(website?.contact.emails.length ? ['Na webu je dohledatelný e-mail.'] : []),
        ...(website?.contact.phones.length ? ['Na webu je dohledatelný telefon.'] : []),
    ]);

    const goodList = positives.length > 0 ? positives : ['mají vlastní web', 'kontakt je snadno dohledatelný', 'web popisuje nabídku pokojů'];

    return sanitizeClientText(`Mini-audit veřejného webu: ${displayName}

První dojem:
Web působí jako funkční prezentace menšího ubytování v centru Prahy. Kontakt i nabídka pokojů jsou dohledatelné.

Co funguje dobře:
${goodList.map((item) => `- ${item}`).join('\n')}

Co bych zlepšil:
- soustředit praktické informace před příjezdem na jedno místo
- doplnit krátkou FAQ sekci
- u kontaktu jasně říct, kdy ho host použije

Další krok:
Poslat 3 konkrétní návrhy, jak by mohla vypadat jednoduchá předpříjezdová sekce.`);
}

export function buildFallbackOutreach(input: { leadName: string; websiteExtraction?: WebsiteExtractionResult; signals?: string[] }) {
    const displayName = cleanLeadDisplayName(input.leadName);
    const positives = bestHumanSignals([...(input.signals ?? []), ...(input.websiteExtraction?.strengths ?? [])], 2);
    const positiveLine = positives.length > 0 ? positives.join(' a ') : 'web má jasně viditelný kontakt a základní informace o pokojích';

    return sanitizeClientText(`Dobrý den,

narazil jsem na web ${displayName}. První dojem působí dobře - ${positiveLine}.

Všiml jsem si jedné drobnosti: praktické informace pro hosty před příjezdem by podle mě šly soustředit víc na jedno místo. Například příjezd, parkování, check-in a nejčastější otázky by mohly být v krátké přehledné sekci.

Nejde o kritiku, spíš o rychlý pohled zvenku. Můžu vám zdarma poslat 3 konkrétní návrhy v bodech?

David`);
}

export function buildFallbackFollowUp(input: { leadName: string }) {
    const displayName = cleanLeadDisplayName(input.leadName);

    return sanitizeClientText(`Dobrý den,

jen krátce navazuji na předchozí zprávu. Šlo mi o pár konkrétních návrhů k webu ${displayName}, hlavně k příjezdu, parkování a častým otázkám hostů.

Pokud to teď není aktuální, vůbec nevadí. Kdyby se vám hodilo, pošlu 3 body zdarma.

David`);
}

export function buildFallbackOffer(input: { leadName: string }) {
    const displayName = cleanLeadDisplayName(input.leadName);

    return sanitizeClientText(`Další krok pro ${displayName}: připravit krátký audit veřejného webu a ukázat 3 konkrétní úpravy předpříjezdové sekce, FAQ a kontaktu pro hosty.`);
}
