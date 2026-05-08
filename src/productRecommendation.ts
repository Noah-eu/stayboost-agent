import { detectCandidateSpecificSignals, freeIdeaSpecificityDiagnostics } from './ideaSpecificity';
import type { Lead, RecommendedProduct, WebsiteExtractionResult } from './types';

interface ProductRecommendation {
    recommendedProduct: RecommendedProduct;
    recommendedProductReason: string;
    productRecommendationSignals: string[];
    freeIdeaPurpose: string;
    paidOfferShort: string;
    paidOfferDetails: string;
}

const normalize = (value = '') => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const unique = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

const extractionText = (lead: Pick<Lead, 'websiteExtraction' | 'strengths' | 'risks' | 'guestFrictionSignals' | 'checkInParkingInfo' | 'businessOpportunity' | 'publicSignals'>) => normalize([
    lead.websiteExtraction?.summary,
    ...(lead.websiteExtraction?.pagesExtracted ?? []).flatMap((page) => [page.title, page.textPreview, page.url]),
    ...(lead.websiteExtraction?.websiteSignals ?? []),
    ...(lead.websiteExtraction?.arrivalSignals ?? []),
    ...(lead.websiteExtraction?.parkingSignals ?? []),
    ...(lead.websiteExtraction?.faqSignals ?? []),
    ...(lead.websiteExtraction?.strengths ?? []),
    ...(lead.websiteExtraction?.risks ?? []),
    lead.strengths,
    lead.risks,
    lead.guestFrictionSignals,
    lead.checkInParkingInfo,
    lead.businessOpportunity,
    ...(lead.publicSignals ?? []),
].filter(Boolean).join('\n'));

const hasContact = (extraction?: WebsiteExtractionResult) => Boolean((extraction?.contact.emails.length ?? 0) + (extraction?.contact.phones.length ?? 0));

const operationalTopics = (lead: Pick<Lead, 'websiteExtraction' | 'strengths' | 'risks' | 'guestFrictionSignals' | 'checkInParkingInfo' | 'businessOpportunity' | 'publicSignals'>) => {
    const text = extractionText(lead);
    return unique([
        /restaurace|restaurant|bar|terasa|terrace/.test(text) ? 'restaurace' : '',
        /wellness|relax|sauna|whirlpool|spa|jacuzzi/.test(text) ? 'wellness / relax' : '',
        /svatba|svatebni|wedding|altan|marquee|party stan/.test(text) ? 'svatby / akce' : '',
        /konferenc|meeting|firemni|skoleni|conference/.test(text) ? 'konference / firemní pobyty' : '',
        /parkoviste|parkovani|parking|nabijeci|charging|elektromobil|ev/.test(text) ? 'parkování / EV' : '',
        /romantick|rodin|family|svatba|konferenc|firemni|vylet|karlstejn|balicek|package/.test(text) ? 'více typů hostů' : '',
    ]);
};

const hasMissingArrivalStructure = (extraction?: WebsiteExtractionResult) => {
    if (!extraction) return false;
    const missingText = normalize(extraction.missingPublicInfoSignals.join('\n'));
    return extraction.arrivalSignals.length === 0
        || /prijezd|check in|check-in|predprijezd|orientace hosta|faq|casto kladene|guest guide/.test(missingText);
};

const weakAreaCount = (lead: Pick<Lead, 'websiteExtraction' | 'risks' | 'guestFrictionSignals' | 'structuredQuickWins' | 'freeIdeas' | 'strengths' | 'publicSignals' | 'checkInParkingInfo'>) => {
    const extraction = lead.websiteExtraction;
    const ideaDiagnostics = freeIdeaSpecificityDiagnostics(lead);
    return [
        (extraction?.missingPublicInfoSignals.length ?? 0) >= 3,
        (extraction?.risks.length ?? 0) >= 2,
        normalize(lead.risks).length > 120,
        normalize(lead.guestFrictionSignals).length > 180,
        ideaDiagnostics.repeatedTemplateWarning,
        ideaDiagnostics.genericFreeIdeasCount >= 2,
    ].filter(Boolean).length;
};

const stayTypeCount = (lead: Pick<Lead, 'websiteExtraction' | 'strengths' | 'risks' | 'guestFrictionSignals' | 'checkInParkingInfo' | 'businessOpportunity' | 'publicSignals'>) => {
    const text = extractionText(lead);
    return [
        /romantick|wellness|relax|vikend|víkend/.test(text),
        /rodin|family|deti|děti/.test(text),
        /svatba|svatebni|wedding|akce|event/.test(text),
        /firemni|firemní|konferenc|skoleni|školení|business/.test(text),
        /restaurace|restaurant|bar|prvni vecer|první večer/.test(text),
    ].filter(Boolean).length;
};

const hasStrongChaosOpsSignals = (lead: Pick<Lead, 'websiteExtraction' | 'strengths' | 'risks' | 'guestFrictionSignals' | 'checkInParkingInfo' | 'businessOpportunity' | 'publicSignals'>, weakAreas: number, topics: string[]) => {
    const text = extractionText(lead);
    const explicitChaos = /chaos|nejasn|neprehledn|nepřehledn|zmatek|opakovan[eé] dotazy|manualn|manu[aá]ln|recepce|provozn[ií] nejasnost|proces/i.test(text);
    const broadMissing = (lead.websiteExtraction?.missingPublicInfoSignals.length ?? 0) >= 4;

    return explicitChaos && (weakAreas >= 2 || broadMissing && topics.length >= 2 || broadMissing);
};

const productCopy = (product: RecommendedProduct, leadPlaybook?: Lead['leadPlaybook']) => {
    if (product === 'guest-guide-starter') {
        return {
            paidOfferShort: 'Guest Guide Starter',
            paidOfferDetails: 'Jednoduchý online průvodce pro hosty: příjezd, parkování, check-in, kontakt, Wi-Fi a FAQ.',
        };
    }

    if (product === 'guest-communication-setup') {
        return {
            paidOfferShort: 'Guest Communication Setup',
            paidOfferDetails: leadPlaybook === 'restaurant-linked-stay'
                ? 'Jednoduchý online průvodce a předpříjezdová komunikace pro hosty. Host dostane odkaz nebo QR kód s praktickými informacemi: příjezd, první večer, restaurace, Wi-Fi, kontakt a odjezd. Sekce se dají upravit podle typu pokoje/apartmánu a navázat na zprávy po rezervaci.'
                : leadPlaybook === 'historic-local-experience-stay'
                    ? 'Jednoduchý online průvodce a předpříjezdová komunikace pro hosty. Host dostane odkaz nebo QR kód s praktickými informacemi: příjezd, vstup, Wi-Fi, vybavení, kontakt, konkrétní lokální tipy a odjezd. Sekce se dají upravit podle typu apartmánu a navázat na zprávy po rezervaci.'
                : 'Jednoduchý online průvodce a předpříjezdová komunikace pro hosty. Host dostane odkaz nebo QR kód s praktickými informacemi: příjezd, vstup, Wi-Fi, vybavení, kontakt, tipy v okolí a odjezd. U různých typů pobytu se dají informace upravit podle hosta a napojit na zprávy po rezervaci.',
        };
    }

    if (product === 'simple-website-starter') {
        return {
            paidOfferShort: 'Jednoduchý web pro ubytování',
            paidOfferDetails: 'Jednoduchá webová stránka pro ubytování: fotky, kontakt, mapa, adresa, rezervace přes telefon/e-mail a praktické informace pro hosty na jednom místě.',
        };
    }

    if (product === 'ops-audit') {
        return {
            paidOfferShort: 'Ops Audit',
            paidOfferDetails: 'Rychlý audit toho, kde hosté mohou ztrácet informace nebo opakovaně psát stejné dotazy.',
        };
    }

    return {
        paidOfferShort: 'Skip / nepokračovat',
        paidOfferDetails: 'Bez jasnější příležitosti bych teď neposílal placenou nabídku; lead může sloužit jen jako benchmark dobře zpracované komunikace.',
    };
};

export const recommendedProductLabels: Record<RecommendedProduct, string> = {
    'guest-guide-starter': 'Guest Guide Starter',
    'guest-communication-setup': 'Guest Communication Setup',
    'simple-website-starter': 'Jednoduchý web pro ubytování',
    'ops-audit': 'Ops Audit',
    skip: 'Skip / nepokračovat',
};

export const recommendProductForLead = (lead: Pick<Lead, 'websiteExtraction' | 'strengths' | 'risks' | 'guestFrictionSignals' | 'checkInParkingInfo' | 'businessOpportunity' | 'publicSignals' | 'structuredQuickWins' | 'freeIdeas' | 'publicMaturityScore' | 'confidence' | 'fitVerdict' | 'leadPlaybook' | 'contactQuality' | 'websiteOwnershipStatus' | 'extractionAllowed'>): ProductRecommendation => {
    const extraction = lead.websiteExtraction;
    const topics = operationalTopics(lead);
    const specificSignals = detectCandidateSpecificSignals(lead).map((signal) => signal.label);
    const contactFound = hasContact(extraction);
    const missingArrivalStructure = hasMissingArrivalStructure(extraction);
    const weakAreas = weakAreaCount(lead);
    const ideaDiagnostics = freeIdeaSpecificityDiagnostics(lead);
    const leadPlaybook = lead.leadPlaybook ?? ideaDiagnostics.leadPlaybook;
    const contactReady = lead.contactQuality?.contactReady ?? contactFound;
    const ownershipStatus = extraction?.websiteOwnershipStatus ?? lead.websiteOwnershipStatus ?? 'unknown';
    const socialProfileLead = ['social-profile', 'social-platform-login', 'no-owned-website-detected'].includes(ownershipStatus) || leadPlaybook === 'social-profile-web-presence';
    const extractionAllowed = extraction?.extractionAllowed ?? lead.extractionAllowed ?? true;
    const specificIdeasReady = ideaDiagnostics.freeIdeasReady && !ideaDiagnostics.repeatedTemplateWarning && !ideaDiagnostics.repeatedConceptWarning;
    const strongChaosOpsSignals = hasStrongChaosOpsSignals(lead, weakAreas, topics);
    const opsEligible = ownershipStatus === 'official' && extractionAllowed && contactReady && (strongChaosOpsSignals || weakAreas >= 3 && (!specificIdeasReady || lead.fitVerdict === 'not-enough-evidence'));
    const typeCount = stayTypeCount(lead);
    const productRecommendationSignals = unique([
        `leadPlaybook:${leadPlaybook}`,
        `freeIdeasReady:${ideaDiagnostics.freeIdeasReady}`,
        `repeatedTemplateWarning:${ideaDiagnostics.repeatedTemplateWarning}`,
        `repeatedConceptWarning:${ideaDiagnostics.repeatedConceptWarning}`,
        `weakAreas:${weakAreas}`,
        `topics:${topics.length}`,
        `stayTypes:${typeCount}`,
        `strongChaosOpsSignals:${strongChaosOpsSignals}`,
        `opsEligible:${opsEligible}`,
        `websiteOwnershipStatus:${ownershipStatus}`,
        `contactReady:${contactReady}`,
    ]);
    const publicMaturity = lead.publicMaturityScore ?? 0;
    const hasStrongPublicStructure = Boolean(extraction && extraction.arrivalSignals.length > 0 && extraction.parkingSignals.length > 0 && (extraction.faqSignals.length > 0 || extraction.guestGuideSignals.length > 0));

    let recommendedProduct: RecommendedProduct = 'guest-guide-starter';
    let recommendedProductReason = 'Web má dohledatelný kontakt a dává smysl ukázat jednoduchý předpříjezdový přehled pro hosty.';

    if (socialProfileLead) {
        recommendedProduct = 'simple-website-starter';
        recommendedProductReason = 'Lead stojí hlavně na sociálním profilu bez dohledaného vlastního webu, takže nejvhodnější produkt je jednoduchý web pro ubytování s kontaktem, fotkami, mapou a základními informacemi.';
    } else if (opsEligible && strongChaosOpsSignals && !(specificIdeasReady && leadPlaybook !== 'basic-website-guest-guide')) {
        recommendedProduct = 'ops-audit';
        recommendedProductReason = 'Evidence ukazuje širší provozní nejasnosti napříč více oblastmi a konkrétní nápady zatím nejsou dostatečně jisté, takže dává smysl nejdřív širší Ops Audit.';
    } else if (leadPlaybook === 'restaurant-linked-stay') {
        recommendedProduct = 'guest-communication-setup';
        recommendedProductReason = 'Playbook restaurant-linked-stay ukazuje productized příležitost: propojit ubytování, první večer a restauraci v předpříjezdové komunikaci místo širšího Ops Auditu.';
    } else if (leadPlaybook === 'city-apartment-arrival') {
        recommendedProduct = typeCount >= 2 ? 'guest-communication-setup' : 'guest-guide-starter';
        recommendedProductReason = typeCount >= 2
            ? 'City-apartment lead mluví k více typům pobytu, takže návaznost má být komunikace pro různé hosty.'
            : 'City-apartment lead primárně potřebuje jednoduchý příjezdový guest guide pro hosty.';
    } else if (leadPlaybook === 'family-local-experience') {
        recommendedProduct = 'guest-guide-starter';
        recommendedProductReason = 'Playbook family-local-experience nejlépe navazuje jednoduchým guest guide starterem s lokálními tipy a praktickými informacemi pro rodiny.';
    } else if (leadPlaybook === 'historic-local-experience-stay') {
        recommendedProduct = 'guest-communication-setup';
        recommendedProductReason = 'Playbook historic-local-experience-stay má konkrétní lokální a historické signály, takže nejlepší návaznost je online průvodce a komunikace po rezervaci.';
    } else if (leadPlaybook === 'romantic-wellness-stay' || leadPlaybook === 'event-wedding-hotel') {
        recommendedProduct = 'guest-communication-setup';
        recommendedProductReason = `Playbook ${leadPlaybook} potřebuje komunikaci podle typu pobytu a očekávání hosta, proto dává smysl Guest Communication Setup.`;
    } else if (topics.length >= 3) {
        recommendedProduct = 'guest-communication-setup';
        recommendedProductReason = `Web řeší více provozních témat (${topics.slice(0, 5).join(', ')}), takže návaznost má být spíš komunikace pro různé typy hostů než jen jednoduchý FAQ blok.`;
    } else if (contactFound && missingArrivalStructure) {
        recommendedProduct = 'guest-guide-starter';
        recommendedProductReason = 'Kontakt je dohledatelný, ale veřejné předpříjezdové informace by šly lépe soustředit do jednoduchého online průvodce.';
    } else if (hasStrongPublicStructure && publicMaturity >= 75 && weakAreas === 0) {
        recommendedProduct = 'skip';
        recommendedProductReason = 'Web působí dobře zpracovaný a z veřejné evidence není vidět dost silná příležitost pro placený další krok.';
    }

    if (opsEligible && !specificIdeasReady && recommendedProduct !== 'ops-audit' && leadPlaybook === 'basic-website-guest-guide') {
        recommendedProduct = 'ops-audit';
        recommendedProductReason = 'Lead nemá dost konkrétní free ideas ani specializovaný playbook, proto je bezpečnější širší audit evidence než productized setup.';
    }

    const copy = productCopy(recommendedProduct, leadPlaybook);

    return {
        recommendedProduct,
        recommendedProductReason,
        productRecommendationSignals,
        freeIdeaPurpose: specificSignals.length
            ? `Ukázat jemný pohled zvenku na konkrétní prvky webu: ${specificSignals.slice(0, 5).join(', ')}. Není to celý audit ani tvrdý prodej.`
            : 'Ukázat jemný pohled zvenku na to, jak hostům zpřehlednit informace před příjezdem. Není to celý audit ani tvrdý prodej.',
        paidOfferShort: copy.paidOfferShort,
        paidOfferDetails: copy.paidOfferDetails,
    };
};
