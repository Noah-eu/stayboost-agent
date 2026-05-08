import { detectCandidateSpecificSignals, freeIdeaSpecificityDiagnostics } from './ideaSpecificity';
import type { Lead, RecommendedProduct, WebsiteExtractionResult } from './types';

interface ProductRecommendation {
    recommendedProduct: RecommendedProduct;
    recommendedProductReason: string;
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

const productCopy = (product: RecommendedProduct) => {
    if (product === 'guest-guide-starter') {
        return {
            paidOfferShort: 'Guest Guide Starter',
            paidOfferDetails: 'Jednoduchý online průvodce pro hosty: příjezd, parkování, check-in, kontakt, Wi-Fi a FAQ.',
        };
    }

    if (product === 'guest-communication-setup') {
        return {
            paidOfferShort: 'Guest Communication Setup',
            paidOfferDetails: 'Úprava předpříjezdové komunikace a hostovského průvodce pro různé typy hostů.',
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
    'ops-audit': 'Ops Audit',
    skip: 'Skip / nepokračovat',
};

export const recommendProductForLead = (lead: Pick<Lead, 'websiteExtraction' | 'strengths' | 'risks' | 'guestFrictionSignals' | 'checkInParkingInfo' | 'businessOpportunity' | 'publicSignals' | 'structuredQuickWins' | 'freeIdeas' | 'publicMaturityScore' | 'confidence' | 'fitVerdict'>): ProductRecommendation => {
    const extraction = lead.websiteExtraction;
    const topics = operationalTopics(lead);
    const specificSignals = detectCandidateSpecificSignals(lead).map((signal) => signal.label);
    const contactFound = hasContact(extraction);
    const missingArrivalStructure = hasMissingArrivalStructure(extraction);
    const weakAreas = weakAreaCount(lead);
    const publicMaturity = lead.publicMaturityScore ?? 0;
    const hasStrongPublicStructure = Boolean(extraction && extraction.arrivalSignals.length > 0 && extraction.parkingSignals.length > 0 && (extraction.faqSignals.length > 0 || extraction.guestGuideSignals.length > 0));

    let recommendedProduct: RecommendedProduct = 'guest-guide-starter';
    let recommendedProductReason = 'Web má dohledatelný kontakt a dává smysl ukázat jednoduchý předpříjezdový přehled pro hosty.';

    if (weakAreas >= 2) {
        recommendedProduct = 'ops-audit';
        recommendedProductReason = 'Evidence ukazuje více slabých nebo nejasných oblastí, takže nejdřív dává smysl širší provozní pohled místo jedné dílčí úpravy.';
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

    const copy = productCopy(recommendedProduct);

    return {
        recommendedProduct,
        recommendedProductReason,
        freeIdeaPurpose: specificSignals.length
            ? `Ukázat jemný pohled zvenku na konkrétní prvky webu: ${specificSignals.slice(0, 5).join(', ')}. Není to celý audit ani tvrdý prodej.`
            : 'Ukázat jemný pohled zvenku na to, jak hostům zpřehlednit informace před příjezdem. Není to celý audit ani tvrdý prodej.',
        paidOfferShort: copy.paidOfferShort,
        paidOfferDetails: copy.paidOfferDetails,
    };
};
