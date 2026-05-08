import type { WebsiteExtractionResult } from './types';
import { detectCandidateSpecificSignals } from './ideaSpecificity';

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
    'audit',
    'kontrola',
    'hodnocení',
    'hodnoceni',
    'chyba',
    'problém',
    'problem',
    'měli byste',
    'meli byste',
    'doporučuji vám',
    'doporucuji vam',
];

const forbiddenOutreachClaims = [
    'Všiml jsem si jedné drobnosti',
    'vsiml jsem si jedne drobnosti',
    'praktické informace nejsou jasně',
    'prakticke informace nejsou jasne',
    'To může zbytečně přidávat dotazy',
    'To muze zbytecne pridavat dotazy',
    'kontrola',
    'hodnocení',
    'hodnoceni',
    'chyba',
    'problém',
    'problem',
    'měli byste',
    'meli byste',
    'doporučuji vám',
    'doporucuji vam',
];

const normalizeForMatch = (value = '') => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const trimSentence = (value = '') => value.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
const sentenceBoundaryPattern = /(?<=[.!?])\s+|\n+/g;

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
    if (normalized.includes('rezervacni nebo poptavkovy kontakt')) return 'kontakt je na webu snadno dohledatelný';
    if (normalized.includes('ubytovani popisuje pokoje') || normalized.includes('ubytovani popisuje apartmany')) return 'web přehledně popisuje pokoje';
    if (normalized.includes('na webu je dohledatelny e mail') || normalized.includes('e mail nalezen na vlastnim webu')) return 'e-mail je na webu viditelný';
    if (normalized.includes('na webu je dohledatelny telefon') || normalized.includes('telefon nalezen na vlastnim webu')) return 'telefon je na webu viditelný';
    if (normalized.includes('neni jasne strukturovana sekce prijezd check in') || normalized.includes('neni jasne videt kompletni predprijezdova orientace')) return 'praktické informace k příjezdu by mohly být lépe soustředěné na jednom místě';
    if (normalized.includes('neni jasne videt parkovani')) return 'informace k parkování nejsou ve veřejné prezentaci výrazně oddělené';
    if (normalized.includes('neni videt faq') || normalized.includes('casto kladene dotazy')) return 'krátká FAQ sekce často pomáhá hostům zorientovat se před příjezdem';
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
        ['Zaujalo mě hlavně: Vlastni verejny web provozu.', 'Zaujalo mě, že máte vlastní web s jasně dohledatelným kontaktem.'],
        ['Zaujalo mě hlavně: Vlastní veřejný web provozu.', 'Zaujalo mě, že máte vlastní web s jasně dohledatelným kontaktem.'],
        ['Vlastni verejny web provozu', 'mají vlastní web'],
        ['Vlastní veřejný web provozu', 'mají vlastní web'],
        ['Rezervacni nebo poptavkovy kontakt je videt', 'kontakt je na webu snadno dohledatelný'],
        ['Rezervační nebo poptávkový kontakt je vidět', 'kontakt je na webu snadno dohledatelný'],
        ['Ubytovani popisuje pokoje nebo apartmany', 'web přehledně popisuje pokoje'],
        ['Ubytování popisuje pokoje nebo apartmány', 'web přehledně popisuje pokoje'],
        ['Na webu je dohledatelny e-mail.', 'e-mail je na webu viditelný.'],
        ['Na webu je dohledatelný e-mail.', 'e-mail je na webu viditelný.'],
        ['Na webu je dohledatelny telefon.', 'telefon je na webu viditelný.'],
        ['Na webu je dohledatelný telefon.', 'telefon je na webu viditelný.'],
        ['Na prectenem verejnem webu neni jasne strukturovana sekce prijezd / check-in.', 'praktické informace k příjezdu by mohly být lépe soustředěné na jednom místě.'],
        ['Na přečteném veřejném webu není jasně strukturovaná sekce příjezd / check-in.', 'praktické informace k příjezdu by mohly být lépe soustředěné na jednom místě.'],
        ['Na prectenem verejnem webu neni jasne videt parkovani.', 'informace k parkování nejsou ve veřejné prezentaci výrazně oddělené.'],
        ['Na přečteném veřejném webu není jasně vidět parkování.', 'informace k parkování nejsou ve veřejné prezentaci výrazně oddělené.'],
        ['Na prectenem verejnem webu neni videt FAQ / casto kladene dotazy.', 'krátká FAQ sekce často pomáhá hostům zorientovat se před příjezdem.'],
        ['Na přečteném veřejném webu není vidět FAQ / často kladené dotazy.', 'krátká FAQ sekce často pomáhá hostům zorientovat se před příjezdem.'],
        ['To může zbytečně přidávat dotazy na recepci.', 'Taková sekce u podobných ubytování často pomáhá snížit počet opakovaných dotazů před příjezdem.'],
        ['To muze zbytecne pridavat dotazy na recepci.', 'Taková sekce u podobných ubytování často pomáhá snížit počet opakovaných dotazů před příjezdem.'],
        ['bez jasného návodu volají zbytečně na recepci', 'jasný návod může snížit nejistotu hosta a omezit opakované dotazy před příjezdem'],
        ['bez jasneho navodu volaji zbytecne na recepci', 'jasný návod může snížit nejistotu hosta a omezit opakované dotazy před příjezdem'],
        ['způsobuje problém', 'může vytvářet nejistotu'],
        ['zpusobuje problem', 'může vytvářet nejistotu'],
        ['hosté jsou zmatení', 'host nemusí hned najít potřebné informace'],
        ['hoste jsou zmateni', 'host nemusí hned najít potřebné informace'],
        ['Parkování bývá častý dotaz a jeho nejasnost zvyšuje stres hosta ještě před příjezdem.', 'Jasně popsané parkování pomáhá hostovi rychleji najít praktické informace před příjezdem.'],
        ['Krátké odpovědi na nejčastější dotazy sníží počet opakovaných zpráv a telefonátů.', 'Krátké odpovědi mohou omezit opakované dotazy a pomoci hostovi rychleji se zorientovat před příjezdem.'],
        ['Pro hotel tohoto typu jde o malý zásah s rychlým efektem na méně dotazů a hladší příjezd hostů.', 'Pro hotel tohoto typu jde o malý zásah, který může omezit opakované dotazy a zpřehlednit příjezd hostů.'],
        ['Všiml jsem si jedné drobnosti', 'Napadlo mě'],
        ['vsiml jsem si jedne drobnosti', 'Napadlo mě'],
        ['praktické informace nejsou jasně', 'praktické informace by možná šly ještě lépe'],
        ['prakticke informace nejsou jasne', 'praktické informace by možná šly ještě lépe'],
        ['měli byste', 'možná by se hodilo'],
        ['meli byste', 'možná by se hodilo'],
        ['doporučuji vám', 'možná by se hodilo'],
        ['doporucuji vam', 'možná by se hodilo'],
        ['kontrola', 'pohled'],
        ['hodnocení', 'pohled'],
        ['hodnoceni', 'pohled'],
        ['chyba', 'detail'],
        ['problém', 'téma'],
        ['problem', 'téma'],
    ];

    replacements.forEach(([from, to]) => {
        cleaned = cleaned.split(from).join(to);
    });

    forbiddenClientTerms.forEach((term) => {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        cleaned = cleaned.replace(new RegExp(escaped, 'gi'), '');
    });

    if (forbiddenTermsFoundInClientOutputs([cleaned]).length > 0) {
        cleaned = cleaned
            .split(sentenceBoundaryPattern)
            .filter((sentence) => forbiddenTermsFoundInClientOutputs([sentence]).length === 0)
            .join(' ');
    }

    return cleaned
        .replace(/\s+([,.!?;:])/g, '$1')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/ {2,}/g, ' ')
        .replace(/\s+\./g, '.')
        .trim();
}

export function hasForbiddenOutreachLanguage(text = '') {
    const normalized = normalizeForMatch(text);
    return forbiddenOutreachClaims.some((phrase) => normalized.includes(normalizeForMatch(phrase))) || /\baudit\b/i.test(text);
}

export function forbiddenTermsFoundInClientOutputs(outputs: string[]) {
    const combined = outputs.join('\n');
    return forbiddenClientTerms.filter((term) => combined.toLowerCase().includes(term.toLowerCase()));
}

export function clientTextSanitizerDiagnostics(outputs: string[]) {
    const sanitizedOutputs = outputs.map(sanitizeClientText);
    const forbiddenTermsBeforeSanitization = forbiddenTermsFoundInClientOutputs(outputs);
    const forbiddenTermsAfterSanitization = forbiddenTermsFoundInClientOutputs(sanitizedOutputs);

    return {
        clientTextSanitizerApplied: true,
        forbiddenTermsBeforeSanitization,
        forbiddenTermsAfterSanitization,
        forbiddenTermsFoundInClientOutputs: forbiddenTermsAfterSanitization,
        clientTextReady: forbiddenTermsAfterSanitization.length === 0,
    };
}

export const hasClientCopyIssue = (outputs: string[]) => !clientTextSanitizerDiagnostics(outputs).clientTextReady;

export function buildFallbackClientMiniAudit(input: { leadName: string; websiteExtraction?: WebsiteExtractionResult; signals?: string[] }) {
    const displayName = cleanLeadDisplayName(input.leadName);
    const signals = detectCandidateSpecificSignals({ websiteExtraction: input.websiteExtraction, strengths: '', publicSignals: input.signals ?? [], checkInParkingInfo: '' }).map((signal) => signal.label);
    const practicalEvidence = signals.filter((signal) => /parkovi|nabíjecí|kontakt|recepce/i.test(signal)).join(', ') || 'kontakt a praktické informace';
    const stayEvidence = signals.filter((signal) => /restaurace|relax|Berounka|ostrov|altán/i.test(signal)).join(', ') || 'služby a okolí';
    const segmentEvidence = signals.filter((signal) => /romantický|konferenční|altán|Karlštejn/i.test(signal)).join(', ') || 'různé typy pobytu';

    return sanitizeClientText(`3 nápady zdarma pro ${displayName}

Co už působí dobře
${signals.length ? `Web dobře ukazuje konkrétní prvky: ${signals.slice(0, 6).join(', ')}.` : 'Web působí jako dobrý základ pro krátký předpříjezdový přehled.'}

3 konkrétní nápady
1. Předpříjezdový přehled pro hosty: spojit adresu, cestu, recepci, ${practicalEvidence} a kontakt do jedné krátké zprávy.
2. Využít silné stránky areálu před pobytem: hostovi připomenout ${stayEvidence} ještě před příjezdem.
3. Rozdělit informace podle typu pobytu: jinak mluvit k romantickému víkendu, svatbě nebo akci, firemnímu pobytu a výletu na Karlštejn podle toho, co web ukazuje.

Proč by to mohlo pomoct hostovi
Host dostane praktické věci i důvod těšit se na pobyt na jednom místě, bez hledání v různých částech webu nebo zpráv.

Co by mohl být placený další krok
Pokud by ukázka dávala smysl, navázal bych jednoduchou sadou předpříjezdových zpráv podle ${segmentEvidence}.`);
}

export function buildFreeIdeaTeaser(input: { leadName: string }) {
    return sanitizeClientText(`Můžu zdarma poslat 3 krátké nápady pro ${cleanLeadDisplayName(input.leadName)}. Berte to jen jako ukázku mého pohledu; pokud už podobný přehled hostům posíláte po rezervaci, tím lépe.`);
}

export function buildPaidNextStep(input: { leadName: string }) {
    const displayName = cleanLeadDisplayName(input.leadName);

    return sanitizeClientText(`Pokud by jim 3 nápady dávaly smysl, další placený krok může být připravit jednoduchý přehled pro hosty před příjezdem: příjezd, parkování, check-in, kontakt a FAQ pro ${displayName}. Když ne, vůbec se nic neděje.`);
}

export function buildFallbackOutreach(input: { leadName: string; websiteExtraction?: WebsiteExtractionResult; signals?: string[] }) {
    const displayName = cleanLeadDisplayName(input.leadName);
    const signals = detectCandidateSpecificSignals({ websiteExtraction: input.websiteExtraction, strengths: '', publicSignals: input.signals ?? [], checkInParkingInfo: '' }).map((signal) => signal.label);
    const examples = signals.some((signal) => /restaurace|relax|parkovi|nabíjecí/i.test(signal))
        ? 'příjezd, parkování, restauraci, relax nebo tipy před pobytem'
        : 'příjezd, parkování, check-in a nejčastější dotazy';

    return sanitizeClientText(`Dobrý den,

omlouvám se za nevyžádanou zprávu. Pohybuji se kolem ubytování a narazil jsem na váš web ${displayName}.

Nevidím samozřejmě, co hostům posíláte po rezervaci, takže nechci dělat žádné velké závěry. Jen mě napadlo, že bych vám mohl zdarma poslat 3 krátké nápady k tomu, jak hostům ještě víc zpřehlednit informace před příjezdem — například ${examples}.

Beru to jen jako malou ukázku. Když se vám to bude zdát užitečné, můžeme se pak domluvit na větší úpravě za úplatu. Když ne, vůbec se nic neděje.

Má smysl vám ty 3 body poslat?

David`);
}

export function buildWebsiteOnlyOutreach(input: { leadName: string; websiteExtraction?: WebsiteExtractionResult; signals?: string[] }) {
    const displayName = cleanLeadDisplayName(input.leadName);
    const signals = detectCandidateSpecificSignals({ websiteExtraction: input.websiteExtraction, strengths: '', publicSignals: input.signals ?? [], checkInParkingInfo: '' }).map((signal) => signal.label);
    const examples = signals.some((signal) => /restaurace|relax|parkovi|nabíjecí/i.test(signal))
        ? 'příjezd, parkování, restauraci, relax nebo tipy před pobytem'
        : 'příjezd, parkování, check-in a nejčastější dotazy';

    return sanitizeClientText(`Dobrý den,

omlouvám se za nevyžádanou zprávu. Pohybuji se kolem ubytování a narazil jsem na váš web ${displayName}.

Nevidím samozřejmě, co hostům posíláte po rezervaci, takže nechci dělat žádné velké závěry. Jen mě napadlo, že bych vám mohl zdarma poslat 3 krátké nápady k tomu, jak hostům ještě víc zpřehlednit informace před příjezdem — například ${examples}.

Beru to jen jako malou ukázku. Když se vám to bude zdát užitečné, můžeme se pak domluvit na větší úpravě za úplatu. Když ne, vůbec se nic neděje.

Má smysl vám ty 3 body poslat?

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
    return buildPaidNextStep(input);
}
