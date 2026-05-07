import { Lead, QuickWin, offerAngleLabels } from './types';

const hasText = (value: string) => value.trim().length > 0;

const cleanSentence = (value: string) => value.trim().replace(/[.!?]+$/, '');

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

    if ((lead.publicLinks ?? []).filter((link) => hasText(link.url)).length < 1) {
        missing.push('alespon 1 verejny link');
    }

    if (!hasText(lead.strengths)) {
        missing.push('alespon 1 silna stranka');
    }

    if (concreteObservations(lead).length < 2) {
        missing.push('alespon 2 konkretni pozorovani');
    }

    if (completeWins.length !== 3) {
        missing.push('presne 3 quick wins s title/action/why');
    }

    return { isReady: missing.length === 0, missing, completeWins };
};

const missingQuickWins = (lead: Lead) =>
    [0, 1, 2]
        .map((index) => (lead.structuredQuickWins ?? [])[index])
        .map((win, index) => (win && hasText(win.title) && hasText(win.action) && hasText(win.why) ? undefined : `Dopln quick win #${index + 1}`))
        .filter((value): value is string => Boolean(value));

const listQuickWins = (wins: QuickWin[]) =>
    wins
        .slice(0, 3)
        .map((win, index) => `${index + 1}. ${win.title}\n   Proc: ${win.why}\n   Akce: ${win.action}${hasText(win.sourceEvidence) ? `\n   Evidence: ${win.sourceEvidence}` : ''}`)
        .join('\n');

const leadTitle = (lead: Lead) => lead.name.trim() || 'toto ubytovani';

export function generateMiniAudit(lead: Lead) {
    const gate = qualityGate(lead);

    if (!gate.isReady) {
        if (lead.extractionStatus !== 'completed' && (lead.sourceMaterials ?? []).length === 0) {
            return 'Nejdriv vloz verejny text nebo poznamky a klikni na Pripravit auditova pozorovani. Odkazy slouzi jen k otevreni zdroje; aplikace URL sama necte.';
        }

        return `Audit zatim neni dost konkretni. Dopln alespon 2 konkretni pozorovani a 3 quick wins.

Chybi:
${gate.missing.map((item) => `- ${item}`).join('\n')}
${missingQuickWins(lead).length > 0 ? `\nQuick wins k doplneni:\n${missingQuickWins(lead).map((item) => `- ${item}`).join('\n')}` : ''}

Poznamka: V teto verzi aplikace odkazy necte automaticky. Audit muze vychazet pouze z pozorovani, ktera rucne vyplnis.`;
    }

    const photoLine = {
        strong: `Hlavni fotka pusobi jako silna cast prezentace: ${cleanSentence(lead.mainPhotoObservation)}. Doporuceni proto smeruji spis na dalsi casti nabidky nez na vymenu hlavni fotky.`,
        average: `Hlavni fotka je hodnocena jako prumerna: ${cleanSentence(lead.mainPhotoObservation)}.`,
        weak: `Hlavni fotka je slaba: ${cleanSentence(lead.mainPhotoObservation)}. Pokud by se menila, vhodny smer je: ${cleanSentence(lead.betterPhotoSuggestion)}.`,
        unknown: 'Hlavni fotka nebyla samostatne hodnocena, audit se proto opira hlavne o ostatni verejna pozorovani.',
    }[lead.mainPhotoVerdict];
    const nextStep =
        lead.mainPhotoVerdict === 'strong' && lead.selectedOfferAngle === 'main-photo'
            ? 'Zacit prvnim quick winem a nechat silnou hlavni fotku jako oporu prvniho dojmu.'
            : `Zacit podle uhlu: ${offerAngleLabels[lead.selectedOfferAngle]}.`;

    return `Mini-audit verejne nabidky: ${leadTitle(lead)}

Vychodisko
Tento audit vychazi pouze z rucne zapsanych verejnych pozorovani a ulozenych odkazu. Aplikace odkazy automaticky necetla ani neprochazela.

Shrnuti prvniho dojmu
${lead.firstImpression}

Co funguje dobre
${lead.strengths}

Hlavni fotka
${photoLine}

Co bych zlepsil jako prvni
${[lead.photoOrderObservation, lead.descriptionObservation, lead.checkInParkingInfo, lead.reviewSignals, lead.guestConfusion, lead.businessOpportunity]
        .filter(hasText)
        .slice(0, 4)
        .map((item) => `- ${item}`)
        .join('\n')}

3 quick wins
${listQuickWins(gate.completeWins)}

Proc to muze mit vliv na hosta
${lead.guestConfusion || lead.guestFrictionSignals || lead.businessOpportunity}

Doporuceny dalsi krok
${nextStep} Nejrychlejsi dalsi krok je vzit prvni quick win, upravit podle nej verejnou prezentaci a potom zkontrolovat, jestli host pred rezervaci rychleji pochopi hlavni hodnotu pobytu.`;
}

export function generateFirstOutreach(lead: Lead) {
    const gate = qualityGate(lead);

    if (!gate.isReady) {
        if (lead.extractionStatus !== 'completed' && (lead.sourceMaterials ?? []).length === 0) {
            return 'Nejdriv vloz verejny text nebo poznamky a klikni na Pripravit auditova pozorovani. Potom pujde osloveni postavit na konkretnim pozitivnim pozorovani a navrhu.';
        }

        return `Osloveni zatim neni dost konkretni.

Chybi:
${gate.missing.map((item) => `- ${item}`).join('\n')}

Nez bude text pouzitelny, dopln konkretni pozitivni pozorovani a alespon jeden kompletni quick win s akci.`;
    }

    const firstWin = gate.completeWins[0];
    const photoIntro =
        lead.mainPhotoVerdict === 'strong'
            ? `Prvni dojem z hlavni fotky mi prijde dobry: ${cleanSentence(lead.mainPhotoObservation)}.`
            : `Jako konkretni prostor vidim: ${cleanSentence(lead.mainPhotoObservation || lead.photoOrderObservation || lead.descriptionObservation)}.`;

    return `Dobry den,

díval jsem se jen na veřejnou prezentaci ${leadTitle(lead)}, takže samozřejmě nehodnotím interní instrukce ani zprávy hostům. ${photoIntro}

Pozitivne na me pusobi hlavne: ${lead.strengths}

Spis bych videl prostor v tomhle konkretnim kroku: ${firstWin.title}. Prakticky by to znamenalo: ${firstWin.action}

Muzu vam zdarma poslat 3 konkretni navrhy, ktere vychazeji jen z verejne prezentace a rucne zapsanych pozorovani. Kromě veřejné prezentace se dá později řešit i to, jak host dostane check-in instrukce, guest guide nebo zprávy před příjezdem, ale teď bych zůstal jen u veřejné nabídky.

Pokud chcete, poslu vam kratky mini-audit ve 3 bodech a sami uvidite, jestli to dava smysl resit dal.

David`;
}

export function generateFollowUp(lead: Lead) {
    return `Dobry den,

jen se kratce vracim k verejne nabidce ${leadTitle(lead)}. Nechci tlacit, jen jsem chtel nabidnout, ze vam muzu poslat 3 konkretni navrhy, co by slo rychle zlepsit v prvnim dojmu hosta.

Kdyby to pro vas ted nebylo aktualni, je to samozrejme v poradku.

David`;
}

export function generateOffer(lead: Lead) {
    return `Navrh dalsiho kroku pro ${leadTitle(lead)}

1. Audit prvniho dojmu — 1 990 Kc
Kratky audit verejne nabidky: prvni dojem, fotky, popis, recenze, mozne nejasnosti a 3 prioritni quick wins.

2. Zlepseni nabidky + komunikace — 6 990 Kc
Uprava struktury nabidky, doporuceni pro fotky a texty, plus navrh zakladni komunikace s hostem pred prijezdem.

3. Hotovy guest guide — od 12 000 Kc
Prakticky guest guide pro hosty: prijezd, parkovani, check-in, vybaveni, pravidla, doporuceni v okoli a odpovedi na caste dotazy.

Doporuceny zacatek
Zacal bych balickem Audit prvniho dojmu, protoze je nejrychlejsi, ma jasny vystup a ukaze, jestli dava smysl pokracovat do komunikace nebo guest guide.`;
}