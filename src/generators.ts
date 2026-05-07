import { buildWebsiteOnlyOutreach, sanitizeClientText } from './clientCopy';
import { Lead, QuickWin } from './types';

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

const firstLine = (value: string, fallback: string) => cleanSentence(value.split('\n').map((line) => line.trim()).find(Boolean) || fallback);

const strongestPositive = (lead: Lead) =>
    firstLine(
        lead.strengths,
        lead.screenshotAnalysis?.visibleStrengths?.[0] || lead.publicSignals[0] || 'prezentace působí na první pohled důvěryhodně',
    );

const bestProposal = (lead: Lead, wins: QuickWin[]) => {
    const galleryObservation = firstLine(lead.photoOrderObservation, '');

    if (galleryObservation) {
        return `Zkusil bych první fotky poskládat víc jako krátký příběh hosta: nejsilnější atmosféra, pokoj, koupelna, lokalita a důkaz hodnocení.`;
    }

    const firstWin = wins[0];
    if (firstWin) return cleanSentence(firstWin.action || firstWin.title);

    return 'Zkusil bych víc zvýraznit nejsilnější důvod, proč si host má vybrat právě vás.';
};

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
        return sanitizeGeneratedText(`Klientský mini-audit zatím negeneruji. Lead potřebuje konkrétnější veřejné podklady nebo screenshotovou analýzu, aby text nepůsobil obecně.`, 40);
    }

    const wins = gate.completeWins.slice(0, 3);
    const proposals = wins.map((win) => `- ${cleanSentence(win.title)}: ${cleanSentence(win.action)}.`).join('\n');
    const firstImpression = firstLine(lead.firstImpression, `${leadTitle(lead)} působí z veřejné prezentace důvěryhodně.`);
    const strengths = strongestPositive(lead);
    const guestBenefit = firstLine(lead.guestConfusion || lead.guestFrictionSignals || lead.businessOpportunity, 'Host se rychleji zorientuje a snáz pochopí, proč rezervovat právě tady.');

    const nextStep = lead.websiteExtraction && lead.screenshots.length === 0
        ? 'Nejrychlejší by bylo vybrat 2 až 3 úpravy praktických informací před příjezdem: příjezd, parkování, check-in, FAQ a kontakt pro hosty.'
        : 'Nejrychlejší by bylo vybrat 2 až 3 úpravy fotek, galerie nebo popisu a otestovat, jestli nabídka působí jasněji už v prvních sekundách.';

    return sanitizeGeneratedText(`Mini-audit veřejné nabídky: ${leadTitle(lead)}

1. První dojem
${firstImpression}

2. Co působí dobře
${strengths}.

3. Co bych zlepšil jako první
${proposals}

4. Proč to může pomoct hostovi
${guestBenefit}.

5. Další krok
${nextStep}`, 230);
}

export function generateFirstOutreach(lead: Lead) {
    const gate = qualityGate(lead);

    if (!gate.isReady) {
        return sanitizeGeneratedText('Zatím bych první oslovení neposílal. Chybí konkrétní veřejné pozorování a jeden jasný návrh, aby zpráva nepůsobila obecně.', 40);
    }

    if (lead.websiteExtraction && lead.screenshots.length === 0) {
        return sanitizeGeneratedText(buildWebsiteOnlyOutreach({ leadName: lead.name, websiteExtraction: lead.websiteExtraction, signals: lead.publicSignals }), 150);
    }

    const positive = strongestPositive(lead);
    const proposal = bestProposal(lead, gate.completeWins);
    const text = `Dobrý den,

narazil jsem na veřejnou prezentaci ${leadTitle(lead)} a první dojem působí dobře. Zaujalo mě hlavně: ${positive}.

Všiml jsem si ale jedné drobnosti: ${proposal}

Nejde o kritiku, spíš o rychlý pohled zvenku. Pomáhám ubytováním zlepšit první dojem z veřejné nabídky a zjednodušit komunikaci s hosty.

Neřešil bych velký redesign. Stačil by malý balíček úprav: pořadí prvních fotek, jedna ostřejší věta v popisu a lepší práce s hodnocením nebo recenzemi v prvních sekundách, hlavně na mobilu. To jsou věci, které host rychle pochopí ještě před otevřením detailů.

Můžu vám zdarma poslat 3 krátké návrhy v bodech. Má smysl vám to poslat?

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
        return sanitizeGeneratedText(`Návrh dalšího kroku pro ${leadTitle(lead)}

1. Rychlý audit praktických informací
Krátký pohled na příjezd, parkování, check-in, FAQ a kontakt pro hosty.

2. Předpříjezdový přehled
Soustředit nejdůležitější informace na jedno místo, aby host věděl, kdy dorazí instrukce a koho kontaktovat.

3. Opatrné ověření guest guide
Pokud už neveřejný průvodce pro hosty existuje, zkontrolovat, jak dobře navazuje na zprávy před příjezdem. Pokud ne, připravit jednoduchou verzi pro hosty.

Doporučený začátek
Začal bych krátkým auditem veřejného webu a 3 konkrétními návrhy v bodech.`, 180);
    }

    return sanitizeGeneratedText(`Návrh dalšího kroku pro ${leadTitle(lead)}

1. Rychlý audit veřejné nabídky
Krátký pohled na první dojem, fotky, popis, recenze a 3 prioritní návrhy.

2. Úprava prvního dojmu
Seřazení galerie, zpřesnění hlavních textů a zvýraznění toho, proč si host vybere právě toto ubytování.

3. Online průvodce a předpříjezdové instrukce
Pokud už průvodce pro hosty máte, dává smysl zkontrolovat, jak dobře navazuje na zprávy před příjezdem. Pokud ne, jde připravit jednoduchá verze pro příjezd, parkování, check-in a časté dotazy.

Doporučený začátek
Začal bych rychlým auditem veřejné nabídky, protože rychle ukáže, které úpravy mají největší smysl.`, 180);
}