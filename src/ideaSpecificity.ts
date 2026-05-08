import type { Lead, LeadPlaybook, QuickWin, WebsiteExtractionResult } from './types';

type SignalKey =
    | 'parking'
    | 'ev'
    | 'contact'
    | 'restaurant'
    | 'breakfast'
    | 'terrace'
    | 'relax'
    | 'spa'
    | 'wine'
    | 'view'
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
    | 'brnoCentre'
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

interface PlaybookAssessment {
    leadPlaybook: LeadPlaybook;
    leadPlaybookReason: string;
    playbookSignals: string[];
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
    { key: 'brnoCentre', label: 'centrum Brna', keywords: ['centrum brna', 'brno centre', 'brno city centre'] },
    { key: 'sklepRestaurant', label: 'Restaurace Sklep', keywords: ['restaurace sklep', 'restaurant sklep', 'sklep restaurant'] },
    { key: 'roomTypes', label: 'více typů apartmánů a pokojů', keywords: ['apartmany a pokoje', 'apartments and rooms', 'studio', 'family room', 'typy apartmanu', 'typy pokoju'] },
    { key: 'kitchen', label: 'kuchyň v apartmánech', keywords: ['kuchyn', 'kitchen', 'kitchenette'] },
    { key: 'tram', label: 'tramvaj / městská doprava', keywords: ['tramvaj', 'tram', 'public transport', 'mhd'] },
    { key: 'cityArrival', label: 'městský příjezd', keywords: ['city centre', 'centrum prahy', 'centrum brna', 'seifertova', 'praha 3', 'zizkov'] },
    { key: 'parking', label: 'parkoviště', keywords: ['parkoviste', 'parkovani', 'parking'] },
    { key: 'ev', label: 'nabíjecí stanice pro elektromobily', keywords: ['nabijeci stanice', 'nabijeni elektromobilu', 'elektromobil', 'ev charging', 'charging station'] },
    { key: 'contact', label: 'kontakt / recepce', keywords: ['recepce', 'kontakt', 'telefon', 'e-mail', 'email', 'rezervace'] },
    { key: 'restaurant', label: 'restaurace', keywords: ['restaurace', 'restaurant', 'grill restaurant', 'bar ', ' menu ', 'snidane', 'snídaně'] },
    { key: 'breakfast', label: 'snídaně', keywords: ['snidane', 'snídaně', 'breakfast'] },
    { key: 'terrace', label: 'terasa', keywords: ['terasa', 'terrace'] },
    { key: 'relax', label: 'relax centrum', keywords: ['relax centrum', 'relaxacni centrum', 'wellness', 'spa', 'sauna'] },
    { key: 'spa', label: 'wellness / spa', keywords: ['wellness', 'spa', 'sauna', 'masaz', 'masáž'] },
    { key: 'wine', label: 'víno', keywords: ['vino', 'víno', 'vinny sklep', 'vinný sklep', 'wine'] },
    { key: 'view', label: 'výhledy', keywords: ['vyhled', 'výhled', 'views'] },
    { key: 'river', label: 'Berounka', keywords: ['berounka'] },
    { key: 'island', label: 'soukromý ostrov', keywords: ['soukromy ostrov', 'private island', 'ostrov'] },
    { key: 'wedding', label: 'svatby a akce', keywords: ['svatebni altan', 'svatba', 'svatebni', 'party stan', 'wedding'] },
    { key: 'conference', label: 'konferenční prostory', keywords: ['konferencni prostory', 'konference', 'firemni akce', 'skoleni'] },
    { key: 'romantic', label: 'romantický pobyt', keywords: ['romanticky hotel', 'romanticky vikend', 'romanticke pobyty', 'romantic'] },
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
const missingSignalPattern = /nen[ií]|chyb[ií]|nenalezen|nen[ií] vid[eě]t|missing|not found|doplnit|overit/i;
const arrivalOnlyConcepts = new Set(['arrival', 'faq', 'contact']);

const firstSignals = (signals: SpecificSignal[], keys: SignalKey[], max = 5) => labelsFor(signals, keys).slice(0, max);
const playbookReason = (playbook: LeadPlaybook, signals: string[]) => {
    const joined = signals.slice(0, 5).join(', ') || 'omezené veřejné signály';
    const reasons: Record<LeadPlaybook, string> = {
        'restaurant-linked-stay': `Web má výrazný gastro signál (${joined}), proto nápady nemají být jen obecný guest guide.`,
        'city-apartment-arrival': `Evidence ukazuje městské ubytování nebo více typů pokojů/apartmánů (${joined}).`,
        'family-local-experience': `Web staví pobyt na rodině, okolí, zahradě nebo lokálních tipech (${joined}).`,
        'romantic-wellness-stay': `Web zmiňuje romantiku, relax, wellness nebo párový pobyt (${joined}).`,
        'event-wedding-hotel': `Web pracuje s eventy, svatbami nebo firemními hosty (${joined}).`,
        'basic-website-guest-guide': 'Nejsou vidět výraznější konkrétní signály, proto zůstává základní guest-guide playbook.',
        'ops-audit': `Evidence ukazuje širší provozní témata (${joined}).`,
        skip: 'Veřejná evidence zatím nedává dost silný důvod pro obchodní nápady.',
    };

    return reasons[playbook];
};

export const determineLeadPlaybook = (lead: Pick<Lead, 'websiteExtraction' | 'strengths' | 'publicSignals' | 'checkInParkingInfo'>): PlaybookAssessment => {
    const signals = detectCandidateSpecificSignals(lead);
    const restaurantSignals = firstSignals(signals, ['sklepRestaurant', 'restaurant', 'breakfast']);
    const citySignals = firstSignals(signals, ['zizkov', 'pragueCentre', 'brnoCentre', 'tram', 'cityArrival', 'roomTypes', 'kitchen']);
    const familySignals = firstSignals(signals, ['families', 'gardenGrill', 'quietPrivacy', 'barbora', 'jesuitCollege', 'kutnaHora', 'vrchlice', 'historicHouse']);
    const wellnessSignals = firstSignals(signals, ['romantic', 'relax', 'spa', 'wine', 'view', 'terrace', 'castle']);
    const eventSignals = firstSignals(signals, ['wedding', 'conference']);
    const opsSignals = firstSignals(signals, ['parking', 'ev', 'contact']);

    if (restaurantSignals.length > 0) return { leadPlaybook: 'restaurant-linked-stay', leadPlaybookReason: playbookReason('restaurant-linked-stay', restaurantSignals), playbookSignals: restaurantSignals };
    if (eventSignals.length > 0) return { leadPlaybook: 'event-wedding-hotel', leadPlaybookReason: playbookReason('event-wedding-hotel', eventSignals), playbookSignals: eventSignals };
    if (wellnessSignals.length > 0) return { leadPlaybook: 'romantic-wellness-stay', leadPlaybookReason: playbookReason('romantic-wellness-stay', wellnessSignals), playbookSignals: wellnessSignals };
    if (familySignals.length > 0) return { leadPlaybook: 'family-local-experience', leadPlaybookReason: playbookReason('family-local-experience', familySignals), playbookSignals: familySignals };
    if (citySignals.length > 0) return { leadPlaybook: 'city-apartment-arrival', leadPlaybookReason: playbookReason('city-apartment-arrival', citySignals), playbookSignals: citySignals };
    if (opsSignals.length >= 3) return { leadPlaybook: 'ops-audit', leadPlaybookReason: playbookReason('ops-audit', opsSignals), playbookSignals: opsSignals };
    return { leadPlaybook: 'basic-website-guest-guide', leadPlaybookReason: playbookReason('basic-website-guest-guide', []), playbookSignals: opsSignals };
};

const cityOrientationWin = (lead: Pick<Lead, 'websiteExtraction'>, signals: SpecificSignal[]) => {
    const usedSignals = firstSignals(signals, ['zizkov', 'pragueCentre', 'brnoCentre', 'tram', 'cityArrival', 'contact'], 5);
    const cityName = hasSignal(signals, ['zizkov', 'pragueCentre']) ? 'Praze' : hasSignal(signals, ['brnoCentre']) ? 'Brně' : 'městě';
    return makeWin(
        `První večer v ${cityName} bez hledání`,
        `Host má po příjezdu rychle pochopit okolí a první kroky: ${usedSignals.join(', ') || 'městská orientace'}.`,
        'Po rezervaci poslat krátký blok: příjezd do ulice, orientace v Praze 3/Žižkově nebo centru, nejbližší doprava, kontakt a co udělat první večer.',
        evidenceFor(signals, ['zizkov', 'pragueCentre', 'brnoCentre', 'tram', 'cityArrival', 'contact'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
        'městská orientace a první večer po příjezdu',
        usedSignals,
    );
};

const restaurantWin = (lead: Pick<Lead, 'websiteExtraction'>, signals: SpecificSignal[]) => {
    const usedSignals = firstSignals(signals, ['sklepRestaurant', 'restaurant', 'breakfast'], 4);
    const restaurantName = usedSignals.some((signal) => /sklep/i.test(signal)) ? 'Restaurací Sklep' : 'restaurací';
    return makeWin(
        `Propojit ubytování s ${restaurantName}`,
        `Restaurace je konkrétní odlišující signál: ${usedSignals.join(', ')}. Nemá zůstat schovaná mimo pobytovou komunikaci.`,
        'Hostům po rezervaci ukázat, kdy se restaurace hodí po příjezdu, jestli dává smysl rezervace, kde ji najdou a co tím vyřeší první večer.',
        evidenceFor(signals, ['sklepRestaurant', 'restaurant', 'breakfast'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
        'ubytování propojené s konkrétním gastro provozem',
        usedSignals,
    );
};

const roomTypeWin = (lead: Pick<Lead, 'websiteExtraction'>, signals: SpecificSignal[]) => {
    const usedSignals = firstSignals(signals, ['roomTypes', 'kitchen', 'fourApartments', 'families'], 5);
    return makeWin(
        'Rozdělit informace podle typu pobytu',
        `Web pracuje s rozdílnými typy ubytování: ${usedSignals.join(', ')}. Každý host nemá dostat stejný balík pokynů.`,
        'Rozdělit pokyny pro apartmán s kuchyní, rodinný apartmán a pokoj: vybavení, co si nevozit, jak používat zázemí a co platí jen pro daný typ pobytu.',
        evidenceFor(signals, ['roomTypes', 'kitchen', 'fourApartments', 'families'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
        'personalizace podle rezervovaného pokoje nebo apartmánu',
        usedSignals,
    );
};

const familyLocalWins = (lead: Pick<Lead, 'websiteExtraction'>, signals: SpecificSignal[]) => [
    makeWin(
        'Naplánovat rodinný pobyt kolem okolí',
        `Web má lokální a rodinné signály: ${evidenceFor(signals, ['barbora', 'jesuitCollege', 'kutnaHora', 'families'], 'lokální okolí a rodiny')}.`,
        'Po rezervaci poslat krátký pěší plán: co stihnout s dětmi, jak daleko jsou hlavní památky a jak si rozvrhnout první odpoledne.',
        evidenceFor(signals, ['barbora', 'jesuitCollege', 'kutnaHora', 'families'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
        'rodinný pobyt navázaný na lokální zážitek',
        firstSignals(signals, ['barbora', 'jesuitCollege', 'kutnaHora', 'families'], 5),
    ),
    makeWin(
        'Připravit hosty na zahradu a gril',
        `Zahrada, gril, klid nebo soukromí jsou pozitivní důvody pobytu: ${evidenceFor(signals, ['gardenGrill', 'quietPrivacy', 'vrchlice'], 'venkovní zázemí')}.`,
        'Doplnit hostům předem, jak používat zahradu/gril, co si vzít ven a jak nejlépe využít klidnější zázemí po návratu z města.',
        evidenceFor(signals, ['gardenGrill', 'quietPrivacy', 'vrchlice'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
        'venkovní zázemí jako součást pobytu',
        firstSignals(signals, ['gardenGrill', 'quietPrivacy', 'vrchlice'], 5),
    ),
    roomTypeWin(lead, signals),
];

const romanticWellnessWins = (lead: Pick<Lead, 'websiteExtraction'>, signals: SpecificSignal[]) => [
    makeWin(
        'Předem naladit romantický scénář pobytu',
        `Web zmiňuje párové nebo relaxační motivy: ${evidenceFor(signals, ['romantic', 'castle', 'view', 'wine'], 'romantický pobyt')}.`,
        'Po rezervaci poslat jemnou inspiraci: kdy dorazit, co si naplánovat první večer, kam zajít v okolí a jak si pobyt udělat klidnější.',
        evidenceFor(signals, ['romantic', 'castle', 'view', 'wine'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
        'romantický scénář před příjezdem',
        firstSignals(signals, ['romantic', 'castle', 'view', 'wine'], 5),
    ),
    makeWin(
        'Ukázat relax a doplňkové možnosti předem',
        `Relax nebo wellness je důvod k vyšší hodnotě pobytu: ${evidenceFor(signals, ['relax', 'spa', 'terrace'], 'relax a wellness')}.`,
        'Přidat krátký blok, kdy a jak využít relax/wellness, co je dobré rezervovat předem a jaké doplňky dávají smysl pro páry.',
        evidenceFor(signals, ['relax', 'spa', 'terrace'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
        'doplňkový upsell navázaný na relax',
        firstSignals(signals, ['relax', 'spa', 'terrace'], 5),
    ),
    makeWin(
        'Rozlišit romantický pobyt od běžného přespání',
        'Stejné příjezdové instrukce nestačí, pokud host kupuje zážitek nebo víkend pro dva.',
        'Připravit variantu komunikace pro páry: atmosféra, doporučený čas příjezdu, tip na první večer a drobný doplněk k rezervaci.',
        evidenceFor(signals, ['romantic', 'relax', 'spa', 'wine', 'castle'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
        'komunikace podle motivu pobytu',
        firstSignals(signals, ['romantic', 'relax', 'spa', 'wine', 'castle'], 5),
    ),
];

const eventWeddingWins = (lead: Pick<Lead, 'websiteExtraction'>, signals: SpecificSignal[]) => [
    makeWin(
        'Vytvořit rozcestník pro typ hosta',
        `Web pracuje s eventy: ${evidenceFor(signals, ['wedding', 'conference'], 'svatby a akce')}. Svatební host, firemní host a běžný host potřebují jiné pokyny.`,
        'Po rezervaci rozdělit komunikaci na svatební hosty, firemní hosty a běžný pobyt: příjezd, program, dress code / agenda a kontakt na místě.',
        evidenceFor(signals, ['wedding', 'conference'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
        'rozcestník podle typu akce',
        firstSignals(signals, ['wedding', 'conference'], 5),
    ),
    makeWin(
        'Oddělit logistiku akce od běžného ubytování',
        'Eventový host neřeší jen pokoj, ale čas příjezdu, program, parkování, místo setkání a kontaktní osobu.',
        'Připravit samostatný blok pro den akce: kde zaparkovat, kam jít po příjezdu, kdo řeší změny a co host nepotřebuje hledat na recepci.',
        evidenceFor(signals, ['parking', 'contact', 'wedding', 'conference'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
        'eventová logistika bez přetížení recepce',
        firstSignals(signals, ['parking', 'contact', 'wedding', 'conference'], 5),
    ),
    makeWin(
        'Připravit následnou zprávu podle akce',
        'Po svatbě nebo firemní akci se hodí jiný follow-up než po běžném víkendu.',
        'Doplnit šablony po pobytu: poděkování svatebním hostům, firemní rekapitulace nebo běžný tip na další pobyt.',
        evidenceFor(signals, ['wedding', 'conference', 'restaurant'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
        'komunikace po pobytu podle typu hosta',
        firstSignals(signals, ['wedding', 'conference', 'restaurant'], 5),
    ),
];

const basicGuestGuideWins = (lead: Pick<Lead, 'websiteExtraction'>, signals: SpecificSignal[]) => [
    makeWin(
        'Složit praktický příjezd z ověřených prvků webu',
        `Web zmiňuje ${evidenceFor(signals, ['parking', 'ev', 'contact'], 'jen základní praktické prvky')}; tady dává smysl jednoduchý guest guide.`,
        `Spojit adresu, cestu, ${hasSignal(signals, ['parking']) ? 'parkování' : 'příjezd'}, ${hasSignal(signals, ['ev']) ? 'EV nabíjení, ' : ''}kontakt a časové informace do krátkého přehledu před pobytem.`,
        evidenceFor(signals, ['parking', 'ev', 'contact'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
        'základní praktická orientace před příjezdem',
        firstSignals(signals, ['parking', 'ev', 'contact'], 5),
    ),
    makeWin(
        'Zjednodušit odpovědi na opakované dotazy',
        'Pokud nejsou vidět výraznější odlišující signály, nejbezpečnější první krok je krátká sada praktických odpovědí.',
        'Připravit stručné odpovědi na příjezd, čas příjezdu, parkování, kontakt a základní vybavení, ale držet je jako fallback, ne jako univerzální playbook.',
        lead.websiteExtraction?.summary || 'Omezená veřejná evidence.',
        'fallback guest guide pro slabou evidenci',
        [],
    ),
    coreFallbackWin(lead),
];

const playbookWins = (playbook: LeadPlaybook, lead: Pick<Lead, 'websiteExtraction'>, signals: SpecificSignal[]) => {
    if (playbook === 'restaurant-linked-stay') return [cityOrientationWin(lead, signals), restaurantWin(lead, signals), roomTypeWin(lead, signals)];
    if (playbook === 'city-apartment-arrival') return [cityOrientationWin(lead, signals), roomTypeWin(lead, signals), restaurantWin(lead, signals)].filter((win) => win.usedSignals?.length);
    if (playbook === 'family-local-experience') return familyLocalWins(lead, signals);
    if (playbook === 'romantic-wellness-stay') return romanticWellnessWins(lead, signals);
    if (playbook === 'event-wedding-hotel') return eventWeddingWins(lead, signals);
    return basicGuestGuideWins(lead, signals);
};

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
    const playbook = determineLeadPlaybook(lead).leadPlaybook;
    const wins = playbookWins(playbook, lead, signals);
    const annotatedExisting = existingWins.map((win) => annotateQuickWinSpecificity(win, lead));
    const nonDuplicateExisting = annotatedExisting.filter((win) => !wins.some((candidate) => normalize(candidate.title) === normalize(win.title)));
    const merged = [...wins, ...nonDuplicateExisting].slice(0, 3);
    const withFallback = merged.length >= 3 ? merged : [...merged, ...basicGuestGuideWins(lead, signals)].slice(0, 3);

    return withFallback.map((win) => annotateQuickWinSpecificity({ ...win, id: win.id || `quick-win-${crypto.randomUUID()}` }, lead));
};

const conceptForIdea = (idea: QuickWin) => {
    const text = normalize(`${idea.title}\n${idea.why}\n${idea.action}\n${idea.uniqueBusinessAngle}\n${(idea.usedSignals ?? []).join('\n')}`);
    if (/restaur|sklep|snidan|menu|jidlo/.test(text)) return 'restaurant';
    if (/typ pobytu|typ poko|apartman|kuchyn|studio|rodinny apartman/.test(text)) return 'room-type';
    if (/zizkov|praha|brno|tram|mesto|ulice|seifertova|prvni vecer/.test(text)) return 'city-orientation';
    if (/rodin|det|zahrad|gril|pamat|kutna hora|barbor|okol|pesky|vrchlice/.test(text)) return 'family-local';
    if (/romant|wellness|relax|spa|vino|par|vyhled/.test(text)) return 'romantic-wellness';
    if (/svat|konfer|firemn|event|akce/.test(text)) return 'event';
    if (/faq|otazk/.test(text)) return 'faq';
    if (/kontakt|recepc/.test(text)) return 'contact';
    if (/prijezd|check-in|parkovan|cestu|adresa/.test(text)) return 'arrival';
    return 'other';
};

const ideaUsesMissingSignal = (idea: QuickWin) => missingSignalPattern.test(`${idea.title}\n${idea.why}\n${idea.action}\n${idea.sourceEvidence}`) && (idea.usedSignals ?? []).length === 0;

export const freeIdeaSpecificityDiagnostics = (lead: Pick<Lead, 'structuredQuickWins' | 'freeIdeas' | 'websiteExtraction' | 'strengths' | 'publicSignals' | 'checkInParkingInfo'>) => {
    const ideas = (lead.freeIdeas?.length ? lead.freeIdeas : lead.structuredQuickWins ?? []).slice(0, 3).map((win) => annotateQuickWinSpecificity(win, lead));
    const genericFreeIdeasCount = ideas.filter((idea) => idea.candidateSpecificity === 'generic').length;
    const candidateSpecificSignals = detectCandidateSpecificSignals(lead);
    const combinedIdeas = normalize(ideas.map((idea) => `${idea.title}\n${idea.why}\n${idea.action}\n${idea.sourceEvidence}\n${idea.uniqueBusinessAngle}\n${(idea.usedSignals ?? []).join('\n')}`).join('\n'));
    const candidateSpecificSignalsUsed = uniqueStrings(candidateSpecificSignals.filter((signal) => combinedIdeas.includes(normalize(signal.label)) || signal.key === 'ev' && /ev|nabijeci|elektromobil/.test(combinedIdeas)).map((signal) => signal.label));
    const normalizedTitles = ideas.map((idea) => normalize(idea.title)).join('|');
    const templateThemeCount = templateThemes.filter((theme) => normalizedTitles.includes(theme)).length;
    const concepts = ideas.map(conceptForIdea);
    const uniqueConceptCount = new Set(concepts).size;
    const positiveSignalsUsedCount = uniqueStrings(ideas.flatMap((idea) => idea.usedSignals ?? [])).length;
    const missingSignalsUsedCount = ideas.filter(ideaUsesMissingSignal).length;
    const repeatedTemplateWarning = genericFreeIdeasCount >= 2
        || templateThemeCount >= 2
        || ideas.filter((idea) => genericTitlePattern.test(idea.title) && (idea.usedSignals ?? []).length < 2).length >= 2;
    const repeatedConceptWarning = uniqueConceptCount <= 1
        || concepts.every((concept) => arrivalOnlyConcepts.has(concept))
        || concepts.filter((concept) => arrivalOnlyConcepts.has(concept)).length === ideas.length;
    const freeIdeasDiversityScore = ideas.length ? Math.round((uniqueConceptCount / ideas.length) * 100) : 0;
    const playbook = determineLeadPlaybook(lead);
    const freeIdeasReady = ideas.length === 3
        && genericFreeIdeasCount <= 1
        && candidateSpecificSignalsUsed.length >= 3
        && positiveSignalsUsedCount >= 2
        && missingSignalsUsedCount <= 1
        && !repeatedTemplateWarning
        && !repeatedConceptWarning
        && ideas.filter((idea) => idea.candidateSpecificity === 'specific').length >= 2;
    const specificSignalRatio = ideas.length ? ideas.filter((idea) => idea.candidateSpecificity === 'specific').length / ideas.length : 0;
    const signalScore = Math.min(1, candidateSpecificSignalsUsed.length / 3);
    const diversityScore = Math.min(1, freeIdeasDiversityScore / 100);
    const warningPenalty = repeatedTemplateWarning || repeatedConceptWarning ? 0.7 : 1;
    const freeIdeasSpecificityScore = ideas.length ? Math.round((specificSignalRatio * 45 + signalScore * 30 + diversityScore * 25) * warningPenalty) : 0;

    return {
        freeIdeasSpecificityScore,
        genericFreeIdeasCount,
        candidateSpecificSignalsUsed,
        repeatedTemplateWarning,
        freeIdeasReady,
        leadPlaybook: playbook.leadPlaybook,
        leadPlaybookReason: playbook.leadPlaybookReason,
        playbookSignals: playbook.playbookSignals,
        freeIdeasDiversityScore,
        repeatedConceptWarning,
        positiveSignalsUsedCount,
        missingSignalsUsedCount,
    };
};
