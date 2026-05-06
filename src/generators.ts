import { Lead, offerAngleLabels } from './types';

const fallback = (value: string, emptyText: string) => value.trim() || emptyText;

const firstThreeQuickWins = (lead: Lead) => {
    const wins = lead.proposedQuickWins.length > 0 ? lead.proposedQuickWins : lead.quickWins;
    const paddedWins = [...wins];

    while (paddedWins.length < 3) {
        paddedWins.push('Doplnit jeden konkretni detail, ktery hosti casto hledaji pred rezervaci.');
    }

    return paddedWins.slice(0, 3);
};

const list = (items: string[]) => items.map((item, index) => `${index + 1}. ${item}`).join('\n');

const leadTitle = (lead: Lead) => lead.name.trim() || 'toto ubytovani';

export function generateMiniAudit(lead: Lead) {
    const wins = firstThreeQuickWins(lead);

    return `Mini-audit verejne nabidky: ${leadTitle(lead)}

Shrnuti prvniho dojmu
Z verejne nabidky pusobi jako hlavni tema ${offerAngleLabels[lead.selectedOfferAngle].toLowerCase()}. ${fallback(
        lead.risks,
        'Nejvetsi prostor vidim v tom, aby se dulezite informace ukazaly hostovi rychleji a jasneji.',
    )}

Co funguje dobre
${fallback(lead.strengths, 'Nabidka uz ma zaklad, na kterem se da stavet: lokalita, typ ubytovani a zakladni prezentace jsou pro hosta srozumitelne.')}

Co bych zlepsil jako prvni
${fallback(
        lead.mainPhotoObservation || lead.photoOrderObservation || lead.descriptionObservation,
        'Jako prvni bych zpresnil prvni dojem z verejne prezentace, hlavne fotky, poradi informaci a jasnost dalsiho kroku pro hosta.',
    )}

3 quick wins
${list(wins)}

Proc to muze mit vliv na hosta
Host se obvykle rozhoduje rychle podle prvnich fotek, popisu a signalu duvery. Kdyz jsou silne stranky videt hned a pripadne nejasnosti jsou vysvetlene, muze to snizit nejistotu pred rezervaci.

Doporuceny dalsi krok
Projit verejnou nabidku jako novy host a upravit prvni obrazovku, prvnich 5 fotek a kratky popis tak, aby odpovidaly tomu, co je na ubytovani nejsilnejsi.`;
}

export function generateFirstOutreach(lead: Lead) {
    const wins = firstThreeQuickWins(lead);

    return `Dobry den,

díval jsem se pouze na veřejnou nabídku vašeho ubytování ${leadTitle(lead)}, takže samozřejmě nehodnotím interní instrukce ani zprávy hostům. Všiml jsem si ale pár věcí v prvním dojmu nabídky, které by podle mě šly rychle zlepšit.

Konkrétně bych vám zdarma poslal 3 návrhy:
${list(wins)}

Beru to jako rychlý pohled zvenku, ne jako kritiku. Kromě veřejné prezentace se dá později řešit i to, jak host dostane check-in instrukce, guest guide nebo zprávy před příjezdem, ale teď bych zůstal jen u veřejné nabídky.

Pokud chcete, pošlu vám krátký mini-audit ve 3 bodech a sami uvidíte, jestli to dává smysl řešit dál.

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