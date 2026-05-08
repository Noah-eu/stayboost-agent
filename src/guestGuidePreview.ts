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
    const isSocialProfile = ['social-profile', 'social-platform-login', 'no-owned-website-detected'].includes(extraction?.websiteOwnershipStatus ?? lead.websiteOwnershipStatus ?? '') || lead.leadPlaybook === 'social-profile-web-presence';
    const isMultiPropertyArrival = lead.leadPlaybook === 'multi-property-arrival-clarity' || hasAny(text, ['vila krumlov']) && hasAny(text, ['pension galko', 'galko siroka', 'galko široká']);
    const hasParking = hasAny(text, ['parkoviste', 'parkovani', 'parking', 'nabijeci stanice', 'charging station', 'ev']);
    const hasRestaurant = hasAny(text, ['restaurace', 'restaurant', 'terasa', 'bar', 'grill']);
    const hasWellness = hasAny(text, ['wellness', 'relax', 'sauna', 'spa']);
    const hasEvents = hasAny(text, ['svatba', 'svatebni', 'altan', 'konference', 'firemni', 'event']);
    const hasNearby = hasAny(text, ['karlstejn', 'berounka', 'hrad', 'okoli', 'nearby']);
    const isKrumlov = hasAny(text, ['krumlov']);
    const nearbyTitle = isKrumlov ? 'Centrum Krumlova a okolí' : hasAny(text, ['karlstejn']) ? 'Karlštejn, Berounka a tipy v okolí' : 'Okolí a tipy';
    const hasRooms = hasAny(text, ['pokoj', 'pokoje', 'room', 'rooms', 'vybaveni']);
    const hasWifi = hasAny(text, ['wi-fi', 'wifi', 'internet']);
    const hasRules = hasAny(text, ['pravidla', 'domovni rad', 'pobyt', 'no smoking', 'zakaz koureni']);
    const hasFaq = hasAny(text, ['faq', 'casto kladene', 'nejcastejsi otazky']) || (extraction?.faqSignals.length ?? 0) > 0;
    const hasCheckInTime = hasAny(text, ['check-in ', 'check in ', 'prijezd od', 'arrival from']);
    const hasCheckoutTime = hasAny(text, ['check-out', 'check out', 'odjezd do', 'departure until']);
    const contacts = contactItems(lead, extraction);
    const sourceEvidence = sources.length ? sources : ['Draft vychází z aktuálně uložené veřejné evidence u leadu.'];
    const commonEvidence = sourceEvidence.slice(0, 6);
    if (isMultiPropertyArrival) {
        const multiSections: GuestGuideSection[] = [
            section({
                id: 'arrival-deadline',
                title: 'Příjezd do 18:00',
                headline: 'Kdy se host může ubytovat',
                overview: 'Hlavní předpříjezdový blok kvůli časově omezenému nástupu na pobyt.',
                groups: [{ title: 'Veřejná evidence', items: ['Nástup na pobyt od 14:00 do 18:00', 'Recepce / kontakt pro příjezd', 'Po rezervaci poslat krátký přehled hostovi'] }],
                sourceEvidence: unique([...(extraction?.arrivalSignals ?? []), ...commonEvidence]),
            }),
            section({
                id: 'late-arrival',
                title: 'Přijedu později',
                headline: 'Pozdější příjezd jen po domluvě',
                overview: 'Host má vědět, co dělat, když hrozí příjezd po 18:00.',
                groups: [{ title: 'Postup pro hosta', items: ['Pozdější nástup pouze po předchozí domluvě s recepcí', 'Uvést telefon nebo e-mail pro domluvu v pracovní době', 'Doplnit interní formulaci pro pozdní příjezd'] }],
                sourceEvidence: unique([extraction?.lateArrivalCondition ?? '', ...commonEvidence]),
            }),
            section({
                id: 'property-switch',
                title: 'Jedete do Vila Krumlov / Jedete do Pension Galko',
                headline: 'Dvě propojené provozovny bez záměny',
                overview: 'Rozcestník pro hosta, aby nezaměnil objekt, adresu, recepci ani parkování.',
                groups: [
                    { title: 'Vila Krumlov', items: ['Adresa a příjezd pro Vila Krumlov', 'Parkování podle pravidel pro Vila Krumlov', 'Kontakt / recepce pro hosta'] },
                    { title: 'Pension Galko', items: ['Adresa a příjezd pro Pension Galko / Galko Široká', 'Parkování podle pravidel pro Pension Galko', 'Kontakt / recepce pro hosta'] },
                ],
                sourceEvidence: commonEvidence,
            }),
            section({
                id: 'parking',
                title: 'Parkování',
                headline: 'Přijedu autem',
                overview: 'Parkování je samostatná předpříjezdová informace, protože má cenu, kapacitu i rezervaci předem.',
                groups: [{ title: 'Veřejná evidence', items: ['Parkování je za poplatek', 'Rezervace parkování nutná předem', 'Počet míst je omezený', 'Vila Krumlov: parkoviště cca 350 m', 'Pension Galko: parkoviště cca 250 m', 'Cena 240 Kč za pobytový den'] }],
                sourceEvidence: unique([...(extraction?.parkingSignals ?? []), ...commonEvidence]),
            }),
            section({
                id: 'contacts',
                title: 'Recepce a kontakty',
                headline: 'Koho kontaktovat před příjezdem',
                overview: 'Kontakt má být vedle příjezdu a pozdního příjezdu, ne jen jako obecná stránka.',
                groups: [{ title: 'Dostupné kontakty / doplnit', items: contacts.slice(0, 6) }],
                sourceEvidence: unique([...(extraction?.contact.emails ?? []), ...(extraction?.contact.phones ?? []), ...commonEvidence]),
            }),
            section({
                id: 'payment-cancellation-rules',
                title: 'Platba a storno / pravidla',
                headline: 'Podmínky na jednom místě',
                overview: 'Web má praktické sekce, které dává smysl poslat hostovi pohromadě po rezervaci.',
                groups: [{ title: 'Sjednotit pro hosta', items: ['Ceník', 'Platební a storno podmínky', 'Ubytovací řád', 'Rezervace'] }],
                sourceEvidence: commonEvidence,
            }),
            section({
                id: 'checkout',
                title: 'Odjezd do 10:00',
                headline: 'Kdy pobyt končí',
                overview: 'Checkout informace má být součástí stejného předpříjezdového přehledu.',
                groups: [{ title: 'Veřejná evidence', items: ['Ukončení pobytu do 10:00', 'Doplnit, kam odevzdat klíče nebo kartu', 'Doplnit poslední praktické kroky před odjezdem'] }],
                sourceEvidence: unique([extraction?.checkoutTime ? `Odjezd do ${extraction.checkoutTime}` : '', ...commonEvidence]),
            }),
        ];
        const previewBase: Omit<GuestGuidePreview, 'configExport'> = {
            propertyName: clean(lead.name) || 'Galko / Vila Krumlov',
            city: clean(lead.city) || 'Český Krumlov',
            address: '[DOPLNIT: adresa podle konkrétní provozovny]',
            suggestedSlug: slugify(`${lead.name}-${lead.city}`),
            language: 'cs',
            sections: multiSections,
            sourceEvidence,
            limitations: unique([
                'Jde o draft ukázky pro dvě propojené provozovny, ne hotový provozní návod.',
                'Praktické informace existují, ale pro hosta by šly sjednotit do jednoho předpříjezdového přehledu.',
                ...(lead.sourceLimitations ?? []),
                ...(extraction?.evidenceLimits ?? []),
            ]).slice(0, 12),
        };

        return { ...previewBase, configExport: buildGuestGuideConfigExport(previewBase) };
    }
    if (isSocialProfile) {
        const socialSections: GuestGuideSection[] = [
            section({
                id: 'website-preview',
                title: 'Website Preview / Landing Page Preview',
                headline: 'Jednoduchý web i průvodce pro hosty',
                overview: 'Z veřejného profilu může vzniknout jednoduchý web pro hosty i základ budoucího guest guide.',
                groups: [{ title: 'Co ukázat hned nahoře', items: ['Název ubytování', 'Fotky ubytování', 'Adresa Pod Kamenem 170', 'Telefon a e-mail', 'Tlačítko zavolat / napsat'] }],
                sourceEvidence: commonEvidence,
            }),
            section({
                id: 'entry',
                title: 'Příjezd a kontakt',
                headline: `Příjezd do ${lead.name || 'ubytování'}`,
                overview: 'Praktický blok pro hosta před příjezdem bez předstírání informací, které nejsou ve veřejné evidenci.',
                groups: [{ title: 'Doplnit', items: [placeholderCheckIn, placeholderEntry, 'Kontakt v den příjezdu', 'Co čekat po příjezdu'] }],
                sourceEvidence: commonEvidence,
            }),
            section({
                id: 'photos-description',
                title: 'Fotky a popis ubytování',
                headline: 'Nejdřív ukázat samotné ubytování',
                overview: 'Sekce pro lepší pořadí fotek a stručný popis apartmánu, domu, vstupu a okolí.',
                groups: [{ title: 'Doplnit', items: ['Fotka pokoje nebo apartmánu jako první', 'Fotka koupelny', 'Fotka vstupu', 'Stručný popis vybavení'] }],
                sourceEvidence: commonEvidence,
            }),
            section({
                id: 'location-map',
                title: 'Poloha a mapa',
                headline: 'Kde ubytování najít',
                overview: 'Adresa, mapa a orientační bod hostovi pomůžou víc než informace schované ve feedu.',
                groups: [{ title: 'Doplnit', items: ['Adresa Pod Kamenem 170, Český Krumlov', 'Mapa / odkaz na navigaci', 'Orientační bod ke vstupu'] }],
                sourceEvidence: commonEvidence,
            }),
            section({
                id: 'booking-contact',
                title: 'Jak rezervovat / kontaktovat',
                headline: 'Jeden jasný způsob kontaktu',
                overview: 'Host má rychle pochopit, jestli má volat, psát e-mail nebo poslat zprávu.',
                groups: [{ title: 'Veřejně viditelné / doplnit', items: contactItems(lead, extraction).slice(0, 5) }],
                sourceEvidence: commonEvidence,
            }),
            section({
                id: 'prearrival-info',
                title: 'Praktické informace před příjezdem',
                headline: 'Základní otázky na jednom místě',
                overview: 'Blok pro check-in, odjezd a nejčastější dotazy.',
                groups: [{ title: 'Doplnit', items: [placeholderCheckIn, placeholderCheckout, placeholderWifi, '[DOPLNIT: nejčastější dotazy]'] }],
                sourceEvidence: commonEvidence,
            }),
            section({
                id: 'checkout',
                title: 'Odjezd',
                headline: 'Odjezd a poslední praktické kroky',
                overview: 'Stručné checkout informace před koncem pobytu.',
                groups: [{ title: 'Doplnit', items: [placeholderCheckout, '[DOPLNIT: kam odevzdat klíče]', '[DOPLNIT: co zkontrolovat před odjezdem]'] }],
                sourceEvidence: commonEvidence,
            }),
        ];
        const previewBase: Omit<GuestGuidePreview, 'configExport'> = {
            propertyName: clean(lead.name) || 'Název ubytování',
            city: clean(lead.city) || '[DOPLNIT: město]',
            address: 'Pod Kamenem 170, Český Krumlov',
            suggestedSlug: slugify(`${lead.name}-${lead.city}`),
            language: 'cs',
            sections: socialSections,
            sourceEvidence,
            limitations: unique(['Zdroj je sociální profil, ne vlastní web.', 'U sociálních profilů extractor často nepřečte obsah; pro lepší audit nahraj screenshot profilu nebo fotek.', ...(lead.sourceLimitations ?? []), ...(extraction?.evidenceLimits ?? [])]).slice(0, 12),
        };

        return { ...previewBase, configExport: buildGuestGuideConfigExport(previewBase) };
    }
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
            title: hasParking ? 'Doprava a parkování' : 'Příjezd a orientace',
            headline: hasParking ? 'Jak se k vám dostat a kde zaparkovat' : 'Jak se k vám dostat bez nejistoty',
            overview: hasParking ? 'Sekce shrnuje příjezd, parkování a praktické dopravní informace bez vymýšlení neveřejných instrukcí.' : 'Sekce shrnuje příjezd a praktickou orientaci bez vymýšlení parkovacích benefitů.',
            groups: [
                {
                    title: 'Veřejně zmíněné informace',
                    items: [
                        hasParking ? 'Web zmiňuje parkování / parkoviště.' : '[DOPLNIT: příjezd a orientační bod ke vstupu]',
                        hasAny(text, ['nabijeci stanice', 'charging station', 'elektromobil']) ? 'Web zmiňuje nabíjecí stanici pro elektromobily.' : '',
                    ],
                },
                { title: 'Doplnit do hotového průvodce', items: hasParking ? ['[DOPLNIT: přesná adresa parkování / navigační bod]', '[DOPLNIT: instrukce pro příjezd]'] : ['[DOPLNIT: přesný postup příjezdu]', '[DOPLNIT: kdy host volá nebo píše v den příjezdu]'] },
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
    const text = normalize(extractionEvidenceText(lead));
    const isKrumlov = hasAny(text, ['krumlov']) && lead.leadPlaybook === 'historic-local-experience-stay';

    if (lead.leadPlaybook === 'multi-property-arrival-clarity') {
        return sanitizeClientText(`Dobrý den,

děkuji, posílám slíbené 3 krátké nápady. Berte to jen jako rychlý pohled zvenku.

1. Zviditelnit příjezd do 18:00
Na webu je uvedeno, že nástup je od 14:00 do 18:00 a pozdější příjezd je možný jen po předchozí domluvě. To je informace, kterou bych dal hostovi velmi jasně hned po rezervaci.

2. Parkování dát do samostatného bloku
Parkování je placené, v docházkové vzdálenosti, s omezenou kapacitou a nutnou rezervací předem. Host, který přijíždí autem, by měl dostat krátký přehled ještě před cestou.

3. Oddělit instrukce pro Vila Krumlov a Pension Galko
Protože jsou prezentace propojené, dávalo by smysl mít v instrukcích jasně odděleno: adresa, recepce, kontakt a parkování pro konkrétní objekt.

Z toho by šel udělat jednoduchý online průvodce pro hosty nebo předpříjezdová zpráva, kterou dostanou po rezervaci.

David`);
    }

    if (isKrumlov) {
        return sanitizeClientText(`Dobrý den,

děkuji, posílám slíbené 3 krátké nápady. Berte to jen jako rychlý pohled zvenku.

1. Příjezd do historického centra bez nejistoty
U apartmánů v centru Krumlova může hostům pomoct krátký přehled ještě před příjezdem: Dlouhá 92, vstup do domu, kontakt v den příjezdu a co čekat po příjezdu.

2. Využít příběh výhledu a historického domu
Na webu působí silně výhled na hrad a zámek, zahrádka u kanálu od Krumlovského mlýna i historické prvky domu. Tyto věci by šly hostům připomenout ještě před pobytem.

3. Udělat mini průvodce Krumlovem a okolím
Na webu už máte stránku Možnosti rekreace. Z ní by šel udělat krátký přehled: co pěšky v Krumlově, kam s dětmi, co za kulturou a kam na výlet v okolí.

Ukázka struktury průvodce: příjezd do Dlouhé ulice, vstup do apartmánu, Wi-Fi, vybavení kuchyně, tipy v historickém centru, výhled na hrad, zahrádka u kanálu, kontakt a odjezd.

Kdyby vám to dávalo smysl, dokážu z toho připravit jednoduchou online stránku pro hosty. Tu můžete poslat odkazem po rezervaci nebo dát do QR kódu v apartmánu.

David`);
    }

    return sanitizeClientText(`Dobrý den,

děkuji, posílám slíbené 3 krátké nápady. Berte to jen jako rychlý pohled zvenku.

${ideaBlock}

Ukázka struktury online průvodce: ${sectionList}.

Online průvodce je jednoduchá stránka pro hosty před příjezdem. Host dostane odkaz nebo QR kód s praktickými informacemi: příjezd, vstup, Wi-Fi, vybavení, kontakt, tipy v okolí a odjezd. Sekce se dají upravit podle typu pobytu a napojit na zprávy po rezervaci.

Navazující placený krok může být ${recommendation.paidOfferShort}: ${recommendation.paidOfferDetails}

David`);
}