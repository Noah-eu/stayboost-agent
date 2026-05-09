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

const pageEvidenceText = (lead: Partial<Lead>) => [
    lead.websiteExtraction?.summary,
    ...(lead.websiteExtraction?.pagesExtracted ?? []).flatMap((page) => [page.title, page.textPreview]),
].filter(Boolean).join('\n');

const navigationFacts = (lead: Partial<Lead>): EvidenceFact[] => {
    const navLabels = [
        ...(lead.websiteExtraction?.discoveredNavigationLinks ?? []).map((link) => link.text || link.label),
    ];
    const pageText = normalize(pageEvidenceText(lead));
    const inferred = [
        /apartm[aá]ny|apartmany|apartments/.test(pageText) ? 'apartmány' : '',
        /prozkoumejte\s+okol[ií]|okol[ií]|tipy\s+v\s+okol[ií]/.test(pageText) ? 'prozkoumejte okolí' : '',
        /galerie|fotogalerie/.test(pageText) ? 'galerie' : '',
        /kontakt|contact/.test(pageText) ? 'kontakt' : '',
    ];

    return uniqueBy([...navLabels, ...inferred]
        .map(clean)
        .filter((label) => !/^https?:\/\//i.test(label) && /apartm[aá]ny|apartmany|prozkoumejte|okol[ií]|galerie|kontakt|contact/i.test(label))
        .map((label) => ({ type: 'navigation' as const, label: 'navigace webu', value: label, source: 'navigace / text oficiálního webu' })), (fact) => normalize(fact.value));
};

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

    if (/v[yý]hled[^.\n]{0,80}(chr[aá]m|barbor)|chr[aá]m[^.\n]{0,80}barbor/.test(normalizedText)) {
        facts.push({ type: 'view', label: 'výhled', value: 'výhled na chrám sv. Barbory', source: extraction?.websiteUrl || 'text oficiálního webu' });
    }

    if (/apartm[aá]ny|apartments|ubytov[aá]n[ií]/.test(normalizedText)) {
        facts.push({ type: 'room-type', label: 'typ ubytování', value: 'apartmány / ubytování', source: extraction?.websiteUrl || 'text oficiálního webu' });
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

    return [
        makeSafeWin(
            'Krátký předpříjezdový přehled pro hosty',
            'Host má před cestou dostat adresu, kontakt a základní orientaci na jednom místě.',
            `Připravit jednoduchý blok: ${address?.value || lead.city || 'adresa ubytování'}, kontakt, kdy volat, jak probíhá příjezd a co si ověřit před cestou.`,
            contactEvidence || 'kontakt a adresa z oficiálního webu',
            ['adresa', 'kontakt'],
        ),
        makeSafeWin(
            view ? 'Využít výhled na chrám sv. Barbory jako silný motiv pobytu' : 'Využít nejsilnější konkrétní motiv z webu',
            view ? 'Web výslovně staví prezentaci na výhledu na chrám sv. Barbory a centru Kutné Hory.' : `Web ukazuje konkrétní motiv pobytu: ${location?.value || roomType?.value || 'ubytování'}.`,
            `Do průvodce přidat krátký blok "co si u nás nenechat ujít": ${[view?.value, location?.value, 'první procházka po příjezdu'].filter(Boolean).join(', ')}.`,
            locationEvidence || roomType?.value || 'konkrétní prezentace na oficiálním webu',
            [view?.value || '', location?.value || '', roomType?.value || ''].filter(Boolean),
        ),
        makeSafeWin(
            'Online rozcestník pro hosta po rezervaci',
            `Web má sekce ${navValues.slice(0, 4).join(', ') || 'ubytování a kontakt'}, ale host by mohl dostat praktický přehled přímo po rezervaci.`,
            'Připravit jednoduchý online průvodce: příjezd, kontakt, apartmány, okolí, Wi-Fi, odjezd.',
            navEvidence || 'navigace a základní informace oficiálního webu',
            navValues.length ? navValues.slice(0, 4) : ['navigace webu'],
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

export const buildSafeMinimumPaidStep = () => sanitizeClientText('Jednoduchý online průvodce pro hosty: příjezd, kontakt, apartmány, okolí, Wi-Fi a odjezd v jednom odkazu nebo QR kódu.');

export const buildSafeMinimumGuestGuidePreview = (lead: Partial<Lead>, safeFacts: EvidenceFact[]): GuestGuidePreview => {
    const contacts = factsByType(safeFacts, 'contact').map((fact) => fact.value);
    const address = firstFact(safeFacts, 'address')?.value || '';
    const location = firstFact(safeFacts, 'location')?.value || lead.city || '';
    const view = firstFact(safeFacts, 'view')?.value;
    const nav = factsByType(safeFacts, 'navigation').map((fact) => fact.value);
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
            {
                id: 'nearby',
                title: 'Okolí / tipy',
                headline: 'Co si nenechat ujít',
                overview: [view, location].filter(Boolean).join(', ') || 'Doplnit konkrétní tipy v okolí.',
                groups: [{ title: 'Tipy', items: [view || '[DOPLNIT: hlavní tip v okolí]', location || '[DOPLNIT: lokalita]', nav.includes('prozkoumejte okolí') ? 'prozkoumejte okolí' : '[DOPLNIT: okolí]'] }],
                sourceEvidence: [view, location, nav.includes('prozkoumejte okolí') ? 'prozkoumejte okolí' : ''].filter((value): value is string => Boolean(value)),
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
