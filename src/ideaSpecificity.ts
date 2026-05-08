import type { Lead, QuickWin, WebsiteExtractionResult } from './types';

type SignalKey =
    | 'parking'
    | 'ev'
    | 'contact'
    | 'restaurant'
    | 'terrace'
    | 'relax'
    | 'river'
    | 'island'
    | 'wedding'
    | 'conference'
    | 'romantic'
    | 'castle'
    | 'barbora'
    | 'jesuitCollege'
    | 'kutnaHora'
    | 'vrchlice'
    | 'gardenGrill'
    | 'families'
    | 'quietPrivacy'
    | 'fourApartments'
    | 'historicHouse'
    | 'zizkov'
    | 'pragueCentre'
    | 'sklepRestaurant'
    | 'roomTypes'
    | 'kitchen'
    | 'tram'
    | 'cityArrival';

interface SpecificSignal {
    key: SignalKey;
    label: string;
    evidence: string;
}

const normalize = (value = '') => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const uniqueStrings = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

const textForExtraction = (extraction?: WebsiteExtractionResult) => [
    extraction?.summary,
    ...(extraction?.pagesExtracted ?? []).flatMap((page) => [page.title, page.textPreview, page.url]),
    ...(extraction?.websiteSignals ?? []),
    ...(extraction?.arrivalSignals ?? []),
    ...(extraction?.parkingSignals ?? []),
    ...(extraction?.faqSignals ?? []),
    ...(extraction?.guestGuideSignals ?? []),
    ...(extraction?.automationSignals ?? []),
    ...(extraction?.strengths ?? []),
    ...(extraction?.risks ?? []),
].filter(Boolean).join('\n');

const matchers: Array<{ key: SignalKey; label: string; keywords: string[] }> = [
    { key: 'barbora', label: 'Chrám sv. Barbory', keywords: ['chram sv barbory', 'chrám sv barbory', 'sv barbory', 'saint barbara'] },
    { key: 'jesuitCollege', label: 'Jezuitská kolej', keywords: ['jezuitska kolej', 'jesuit college'] },
    { key: 'kutnaHora', label: 'Kutná Hora / 5 minut od památek', keywords: ['kutna hora', 'kutne hory', '5 minut chuze', 'pamatky kutne hory', 'unesco'] },
    { key: 'vrchlice', label: 'říčka Vrchlice', keywords: ['vrchlice', 'ricka vrchlice'] },
    { key: 'gardenGrill', label: 'zahrádka s grilem', keywords: ['zahradka s grilem', 'zahrada s grilem', 'zahradka', 'zahrada', 'gril', 'grill'] },
    { key: 'families', label: 'rodiny s dětmi', keywords: ['rodiny s detmi', 'rodina s detmi', 'deti', 'children', 'families'] },
    { key: 'quietPrivacy', label: 'klid a soukromí', keywords: ['klid a soukromi', 'soukromi', 'klid', 'privacy', 'quiet'] },
    { key: 'fourApartments', label: 'čtyři apartmány', keywords: ['ctyri apartmany', '4 apartmany', 'four apartments'] },
    { key: 'historicHouse', label: 'historický dům', keywords: ['historicky dum', 'historical house', 'historic house'] },
    { key: 'zizkov', label: 'Žižkov / Praha 3', keywords: ['zizkov', 'praha 3', 'prague 3', 'seifertova'] },
    { key: 'pragueCentre', label: 'centrum Prahy', keywords: ['centrum prahy', 'centre of prague', 'city centre', 'center of prague', 'v centru prahy'] },
    { key: 'sklepRestaurant', label: 'Restaurace Sklep', keywords: ['restaurace sklep', 'restaurant sklep', 'sklep restaurant'] },
    { key: 'roomTypes', label: 'více typů apartmánů a pokojů', keywords: ['apartmany a pokoje', 'apartments and rooms', 'studio', 'family room', 'typy apartmanu', 'typy pokoju'] },
    { key: 'kitchen', label: 'kuchyň v apartmánech', keywords: ['kuchyn', 'kitchen', 'kitchenette'] },
    { key: 'tram', label: 'tramvaj / městská doprava', keywords: ['tramvaj', 'tram', 'public transport', 'mhd'] },
    { key: 'cityArrival', label: 'městský příjezd', keywords: ['city centre', 'centrum prahy', 'seifertova', 'praha 3', 'zizkov'] },
    { key: 'parking', label: 'parkoviště', keywords: ['parkoviste', 'parkovani', 'parking'] },
    { key: 'ev', label: 'nabíjecí stanice pro elektromobily', keywords: ['nabijeci stanice', 'nabijeni elektromobilu', 'elektromobil', 'ev charging', 'charging station'] },
    { key: 'contact', label: 'kontakt / recepce', keywords: ['recepce', 'kontakt', 'telefon', 'e-mail', 'email', 'rezervace'] },
    { key: 'restaurant', label: 'restaurace', keywords: ['restaurace', 'restaurant'] },
    { key: 'terrace', label: 'terasa', keywords: ['terasa', 'terrace'] },
    { key: 'relax', label: 'relax centrum', keywords: ['relax centrum', 'relaxacni centrum', 'wellness', 'spa', 'sauna'] },
    { key: 'river', label: 'Berounka', keywords: ['berounka'] },
    { key: 'island', label: 'soukromý ostrov', keywords: ['soukromy ostrov', 'private island', 'ostrov'] },
    { key: 'wedding', label: 'svatby a akce', keywords: ['svatebni altan', 'svatba', 'svatebni', 'party stan', 'wedding'] },
    { key: 'conference', label: 'konferenční prostory', keywords: ['konferencni prostory', 'konference', 'firemni akce', 'skoleni'] },
    { key: 'romantic', label: 'romantický hotel', keywords: ['romanticky hotel', 'romanticky vikend', 'romanticke pobyty'] },
    { key: 'castle', label: 'Karlštejn', keywords: ['karlstejn', 'hrad karlstejn', 'pod hradem'] },
];

const firstEvidence = (extraction: WebsiteExtractionResult | undefined, signal: Pick<SpecificSignal, 'label'>) => {
    const normalizedLabel = normalize(signal.label);
    const page = extraction?.pagesExtracted.find((candidate) => normalize(`${candidate.title}\n${candidate.textPreview}\n${candidate.url}`).includes(normalizedLabel));

    return page ? `${signal.label}: ${page.title || page.url}` : signal.label;
};

export const detectCandidateSpecificSignals = (lead: Pick<Lead, 'websiteExtraction' | 'strengths' | 'publicSignals' | 'checkInParkingInfo'>): SpecificSignal[] => {
    const extractionText = textForExtraction(lead.websiteExtraction);
    const combined = normalize([
        extractionText,
        lead.strengths,
        lead.checkInParkingInfo,
        ...(lead.publicSignals ?? []),
    ].filter(Boolean).join('\n'));
    const signals = matchers
        .filter((matcher) => matcher.keywords.some((keyword) => combined.includes(normalize(keyword))))
        .map((matcher) => ({
            key: matcher.key,
            label: matcher.label,
            evidence: firstEvidence(lead.websiteExtraction, matcher),
        }));

    return uniqueStrings(signals.map((signal) => signal.key)).map((key) => signals.find((signal) => signal.key === key)).filter(Boolean) as SpecificSignal[];
};

const hasSignal = (signals: SpecificSignal[], keys: SignalKey[]) => signals.some((signal) => keys.includes(signal.key));
const labelsFor = (signals: SpecificSignal[], keys: SignalKey[]) => signals.filter((signal) => keys.includes(signal.key)).map((signal) => signal.label);
const evidenceFor = (signals: SpecificSignal[], keys: SignalKey[], fallback: string) => labelsFor(signals, keys).length ? labelsFor(signals, keys).join(', ') : fallback;

const makeWin = (title: string, why: string, action: string, sourceEvidence: string, uniqueBusinessAngle: string, usedSignals: string[]): QuickWin => ({
    id: `quick-win-${crypto.randomUUID()}`,
    title,
    why,
    action,
    sourceEvidence,
    candidateSpecificity: usedSignals.length >= 1 ? 'specific' : 'generic',
    uniqueBusinessAngle,
    usedSignals: uniqueStrings(usedSignals),
});

const genericTitlePattern = /p[řr]ijezd na jedn|p[řr]edp[řr][ií]jezdov[yý] p[řr]ehled|parkov[aá]n[ií] bez|mini faq|faq p[řr]ed|dodat kr[aá]tkou faq|zviditelnit praktick|str[aá]nku p[řr]ed p[řr]ijezdem|kontakt pro den p[řr][ií]jezdu/i;
const genericTextPattern = /host tak m[uů][žz]e h[uů][řr]|nen[ií] jasn[eě] vid[eě]t parkov[aá]n[ií]|nej[čc]ast[eě]j[šs][ií]ch p[řr]edp[řr][ií]jezdov[yý]ch ot[aá]zek|p[řr][ií]jezd, check-in, parkov[aá]n[ií] a prvn[ií] kontakt/i;
const missingOnlyPattern = /nen[ií] jasn[eě]|nen[ií] vid[eě]t|chyb[ií]|doplnit|p[řr][ií]jezd|check-in|faq|kontakt/i;
const templateThemes = ['prijezd na jednu stranku', 'predprijezdovy prehled', 'faq pred pobytem', 'dodat kratkou faq', 'kontakt pro den prijezdu', 'zviditelnit prakticke informace', 'stranku pred prijezdem'];

const matchedSignalsForIdea = (quickWin: QuickWin, signals: SpecificSignal[]) => {
    const combined = normalize(`${quickWin.title}\n${quickWin.why}\n${quickWin.action}\n${quickWin.sourceEvidence}\n${quickWin.uniqueBusinessAngle}\n${(quickWin.usedSignals ?? []).join('\n')}`);

    return signals.filter((signal) => combined.includes(normalize(signal.label)) || signal.key === 'ev' && /ev|nabijeci|elektromobil/.test(combined));
};

export const annotateQuickWinSpecificity = (quickWin: QuickWin, lead: Pick<Lead, 'websiteExtraction' | 'strengths' | 'publicSignals' | 'checkInParkingInfo'>): QuickWin => {
    const signals = detectCandidateSpecificSignals(lead);
    const matchedSignals = matchedSignalsForIdea(quickWin, signals);
    const combinedIdea = `${quickWin.title}\n${quickWin.why}\n${quickWin.action}`;
    const isGeneric = genericTitlePattern.test(quickWin.title) && matchedSignals.length < 2
        || genericTextPattern.test(combinedIdea) && matchedSignals.length < 2
        || matchedSignals.length === 0
        || missingOnlyPattern.test(combinedIdea) && matchedSignals.length === 0;
    const usedSignals = uniqueStrings([...(quickWin.usedSignals ?? []), ...matchedSignals.map((signal) => signal.label)]);

    return {
        ...quickWin,
        candidateSpecificity: isGeneric ? 'generic' : 'specific',
        uniqueBusinessAngle: quickWin.uniqueBusinessAngle || (usedSignals.length ? usedSignals.join(', ') : 'obecné předpříjezdové informace'),
        usedSignals,
    };
};

const coreFallbackWin = (lead: Pick<Lead, 'websiteExtraction'>): QuickWin => ({
    id: `quick-win-${crypto.randomUUID()}`,
    title: 'Ověřit jednu stránku před příjezdem',
    why: 'Z veřejné evidence zatím není dost konkrétních pozitivních signálů pro plně personalizované tři nápady.',
    action: 'Použít jen jako pracovní placeholder a před odesláním doplnit konkrétní signály z webu nebo ruční kontroly.',
    sourceEvidence: lead.websiteExtraction?.summary || 'Omezená veřejná evidence.',
    candidateSpecificity: 'generic',
    uniqueBusinessAngle: 'placeholder pro ruční doplnění evidence',
    usedSignals: [],
});

export const buildSpecificFreeIdeas = (lead: Pick<Lead, 'name' | 'websiteExtraction' | 'strengths' | 'publicSignals' | 'checkInParkingInfo'>, existingWins: QuickWin[] = []): QuickWin[] => {
    const signals = detectCandidateSpecificSignals(lead);
    const wins: QuickWin[] = [];

    if (hasSignal(signals, ['barbora', 'jesuitCollege', 'kutnaHora'])) {
        const usedSignals = labelsFor(signals, ['barbora', 'jesuitCollege', 'kutnaHora']).slice(0, 4);
        wins.push(makeWin(
            'Postavit průvodce kolem památek Kutné Hory',
            `Web staví pobyt na konkrétní lokalitě: ${usedSignals.join(', ')}. To je silnější motiv než obecná informace o příjezdu.`,
            'V předpříjezdové zprávě přidat krátký blok „co stihnout pěšky“: Chrám sv. Barbory, Jezuitská kolej a rychlá orientace po Kutné Hoře.',
            evidenceFor(signals, ['barbora', 'jesuitCollege', 'kutnaHora'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
            'pobyt jako klidná základna u památek Kutné Hory',
            usedSignals,
        ));
    }

    if (hasSignal(signals, ['gardenGrill', 'families', 'quietPrivacy', 'vrchlice'])) {
        const usedSignals = labelsFor(signals, ['gardenGrill', 'families', 'quietPrivacy', 'vrchlice']).slice(0, 4);
        wins.push(makeWin(
            'Předem naladit rodiny na zahradu a klid',
            `Konkrétní signály jako ${usedSignals.join(', ')} pomáhají ukázat, proč je pobyt vhodný pro rodiny a klidnější návštěvu.`,
            'Do průvodce přidat sekci „po příjezdu“: kde je zahrada/gril, jak ji mohou hosté používat a co je dobré vzít dětem ven.',
            evidenceFor(signals, ['gardenGrill', 'families', 'quietPrivacy', 'vrchlice'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
            'rodinný pobyt s venkovním zázemím a klidem',
            usedSignals,
        ));
    }

    if (hasSignal(signals, ['fourApartments', 'historicHouse', 'roomTypes'])) {
        const usedSignals = labelsFor(signals, ['fourApartments', 'historicHouse', 'roomTypes']).slice(0, 4);
        wins.push(makeWin(
            'Rozdělit informace podle typu apartmánu',
            `Web ukazuje ${usedSignals.join(', ')}. Hostům může pomoct, když praktické informace nejsou pro všechny pokoje úplně stejné.`,
            'Připravit krátké bloky pro jednotlivé apartmány/pokoje: vybavení, komu se hodí, co je společné a co je specifické pro daný typ pobytu.',
            evidenceFor(signals, ['fourApartments', 'historicHouse', 'roomTypes'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
            'přehled podle konkrétního typu ubytování',
            usedSignals,
        ));
    }

    if (hasSignal(signals, ['zizkov', 'pragueCentre', 'tram', 'cityArrival'])) {
        const usedSignals = labelsFor(signals, ['zizkov', 'pragueCentre', 'tram', 'cityArrival']).slice(0, 4);
        wins.push(makeWin(
            'Udělat městskou orientaci pro příjezd do Prahy',
            `U městského ubytování jsou klíčové signály ${usedSignals.join(', ')}. Host potřebuje rychle pochopit čtvrť, dopravu a příjezd.`,
            'Do zprávy před příjezdem přidat mini-orientaci: Žižkov/Praha 3, nejbližší tramvaj, cesta z centra a co čekat při příjezdu do ulice.',
            evidenceFor(signals, ['zizkov', 'pragueCentre', 'tram', 'cityArrival'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
            'městský příjezd a orientace v Praze',
            usedSignals,
        ));
    }

    if (hasSignal(signals, ['sklepRestaurant', 'restaurant'])) {
        const usedSignals = labelsFor(signals, ['sklepRestaurant', 'restaurant']).slice(0, 3);
        wins.push(makeWin(
            'Propojit ubytování s Restaurací Sklep',
            `Restaurace je konkrétní výhoda webu: ${usedSignals.join(', ')}. Může být součástí předpobytového naladění, ne jen samostatná informace.`,
            'Přidat blok „jídlo po příjezdu“: kdy se hodí Restaurace Sklep, jestli je potřeba rezervace a jak ji host najde z pokoje/apartmánu.',
            evidenceFor(signals, ['sklepRestaurant', 'restaurant'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
            'ubytování spojené s konkrétní restaurací v místě',
            usedSignals,
        ));
    }

    if (hasSignal(signals, ['roomTypes', 'kitchen'])) {
        const usedSignals = labelsFor(signals, ['roomTypes', 'kitchen']).slice(0, 4);
        wins.push(makeWin(
            'Vysvětlit rozdíl mezi pokoji a apartmány',
            `Web pracuje s více typy ubytování: ${usedSignals.join(', ')}. Praktické informace by měly odpovídat tomu, co si host rezervoval.`,
            'V host guide rozdělit informace pro pokoj a apartmán: kuchyň, vybavení, délka pobytu, co si host nemusí vozit a co platí jen pro apartmán.',
            evidenceFor(signals, ['roomTypes', 'kitchen'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
            'personalizace podle rezervovaného typu pokoje/apartmánu',
            usedSignals,
        ));
    }

    if (hasSignal(signals, ['restaurant', 'terrace', 'relax', 'river', 'island', 'wedding'])) {
        const usedSignals = labelsFor(signals, ['restaurant', 'terrace', 'relax', 'river', 'island', 'wedding']).slice(0, 5);
        wins.push(makeWin(
            'Využít silné stránky areálu před pobytem',
            `Web má silné pobytové motivy: ${usedSignals.join(', ')}. Ty mohou hosta naladit ještě před příjezdem.`,
            `Do zprávy před příjezdem přidat krátké připomenutí toho, co lze využít na místě: ${usedSignals.join(', ')}.`,
            evidenceFor(signals, ['restaurant', 'terrace', 'relax', 'river', 'island', 'wedding'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
            'předpobytové naladění hosta přes konkrétní služby a místo',
            usedSignals,
        ));
    }

    if (hasSignal(signals, ['romantic', 'wedding', 'conference', 'castle', 'river'])) {
        const usedSignals = labelsFor(signals, ['romantic', 'wedding', 'conference', 'castle', 'river']).slice(0, 5);
        wins.push(makeWin(
            'Rozdělit informace podle typu pobytu',
            `Web oslovuje více situací: ${usedSignals.join(', ')}. Každý host může před příjezdem potřebovat trochu jiný kontext.`,
            'Připravit varianty předpříjezdového přehledu pro romantický víkend, svatbu nebo akci, firemní pobyt a výlet podle toho, co si host rezervoval.',
            evidenceFor(signals, ['romantic', 'wedding', 'conference', 'castle', 'river'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
            'segmentace komunikace podle motivu pobytu',
            usedSignals,
        ));
    }

    if (hasSignal(signals, ['parking', 'ev', 'contact']) && wins.length < 3) {
        const usedSignals = labelsFor(signals, ['parking', 'ev', 'contact']).slice(0, 4);
        wins.push(makeWin(
            'Složit praktický příjezd z ověřených prvků webu',
            `Web už zmiňuje ${usedSignals.join(', ')}; nemá smysl to prezentovat jako chybějící, spíš jako praktický balíček pro hosta.`,
            `Spojit adresu, cestu, ${hasSignal(signals, ['parking']) ? 'parkování' : 'příjezd'}, ${hasSignal(signals, ['ev']) ? 'EV nabíjení, ' : ''}kontakt a časové informace do krátkého přehledu před pobytem.`,
            evidenceFor(signals, ['parking', 'ev', 'contact'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
            'praktická orientace před příjezdem navázaná na ověřené kontaktní a dopravní prvky',
            usedSignals,
        ));
    }

    const annotatedExisting = existingWins.map((win) => annotateQuickWinSpecificity(win, lead));
    const nonDuplicateExisting = annotatedExisting.filter((win) => !wins.some((candidate) => normalize(candidate.title) === normalize(win.title)));
    const merged = [...wins, ...nonDuplicateExisting].slice(0, 3);
    const withFallback = merged.length >= 3 ? merged : [...merged, coreFallbackWin(lead)].slice(0, 3);

    return withFallback.map((win) => annotateQuickWinSpecificity({ ...win, id: win.id || `quick-win-${crypto.randomUUID()}` }, lead));
};

export const freeIdeaSpecificityDiagnostics = (lead: Pick<Lead, 'structuredQuickWins' | 'freeIdeas' | 'websiteExtraction' | 'strengths' | 'publicSignals' | 'checkInParkingInfo'>) => {
    const ideas = (lead.freeIdeas?.length ? lead.freeIdeas : lead.structuredQuickWins ?? []).slice(0, 3).map((win) => annotateQuickWinSpecificity(win, lead));
    const genericFreeIdeasCount = ideas.filter((idea) => idea.candidateSpecificity === 'generic').length;
    const candidateSpecificSignals = detectCandidateSpecificSignals(lead);
    const combinedIdeas = normalize(ideas.map((idea) => `${idea.title}\n${idea.why}\n${idea.action}\n${idea.sourceEvidence}\n${idea.uniqueBusinessAngle}\n${(idea.usedSignals ?? []).join('\n')}`).join('\n'));
    const candidateSpecificSignalsUsed = uniqueStrings(candidateSpecificSignals.filter((signal) => combinedIdeas.includes(normalize(signal.label)) || signal.key === 'ev' && /ev|nabijeci|elektromobil/.test(combinedIdeas)).map((signal) => signal.label));
    const normalizedTitles = ideas.map((idea) => normalize(idea.title)).join('|');
    const templateThemeCount = templateThemes.filter((theme) => normalizedTitles.includes(theme)).length;
    const repeatedTemplateWarning = genericFreeIdeasCount >= 2
        || templateThemeCount >= 2
        || ideas.filter((idea) => genericTitlePattern.test(idea.title) && (idea.usedSignals ?? []).length < 2).length >= 2;
    const freeIdeasReady = ideas.length === 3
        && genericFreeIdeasCount <= 1
        && candidateSpecificSignalsUsed.length >= 3
        && !repeatedTemplateWarning
        && ideas.filter((idea) => idea.candidateSpecificity === 'specific').length >= 2;
    const specificSignalRatio = ideas.length ? ideas.filter((idea) => idea.candidateSpecificity === 'specific').length / ideas.length : 0;
    const signalScore = Math.min(1, candidateSpecificSignalsUsed.length / 3);
    const freeIdeasSpecificityScore = ideas.length ? Math.round((specificSignalRatio * 65 + signalScore * 35) * (repeatedTemplateWarning ? 0.75 : 1)) : 0;

    return {
        freeIdeasSpecificityScore,
        genericFreeIdeasCount,
        candidateSpecificSignalsUsed,
        repeatedTemplateWarning,
        freeIdeasReady,
    };
};
