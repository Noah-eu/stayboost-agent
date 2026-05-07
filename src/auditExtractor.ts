import { AuditExtractionInput, AuditExtractionResult, QuickWin, SourceMaterial } from './types';

const strengthKeywords = [
    'location',
    'centrum',
    'parking',
    'parkovani',
    'self check-in',
    'wi-fi',
    'wifi',
    'kitchen',
    'kuchyn',
    'family',
    'rodina',
    'terrace',
    'terasa',
    'breakfast',
    'snidane',
    'quiet',
    'klid',
    'clean',
    'ciste',
    'modern',
    'moderne',
    'spacious',
    'prostorne',
    'close',
    'blizko',
    'metro',
    'tram',
    'reception',
    'recepce',
    'profesionalne',
    'praha',
    'apartman',
    'silna uvodni fotka',
];

const frictionKeywords = [
    'check-in',
    'checkin',
    'parking',
    'parkovani',
    'key',
    'klic',
    'code',
    'kod',
    'entrance',
    'vstup',
    'hard to find',
    'tezke najit',
    'noisy',
    'hluk',
    'confusing',
    'nejasne',
    'communication',
    'komunikace',
    'late',
    'pozdni',
    'unclear',
    'neprehledne',
    'stairs',
    'schody',
    'luggage',
    'zavazadla',
    'qr guest guide',
    'guest guide',
    'pred prijezdem',
    'behem pobytu',
];

const normalize = (value: string) =>
    value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

const compact = (value: string) => value.replace(/\s+/g, ' ').trim();

const sentenceParts = (content: string) =>
    content
        .split(/[.!?\n]+/)
        .map(compact)
        .filter((part) => part.length > 0);

const hasAny = (content: string, keywords: string[]) => {
    const normalizedContent = normalize(content);
    return keywords.some((keyword) => normalizedContent.includes(normalize(keyword)));
};

const firstMatchingSentence = (materials: SourceMaterial[], keywords: string[]) => {
    for (const material of materials) {
        const sentence = sentenceParts(material.content).find((part) => hasAny(part, keywords));

        if (sentence) {
            return { material, sentence };
        }
    }

    return undefined;
};

const unique = (items: string[]) => Array.from(new Set(items.map(compact).filter(Boolean)));

const evidenceLabel = (material: SourceMaterial, sentence: string) => `${material.title || 'Podklad'}: ${sentence}`;

const makeQuickWin = (title: string, why: string, action: string, sourceEvidence: string): QuickWin => ({
    id: `quick-win-${crypto.randomUUID()}`,
    title,
    why,
    action,
    sourceEvidence,
});

const buildQuickWins = (materials: SourceMaterial[], strengthEvidence: string, frictionEvidence: string) => {
    const allContent = normalize(materials.map((material) => material.content).join(' '));
    const wins: QuickWin[] = [];

    if (allContent.includes('check-in') || allContent.includes('checkin') || allContent.includes('pred prijezdem')) {
        wins.push(
            makeQuickWin(
                'Zviditelnit informace pred prijezdem',
                'Podklad ukazuje, ze prakticke informace pred prijezdem jsou dulezite pro snizeni nejistoty hosta.',
                'Doplnit do horni casti verejne prezentace kratky blok: check-in, prijezd, parkovani a kde host najde instrukce.',
                frictionEvidence,
            ),
        );
    }

    if (allContent.includes('guest guide') || allContent.includes('qr')) {
        wins.push(
            makeQuickWin(
                'Vysvetlit QR guest guide predem',
                'Guest guide muze byt silny benefit, kdyz host pred rezervaci pochopi, co mu usnadni.',
                'Pridat jednu vetu k verejnemu popisu: po rezervaci host dostane QR guest guide s prijezdem, pravidly a tipy v okoli.',
                frictionEvidence,
            ),
        );
    }

    if (allContent.includes('parkovani') || allContent.includes('parking')) {
        wins.push(
            makeQuickWin(
                'Oddelit parkovani od obecneho popisu',
                'Parkovani patri mezi prakticke informace, ktere host resi pred rezervaci.',
                'Vytahnout parkovani do samostatneho kratkeho bodu vedle check-inu a dostupnosti.',
                frictionEvidence,
            ),
        );
    }

    if (allContent.includes('uvodni fotk') || allContent.includes('silnou uvodni fotk') || allContent.includes('ciste') || allContent.includes('profesionalne')) {
        wins.push(
            makeQuickWin(
                'Navazat na silny prvni dojem praktickymi detaily',
                'Podklad popisuje silny vizual, ale navazujici prakticke informace maji rozhodnout dalsi krok hosta.',
                'Za silnou uvodni fotku doplnit 3 kratke prakticke body: pro koho je pobyt, prijezd a co host dostane pred prijezdem.',
                strengthEvidence,
            ),
        );
    }

    if (allContent.includes('pred prijezdem') && allContent.includes('behem pobytu')) {
        wins.push(
            makeQuickWin(
                'Rozdelit informace pred prijezdem a behem pobytu',
                'Podklad primo zminuje potrebu jasneho rozdeleni situaci pred prijezdem a behem pobytu.',
                'V popisu nebo odkazu na guest guide rozdelit obsah na dve casti: pred prijezdem a behem pobytu.',
                frictionEvidence,
            ),
        );
    }

    const deduped = wins.filter((win, index, allWins) => allWins.findIndex((candidate) => candidate.title === win.title) === index);

    return deduped.slice(0, 3);
};

export function extractAuditObservations(input: AuditExtractionInput): AuditExtractionResult {
    const usableMaterials = input.sourceMaterials.filter((material) => material.content.trim().length >= 40);
    const combinedContent = usableMaterials.map((material) => material.content).join(' ');

    if (usableMaterials.length === 0) {
        return {
            status: 'needs-more-input',
            message: 'Vloz alespon jeden verejny text nebo poznamku dlouhou aspon 40 znaku. Odkaz sam o sobe aplikace necte.',
            evidenceNotes: [],
        };
    }

    const strengthMatch = firstMatchingSentence(usableMaterials, strengthKeywords);
    const frictionMatch = firstMatchingSentence(usableMaterials, frictionKeywords);
    const hasSignals = hasAny(combinedContent, [...strengthKeywords, ...frictionKeywords]);

    if (!hasSignals || !strengthMatch || !frictionMatch) {
        return {
            status: 'needs-more-input',
            message: 'Podklad je moc obecny. Dopln konkretni verejny text o silnych strankach a praktickych nejasnostech, napr. fotky, lokalita, check-in, parkovani nebo guest guide.',
            evidenceNotes: usableMaterials.map((material) => material.title || 'Podklad bez nazvu'),
        };
    }

    const strengthEvidence = evidenceLabel(strengthMatch.material, strengthMatch.sentence);
    const frictionEvidence = evidenceLabel(frictionMatch.material, frictionMatch.sentence);
    const quickWins = buildQuickWins(usableMaterials, strengthEvidence, frictionEvidence);

    if (quickWins.length < 3) {
        return {
            status: 'needs-more-input',
            message: 'Nasel jsem signaly, ale pro 3 konkretni quick wins dopln jeste material k praktickym informacim, prijezdu, fotkam, popisu nebo guest guide.',
            evidenceNotes: [strengthEvidence, frictionEvidence],
        };
    }

    const materialTitles = unique(usableMaterials.map((material) => material.title || 'Vlozeny podklad'));
    const publicSignals = unique([
        `Silna stranka z podkladu: ${strengthMatch.sentence}`,
        `Friction signal z podkladu: ${frictionMatch.sentence}`,
    ]);

    return {
        status: 'completed',
        message: `Pripravil jsem auditova pozorovani z ${usableMaterials.length} vlozeneho podkladu. URL slouzily jen jako reference, ne jako automaticky cteny zdroj.`,
        evidenceNotes: [strengthEvidence, frictionEvidence],
        draft: {
            firstImpression: `${input.leadName || 'Nabidka'} pusobi podle vlozeneho verejneho materialu silne v prvnim dojmu, ale prakticke informace pred rezervaci potrebuji jasnejsi strukturu. Evidence: ${strengthEvidence}`,
            strengths: `Silna stranka: ${strengthMatch.sentence}. Zdroj: ${strengthMatch.material.title || 'vlozeny podklad'}.`,
            reviewSignals: `Z vlozenych podkladu: ${materialTitles.join(', ')}. K dispozici jsou rucne dodane verejne signaly, ne automaticky prectene recenze z URL.`,
            guestFrictionSignals: `Mozne treni hosta: ${frictionMatch.sentence}. Zdroj: ${frictionMatch.material.title || 'vlozeny podklad'}.`,
            risks: 'Riziko je, ze silny prvni dojem nebude nasledovany jasnymi informacemi o prijezdu, check-inu a tom, co host dostane pred pobytem.',
            businessOpportunity: 'Nejvetsi prilezitost je prevest silny verejny prvni dojem do prakticke jistoty pred rezervaci: prijezd, check-in, parkovani a guest guide.',
            mainPhotoVerdict: hasAny(combinedContent, ['silna uvodni fotka', 'silnou uvodni fotku', 'uvodni fotka']) ? 'strong' : 'unknown',
            mainPhotoObservation: hasAny(combinedContent, ['silna uvodni fotka', 'silnou uvodni fotku', 'uvodni fotka'])
                ? `Podklad zminuje silnou uvodni fotku. Evidence: ${strengthEvidence}`
                : '',
            checkInParkingInfo: hasAny(combinedContent, ['check-in', 'parking', 'parkovani', 'pred prijezdem'])
                ? `Prakticke informace pred prijezdem jsou hlavni tema k doplneni. Evidence: ${frictionEvidence}`
                : '',
            guestConfusion: 'Host muze rychle pochopit vizual a typ ubytovani, ale bez jasneho rozdeleni informaci pred prijezdem a behem pobytu muze zustat nejisty.',
            structuredQuickWins: quickWins,
            publicSignals,
            selectedOfferAngle: hasAny(combinedContent, ['guest guide', 'qr']) ? 'guest-guide' : 'description',
        },
    };
}
