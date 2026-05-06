import { AccommodationType, LeadCandidate, LeadSearchSession, OfferAngle } from './types';

const emailPattern = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i;
const urlPattern = /https?:\/\/[^\s]+|www\.[^\s]+/i;

const recommendedSearchQueries = [
    'apartmany self check-in Praha',
    'penzion parkovani Cesky Krumlov',
    'ubytovani bez recepce Brno',
    'apartmany keybox Plzen',
    'maly hotel check-in instrukce',
];

export const leadFinderMockText = `Apartmany River Gate
Mesto: Praha
Typ: Apartman
URL: https://example.com/river-gate
Email: rezervace@rivergate.example
Poznamky: Vice jednotek, self check-in, keybox, parkovani ve dvore. Popis je kratky a fotky jsou v nejasnem poradi.
Recenze: Hoste zminuji prijezd, parkovani a nejasne instrukce k Wi-Fi.

Penzion U Mostu
Mesto: Cesky Krumlov
Typ: Penzion
URL: https://example.com/penzion-u-mostu
Email: info@umostu.example
Poznamky: Maly penzion, dobra lokalita, parkovani je popsane az dole. Hlavni fotka ukazuje fasadu, pokoje pusobi silneji.
Recenze: Chvala lokality, ale casto dotazy na prijezd a check-in.

Hotel Kompakt
Mesto: Brno
Typ: Hotel
URL: https://example.com/hotel-kompakt
Poznamky: Mensi hotel bez recepce v noci, online check-in, vice jednotek, vlastni web.
Recenze: Hoste zminuji rychlou komunikaci, ale take nejasnosti u nocniho prijezdu.`;

export { recommendedSearchQueries };

const lower = (value: string) => value.toLowerCase();

const includesAny = (value: string, keywords: string[]) => keywords.some((keyword) => value.includes(keyword));

const getLineValue = (block: string, labels: string[]) => {
    const lines = block.split('\n').map((line) => line.trim());
    const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const matcher = new RegExp(`^(${labelPattern})\\s*[:-]\\s*(.+)$`, 'i');
    const line = lines.find((currentLine) => matcher.test(currentLine));

    return line?.replace(matcher, '$2').trim() ?? '';
};

const inferAccommodationType = (text: string, fallbackType: AccommodationType | ''): AccommodationType => {
    const content = lower(text);

    if (includesAny(content, ['apartman', 'apartmany', 'apartment'])) {
        return 'Apartman';
    }

    if (includesAny(content, ['penzion', 'pension'])) {
        return 'Penzion';
    }

    if (includesAny(content, ['hotel'])) {
        return 'Hotel';
    }

    return fallbackType || 'Jine';
};

const inferName = (block: string) => {
    const labeledName = getLineValue(block, ['nazev', 'name', 'ubytovani']);

    if (labeledName) {
        return labeledName;
    }

    return block
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line && !line.includes(':')) ?? 'Neznamy kandidat';
};

const inferRecommendedAngle = (text: string): OfferAngle => {
    const content = lower(text);

    if (includesAny(content, ['recenze', 'review', 'hodnoceni'])) {
        return 'reviews';
    }

    if (includesAny(content, ['komunikace', 'zpravy', 'odpoved', 'domluva'])) {
        return 'guest-communication';
    }

    if (includesAny(content, ['check-in', 'checkin', 'keybox', 'prijezd', 'wifi', 'wi-fi', 'instrukce'])) {
        return 'guest-guide';
    }

    if (includesAny(content, ['poradi fotek', 'galerie', 'fotky'])) {
        return 'photo-order';
    }

    if (includesAny(content, ['popis', 'text'])) {
        return 'description';
    }

    return 'main-photo';
};

export function scoreLeadCandidate(candidate: Omit<LeadCandidate, 'score' | 'signals' | 'recommendedOfferAngle'>) {
    const content = lower(`${candidate.name} ${candidate.accommodationType} ${candidate.sourceNotes} ${candidate.reviewSnippets} ${candidate.url} ${candidate.email}`);
    const signals: string[] = [];
    let score = 0;

    if (candidate.email) {
        score += 18;
        signals.push('Verejny kontakt / e-mail');
    }

    if (['Apartman', 'Penzion', 'Hotel'].includes(candidate.accommodationType)) {
        score += candidate.accommodationType === 'Hotel' ? 10 : 16;
        signals.push('Vhodny mensi typ ubytovani');
    }

    if (includesAny(content, ['self check-in', 'self checkin', 'bez recepce', 'bezrecepcni', 'online check-in', 'keybox'])) {
        score += 14;
        signals.push('Self check-in / bezrecepcni provoz');
    }

    if (includesAny(content, ['parkovani', 'keybox', 'prijezd', 'wi-fi', 'wifi', 'vice jednotek', 'vice apartmanu'])) {
        score += 12;
        signals.push('Operacni signaly: parkovani, prijezd, Wi-Fi nebo vice jednotek');
    }

    if (includesAny(content, ['recenze', 'check-in', 'komunikace', 'prijezd', 'parkovani', 'nejasn', 'instrukce'])) {
        score += 16;
        signals.push('Recenze / verejne texty zminuji mozne treni hosta');
    }

    if (includesAny(content, ['slaby popis', 'kratky popis', 'nejasny popis', 'fotky', 'hlavni fotka', 'poradi fotek', 'galerie'])) {
        score += 14;
        signals.push('Prostor pro zlepseni popisu nebo fotek');
    }

    if (candidate.url) {
        score += 10;
        signals.push('Vlastni web nebo OTA profil');
    }

    return {
        score: Math.min(score, 100),
        signals,
        recommendedOfferAngle: inferRecommendedAngle(content),
    };
}

export function parseLeadCandidates(sourceText: string, session: Pick<LeadSearchSession, 'cityOrArea' | 'accommodationType'>) {
    const blocks = sourceText
        .split(/\n\s*\n|---+/)
        .map((block) => block.trim())
        .filter(Boolean);

    return blocks.map((block): LeadCandidate => {
        const email = block.match(emailPattern)?.[0] ?? '';
        const url = block.match(urlPattern)?.[0] ?? '';
        const sourceNotes = getLineValue(block, ['poznamky', 'notes', 'nabidka']) || block;
        const reviewSnippets = getLineValue(block, ['recenze', 'reviews', 'hodnoceni']);
        const candidateBase = {
            id: `candidate-${crypto.randomUUID()}`,
            name: inferName(block),
            city: getLineValue(block, ['mesto', 'oblast', 'city']) || session.cityOrArea,
            accommodationType: inferAccommodationType(block, session.accommodationType),
            email,
            url,
            sourceNotes,
            reviewSnippets,
        };
        const scoring = scoreLeadCandidate(candidateBase);

        return {
            ...candidateBase,
            ...scoring,
        };
    });
}