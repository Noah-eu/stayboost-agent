import { sanitizeClientText } from './clientCopy';
import type { EvidenceFact, GuestGuidePreview, Lead, QuickWin } from './types';

const normalize = (value = '') => value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const uniqueBy = <Item>(items: Item[], keyFor: (item: Item) => string) => [...new Map(items.map((item) => [keyFor(item), item])).values()];
const firstFact = (facts: EvidenceFact[], type: EvidenceFact['type'], pattern?: RegExp) => facts.find((fact) => fact.type === type && (!pattern || pattern.test(normalize(`${fact.label}\n${fact.value}`))));
const factsByType = (facts: EvidenceFact[], type: EvidenceFact['type']) => facts.filter((fact) => fact.type === type);
const clean = (value = '') => value.replace(/\s+/g, ' ').trim();
const includesText = (value = '', pattern?: RegExp) => pattern ? pattern.test(normalize(value)) : false;

const pageEvidenceText = (lead: Partial<Lead>) => [
    lead.websiteExtraction?.summary,
    ...(lead.websiteExtraction?.pagesExtracted ?? []).flatMap((page) => [page.title, page.textPreview]),
].filter(Boolean).join('\n');

const navigationFacts = (lead: Partial<Lead>): EvidenceFact[] => {
    const navLabels = [
        ...(lead.websiteExtraction?.discoveredNavigationLinks ?? []).map((link) => link.text || link.label),
    ];

    return uniqueBy(navLabels
        .map(clean)
        .filter((label) => !/^https?:\/\//i.test(label) && /apartm[aá]ny|apartmany|prozkoumejte|okol[ií]|galerie|kontakt|contact/i.test(label))
        .map((label) => ({ type: 'navigation' as const, label: 'navigace webu', value: label, source: 'navigace / text oficiálního webu' })), (fact) => normalize(fact.value));
};

const safeFactStrength = (fact: EvidenceFact) => {
    const content = normalize(`${fact.label}\n${fact.value}`);

    if (fact.type === 'missing-public-info') return 5;
    if (fact.type === 'navigation') return 4;
    if (fact.type === 'room-type') return 3;

    if (
        fact.type === 'website-strength'
        && /restaurace|restaurant|bistro|wellness|spa|snidane|sni[dď]an[eě]|elektrokol|kolo|bike/.test(content)
    ) return 1;

    if (
        fact.type === 'location'
        || fact.type === 'view'
        || fact.type === 'nearby'
        || /centrum|okoli|vylet|tipy|pamatk|vyhled|mesto/.test(content)
    ) return 2;

    return 4;
};

const strongestFacts = (facts: EvidenceFact[], strength: number) => facts
    .filter((fact) => safeFactStrength(fact) === strength)
    .sort((a, b) => a.value.length - b.value.length);

const addressFromText = (text: string) => text
    .split(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)[0]
    .match(/(?:Kremnick[aá]\s+43\/13,?\s*284\s*01\s*Kutn[aá]\s+Hora|[A-ZÁ-Ž][A-Za-zÁ-ž.-]+\s+\d+\/\d+,?\s*\d{3}\s*\d{2}\s+[A-ZÁ-Ž][A-Za-zÁ-ž.-]+(?:\s+[A-ZÁ-Ž][A-Za-zÁ-ž.-]+){0,2})/)?.[0];

export const buildSafeEvidenceFacts = (lead: Partial<Lead>) => {
    const extraction = lead.websiteExtraction;
    const text = [pageEvidenceText(lead), lead.notes, ...(lead.sourceMaterials ?? []).flatMap((material) => [material.title, material.content])].filter(Boolean).join('\n');
    const normalizedText = normalize(text);
    const facts: EvidenceFact[] = [];
    const contactSource = extraction?.contact.contactPageUrl || extraction?.websiteUrl || 'kontakt na oficiálním webu';

    for (const email of extraction?.contact.emails ?? []) facts.push({ type: 'contact', label: 'e-mail', value: email, source: contactSource });
    for (const phone of extraction?.contact.phones ?? []) facts.push({ type: 'contact', label: 'telefon', value: phone, source: contactSource });

    const address = addressFromText(text);
    if (address) facts.push({ type: 'address', label: 'adresa', value: clean(address), source: extraction?.contact.contactPageUrl || extraction?.websiteUrl || 'text oficiálního webu' });

    if (/centrum\s+kutn[eé]\s+hory|v\s+centru\s+kutn[eé]\s+hory|kutn[aá]\s+hora/.test(normalizedText) || normalize(lead.city ?? '').includes('kutna hora')) {
        facts.push({ type: 'location', label: 'lokalita', value: normalizedText.includes('centrum kutne hory') || normalizedText.includes('centru kutne hory') ? 'centrum Kutné Hory' : 'Kutná Hora', source: extraction?.websiteUrl || 'text oficiálního webu' });
    }

    if (/centrum\s+liberce|v\s+centru\s+liberce|liberec/.test(normalizedText) || normalize(lead.city ?? '').includes('liberec')) {
        facts.push({ type: 'location', label: 'lokalita', value: /centrum\s+liberce|v\s+centru\s+liberce/.test(normalizedText) ? 'apartmány v centru Liberce' : 'Liberec', source: extraction?.websiteUrl || 'text oficiálního webu' });
    }

    if (/v[yý]hled[^.\n]{0,80}(chr[aá]m|barbor)|chr[aá]m[^.\n]{0,80}barbor/.test(normalizedText)) {
        facts.push({ type: 'view', label: 'výhled', value: 'výhled na chrám sv. Barbory', source: extraction?.websiteUrl || 'text oficiálního webu' });
    }

    if (/apartm[aá]ny|apartments|ubytov[aá]n[ií]/.test(normalizedText)) {
        facts.push({ type: 'room-type', label: 'typ ubytování', value: 'apartmány / ubytování', source: extraction?.websiteUrl || 'text oficiálního webu' });
    }

    if (/restaurace\s+milenium/.test(normalizedText)) {
        const value = /p[řr][ií]zem[ií][^\n.]{0,80}denn[eě]\s+otev[řr]en/.test(normalizedText)
            ? 'V přízemí denně otevřena restaurace Milenium'
            : /p[řr][ií]zem[ií]/.test(normalizedText)
                ? 'Restaurace Milenium v přízemí'
                : 'Restaurace Milenium';
        facts.push({ type: 'website-strength', label: 'restaurace', value, source: extraction?.websiteUrl || 'text oficiálního webu' });
    } else if (/restaurace|restaurant|bistro/.test(normalizedText)) {
        facts.push({ type: 'website-strength', label: 'restaurace', value: 'Restaurace je součástí nabídky pobytu', source: extraction?.websiteUrl || 'text oficiálního webu' });
    }

    if (/tipy\s+na\s+v[ýy]lety|prozkoumejte\s+okol[ií]|mo[zž]nosti\s+rekreace|v[ýy]let/.test(normalizedText)) {
        facts.push({ type: 'nearby', label: 'lokální tipy', value: /tipy\s+na\s+v[ýy]lety/.test(normalizedText) ? 'Tipy na výlety pro vás máme připravené' : 'Tipy na výlety v okolí', source: extraction?.websiteUrl || 'text oficiálního webu' });
    }

    if (/elektrokol|e-?bike|zap[ůu]j[čc]it\s+kolo|zap[ůu]j[čc]en[ií]\s+kola/.test(normalizedText)) {
        facts.push({ type: 'website-strength', label: 'elektrokolo', value: 'Možnost zapůjčit elektrokolo', source: extraction?.websiteUrl || 'text oficiálního webu' });
    }

    facts.push(...navigationFacts(lead));

    const missingSignals = extraction?.missingPublicInfoSignals ?? [];
    if (missingSignals.length > 0 || !/faq|často kladené|casto kladene|parkov[aá]n[ií]|předpříjezd|predprijezd/.test(normalizedText)) {
        facts.push({ type: 'missing-public-info', label: 'veřejně nejasné praktické informace', value: 'není veřejně jasné FAQ / parkování / předpříjezdový přehled', source: 'nepřítomnost strukturované sekce v přečteném oficiálním webu' });
    }

    const safeFacts = uniqueBy(facts, (fact) => `${fact.type}|${normalize(fact.value)}`);
    const safeFactCategories = uniqueBy(safeFacts.map((fact) => fact.type), (type) => type);

    return { safeFacts, safeFactCount: safeFacts.length, safeFactCategories };
};

const makeSafeWin = (title: string, why: string, action: string, sourceEvidence: string, usedSignals: string[]): QuickWin => ({
    id: `quick-win-${crypto.randomUUID()}`,
    title,
    why,
    action,
    sourceEvidence,
    candidateSpecificity: 'specific',
    uniqueBusinessAngle: usedSignals.join(', '),
    usedSignals,
});

export const buildSafeMinimumFreeIdeas = (lead: Partial<Lead>, safeFacts: EvidenceFact[]): QuickWin[] => {
    const contacts = factsByType(safeFacts, 'contact');
    const address = firstFact(safeFacts, 'address');
    const location = firstFact(safeFacts, 'location');
    const view = firstFact(safeFacts, 'view');
    const roomType = firstFact(safeFacts, 'room-type');
    const nav = factsByType(safeFacts, 'navigation');
    const navValues = nav.map((fact) => fact.value).filter(Boolean);
    const contactEvidence = [address?.value, ...contacts.map((fact) => fact.value)].filter(Boolean).join(', ');
    const locationEvidence = [view?.value, location?.value].filter(Boolean).join(', ');
    const navEvidence = navValues.length ? `navigace webu: ${navValues.slice(0, 4).join(', ')}` : [roomType?.value, 'kontakt'].filter(Boolean).join(', ');
    const topOperationalFacts = strongestFacts(safeFacts, 1);
    const topLocalFacts = strongestFacts(safeFacts, 2);
    const restaurantFact = topOperationalFacts.find((fact) => includesText(`${fact.label}\n${fact.value}`, /restaurace|restaurant|bistro/));
    const tripFact = topLocalFacts.find((fact) => includesText(`${fact.label}\n${fact.value}`, /tipy|vylet|okoli/));
    const ebikeFact = topOperationalFacts.find((fact) => includesText(`${fact.label}\n${fact.value}`, /elektrokol|kolo|bike/));
    const strongestPositiveFact = [...topOperationalFacts, ...topLocalFacts, ...strongestFacts(safeFacts, 3), ...strongestFacts(safeFacts, 4)]
        .find((fact) => fact.type !== 'missing-public-info' && fact.type !== 'contact' && fact.type !== 'address');
    const secondIdeaUsedSignals = restaurantFact
        ? ['restaurace Milenium', 'v přízemí', 'denně otevřena']
        : strongestPositiveFact
            ? [strongestPositiveFact.value]
            : [roomType?.value || 'konkrétní webový signál'];
    const thirdIdeaSignals = uniqueBy([
        tripFact?.value ? 'tipy na výlety' : '',
        ebikeFact?.value ? 'elektrokolo' : '',
        location?.value ? normalize(location.value).includes('liberec') ? 'Liberec' : location.value : '',
    ].filter(Boolean), (value) => normalize(value as string)) as string[];

    return [
        makeSafeWin(
            'Krátký předpříjezdový přehled pro hosty',
            'Host má před cestou dostat adresu, kontakt a základní orientaci na jednom místě.',
            `Připravit jednoduchý blok: ${address?.value || lead.city || 'adresa ubytování'}, kontakt, kdy volat, jak probíhá příjezd a co si ověřit před cestou.`,
            contactEvidence || 'kontakt a adresa z oficiálního webu',
            [address?.value, ...contacts.map((fact) => fact.value)].filter((value): value is string => Boolean(value)),
        ),
        makeSafeWin(
            restaurantFact
                ? 'Využít restauraci Milenium jako výhodu po příjezdu'
                : view
                    ? 'Využít výhled na chrám sv. Barbory jako silný motiv pobytu'
                    : `Využít konkrétní výhodu: ${strongestPositiveFact?.value || location?.value || roomType?.value || 'pobytový motiv z webu'}`,
            restaurantFact
                ? 'Web uvádí, že v přízemí je denně otevřená restaurace Milenium.'
                : view
                    ? 'Web výslovně staví prezentaci na výhledu na chrám sv. Barbory a centru Kutné Hory.'
                    : `Web ukazuje konkrétní motiv pobytu: ${strongestPositiveFact?.value || location?.value || roomType?.value || 'ubytování'}.`,
            restaurantFact
                ? 'Do průvodce přidat blok: kde se host může najíst po příjezdu, jak je restaurace propojená s apartmány a co si ověřit předem.'
                : `Do průvodce přidat krátký blok „co si u nás nenechat ujít“: ${[strongestPositiveFact?.value, view?.value, location?.value, 'první orientace po příjezdu'].filter(Boolean).join(', ')}.`,
            restaurantFact?.value || locationEvidence || roomType?.value || 'konkrétní prezentace na oficiálním webu',
            secondIdeaUsedSignals,
        ),
        makeSafeWin(
            tripFact || ebikeFact
                ? 'Přidat blok s tipy na výlety a elektrokolo'
                : 'Online rozcestník pro hosta po rezervaci',
            tripFact || ebikeFact
                ? 'Web zmiňuje tipy na výlety a možnost zapůjčit elektrokolo.'
                : `Web má sekce ${navValues.slice(0, 4).join(', ') || 'ubytování a kontakt'}, ale host by mohl dostat praktický přehled přímo po rezervaci.`,
            tripFact || ebikeFact
                ? `Připravit krátký hostovský přehled: první procházka v ${normalize(location?.value || '').includes('liberec') ? 'Liberci' : 'okolí'}, tipy v okolí, možnost zapůjčení elektrokola a co si host má domluvit předem.`
                : 'Připravit jednoduchý online průvodce: příjezd, kontakt, apartmány, okolí, Wi-Fi, odjezd.',
            [tripFact?.value, ebikeFact?.value].filter(Boolean).join(', ') || navEvidence || 'navigace a základní informace oficiálního webu',
            thirdIdeaSignals.length ? thirdIdeaSignals : navValues.length ? navValues.slice(0, 4) : ['navigace webu'],
        ),
    ];
};

export const buildSafeMinimumMiniAudit = (lead: Partial<Lead>, ideas: QuickWin[]) => sanitizeClientText(`3 nápady zdarma pro ${lead.name || 'ubytování'}

${ideas.map((idea, index) => `${index + 1}. ${idea.title}
${idea.action}
Podklad: ${idea.sourceEvidence}.`).join('\n\n')}`);

export const buildSafeMinimumOutreach = (lead: Partial<Lead>) => sanitizeClientText(`Dobrý den,

omlouvám se za nevyžádanou zprávu. Narazil jsem na váš web ${lead.name || 'vašeho ubytování'}.

Nevidím samozřejmě, co hostům posíláte po rezervaci. Jen mě napadlo, že bych vám mohl zdarma poslat 3 krátké nápady, jak hostům ještě víc zpřehlednit informace před příjezdem — například příjezd, kontakt, okolí a základní informace na jednom místě.

Berte to jen jako malou ukázku mého pohledu. Pokud by vám to dávalo smysl, můžeme se pak domluvit třeba na jednoduchém online průvodci pro hosty.

Má smysl vám ty 3 body poslat?

David`);

export const buildSafeMinimumFollowUp = (lead: Partial<Lead>) => sanitizeClientText(`Dobrý den,

jen krátce navazuji na předchozí zprávu ohledně ${lead.name || 'vašeho ubytování'}. Šlo mi hlavně o tři praktické body pro hosty před příjezdem: příjezd, kontakt a okolí.

Kdyby se vám to hodilo, rád je pošlu.

David`);

export const buildSafeMinimumPaidStep = (lead: Partial<Lead>, safeFacts: EvidenceFact[]) => {
    const address = firstFact(safeFacts, 'address')?.value;
    const hasRestaurant = Boolean(firstFact(safeFacts, 'website-strength', /restaurace|restaurant|bistro/));
    const hasTrips = Boolean(firstFact(safeFacts, 'nearby', /tipy|vylet|okoli/));
    const hasEbike = Boolean(firstFact(safeFacts, 'website-strength', /elektrokol|kolo|bike/));
    const location = firstFact(safeFacts, 'location')?.value || lead.city || '';

    if (hasRestaurant && hasTrips && hasEbike && address && normalize(location).includes('liberec')) {
        return sanitizeClientText('Jednoduchý online průvodce a předpříjezdová komunikace pro hosty Apartmánů Milenium: příjezd na Baarovu 49/3, kontakty, restaurace Milenium v přízemí, tipy na výlety, možnost zapůjčení elektrokola, Wi-Fi a odjezd.');
    }

    const blocks = [
        address ? `příjezd na ${address}` : 'příjezd',
        'kontakty',
        hasRestaurant ? 'restaurace' : '',
        hasTrips ? 'tipy na výlety' : 'okolí',
        hasEbike ? 'možnost zapůjčení elektrokola' : '',
        'Wi-Fi',
        'odjezd',
    ].filter(Boolean);

    return sanitizeClientText(`Jednoduchý online průvodce a předpříjezdová komunikace pro hosty: ${blocks.join(', ')}.`);
};

export const buildSafeMinimumGuestGuidePreview = (lead: Partial<Lead>, safeFacts: EvidenceFact[]): GuestGuidePreview => {
    const contacts = factsByType(safeFacts, 'contact').map((fact) => fact.value);
    const address = firstFact(safeFacts, 'address')?.value || '';
    const location = firstFact(safeFacts, 'location')?.value || lead.city || '';
    const view = firstFact(safeFacts, 'view')?.value;
    const nav = factsByType(safeFacts, 'navigation').map((fact) => fact.value);
    const restaurantFact = firstFact(safeFacts, 'website-strength', /restaurace|restaurant|bistro/);
    const tripFact = firstFact(safeFacts, 'nearby', /tipy|vylet|okoli/);
    const ebikeFact = firstFact(safeFacts, 'website-strength', /elektrokol|kolo|bike/);
    const nearbySource = [view, location, tripFact?.value, ebikeFact?.value, nav.includes('prozkoumejte okolí') ? 'prozkoumejte okolí' : '']
        .filter((value): value is string => Boolean(value));
    const preview: Omit<GuestGuidePreview, 'configExport'> = {
        propertyName: lead.name || 'Ubytování',
        city: lead.city || location,
        address,
        suggestedSlug: normalize(lead.name || 'ubytovani').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'ubytovani',
        language: 'cs',
        sourceEvidence: safeFacts.map((fact) => `${fact.label}: ${fact.value}`),
        limitations: ['Bezpečný preview vychází jen z ověřených údajů na oficiálním webu a obsahuje placeholdery k doplnění.'],
        sections: [
            {
                id: 'arrival-contact',
                title: 'Příjezd a kontakt',
                headline: 'Základní informace před cestou',
                overview: 'Adresa, kontakt a první orientace na jednom místě.',
                groups: [{ title: 'Ověřené údaje', items: [address || '[DOPLNIT: adresa]', ...contacts, '[DOPLNIT: instrukce k příjezdu]'] }],
                sourceEvidence: [address, ...contacts].filter(Boolean),
            },
            {
                id: 'apartments',
                title: 'Apartmány',
                headline: 'Co host rezervuje',
                overview: 'Krátký přehled ubytování bez domýšlení vybavení.',
                groups: [{ title: 'Doplnit', items: ['apartmány / ubytování', '[DOPLNIT: vybavení apartmánu]', '[DOPLNIT: pravidla pobytu]'] }],
                sourceEvidence: [firstFact(safeFacts, 'room-type')?.value || 'apartmány / ubytování'].filter(Boolean),
            },
            ...(restaurantFact ? [
                {
                    id: 'restaurant',
                    title: 'Restaurace Milenium',
                    headline: 'Jídlo po příjezdu bez hledání',
                    overview: 'Krátký blok o restauraci v přízemí jako praktické výhodě po příjezdu.',
                    groups: [{ title: 'Ověřené údaje', items: [restaurantFact.value, '[DOPLNIT: otevírací dobu]', '[DOPLNIT: rezervaci předem, pokud je potřeba]'] }],
                    sourceEvidence: [restaurantFact.value],
                },
            ] : []),
            {
                id: 'nearby',
                title: 'Okolí / tipy',
                headline: 'Co si nenechat ujít',
                overview: [view, location, tripFact?.value, ebikeFact?.value].filter(Boolean).join(', ') || 'Doplnit konkrétní tipy v okolí.',
                groups: [{ title: 'Tipy', items: [tripFact?.value || view || '[DOPLNIT: hlavní tip v okolí]', location || '[DOPLNIT: lokalita]', ebikeFact?.value || '[DOPLNIT: možnost půjčení kola / elektrokola]'] }],
                sourceEvidence: nearbySource,
            },
            {
                id: 'wifi-departure',
                title: 'Wi-Fi a odjezd',
                headline: 'Placeholdery k doplnění',
                overview: 'Praktické údaje, které se mají doplnit před použitím.',
                groups: [{ title: 'Doplnit', items: ['[DOPLNIT: Wi-Fi]', '[DOPLNIT: check-out / odjezd]', '[DOPLNIT: komu volat při problému]'] }],
                sourceEvidence: ['placeholdery k doplnění'],
            },
        ],
    };

    return {
        ...preview,
        configExport: {
            propertyName: preview.propertyName,
            city: preview.city,
            address: preview.address,
            sections: preview.sections.map((section) => ({ id: section.id, title: section.title, groups: section.groups })),
            safeMinimum: true,
        },
    };
};
