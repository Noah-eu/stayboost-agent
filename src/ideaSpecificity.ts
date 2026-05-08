import type { Lead, QuickWin, WebsiteExtractionResult } from './types';

type SignalKey = 'parking' | 'ev' | 'contact' | 'restaurant' | 'terrace' | 'relax' | 'river' | 'island' | 'wedding' | 'conference' | 'romantic' | 'castle';

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
].filter(Boolean).join('\n');

const matchers: Array<{ key: SignalKey; label: string; keywords: string[] }> = [
    { key: 'parking', label: 'parkoviště', keywords: ['parkoviste', 'parkovani', 'parking'] },
    { key: 'ev', label: 'nabíjecí stanice pro elektromobily', keywords: ['nabijeci stanice', 'nabijeni elektromobilu', 'elektromobil', 'ev charging', 'charging station'] },
    { key: 'contact', label: 'kontakt / recepce', keywords: ['recepce', 'kontakt', 'telefon', 'e-mail', 'email'] },
    { key: 'restaurant', label: 'restaurace', keywords: ['restaurace', 'restaurant'] },
    { key: 'terrace', label: 'terasa', keywords: ['terasa', 'terrace'] },
    { key: 'relax', label: 'relax centrum', keywords: ['relax centrum', 'relaxacni centrum', 'wellness', 'spa'] },
    { key: 'river', label: 'Berounka', keywords: ['berounka'] },
    { key: 'island', label: 'soukromý ostrov', keywords: ['soukromy ostrov', 'soukromy ostrov', 'ostrov'] },
    { key: 'wedding', label: 'svatební altán', keywords: ['svatebni altan', 'svatba', 'svatebni', 'party stan', 'gril'] },
    { key: 'conference', label: 'konferenční prostory', keywords: ['konferencni prostory', 'konference', 'firemni akce', 'skoleni'] },
    { key: 'romantic', label: 'romantický hotel', keywords: ['romanticky hotel', 'romanticky vikend', 'romanticke pobyty'] },
    { key: 'castle', label: 'Karlštejn', keywords: ['karlstejn', 'hrad karlstejn', 'pod hradem'] },
];

const firstEvidence = (extraction: WebsiteExtractionResult | undefined, signal: SpecificSignal) => {
    const normalizedLabel = normalize(signal.label);
    const page = extraction?.pagesExtracted.find((candidate) => normalize(`${candidate.title}\n${candidate.textPreview}\n${candidate.url}`).includes(normalizedLabel));

    return page ? `${signal.label}: ${page.title || page.url}` : signal.evidence;
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
            evidence: firstEvidence(lead.websiteExtraction, { key: matcher.key, label: matcher.label, evidence: matcher.label }),
        }));

    return uniqueStrings(signals.map((signal) => signal.key)).map((key) => signals.find((signal) => signal.key === key)).filter(Boolean) as SpecificSignal[];
};

const hasSignal = (signals: SpecificSignal[], keys: SignalKey[]) => signals.some((signal) => keys.includes(signal.key));
const labelsFor = (signals: SpecificSignal[], keys: SignalKey[]) => signals.filter((signal) => keys.includes(signal.key)).map((signal) => signal.label);
const evidenceFor = (signals: SpecificSignal[], keys: SignalKey[], fallback: string) => labelsFor(signals, keys).length ? labelsFor(signals, keys).join(', ') : fallback;

const makeWin = (title: string, why: string, action: string, sourceEvidence: string, uniqueBusinessAngle: string): QuickWin => ({
    id: `quick-win-${crypto.randomUUID()}`,
    title,
    why,
    action,
    sourceEvidence,
    candidateSpecificity: 'specific',
    uniqueBusinessAngle,
});

const genericTitlePattern = /p[řr]ijezd na jedn|parkov[aá]n[ií] bez|mini faq|faq p[řr]ed|zviditelnit praktick|str[aá]nku p[řr]ed p[řr]ijezdem/i;
const genericTextPattern = /host tak m[uů][žz]e h[uů][řr]|nen[ií] jasn[eě] vid[eě]t parkov[aá]n[ií]|nej[čc]ast[eě]j[šs][ií]ch p[řr]edp[řr][ií]jezdov[yý]ch ot[aá]zek/i;

export const annotateQuickWinSpecificity = (quickWin: QuickWin, lead: Pick<Lead, 'websiteExtraction' | 'strengths' | 'publicSignals' | 'checkInParkingInfo'>): QuickWin => {
    const signals = detectCandidateSpecificSignals(lead);
    const combined = normalize(`${quickWin.title}\n${quickWin.why}\n${quickWin.action}\n${quickWin.sourceEvidence}`);
    const matchedSignals = signals.filter((signal) => combined.includes(normalize(signal.label)) || signal.key === 'ev' && /ev|nabijeci|elektromobil/.test(combined));
    const isGeneric = genericTitlePattern.test(quickWin.title) || genericTextPattern.test(`${quickWin.why}\n${quickWin.action}`) || matchedSignals.length === 0;

    return {
        ...quickWin,
        candidateSpecificity: isGeneric ? 'generic' : 'specific',
        uniqueBusinessAngle: quickWin.uniqueBusinessAngle || (matchedSignals.length ? matchedSignals.map((signal) => signal.label).join(', ') : 'obecné předpříjezdové informace'),
    };
};

export const buildSpecificFreeIdeas = (lead: Pick<Lead, 'name' | 'websiteExtraction' | 'strengths' | 'publicSignals' | 'checkInParkingInfo'>, existingWins: QuickWin[] = []): QuickWin[] => {
    const signals = detectCandidateSpecificSignals(lead);
    const wins: QuickWin[] = [];

    if (hasSignal(signals, ['parking', 'ev', 'contact'])) {
        wins.push(makeWin(
            'Předpříjezdový přehled pro hosty',
            `Web už zmiňuje ${evidenceFor(signals, ['parking', 'ev', 'contact'], 'praktické kontaktní informace')}; hostovi může pomoct dostat tyto praktické body pohromadě ještě před cestou.`,
            `Spojit adresu, cestu, recepci, ${hasSignal(signals, ['parking']) ? 'parkování' : 'příjezd'}, ${hasSignal(signals, ['ev']) ? 'EV nabíjení, ' : ''}kontakt a časové informace do krátkého přehledu před pobytem.`,
            evidenceFor(signals, ['parking', 'ev', 'contact'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
            'praktická orientace před příjezdem navázaná na parkování, EV nabíjení a kontakt',
        ));
    }

    if (hasSignal(signals, ['restaurant', 'terrace', 'relax', 'river', 'island', 'wedding'])) {
        wins.push(makeWin(
            'Využít silné stránky areálu před pobytem',
            `Web má silné pobytové motivy: ${evidenceFor(signals, ['restaurant', 'terrace', 'relax', 'river', 'island', 'wedding'], 'služby a okolí')}. Ty mohou hosta naladit ještě před příjezdem.`,
            `Do zprávy před příjezdem přidat krátké připomenutí toho, co lze využít na místě: ${labelsFor(signals, ['restaurant', 'relax', 'river', 'island', 'wedding']).join(', ') || 'služby, okolí a tipy před pobytem'}.`,
            evidenceFor(signals, ['restaurant', 'terrace', 'relax', 'river', 'island', 'wedding'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
            'předpobytové naladění hosta přes konkrétní služby a místo',
        ));
    }

    if (hasSignal(signals, ['romantic', 'wedding', 'conference', 'castle', 'river'])) {
        wins.push(makeWin(
            'Rozdělit informace podle typu pobytu',
            `Web oslovuje více situací: ${evidenceFor(signals, ['romantic', 'wedding', 'conference', 'castle', 'river'], 'různé typy pobytu')}. Každý host může před příjezdem potřebovat trochu jiný kontext.`,
            `Připravit varianty předpříjezdového přehledu pro romantický víkend, svatbu nebo akci, firemní pobyt a výlet na Karlštejn podle toho, co si host rezervoval.`,
            evidenceFor(signals, ['romantic', 'wedding', 'conference', 'castle', 'river'], lead.websiteExtraction?.summary || 'Veřejný web provozu'),
            'segmentace komunikace podle motivu pobytu',
        ));
    }

    const annotatedExisting = existingWins.map((win) => annotateQuickWinSpecificity(win, lead));
    const nonDuplicateExisting = annotatedExisting.filter((win) => !wins.some((candidate) => normalize(candidate.title) === normalize(win.title)));

    return [...wins, ...nonDuplicateExisting].slice(0, 3).map((win) => annotateQuickWinSpecificity({ ...win, id: win.id || `quick-win-${crypto.randomUUID()}` }, lead));
};

export const freeIdeaSpecificityDiagnostics = (lead: Pick<Lead, 'structuredQuickWins' | 'freeIdeas' | 'websiteExtraction' | 'strengths' | 'publicSignals' | 'checkInParkingInfo'>) => {
    const ideas = (lead.freeIdeas?.length ? lead.freeIdeas : lead.structuredQuickWins ?? []).slice(0, 3).map((win) => annotateQuickWinSpecificity(win, lead));
    const genericFreeIdeasCount = ideas.filter((idea) => idea.candidateSpecificity === 'generic').length;
    const candidateSpecificSignals = detectCandidateSpecificSignals(lead);
    const combinedIdeas = normalize(ideas.map((idea) => `${idea.title}\n${idea.why}\n${idea.action}\n${idea.sourceEvidence}\n${idea.uniqueBusinessAngle}`).join('\n'));
    const candidateSpecificSignalsUsed = uniqueStrings(candidateSpecificSignals.filter((signal) => combinedIdeas.includes(normalize(signal.label)) || signal.key === 'ev' && /ev|nabijeci|elektromobil/.test(combinedIdeas)).map((signal) => signal.label));
    const repeatedTemplateWarning = genericFreeIdeasCount >= 2 || ideas.map((idea) => normalize(idea.title)).join('|').includes('prijezd na jednu stranku') && combinedIdeas.includes('mini faq');

    return {
        freeIdeasSpecificityScore: ideas.length ? Math.round(((ideas.length - genericFreeIdeasCount) / ideas.length) * 100) : 0,
        genericFreeIdeasCount,
        candidateSpecificSignalsUsed,
        repeatedTemplateWarning,
    };
};
