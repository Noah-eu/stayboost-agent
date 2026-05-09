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
    | 'cityArrival'
    | 'historicCentre'
    | 'castleView'
    | 'krumlovCastle'
    | 'canalGarden'
    | 'historicElements'
    | 'privateEntry'
    | 'krumlovRecreation'
    | 'seidlAtelier'
    | 'museums'
    | 'revolvingTheatre'
    | 'vltavaRafting'
    | 'lipno'
    | 'klet'
    | 'rozmberk'
    | 'hluboka'
    | 'holasovice'
    | 'dlouhaAddress'
    | 'babyCot'
    | 'socialProfile'
    | 'noOwnedWebsite'
    | 'photoPresentation'
    | 'vilaKrumlov'
    | 'pensionGalko'
    | 'linkedDomains'
    | 'sharedReception'
    | 'checkInWindow'
    | 'lateArrival'
    | 'checkoutTime'
    | 'parkingReservation'
    | 'parkingPaid'
    | 'parkingLimited'
    | 'parkingDistance';

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
    extraction?.sourceUrlClassification,
    extraction?.websiteOwnershipStatus,
    extraction?.socialProfileStatus,
    extraction?.summary,
    extraction?.checkInWindowStart,
    extraction?.checkInWindowEnd,
    extraction?.lateArrivalCondition,
    extraction?.receptionHours,
    extraction?.checkoutTime,
    extraction?.parkingReservationRequired ? 'parkingReservationRequired' : '',
    extraction?.parkingPaid ? 'parkingPaid' : '',
    extraction?.parkingLimited ? 'parkingLimited' : '',
    extraction?.parkingDistanceMeters ? Object.entries(extraction.parkingDistanceMeters).map(([name, meters]) => `${name} ${meters} m`).join('\n') : '',
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
    { key: 'historicCentre', label: 'historické centrum', keywords: ['historicke centrum', 'historickem centru', 'stare mesto', 'staré město', 'centrum ceskeho krumlova', 'centrum českého krumlova'] },
    { key: 'castleView', label: 'výhled na hrad a zámek', keywords: ['vyhled na hrad', 'výhled na hrad', 'vyhled na zamek', 'výhled na zámek', 'hrad a zamek', 'hrad a zámek'] },
    { key: 'krumlovCastle', label: 'Zámek Český Krumlov', keywords: ['zamek cesky krumlov', 'zámek český krumlov', 'statni hrad a zamek cesky krumlov', 'státní hrad a zámek český krumlov'] },
    { key: 'canalGarden', label: 'zahrádka u kanálu', keywords: ['zahradka u kanalu', 'zahrádka u kanálu', 'krumlovskeho mlyna', 'krumlovského mlýna', 'kanal od krumlovskeho mlyna'] },
    { key: 'historicElements', label: 'historické prvky domu', keywords: ['hradby', 'tramovy strop', 'trámový strop', 'drevene podlahy', 'dřevěné podlahy', 'historicke prvky'] },
    { key: 'privateEntry', label: 'vlastní vchod', keywords: ['vlastni vchod', 'vlastní vchod', 'mala predsinka', 'malá předsíňka'] },
    { key: 'krumlovRecreation', label: 'Možnosti rekreace', keywords: ['moznosti rekreace', 'možnosti rekreace', 'rekreace.php', 'tipy v okoli', 'tipy v okolí', 'vylety', 'výlety'] },
    { key: 'seidlAtelier', label: 'Fotoateliér Seidl', keywords: ['fotoatelier seidl', 'fotoateliér seidl', 'seidl'] },
    { key: 'museums', label: 'muzea', keywords: ['muzea', 'museum', 'museums'] },
    { key: 'revolvingTheatre', label: 'otáčivé divadlo', keywords: ['otacive divadlo', 'otáčivé divadlo'] },
    { key: 'vltavaRafting', label: 'plavba vorů po Vltavě', keywords: ['plavba voru', 'plavba vorů', 'vltave', 'vltavě', 'voru po vltave'] },
    { key: 'lipno', label: 'Lipno', keywords: ['lipno'] },
    { key: 'klet', label: 'Kleť', keywords: ['klet', 'kleť'] },
    { key: 'rozmberk', label: 'Rožmberk', keywords: ['rozmberk', 'rožmberk'] },
    { key: 'hluboka', label: 'Hluboká', keywords: ['hluboka', 'hluboká'] },
    { key: 'holasovice', label: 'Holašovice', keywords: ['holasovice', 'holašovice'] },
    { key: 'dlouhaAddress', label: 'Dlouhá 92', keywords: ['dlouha 92', 'dlouhá 92'] },
    { key: 'babyCot', label: 'dětská postýlka', keywords: ['detska postylka', 'dětská postýlka', 'pristylka', 'přistýlka'] },
    { key: 'socialProfile', label: 'Facebook / veřejný profil', keywords: ['facebook', 'instagram', 'social-profile', 'veřejný sociální profil', 'verejny socialni profil', 'veřejný profil', 'verejny profil'] },
    { key: 'noOwnedWebsite', label: 'žádný vlastní web nenalezen', keywords: ['zadny vlastni web nenalezen', 'žádný vlastní web nenalezen', 'neni videt vlastni web', 'není vidět vlastní web', 'ne vlastni web'] },
    { key: 'photoPresentation', label: 'fotky ubytování', keywords: ['fotky ubytovani', 'fotky ubytování', 'cover', 'titulni fotka', 'titulní fotka', 'fotka krumlova'] },
    { key: 'vilaKrumlov', label: 'Vila Krumlov', keywords: ['vila krumlov', 'vilakrumlov.com'] },
    { key: 'pensionGalko', label: 'Pension Galko / Galko Široká', keywords: ['pension galko', 'galko siroka', 'galko široká', 'galko-ck.cz'] },
    { key: 'linkedDomains', label: 'propojené weby Vila Krumlov a Pension Galko', keywords: ['vilakrumlov.com', 'galko-ck.cz'] },
    { key: 'sharedReception', label: 'recepce / kontakt pro příjezd', keywords: ['recepce', 'kontakt', 'pracovni doba recepce', 'pracovní doba recepce'] },
    { key: 'checkInWindow', label: 'nástup 14:00-18:00', keywords: ['14:00 18:00', '14.00 18.00', '14:00-18:00', '14.00-18.00', 'checkInWindowStart', 'checkinwindowstart'] },
    { key: 'lateArrival', label: 'pozdější nástup jen po domluvě s recepcí', keywords: ['pozdější nástup', 'pozdejsi nastup', 'pozdni prijezd', 'late arrival'] },
    { key: 'checkoutTime', label: 'odjezd do 10:00', keywords: ['do 10:00', 'do 10.00', 'checkouttime', 'check-out do 10'] },
    { key: 'parkingReservation', label: 'parkování s rezervací předem', keywords: ['rezervace parkovani', 'rezervace parkování', 'parkingReservationRequired', 'parkingreservationrequired', 'rezervaci predem', 'rezervací předem'] },
    { key: 'parkingPaid', label: 'placené parkování 240 Kč za pobytový den', keywords: ['240 kc', '240 kč', 'parkingPaid', 'parkingpaid', 'placene parkovani', 'placené parkování'] },
    { key: 'parkingLimited', label: 'omezená kapacita parkování', keywords: ['omezena kapacita', 'omezená kapacita', 'parkingLimited', 'parkinglimited', 'pocet mist je omezen'] },
    { key: 'parkingDistance', label: 'parkoviště 250 m / 350 m', keywords: ['250 m', '350 m', 'parkingDistanceMeters', 'parkingdistancemeters'] },
    { key: 'parking', label: 'parkoviště', keywords: ['parkoviste', 'parkovani', 'parking'] },
    { key: 'ev', label: 'nabíjecí stanice pro elektromobily', keywords: ['nabijeci stanice', 'nabijeni elektromobilu', 'elektromobil', 'ev charging', 'charging station'] },
    { key: 'contact', label: 'kontakt', keywords: ['recepce', 'kontakt', 'telefon', 'e-mail', 'email', 'rezervace'] },
    { key: 'restaurant', label: 'restaurace', keywords: ['restaurace', 'restaurant', 'grill restaurant', 'bar ', ' menu ', 'snidane', 'snídaně'] },
    { key: 'breakfast', label: 'snídaně', keywords: ['snidane', 'snídaně', 'breakfast'] },
    { key: 'terrace', label: 'terasa', keywords: ['terasa', 'terrace'] },
    { key: 'relax', label: 'relax centrum', keywords: ['relax centrum', 'relaxacni centrum', 'relaxační centrum'] },
    { key: 'spa', label: 'wellness / spa', keywords: ['wellness', 'spa', 'sauna', 'masaz', 'masáž', 'virivka', 'vířivka', 'bazen', 'bazén', 'lazensky', 'lázeňský', 'koupelovy', 'koupelový'] },
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
        'multi-property-arrival-clarity': `Evidence ukazuje dvě propojené provozovny a konkrétní příjezdová pravidla (${joined}).`,
        'city-apartment-arrival': `Evidence ukazuje městské ubytování nebo více typů pokojů/apartmánů (${joined}).`,
        'family-local-experience': `Web staví pobyt na rodině, okolí, zahradě nebo lokálních tipech (${joined}).`,
        'historic-local-experience-stay': `Web ukazuje historický dům, centrum nebo konkrétní lokální tipy (${joined}).`,
        'social-profile-web-presence': `Zdroj je veřejný sociální profil bez dohledaného vlastního webu (${joined}).`,
        'romantic-wellness-stay': `Web explicitně zmiňuje wellness, spa, saunu, relax centrum nebo podobnou službu (${joined}).`,
        'event-wedding-hotel': `Web pracuje s eventy, svatbami nebo firemními hosty (${joined}).`,
        'basic-website-guest-guide': 'Nejsou vidět výraznější konkrétní signály, proto zůstává základní guest-guide playbook.',
        'ops-audit': `Evidence ukazuje širší provozní témata (${joined}).`,
        skip: 'Veřejná evidence zatím nedává dost silný důvod pro obchodní nápady.',
    };

    return reasons[playbook];
};

const socialProfileSignalsForLead = (lead: Pick<Lead, 'websiteExtraction' | 'publicSignals'>) => {
    const text = normalize([
        lead.websiteExtraction?.websiteUrl,
        lead.websiteExtraction?.sourceUrlClassification,
        lead.websiteExtraction?.websiteOwnershipStatus,
        lead.websiteExtraction?.summary,
        ...(lead.publicSignals ?? []),
    ].filter(Boolean).join('\n'));

    return /facebook|instagram|social-profile|verejny socialni profil|veřejný sociální profil/.test(text) ? ['Facebook / veřejný profil'] : [];
};

export const determineLeadPlaybook = (lead: Pick<Lead, 'websiteExtraction' | 'strengths' | 'publicSignals' | 'checkInParkingInfo'>): PlaybookAssessment => {
    const ownershipStatus = lead.websiteExtraction?.websiteOwnershipStatus;
    const sourceClassification = lead.websiteExtraction?.sourceUrlClassification;
    if (ownershipStatus && ['directory', 'municipal-catalog', 'aggregator', 'platform-listing'].includes(ownershipStatus) || sourceClassification && ['directory-listing', 'municipal-catalog', 'ota-or-aggregator', 'platform-hosted-profile', 'platform-listing'].includes(sourceClassification)) {
        return { leadPlaybook: 'skip', leadPlaybookReason: 'Zdroj je katalog/agregátor, ne vlastní web provozu; před nápady je potřeba oficiální web.', playbookSignals: ['official-website-required'] };
    }
    const signals = detectCandidateSpecificSignals(lead);
    const multiPropertySignals = firstSignals(signals, ['vilaKrumlov', 'pensionGalko', 'linkedDomains', 'sharedReception', 'checkInWindow', 'lateArrival', 'checkoutTime', 'parkingReservation', 'parkingPaid', 'parkingLimited', 'parkingDistance'], 10);
    const restaurantSignals = firstSignals(signals, ['sklepRestaurant', 'restaurant', 'breakfast']);
    const citySignals = firstSignals(signals, ['zizkov', 'pragueCentre', 'brnoCentre', 'tram', 'cityArrival', 'roomTypes', 'kitchen']);
    const familySignals = firstSignals(signals, ['families', 'gardenGrill', 'barbora', 'jesuitCollege', 'kutnaHora', 'vrchlice', 'historicHouse']);
    const historicLocalSignals = firstSignals(signals, ['historicCentre', 'castleView', 'krumlovCastle', 'canalGarden', 'historicElements', 'privateEntry', 'krumlovRecreation', 'seidlAtelier', 'museums', 'revolvingTheatre', 'vltavaRafting', 'lipno', 'klet', 'rozmberk', 'hluboka', 'holasovice', 'dlouhaAddress', 'kitchen', 'babyCot'], 8);
    const wellnessSignals = firstSignals(signals, ['relax', 'spa']);
    const eventSignals = firstSignals(signals, ['wedding', 'conference']);
    const opsSignals = firstSignals(signals, ['parking', 'ev', 'contact']);
    const socialProfileSignals = socialProfileSignalsForLead(lead);

    if (socialProfileSignals.length > 0) return { leadPlaybook: 'social-profile-web-presence', leadPlaybookReason: playbookReason('social-profile-web-presence', socialProfileSignals), playbookSignals: socialProfileSignals };
    if (hasSignal(signals, ['vilaKrumlov']) && hasSignal(signals, ['pensionGalko']) && (hasSignal(signals, ['checkInWindow', 'lateArrival', 'parkingReservation', 'parkingPaid', 'parkingLimited', 'parkingDistance', 'sharedReception']) || hasSignal(signals, ['linkedDomains']))) {
        return { leadPlaybook: 'multi-property-arrival-clarity', leadPlaybookReason: playbookReason('multi-property-arrival-clarity', multiPropertySignals), playbookSignals: multiPropertySignals };
    }
    if (restaurantSignals.length > 0) return { leadPlaybook: 'restaurant-linked-stay', leadPlaybookReason: playbookReason('restaurant-linked-stay', restaurantSignals), playbookSignals: restaurantSignals };
    if (eventSignals.length > 0) return { leadPlaybook: 'event-wedding-hotel', leadPlaybookReason: playbookReason('event-wedding-hotel', eventSignals), playbookSignals: eventSignals };
    if (historicLocalSignals.length > 0 && wellnessSignals.length === 0) return { leadPlaybook: 'historic-local-experience-stay', leadPlaybookReason: playbookReason('historic-local-experience-stay', historicLocalSignals), playbookSignals: historicLocalSignals };
    if (wellnessSignals.length > 0) return { leadPlaybook: 'romantic-wellness-stay', leadPlaybookReason: playbookReason('romantic-wellness-stay', wellnessSignals), playbookSignals: wellnessSignals };
    if (familySignals.length > 0) return { leadPlaybook: 'family-local-experience', leadPlaybookReason: playbookReason('family-local-experience', familySignals), playbookSignals: familySignals };
    if (citySignals.length > 0) return { leadPlaybook: 'city-apartment-arrival', leadPlaybookReason: playbookReason('city-apartment-arrival', citySignals), playbookSignals: citySignals };
    if (opsSignals.length >= 3) return { leadPlaybook: 'ops-audit', leadPlaybookReason: playbookReason('ops-audit', opsSignals), playbookSignals: opsSignals };
    return { leadPlaybook: 'basic-website-guest-guide', leadPlaybookReason: playbookReason('basic-website-guest-guide', []), playbookSignals: opsSignals };
};

const cityOrientationWin = (lead: Pick<Lead, 'websiteExtraction'>, signals: SpecificSignal[]) => {
    const usedSignals = firstSignals(signals, ['zizkov', 'pragueCentre', 'brnoCentre', 'tram', 'cityArrival', 'contact'], 5);
    const cityName = hasSignal(signals, ['zizkov', 'pragueCentre']) ? 'Praze' : hasSignal(signals, ['brnoCentre']) ? 'Brně' : 'městě';
    const orientationPlace = hasSignal(signals, ['zizkov']) ? 'orientace v Praze 3/Žižkově' : hasSignal(signals, ['pragueCentre']) ? 'orientace v centru Prahy' : hasSignal(signals, ['brnoCentre']) ? 'orientace v centru Brna' : 'orientace v okolí ubytování';
    return makeWin(
        `První večer v ${cityName} bez hledání`,
        `Host má po příjezdu rychle pochopit okolí a první kroky: ${usedSignals.join(', ') || 'městská orientace'}.`,
        `Po rezervaci poslat krátký blok: příjezd do ulice, ${orientationPlace}, nejbližší doprava, kontakt a co udělat první večer.`,
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
        `Zahrada nebo gril jsou explicitní důvody pobytu: ${evidenceFor(signals, ['gardenGrill'], 'zahrada nebo gril')}.`,
        'Doplnit hostům předem, jak používat zahradu/gril, co si vzít ven a jak nejlépe využít klidnější zázemí po návratu z města.',
        evidenceFor(signals, ['gardenGrill'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
        'venkovní zázemí jako součást pobytu',
        firstSignals(signals, ['gardenGrill'], 5),
    ),
    roomTypeWin(lead, signals),
];

const multiPropertyArrivalWins = (lead: Pick<Lead, 'websiteExtraction'>, signals: SpecificSignal[]) => [
    makeWin(
        'Udělat jasný předpříjezdový blok kvůli příjezdu do 18:00',
        'Na webu je uvedeno, že nástup je od 14:00 do 18:00 a pozdější příjezd je jen po domluvě.',
        'Po rezervaci poslat hostovi krátký přehled: kdy se může ubytovat, kde je recepce, na jaký telefon volat v pracovní době a co dělat, když hrozí pozdější příjezd.',
        evidenceFor(signals, ['checkInWindow', 'lateArrival', 'sharedReception'], lead.websiteExtraction?.summary || 'Nástup 14:00-18:00, pozdější nástup jen po domluvě, recepce/kontakt.'),
        'předpříjezdová komunikace pro časově omezený příjezd',
        firstSignals(signals, ['checkInWindow', 'lateArrival', 'sharedReception'], 6),
    ),
    makeWin(
        'Parkování vytáhnout do samostatného předpříjezdového bodu',
        'Parkování je placené, s omezenou kapacitou a nutnou rezervací předem.',
        'V předpříjezdové zprávě nebo online průvodci udělat samostatnou sekci „Přijedu autem“: vzdálenost parkoviště, cena, hotovostní platba, nutnost rezervace a co dělat po příjezdu.',
        evidenceFor(signals, ['parkingDistance', 'parkingPaid', 'parkingReservation', 'parkingLimited'], lead.websiteExtraction?.summary || 'Parkoviště 250 m / 350 m, 240 Kč za pobytový den, rezervace nutná předem, počet míst omezený.'),
        'parkování s rezervací předem jako hlavní předpříjezdová informace',
        firstSignals(signals, ['parkingDistance', 'parkingPaid', 'parkingReservation', 'parkingLimited'], 6),
    ),
    makeWin(
        'Oddělit instrukce pro Vila Krumlov a Pension Galko',
        'Weby a provozy jsou propojené a host může snadno zaměnit adresu, recepci nebo kontakt.',
        'V guest guide nebo předpříjezdové zprávě mít dvě jasné varianty: „Jedu do Vila Krumlov“ a „Jedu do Pension Galko“, s adresou, recepcí, telefonem a parkováním pro konkrétní objekt.',
        evidenceFor(signals, ['vilaKrumlov', 'pensionGalko', 'linkedDomains', 'sharedReception'], lead.websiteExtraction?.summary || 'Vila Krumlov a Pension Galko / Galko Široká jsou propojené weby s různými adresami a kontakty.'),
        'rozlišení dvou propojených provozoven před příjezdem',
        firstSignals(signals, ['vilaKrumlov', 'pensionGalko', 'linkedDomains', 'sharedReception'], 6),
    ),
];

const historicLocalExperienceWins = (lead: Pick<Lead, 'websiteExtraction'>, signals: SpecificSignal[]) => [
    makeWin(
        'Příjezd do historického centra bez nejistoty',
        'Ubytování je v historickém centru a má vlastní vstup; hostovi pomůže mít předem jasně shrnutou adresu, vstup a kontakt.',
        'Připravit krátký přehled pro hosty: adresa Dlouhá 92, jak se dostat ke vstupu, kdy volat, co čekat po příjezdu a co je potřeba vědět u apartmánů v centru Krumlova.',
        'Dlouhá 92, historické centrum Českého Krumlova, vlastní vchod, veřejný kontakt.',
        'příjezd do historického centra s vlastním vstupem',
        ['Dlouhá 92', 'historické centrum Českého Krumlova', 'vlastní vchod', 'veřejný kontakt'],
    ),
    makeWin(
        'Využít příběh výhledu, zahrádky a historického domu',
        `Silné části pobytu jsou atmosféra domu a místa: ${evidenceFor(signals, ['castleView', 'canalGarden', 'historicElements', 'quietPrivacy'], 'výhled, zahrádka a historický dům')}.`,
        'Po rezervaci poslat hostům krátké „co si u nás nenechat ujít“: výhled na hrad a zámek, zahrádka u kanálu od Krumlovského mlýna, historické prvky domu, klidné prostředí.',
        evidenceFor(signals, ['castleView', 'canalGarden', 'historicElements', 'quietPrivacy'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
        'historický dům a konkrétní atmosféra pobytu',
        ['výhled na hrad a zámek', 'zahrádka u kanálu', 'historické prvky domu', 'klid a soukromí'],
    ),
    makeWin(
        'Mini průvodce Krumlovem a okolím',
        'Web už obsahuje stránku Možnosti rekreace s konkrétními tipy; z toho jde udělat užitečný přehled pro hosty.',
        'Převést tipy z Možností rekreace do krátkého hostovského průvodce: co pěšky v Krumlově, co za kulturou a kam na výlet v okolí.',
        'Zámek Český Krumlov, Fotoateliér Seidl, otáčivé divadlo, plavba vorů po Vltavě, Lipno, Kleť.',
        'lokální průvodce z existující stránky Možnosti rekreace',
        ['Možnosti rekreace', 'Zámek Český Krumlov', 'Fotoateliér Seidl', 'otáčivé divadlo', 'plavba vorů po Vltavě', 'Lipno', 'Kleť'],
    ),
];

const socialProfileWebPresenceWins = (lead: Pick<Lead, 'websiteExtraction'>): QuickWin[] => {
    const evidence = lead.websiteExtraction?.summary || 'Facebook profil / veřejná prezentace bez dohledaného vlastního webu.';
    return [
        makeWin(
            'Jednoduchý web místo samotné Facebook stránky',
            'Pokud je hlavní veřejná prezentace hlavně Facebook, host nemusí rychle najít základní informace mimo sociální platformu.',
            'Vytvořit jednoduchou stránku s názvem ubytování, fotkami, adresou Pod Kamenem 170, telefonem, e-mailem, mapou a tlačítkem „zavolat / napsat“.',
            'Facebook profil, žádný vlastní web nenalezen, kontakt je veřejně vidět.',
            'malý web jako stabilní veřejná prezentace mimo Facebook',
            ['Facebook / veřejný profil', 'žádný vlastní web nenalezen', 'kontakt'],
        ),
        makeWin(
            'Přerovnat fotky tak, aby první ukazovaly ubytování',
            'První dojem má rychle ukázat samotné ubytování, ne jen obecnou atmosféru lokality.',
            'Jako první použít fotku pokoje/apartmánu nebo domu, ne obecnou fotku Krumlova; potom ukázat pokoj, koupelnu, vstup a okolí.',
            'Facebook cover je obecný pohled na Krumlov, fotky ubytování jsou až níže.',
            'lepší první dojem z veřejného profilu a budoucího webu',
            ['fotky ubytování', 'Facebook / veřejný profil'],
        ),
        makeWin(
            'Přidat praktický blok pro hosty před příjezdem',
            'Kontakt je vidět, ale host před rezervací nebo příjezdem potřebuje praktické informace na jednom místě.',
            'Na web/online stránku dát: adresa, mapa, jak se dostat ke vstupu, kontakt v den příjezdu, čas příjezdu, odjezd a nejčastější dotazy.',
            evidence.includes('Pod Kamenem') ? evidence : 'Facebook profil ukazuje kontakt, ale ne strukturované příjezdové informace.',
            'praktické informace pro hosta bez hledání ve feedu',
            ['kontakt', 'Facebook / veřejný profil'],
        ),
    ];
};

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
    if (playbook === 'multi-property-arrival-clarity') return multiPropertyArrivalWins(lead, signals);
    if (playbook === 'city-apartment-arrival') return [cityOrientationWin(lead, signals), roomTypeWin(lead, signals), restaurantWin(lead, signals)].filter((win) => win.usedSignals?.length);
    if (playbook === 'family-local-experience') return familyLocalWins(lead, signals);
    if (playbook === 'historic-local-experience-stay') return historicLocalExperienceWins(lead, signals);
    if (playbook === 'social-profile-web-presence') return socialProfileWebPresenceWins(lead);
    if (playbook === 'romantic-wellness-stay') return romanticWellnessWins(lead, signals);
    if (playbook === 'event-wedding-hotel') return eventWeddingWins(lead, signals);
    if (playbook === 'skip') return [];
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
    const usedSignals = quickWin.usedSignals?.length ? uniqueStrings(quickWin.usedSignals) : uniqueStrings(matchedSignals.map((signal) => signal.label));

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
    if (playbook === 'skip') return [];
    const annotatedExisting = existingWins.map((win) => annotateQuickWinSpecificity(win, lead));
    const nonDuplicateExisting = annotatedExisting.filter((win) => !wins.some((candidate) => normalize(candidate.title) === normalize(win.title)));
    const merged = [...wins, ...nonDuplicateExisting].slice(0, 3);
    const withFallback = merged.length >= 3 ? merged : [...merged, ...basicGuestGuideWins(lead, signals)].slice(0, 3);

    return withFallback.map((win) => annotateQuickWinSpecificity({ ...win, id: win.id || `quick-win-${crypto.randomUUID()}` }, lead));
};

const conceptForIdea = (idea: QuickWin) => {
    const text = normalize(`${idea.title}\n${idea.why}\n${idea.action}\n${idea.uniqueBusinessAngle}\n${(idea.usedSignals ?? []).join('\n')}`);
    if (/restaur|sklep|snidan|menu|jidlo/.test(text)) return 'restaurant';
    if (/vila krumlov|pension galko|galko siroka|dv[eě] propojen[eé]|dvou propojen/.test(text)) return 'multi-property';
    if (/parkov|240 k|250 m|350 m|p[řr]ijedu autem/.test(text)) return 'parking';
    if (/18:00|18 00|pozd[eě]j[šs][ií]|recepc/.test(text)) return 'arrival-deadline';
    if (/typ pobytu|typ poko|apartman|kuchyn|studio|rodinny apartman/.test(text)) return 'room-type';
    if (/zizkov|praha|brno|tram|mesto|ulice|seifertova|prvni vecer/.test(text)) return 'city-orientation';
    if (/krumlov|hrad|zamek|zahrad|kanal|muze|seidl|divadlo|vltav|lipno|klet|rozmberk|hluboka|holasovic|historick/.test(text)) return 'historic-local';
    if (/fotk|cover|pokoj|koupeln|dum|domu/.test(text)) return 'photo-order';
    if (/jednoduchy web|facebook strank|vlastni web nenalezen|zavolat|napsat/.test(text)) return 'simple-website';
    if (/praktick|prijezd|mapa|kontakt v den|faq/.test(text)) return 'arrival';
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
    const structurallyCompleteIdeasCount = ideas.filter((idea) => idea.title.trim() && idea.why.trim() && idea.action.trim() && idea.sourceEvidence.trim() && idea.candidateSpecificity !== 'generic').length;
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
        || ideas.filter((idea) => genericTitlePattern.test(idea.title) && (idea.usedSignals ?? []).length < 2).length >= 2
        || (/rozdelit\W+pokyny\W+pro\W+apartman\W+s\W+kuchyni\W+rodinny\W+apartman\W+a\W+pokoj/.test(combinedIdeas) && !/apartman\w*\s+s\s+kuchyni|rodinny\s+apartman|typy\s+(?:apartmanu|pokoju)|studio|family\s+room/.test(normalize(textForExtraction(lead.websiteExtraction))));
    const repeatedConceptWarning = uniqueConceptCount <= 1
        || concepts.every((concept) => arrivalOnlyConcepts.has(concept))
        || concepts.filter((concept) => arrivalOnlyConcepts.has(concept)).length === ideas.length;
    const freeIdeasDiversityScore = ideas.length ? Math.round((uniqueConceptCount / ideas.length) * 100) : 0;
    const playbook = determineLeadPlaybook(lead);
    const localExperienceExtractionReady = playbook.leadPlaybook !== 'historic-local-experience-stay'
        || !(lead.websiteExtraction?.missedPriorityPages ?? []).includes('Možnosti rekreace')
        || (lead.websiteExtraction?.localExperienceSignals?.length ?? 0) >= 3;
    const freeIdeasReady = ideas.length === 3
        && structurallyCompleteIdeasCount === 3
        && genericFreeIdeasCount <= 1
        && candidateSpecificSignalsUsed.length >= 3
        && positiveSignalsUsedCount >= 2
        && missingSignalsUsedCount <= 1
        && localExperienceExtractionReady
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
        localExperienceExtractionReady,
        structurallyCompleteIdeasCount,
    };
};
