const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
};

const json = (statusCode: number, body: unknown) => ({ statusCode, headers, body: JSON.stringify(body) });

const fallbackAnalysis = (candidate: { name?: string; signals?: string[]; risks?: string[]; sourceSnippets?: string[]; evidenceSummary?: string; isMock?: boolean }) => {
    const name = candidate.name || 'Vybrany kandidat';
    const signals = candidate.signals || [];
    const risks = candidate.risks || [];
    const evidence = candidate.sourceSnippets?.[0] || candidate.evidenceSummary || 'Omezeny verejny search snippet.';

    return {
        firstImpression: `${name} vypada z verejnych snippetů jako relevantni lead, ale evidence je omezena na search vysledky.`,
        strengths: signals.slice(0, 3),
        risks: risks.length > 0 ? risks : ['Omezeny verejny nahled, neni potvrzen detail nabidky.'],
        guestFrictionSignals: ['Host muze pred rezervaci hledat jasne informace k prijezdu, check-inu, parkovani a komunikaci.'],
        quickWins: [
            {
                title: 'Zviditelnit informace pred prijezdem',
                why: 'Search snippet naznacuje provozni tema, ktere host resi pred rezervaci.',
                action: 'Pridat kratky blok: prijezd, check-in, parkovani a kde host najde instrukce.',
                sourceEvidence: evidence,
            },
            {
                title: 'Vytahnout nejsilnejsi benefit',
                why: 'Silne verejne signaly maji byt videt v prvnich sekundach.',
                action: `V prvnim odstavci zminit: ${signals.slice(0, 2).join(' + ') || 'hlavni hodnotu pobytu'}.`,
                sourceEvidence: evidence,
            },
            {
                title: 'Navrhnout guest guide jako dalsi krok',
                why: 'Guest guide umi spojit prijezd, pravidla a tipy do jednoho jednoducheho odkazu.',
                action: 'Nabidnout QR guest guide pro informace pred prijezdem a behem pobytu.',
                sourceEvidence: evidence,
            },
        ],
        miniAudit: `Mini-audit pro ${name}: vystup vychazi jen z verejnych search snippetů. Silne signaly: ${signals.join(', ') || 'omezeny verejny signal'}. Rizika: ${risks.join(', ') || 'nedostatek detailu'}. Prvni krok: zviditelnit prakticke informace pred prijezdem.`,
        outreachEmail: `Dobry den,\n\nvsiml jsem si verejne prezentace ${name}. Z dostupnych verejnych snippetů pusobi zajimave hlavne ${signals.slice(0, 2).join(' a ') || 'prvni dojem nabidky'}.\n\nPoslal bych vam zdarma 3 konkretni navrhy, jak zlepsit verejnou prezentaci pred rezervaci - hlavne prijezd, check-in a prakticke instrukce. Nehodnotim interni komunikaci ani automaticky neprochazim OTA stranky.\n\nDavid`,
        followUp: `Dobry den, jen se kratce vracim k verejne prezentaci ${name}. Pokud chcete, poslu kratky mini-audit ve 3 bodech bez zavazku.`,
        offerRecommendation: 'Doporucit bezplatny mini-audit a potom placeny audit guest guide / komunikace pred prijezdem.',
        confidence: 'low',
        evidenceLimits: ['Omezeno na search snippety a dodane verejne texty.', 'Netvrdi, ze byla prectena Booking/Airbnb/Google stranka.', 'E-maily se automaticky neposilaji.'],
    };
};

const parseJsonObject = (value: string) => {
    const trimmed = value.trim();
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
        throw new Error('OpenAI response did not contain JSON object.');
    }

    return JSON.parse(trimmed.slice(start, end + 1));
};

const validateAnalysis = (value: unknown) => {
    const analysis = value as { quickWins?: unknown[]; miniAudit?: unknown; outreachEmail?: unknown; confidence?: unknown };

    if (!analysis || !Array.isArray(analysis.quickWins) || analysis.quickWins.length < 3 || typeof analysis.miniAudit !== 'string' || typeof analysis.outreachEmail !== 'string') {
        throw new Error('Invalid analysis JSON shape.');
    }

    if (!['low', 'medium', 'high'].includes(String(analysis.confidence))) {
        throw new Error('Invalid confidence value.');
    }

    return value;
};

export const handler = async (event: { httpMethod: string; body?: string | null }) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { message: 'Use POST.' });

    const openAiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
    const body = JSON.parse(event.body || '{}') as { candidate?: unknown; sourceSnippets?: string[]; sourceUrls?: string[]; userNotes?: string };
    const candidate = body.candidate as { name?: string; signals?: string[]; risks?: string[]; sourceSnippets?: string[]; evidenceSummary?: string; isMock?: boolean };

    if (!openAiKey) {
        return json(501, {
            status: 'needs-config',
            message: 'AI extrakce neni nakonfigurovana. Nastav OPENAI_API_KEY v Netlify environment variables.',
            isMock: true,
            analysis: { ...fallbackAnalysis(candidate || {}), isMock: true },
        });
    }

    const prompt = `Vrat pouze parsovatelny JSON bez markdownu. Analyzuj lead kandidata pro StayBoost Agent z verejnych search snippetů. Nesmíš tvrdit, ze jsi cetl Booking/Airbnb/Google stranku nebo interni zpravy. Pokud jsou zdroje slabe, uved evidenceLimits a confidence low. Shape: {"firstImpression":string,"strengths":string[],"risks":string[],"guestFrictionSignals":string[],"quickWins":[{"title":string,"why":string,"action":string,"sourceEvidence":string}],"miniAudit":string,"outreachEmail":string,"followUp":string,"offerRecommendation":string,"confidence":"low"|"medium"|"high","evidenceLimits":string[]}.\n\nCandidate: ${JSON.stringify(candidate)}\nSnippets: ${JSON.stringify(body.sourceSnippets || [])}\nURLs: ${JSON.stringify(body.sourceUrls || [])}\nUser notes: ${body.userNotes || ''}`;

    const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${openAiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, input: prompt }),
    });

    if (!response.ok) {
        return json(response.status, { status: 'error', message: `OpenAI request failed with HTTP ${response.status}`, isMock: false });
    }

    const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const outputText = payload.output_text || payload.output?.flatMap((item) => item.content || []).map((content) => content.text || '').join('\n') || '';
    const parsed = validateAnalysis(parseJsonObject(outputText));

    return json(200, {
        status: 'completed',
        message: 'AI analyza dokoncena z dodanych verejnych snippetů a odkazu.',
        isMock: false,
        analysis: { ...(parsed as Record<string, unknown>), isMock: false },
    });
};
