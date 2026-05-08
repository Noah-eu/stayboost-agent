import { buildFreeIdeaTeaser, buildPaidNextStep, buildWebsiteOnlyOutreach, sanitizeClientText } from './clientCopy';
import { detectCandidateSpecificSignals } from './ideaSpecificity';
import { Lead } from './types';

const hasText = (value = '') => value.trim().length > 0;

const cleanSentence = (value = '') => value.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');

const completedQuickWins = (lead: Lead) =>
    (lead.structuredQuickWins ?? []).filter((win) => hasText(win.title) && hasText(win.action) && hasText(win.why));

const concreteObservations = (lead: Lead) =>
    [
        lead.firstImpression,
        lead.mainPhotoObservation,
        lead.photoOrderObservation,
        lead.descriptionObservation,
        lead.checkInParkingInfo,
        lead.reviewSignals,
        lead.guestConfusion,
        lead.businessOpportunity,
    ].filter(hasText);

const qualityGate = (lead: Lead) => {
    const missing: string[] = [];
    const completeWins = completedQuickWins(lead);

    if ((lead.publicLinks ?? []).filter((link) => hasText(link.url)).length < 1) missing.push('alespoň 1 veřejný link');
    if (!hasText(lead.strengths)) missing.push('alespoň 1 silná stránka');
    if (concreteObservations(lead).length < 2) missing.push('alespoň 2 konkrétní pozorování');
    if (completeWins.length !== 3) missing.push('3 quick wins s důvodem a akcí');

    return { isReady: missing.length === 0, missing, completeWins };
};

const forbiddenClientPhrases = [
    'evidenceLimits',
    'fallback',
    'OpenAI',
    'Tavily',
    'sourceEvidence',
    'setup automation',
    'public snippet',
    'manually entered observations',
    'aplikace odkazy nečetla',
    'aplikace odkazy necetla',
    'ručně zapsaných pozorování',
    'rucne zapsanych pozorovani',
    'Východisko',
    'Vychodisko',
];

const stripForbiddenClientLanguage = (value: string) => {
    const cleanedLines = value
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => !forbiddenClientPhrases.some((phrase) => line.toLowerCase().includes(phrase.toLowerCase())));

    return cleanedLines
        .join('\n')
        .replace(/public snippetu?/gi, 'veřejné ukázky')
        .replace(/snippetů/gi, 'veřejných ukázek')
        .replace(/snippet/gi, 'veřejná ukázka')
        .replace(/quick wins?/gi, 'rychlé návrhy')
        .replace(/guest guide/gi, 'online průvodce pro hosty')
        .replace(/\.{3,}/g, '.')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

const limitWords = (value: string, maxWords: number) => {
    const words = value.trim().split(/\s+/).filter(Boolean);

    if (words.length <= maxWords) return value.trim();

    const truncated = words.slice(0, maxWords).join(' ');
    const lastSentenceEnd = Math.max(truncated.lastIndexOf('.'), truncated.lastIndexOf('?'), truncated.lastIndexOf('!'));

    return lastSentenceEnd > 80 ? truncated.slice(0, lastSentenceEnd + 1).trim() : truncated.trim().replace(/[,:;]+$/, '') + '.';
};

const sanitizeGeneratedText = (value: string, maxWords: number) => limitWords(sanitizeClientText(stripForbiddenClientLanguage(value)), maxWords);

const leadTitle = (lead: Lead) => lead.name.trim() || 'vaše ubytování';

export function generateInternalAgentBrief(lead: Lead) {
    const gate = qualityGate(lead);

    return `Interní poznámky agenta: ${leadTitle(lead)}

Stav leadu: ${lead.agentLeadStatus}
Evidence level: ${lead.evidenceLevel}
Needs agent analysis: ${lead.needsAgentAnalysis ? 'ano' : 'ne'}
Quality gate: ${gate.isReady ? 'OK' : `chybí ${gate.missing.join(', ')}`}
Skóre: lead ${lead.leadScore}, opportunity ${lead.opportunityScore ?? 0}, fit ${lead.fitVerdict || 'neuvedeno'}

Co víme:
${[lead.firstImpression, lead.strengths, lead.reviewSignals].filter(hasText).join('\n') || 'Zatím jen omezené veřejné podklady.'}

Rizika a limity:
${[lead.risks, lead.guestFrictionSignals, ...(lead.sourceLimitations ?? [])].filter(hasText).map((item) => `- ${item}`).join('\n') || '- Bez zásadních poznámek.'}

Důvod dalšího kroku:
${lead.qualificationReason || lead.businessOpportunity || 'Doplnit podklady, potom rozhodnout, jestli lead oslovit.'}`;
}

export function generateMiniAudit(lead: Lead) {
    const gate = qualityGate(lead);

    if (!gate.isReady) {
        return sanitizeGeneratedText(`3 nápady zdarma zatím negeneruji. Lead potřebuje konkrétnější veřejné podklady nebo analýzu, aby text nepůsobil obecně.`, 40);
    }

    const wins = gate.completeWins.slice(0, 3);
    const proposals = wins.map((win, index) => `${index + 1}. ${cleanSentence(win.title)}
${cleanSentence(win.action)}.
Podklad: ${cleanSentence(win.sourceEvidence)}.`).join('\n\n');
    const strengths = detectCandidateSpecificSignals(lead).map((signal) => signal.label).slice(0, 6);
    const why = wins.map((win) => cleanSentence(win.why)).filter(Boolean).join(' ');
    const paidStep = cleanSentence(lead.paidNextStep || generateOffer(lead));

    return sanitizeGeneratedText(`3 nápady zdarma pro ${leadTitle(lead)}

Poslat až po souhlasu. Beru to jako malou ukázku pohledu zvenku, ne jako rozbor ani kritiku.

Co už působí dobře
${strengths.length ? strengths.join(', ') : cleanSentence(lead.strengths) || 'Web už dává dobrý základ pro předpříjezdovou komunikaci'}.

3 konkrétní nápady
${proposals}

Proč by to mohlo pomoct hostovi
${why || 'Host dostane praktické informace a důvody těšit se na pobyt přehledně před příjezdem.'}

Co by mohl být placený další krok
${paidStep}.`, 260);
}

export function generateFirstOutreach(lead: Lead) {
    const gate = qualityGate(lead);

    if (!gate.isReady) {
        return sanitizeGeneratedText('Zatím bych první oslovení neposílal. Chybí konkrétní veřejné pozorování a jeden jasný návrh, aby zpráva nepůsobila obecně.', 40);
    }

    if (lead.websiteExtraction && lead.screenshots.length === 0) {
        return sanitizeGeneratedText(buildWebsiteOnlyOutreach({ leadName: lead.name, websiteExtraction: lead.websiteExtraction, signals: lead.publicSignals }), 150);
    }

    const text = `Dobrý den,

omlouvám se za nevyžádanou zprávu. Pohybuji se kolem ubytování a narazil jsem na váš web ${leadTitle(lead)}.

Nevidím samozřejmě, co hostům posíláte po rezervaci, takže nechci dělat žádné velké závěry. Jen mě napadlo, že bych vám mohl zdarma poslat 3 krátké nápady k tomu, jak hostům ještě víc zpřehlednit informace před příjezdem — například příjezd, parkování, check-in a nejčastější dotazy.

Beru to jen jako malou ukázku. Když se vám to bude zdát užitečné, můžeme se pak domluvit na větší úpravě za úplatu. Když ne, vůbec se nic neděje.

Má smysl vám ty 3 body poslat?

David`;

    return sanitizeGeneratedText(text, 155);
}

export function generateFollowUp(lead: Lead) {
    const topic = lead.websiteExtraction && lead.screenshots.length === 0
        ? `příjezdu, parkování, check-inu a častým otázkám hostů na webu ${leadTitle(lead)}`
        : `prvnímu dojmu z veřejné nabídky ${leadTitle(lead)} — fotky, galerie a praktické informace pro hosta`;

    return sanitizeGeneratedText(`Dobrý den,

jen krátce navazuji na předchozí zprávu. Šlo mi hlavně o pár rychlých návrhů k ${topic}.

Pokud to teď není aktuální, vůbec nevadí. Kdyby se vám hodilo, pošlu 3 konkrétní body zdarma.

David`, 85);
}

export function generateOffer(lead: Lead) {
    if (lead.websiteExtraction && lead.screenshots.length === 0) {
        return sanitizeGeneratedText(buildPaidNextStep({ leadName: lead.name }), 80);
    }

    return sanitizeGeneratedText(buildPaidNextStep({ leadName: lead.name }), 80);
}

export function generateFreeIdeaTeaser(lead: Lead) {
    return sanitizeGeneratedText(buildFreeIdeaTeaser({ leadName: lead.name }), 60);
}