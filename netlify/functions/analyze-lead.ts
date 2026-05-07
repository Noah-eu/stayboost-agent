type CandidateInput = {
    name?: string;
    signals?: string[];
    risks?: string[];
    sourceSnippets?: string[];
    evidenceSummary?: string;
    isMock?: boolean;
};

declare const process: { env: Record<string, string | undefined> };

type FallbackReason =
    | 'missing_openai_api_key'
    | 'openai_401_auth'
    | 'openai_403_access'
    | 'openai_429_rate_limit'
    | 'openai_400_bad_request_or_model'
    | 'openai_5xx_provider_error'
    | 'openai_http_error'
    | 'openai_json_parse_error'
    | 'function_runtime_error';

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
};

const json = (statusCode: number, body: unknown) => ({ statusCode, headers, body: JSON.stringify(body) });

const makeDebugId = () => `analyze-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const safeSample = (value: string) => value
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
    .slice(0, 300);

const fallbackReasonForStatus = (status: number): FallbackReason => {
    if (status === 401) return 'openai_401_auth';
    if (status === 403) return 'openai_403_access';
    if (status === 429) return 'openai_429_rate_limit';
    if (status === 400) return 'openai_400_bad_request_or_model';
    if (status >= 500) return 'openai_5xx_provider_error';
    return 'openai_http_error';
};

const fallbackAnalysis = (candidate: CandidateInput) => {
    const name = candidate.name || 'Vybrany kandidat';
    const signals = candidate.signals || [];
    const risks = candidate.risks || [];
    const evidence = candidate.sourceSnippets?.[0] || candidate.evidenceSummary || 'Omezeny verejny search snippet.';

    return {
        firstImpression: `${name} vypada z verejnych snippetu jako relevantni lead, ale evidence je omezena na search vysledky.`,
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
        miniAudit: `Mini-audit pro ${name}: vystup vychazi jen z verejnych search snippetu. Silne signaly: ${signals.join(', ') || 'omezeny verejny signal'}. Rizika: ${risks.join(', ') || 'nedostatek detailu'}. Prvni krok: zviditelnit prakticke informace pred prijezdem.`,
        outreachEmail: `Dobry den,\n\nvsiml jsem si verejne prezentace ${name}. Z dostupnych verejnych snippetu pusobi zajimave hlavne ${signals.slice(0, 2).join(' a ') || 'prvni dojem nabidky'}.\n\nPoslal bych vam zdarma 3 konkretni navrhy, jak zlepsit verejnou prezentaci pred rezervaci - hlavne prijezd, check-in a prakticke instrukce. Nehodnotim interni komunikaci ani automaticky neprochazim OTA stranky.\n\nDavid`,
        followUp: `Dobry den, jen se kratce vracim k verejne prezentaci ${name}. Pokud chcete, poslu kratky mini-audit ve 3 bodech bez zavazku.`,
        offerRecommendation: 'Doporucit bezplatny mini-audit a potom placeny audit guest guide / komunikace pred prijezdem.',
        confidence: 'low',
        evidenceLimits: ['Omezeno na search snippety a dodane verejne texty.', 'Netvrdi, ze byla prectena Booking/Airbnb/Google stranka.', 'E-maily se automaticky neposilaji.'],
    };
};

const cleanJsonText = (value: string) => {
    const trimmed = value.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return fenced ? fenced[1].trim() : trimmed;
};

const parseJsonObject = (value: string) => {
    const trimmed = cleanJsonText(value);
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
        throw new Error('OpenAI response did not contain JSON object.');
    }

    return JSON.parse(trimmed.slice(start, end + 1));
};

const extractTextContent = (payload: unknown): string => {
    const response = payload as {
        output_text?: string;
        output?: Array<{ content?: Array<{ text?: string; value?: string }> }>;
    };

    if (typeof response.output_text === 'string' && response.output_text.trim()) {
        return response.output_text;
    }

    return response.output
        ?.flatMap((item) => item.content || [])
        .map((content) => content.text || content.value || '')
        .filter(Boolean)
        .join('\n') || '';
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

const logFallback = (details: { debugId: string; status: number; fallbackReason: string; model: string; hasOpenAIKey: boolean }) => {
    console.error('[stayboost-agent] analyze-lead fallback', details);
};

const fallbackResponse = ({ candidate, debugId, fallbackReason, hasOpenAIKey, httpStatus, message, model, sanitizedSample, statusCode = 200 }: {
    candidate: CandidateInput;
    debugId: string;
    fallbackReason: FallbackReason;
    hasOpenAIKey: boolean;
    httpStatus?: number;
    message: string;
    model: string;
    sanitizedSample?: string;
    statusCode?: number;
}) => {
    logFallback({ debugId, status: httpStatus || statusCode, fallbackReason, model, hasOpenAIKey });

    return json(statusCode, {
        status: fallbackReason === 'missing_openai_api_key' ? 'needs-config' : 'completed',
        message,
        isMock: true,
        provider: 'fallback',
        fallbackReason,
        diagnostic: {
            mode: 'demo-fallback',
            analyzeProvider: 'demo-fallback',
            fallbackReason,
            httpStatus: httpStatus || statusCode,
            debugId,
            userMessage: `OpenAI analyza nebezela: ${fallbackReason}`,
            runtime: 'netlify-function',
            hasOpenAIKey,
            model,
            sanitizedSample,
        },
        analysis: { ...fallbackAnalysis(candidate || {}), isMock: true },
    });
};

export const handler = async (event: { httpMethod: string; body?: string | null }) => {
    const debugId = makeDebugId();

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { message: 'Use POST.' });

    const openAiKey = process.env.OPENAI_API_KEY;
    const hasOpenAIKey = Boolean(openAiKey);
    const model = process.env.OPENAI_MODEL || 'gpt-5.5';

    try {
        const body = JSON.parse(event.body || '{}') as { candidate?: unknown; sourceSnippets?: string[]; sourceUrls?: string[]; userNotes?: string };
        const candidate = body.candidate as CandidateInput;

        if (!openAiKey) {
            return fallbackResponse({
                candidate,
                debugId,
                fallbackReason: 'missing_openai_api_key',
                hasOpenAIKey,
                httpStatus: 501,
                message: 'OpenAI analyza nebezela: missing_openai_api_key. Nastav OPENAI_API_KEY ve Functions environment scope.',
                model,
                statusCode: 501,
            });
        }

        const prompt = `Vrat pouze parsovatelny JSON bez markdownu. Analyzuj lead kandidata pro StayBoost Agent z verejnych search snippetu. Nesmíš tvrdit, ze jsi cetl Booking/Airbnb/Google stranku nebo interni zpravy. Pokud jsou zdroje slabe, uved evidenceLimits a confidence low. Shape: {"firstImpression":string,"strengths":string[],"risks":string[],"guestFrictionSignals":string[],"quickWins":[{"title":string,"why":string,"action":string,"sourceEvidence":string}],"miniAudit":string,"outreachEmail":string,"followUp":string,"offerRecommendation":string,"confidence":"low"|"medium"|"high","evidenceLimits":string[]}.

Candidate: ${JSON.stringify(candidate)}
Snippets: ${JSON.stringify(body.sourceSnippets || [])}
URLs: ${JSON.stringify(body.sourceUrls || [])}
User notes: ${body.userNotes || ''}`;

        const response = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${openAiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ model, input: prompt }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            const fallbackReason = fallbackReasonForStatus(response.status);

            return fallbackResponse({
                candidate,
                debugId,
                fallbackReason,
                hasOpenAIKey,
                httpStatus: response.status,
                message: `OpenAI analyza nebezela: ${fallbackReason}`,
                model,
                sanitizedSample: safeSample(errorText),
            });
        }

        const payload = await response.json();
        const outputText = extractTextContent(payload);

        try {
            const parsed = validateAnalysis(parseJsonObject(outputText));

            return json(200, {
                status: 'completed',
                message: 'OpenAI analyza dokoncena z dodanych verejnych snippetu a odkazu.',
                isMock: false,
                provider: 'openai',
                fallbackReason: null,
                diagnostic: {
                    mode: 'real-api',
                    analyzeProvider: 'openai',
                    debugId,
                    userMessage: 'OpenAI analyza probehla pres realne API.',
                    runtime: 'netlify-function',
                    hasOpenAIKey,
                    model,
                },
                analysis: { ...(parsed as Record<string, unknown>), isMock: false },
            });
        } catch {
            return fallbackResponse({
                candidate,
                debugId,
                fallbackReason: 'openai_json_parse_error',
                hasOpenAIKey,
                httpStatus: 200,
                message: 'OpenAI analyza nebezela: openai_json_parse_error',
                model,
                sanitizedSample: safeSample(outputText),
            });
        }
    } catch {
        return fallbackResponse({
            candidate: {},
            debugId,
            fallbackReason: 'function_runtime_error',
            hasOpenAIKey,
            httpStatus: 500,
            message: 'OpenAI analyza nebezela: function_runtime_error',
            model,
            statusCode: 500,
        });
    }
};
