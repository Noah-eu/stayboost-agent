import { sanitizeClientText } from './clientCopy';
import { recommendProductForLead } from './productRecommendation';
import type { GuestGuidePreview, GuestGuideSection, Lead, QuickWin, WebsiteExtractionResult } from './types';

const placeholderCheckIn = '[DOPLNIT: čas check-inu]';
const placeholderEntry = '[DOPLNIT: přesný postup příjezdu / vstupu]';
const placeholderWifi = '[DOPLNIT: Wi-Fi název a heslo]';
const placeholderCheckout = '[DOPLNIT: čas odjezdu / checkoutu]';

const normalize = (value = '') => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const clean = (value = '') => sanitizeClientText(value).replace(/\s+/g, ' ').trim();
const unique = (values: string[]) => [...new Set(values.map(clean).filter(Boolean))];

const slugify = (value = 'guest-guide') => normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'guest-guide';

const extractionEvidenceText = (lead: Lead) => [
    lead.name,
    lead.city,
    lead.firstImpression,
    lead.strengths,
    lead.checkInParkingInfo,
    lead.guestFrictionSignals,
    lead.businessOpportunity,
    lead.websiteExtraction?.summary,
    ...(lead.publicSignals ?? []),
    ...(lead.websiteExtraction?.pagesExtracted ?? []).flatMap((page) => [page.title, page.textPreview, page.url]),
    ...(lead.websiteExtraction?.websiteSignals ?? []),
    ...(lead.websiteExtraction?.arrivalSignals ?? []),
    ...(lead.websiteExtraction?.parkingSignals ?? []),
    ...(lead.websiteExtraction?.faqSignals ?? []),
    ...(lead.websiteExtraction?.guestGuideSignals ?? []),
    ...(lead.websiteExtraction?.strengths ?? []),
    ...(lead.websiteExtraction?.risks ?? []),
].filter(Boolean).join('\n');

const evidenceSourceList = (lead: Lead, extraction?: WebsiteExtractionResult) => unique([
    extraction?.summary ?? '',
    ...(extraction?.pagesExtracted ?? []).map((page) => page.url),
    ...(extraction?.strengths ?? []),
    ...(extraction?.parkingSignals ?? []),
    ...(extraction?.arrivalSignals ?? []),
    ...(extraction?.faqSignals ?? []),
    ...(lead.publicSignals ?? []),
]).slice(0, 18);

const contactItems = (lead: Lead, extraction?: WebsiteExtractionResult) => unique([
    ...(extraction?.contact.emails ?? []).map((email) => `E-mail z veřejného webu: ${email}`),
    ...(extraction?.contact.phones ?? []).map((phone) => `Telefon z veřejného webu: ${phone}`),
    lead.email ? `CRM e-mail: ${lead.email}` : '',
    extraction?.contact.contactPageUrl ? `Kontaktní stránka: ${extraction.contact.contactPageUrl}` : '',
    'Doplnit, kdy má host použít recepci / e-mail / telefon před příjezdem.',
]);

const hasAny = (text: string, needles: string[]) => needles.some((needle) => text.includes(needle));

const section = (input: GuestGuideSection): GuestGuideSection => ({
    ...input,
    headline: clean(input.headline),
    overview: clean(input.overview),
    sourceEvidence: unique(input.sourceEvidence),
    groups: input.groups.map((group) => ({
        title: clean(group.title),
        items: unique(group.items),
    })).filter((group) => group.items.length > 0),
});

const quickWinLines = (lead: Lead) => (lead.freeIdeas?.length ? lead.freeIdeas : lead.structuredQuickWins ?? [])
    .filter((win: QuickWin) => win.title.trim() && win.action.trim())
    .slice(0, 3)
    .map((win, index) => `${index + 1}. ${clean(win.title)} - ${clean(win.action)}`);

const configSectionContent = (guideSection: GuestGuideSection) => ({
    title: guideSection.title,
    headline: guideSection.headline,
    overview: guideSection.overview,
    groups: guideSection.groups,
});

export function buildGuestGuideConfigExport(preview: Omit<GuestGuidePreview, 'configExport'>) {
    return {
        DEMO_PROPERTY: {
            name: preview.propertyName,
            city: preview.city,
            address: preview.address,
            coverLabel: 'Guest guide preview',
        },
        SECTION_ORDER: preview.sections.map((guideSection) => guideSection.id),
        SECTION_CONTENT: Object.fromEntries(preview.sections.map((guideSection) => [guideSection.id, configSectionContent(guideSection)])),
    };
}

export function createGuestGuidePreview(lead: Lead): GuestGuidePreview {
    const extraction = lead.websiteExtraction;
    const rawText = extractionEvidenceText(lead);
    const text = normalize(rawText);
    const sources = evidenceSourceList(lead, extraction);
    const hasParking = hasAny(text, ['parkoviste', 'parkovani', 'parking', 'nabijeci stanice', 'charging station', 'ev']);
    const hasRestaurant = hasAny(text, ['restaurace', 'restaurant', 'terasa', 'bar', 'grill']);
    const hasWellness = hasAny(text, ['wellness', 'relax', 'sauna', 'spa']);
    const hasEvents = hasAny(text, ['svatba', 'svatebni', 'altan', 'konference', 'firemni', 'event']);
    const hasNearby = hasAny(text, ['karlstejn', 'berounka', 'hrad', 'okoli', 'nearby']);
    const nearbyTitle = hasAny(text, ['krumlov']) ? 'Centrum Krumlova a okolí' : hasAny(text, ['karlstejn']) ? 'Karlštejn, Berounka a tipy v okolí' : 'Okolí a tipy';
    const hasRooms = hasAny(text, ['pokoj', 'pokoje', 'room', 'rooms', 'vybaveni']);
    const hasWifi = hasAny(text, ['wi-fi', 'wifi', 'internet']);
    const hasRules = hasAny(text, ['pravidla', 'domovni rad', 'pobyt', 'no smoking', 'zakaz koureni']);
    const hasFaq = hasAny(text, ['faq', 'casto kladene', 'nejcastejsi otazky']) || (extraction?.faqSignals.length ?? 0) > 0;
    const hasCheckInTime = hasAny(text, ['check-in ', 'check in ', 'prijezd od', 'arrival from']);
    const hasCheckoutTime = hasAny(text, ['check-out', 'check out', 'odjezd do', 'departure until']);
    const contacts = contactItems(lead, extraction);
    const sourceEvidence = sources.length ? sources : ['Draft vychází z aktuálně uložené veřejné evidence u leadu.'];
    const commonEvidence = sourceEvidence.slice(0, 6);
    const sections: GuestGuideSection[] = [
        section({
            id: 'entry',
            title: 'Příjezd a kontakt',
            headline: `Příjezd do ${lead.name || 'ubytování'}`,
            overview: 'Draft úvodní sekce, která má hostovi před příjezdem soustředit praktické kroky na jedno místo.',
            groups: [
                {
                    title: 'Před příjezdem doplnit',
                    items: [
                        hasCheckInTime ? 'Veřejný web zmiňuje check-in / příjezd; ověřit přesný čas a formulaci.' : placeholderCheckIn,
                        placeholderEntry,
                        'Doplnit, kdy host dostane finální instrukce k příjezdu.',
                    ],
                },
                { title: 'Kontakt pro den příjezdu', items: contacts.slice(0, 4) },
            ],
            sourceEvidence: commonEvidence,
        }),
        section({
            id: 'transport',
            title: 'Doprava a parkování',
            headline: 'Jak se k vám dostat a kde zaparkovat',
            overview: 'Sekce shrnuje příjezd, parkování a praktické dopravní informace bez vymýšlení neveřejných instrukcí.',
            groups: [
                {
                    title: 'Veřejně zmíněné informace',
                    items: [
                        hasParking ? 'Web zmiňuje parkování / parkoviště.' : '[DOPLNIT: parkování a příjezd autem]',
                        hasAny(text, ['nabijeci stanice', 'charging station', 'elektromobil']) ? 'Web zmiňuje nabíjecí stanici pro elektromobily.' : '',
                    ],
                },
                { title: 'Doplnit do hotového průvodce', items: ['[DOPLNIT: přesná adresa parkování / navigační bod]', '[DOPLNIT: instrukce pro příjezd veřejnou dopravou]'] },
            ],
            sourceEvidence: unique([...(extraction?.parkingSignals ?? []), ...commonEvidence]),
        }),
        section({
            id: 'contacts',
            title: 'Kontakty',
            headline: 'Koho kontaktovat před příjezdem nebo během pobytu',
            overview: 'Kontaktní sekce má hostovi říct nejen kontakt, ale také kdy ho použít.',
            groups: [
                { title: 'Dostupné veřejné kontakty', items: contacts },
                { title: 'Doplnit interně', items: ['[DOPLNIT: kontakt pro urgentní situace]', '[DOPLNIT: jazyk / časy dostupnosti recepce]'] },
            ],
            sourceEvidence: unique([...(extraction?.contact.emails ?? []), ...(extraction?.contact.phones ?? []), extraction?.contact.contactPageUrl ?? '', ...commonEvidence]),
        }),
    ];

    if (hasRestaurant) {
        sections.push(section({
            id: 'restaurant',
            title: 'Restaurace',
            headline: 'Restaurace, terasa a možnosti posezení',
            overview: 'Návrh sekce pro hosty, kteří chtějí předem vědět, jak funguje restaurace a terasa.',
            groups: [
                { title: 'Signály z webu', items: ['Web zmiňuje restauraci / restaurant.', hasAny(text, ['terasa']) ? 'Web zmiňuje terasu.' : '', hasAny(text, ['bar']) ? 'Web zmiňuje bar.' : ''] },
                { title: 'Doplnit do průvodce', items: ['[DOPLNIT: otevírací doba restaurace]', '[DOPLNIT: rezervace stolu / snídaně / večeře]'] },
            ],
            sourceEvidence: commonEvidence,
        }));
    }

    if (hasWellness) {
        sections.push(section({
            id: 'wellness',
            title: 'Relax centrum',
            headline: 'Relax a wellness během pobytu',
            overview: 'Sekce má hostovi předem vysvětlit, co může využít a co je potřeba rezervovat.',
            groups: [
                { title: 'Signály z webu', items: [hasAny(text, ['relax']) ? 'Web zmiňuje relax centrum.' : '', hasAny(text, ['wellness']) ? 'Web zmiňuje wellness.' : '', hasAny(text, ['sauna']) ? 'Web zmiňuje saunu.' : ''] },
                { title: 'Doplnit do průvodce', items: ['[DOPLNIT: rezervace wellness / relax centra]', '[DOPLNIT: časy, cena a pravidla vstupu]'] },
            ],
            sourceEvidence: commonEvidence,
        }));
    }

    if (hasEvents) {
        sections.push(section({
            id: 'events',
            title: 'Svatby a akce',
            headline: 'Informace pro svatby, akce a firemní pobyty',
            overview: 'Draft sekce pro různé typy hostů, aby se akční a firemní informace nepletly s běžným pobytem.',
            groups: [
                { title: 'Signály z webu', items: [hasAny(text, ['svatba', 'svatebni']) ? 'Web zmiňuje svatby / svatební pobyty.' : '', hasAny(text, ['konference', 'firemni']) ? 'Web zmiňuje konference nebo firemní pobyty.' : '', hasAny(text, ['soukromy ostrov']) ? 'Web zmiňuje soukromý ostrov.' : '', hasAny(text, ['altan']) ? 'Web zmiňuje altán.' : ''] },
                { title: 'Doplnit do průvodce', items: ['[DOPLNIT: kontaktní osoba pro akce]', '[DOPLNIT: časový harmonogram / místo srazu pro hosty akce]'] },
            ],
            sourceEvidence: commonEvidence,
        }));
    }

    if (hasNearby) {
        sections.push(section({
            id: 'nearby',
            title: 'Okolí a tipy',
            headline: nearbyTitle,
            overview: 'Sekce může hostům připomenout nejsilnější důvody pobytu a praktické tipy bez nutnosti dalšího hledání.',
            groups: [
                { title: 'Signály z webu', items: [hasAny(text, ['krumlov']) ? 'Web zmiňuje Český Krumlov.' : '', hasAny(text, ['karlstejn']) ? 'Web zmiňuje Karlštejn.' : '', hasAny(text, ['berounka']) ? 'Web zmiňuje Berounku.' : '', hasAny(text, ['hrad', 'zamek']) ? 'Web zmiňuje hrad / zámek.' : ''] },
                { title: 'Doplnit do průvodce', items: ['[DOPLNIT: 3 až 5 doporučených míst v okolí]', '[DOPLNIT: sezónní tipy / délka procházky / doprava]'] },
            ],
            sourceEvidence: commonEvidence,
        }));
    }

    sections.push(section({
        id: 'faq',
        title: 'FAQ před příjezdem',
        headline: 'Nejčastější otázky před příjezdem',
        overview: 'Draft FAQ, které má navázat na 3 nápady zdarma a soustředit praktické odpovědi pro hosty.',
        groups: [
            { title: hasFaq ? 'Veřejně strukturované / k ověření' : 'Doplnit před zveřejněním', items: [placeholderCheckIn, placeholderEntry, placeholderWifi, '[DOPLNIT: pozdní příjezd]', '[DOPLNIT: platba / kauce / storno podle vašeho procesu]'] },
        ],
        sourceEvidence: unique([...(extraction?.faqSignals ?? []), ...commonEvidence]),
    }));

    if (hasRooms) {
        sections.push(section({
            id: 'rooms',
            title: 'Pokoje a vybavení',
            headline: 'Co host najde na pokoji',
            overview: 'Sekce pro stručné shrnutí vybavení bez přepisování celého webu.',
            groups: [
                { title: 'Doplnit do průvodce', items: ['[DOPLNIT: vybavení pokoje]', '[DOPLNIT: co si host nemusí vozit]'] },
            ],
            sourceEvidence: commonEvidence,
        }));
    }

    if (hasWifi && !sections.some((guideSection) => guideSection.id === 'wifi')) {
        sections.push(section({
            id: 'wifi',
            title: 'Wi-Fi',
            headline: 'Připojení k internetu',
            overview: 'Wi-Fi údaje je potřeba doplnit interně, pokud nejsou veřejně bezpečně publikované.',
            groups: [{ title: 'Doplnit', items: [placeholderWifi] }],
            sourceEvidence: commonEvidence,
        }));
    }

    if (hasRules) {
        sections.push(section({
            id: 'rules',
            title: 'Pravidla pobytu',
            headline: 'Jednoduchá pravidla pro klidný pobyt',
            overview: 'Sekce má stručně shrnout praktická pravidla bez tvrdého tónu.',
            groups: [{ title: 'Doplnit', items: ['[DOPLNIT: domácí pravidla / noční klid / kouření / mazlíčci]'] }],
            sourceEvidence: commonEvidence,
        }));
    }

    sections.push(section({
        id: 'checkout',
        title: 'Odjezd',
        headline: 'Odjezd a poslední praktické kroky',
        overview: 'Závěrečná sekce má hostovi připomenout checkout a drobnosti před odjezdem.',
        groups: [
            { title: 'Doplnit před zveřejněním', items: [hasCheckoutTime ? 'Veřejný web zmiňuje checkout; ověřit přesný čas a formulaci.' : placeholderCheckout, '[DOPLNIT: kam odevzdat klíče / kartu]', '[DOPLNIT: co zkontrolovat před odjezdem]'] },
        ],
        sourceEvidence: commonEvidence,
    }));

    const previewBase: Omit<GuestGuidePreview, 'configExport'> = {
        propertyName: clean(lead.name) || 'Název ubytování',
        city: clean(lead.city) || '[DOPLNIT: město]',
        address: '[DOPLNIT: adresa]',
        suggestedSlug: slugify(`${lead.name}-${lead.city}`),
        language: 'cs',
        sections,
        sourceEvidence,
        limitations: unique([
            'Jde o draft ukázky, ne hotový provozní návod.',
            'Nepředstírá neveřejné instrukce, které nejsou ve veřejné evidenci.',
            'Placeholdery v hranatých závorkách je potřeba doplnit před zveřejněním.',
            ...(lead.sourceLimitations ?? []),
            ...(extraction?.evidenceLimits ?? []),
        ]).slice(0, 12),
    };

    return {
        ...previewBase,
        configExport: buildGuestGuideConfigExport(previewBase),
    };
}

export function createGuestGuideSecondEmail(lead: Lead, preview: GuestGuidePreview = createGuestGuidePreview(lead)) {
    const ideas = quickWinLines(lead);
    const ideaBlock = ideas.length ? ideas.join('\n') : '1. [DOPLNIT: první konkrétní nápad]\n2. [DOPLNIT: druhý konkrétní nápad]\n3. [DOPLNIT: třetí konkrétní nápad]';
    const sectionList = preview.sections.map((guideSection) => guideSection.title).slice(0, 8).join(', ');
    const recommendation = recommendProductForLead(lead);

    return sanitizeClientText(`Dobrý den,

děkuji, posílám slíbené 3 krátké nápady. Berte to jen jako rychlý pohled zvenku.

${ideaBlock}

Ukázka struktury online průvodce: ${sectionList}.

Online průvodce je jednoduchá stránka pro hosty před příjezdem. Host dostane odkaz nebo QR kód s praktickými informacemi: příjezd, vstup, Wi-Fi, vybavení, kontakt, tipy v okolí a odjezd. Sekce se dají upravit podle typu pobytu a napojit na zprávy po rezervaci.

Navazující placený krok může být ${recommendation.paidOfferShort}: ${recommendation.paidOfferDetails}

David`);
}