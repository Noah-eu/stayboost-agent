type CandidateInput = {
    runId?: string;
    name?: string;
    signals?: string[];
    risks?: string[];
    opportunityScore?: number;
    fitVerdict?: FitVerdict;
    confidence?: Confidence;
    alreadySolvedSignals?: string[];
    missingEvidence?: string[];
    contradictionWarnings?: string[];
    sourceSnippets?: string[];
    evidenceSummary?: string;
    isMock?: boolean;
};

type FitVerdict = 'strong-opportunity' | 'moderate-opportunity' | 'weak-opportunity' | 'not-enough-evidence' | 'skip';
type Confidence = 'low' | 'medium' | 'high';

declare const process: { env: Record<string, string | undefined> };

type FallbackReason =
    | 'missing_openai_api_key'
    | 'openai_401_auth'
    | 'openai_403_access'
    | 'openai_429_rate_limit'
    | 'openai_400_bad_request_or_model'
    | 'openai_504_from_provider'
    | 'openai_5xx_provider_error'
    | 'openai_http_error'
    | 'openai_timeout'
    | 'openai_network_error'
    | 'openai_json_parse_error'
    | 'netlify_function_timeout_risk'
    | 'function_runtime_error';

const OPENAI_TIMEOUT_MS = 20000;
const MAX_SNIPPETS = 4;
const MAX_SNIPPET_LENGTH = 800;
const MAX_FIELD_LENGTH = 600;

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
    if (status === 504) return 'openai_504_from_provider';
    if (status >= 500) return 'openai_5xx_provider_error';
    return 'openai_http_error';
};

const trimText = (value = '', maxLength = MAX_FIELD_LENGTH) => value.replace(/\s+/g, ' ').trim().slice(0, maxLength);

const trimList = (values: string[] = [], maxItems = MAX_SNIPPETS, maxLength = MAX_SNIPPET_LENGTH) => values
    .filter(Boolean)
    .slice(0, maxItems)
    .map((value) => trimText(value, maxLength));

const compactCandidate = (candidate: CandidateInput, sourceSnippets: string[] = []) => ({
    name: trimText(candidate.name, 160),
    evidenceSummary: trimText(candidate.evidenceSummary, 500),
    signals: trimList(candidate.signals, 8, 120),
    risks: trimList(candidate.risks, 6, 140),
    opportunityScore: candidate.opportunityScore ?? 0,
    fitVerdict: candidate.fitVerdict ?? 'not-enough-evidence',
    confidence: candidate.confidence ?? 'low',
    alreadySolvedSignals: trimList(candidate.alreadySolvedSignals, 6, 160),
    missingEvidence: trimList(candidate.missingEvidence, 6, 160),
    contradictionWarnings: trimList(candidate.contradictionWarnings, 4, 180),
    sourceSnippets: trimList(sourceSnippets.length > 0 ? sourceSnippets : candidate.sourceSnippets, MAX_SNIPPETS, MAX_SNIPPET_LENGTH),
});

const fallbackAnalysis = (candidate: CandidateInput) => {
    const name = candidate.name || 'Vybrany kandidat';
    const signals = candidate.signals || [];
    const risks = candidate.risks || [];
    const evidence = candidate.sourceSnippets?.[0] || candidate.evidenceSummary || 'Omezeny verejny search snippet.';
    const fitVerdict = candidate.fitVerdict || 'not-enough-evidence';
    const isLowFit = ['weak-opportunity', 'not-enough-evidence', 'skip'].includes(fitVerdict);
    const solvedSignals = candidate.alreadySolvedSignals || [];
    const firstImpression = isLowFit
        ? `${name} neni podle dostupnych snippetu jasna priorita. Evidence neukazuje konkretni obchodni bolest, kterou by mel StayBoost resit.`
        : `${name} vypada z verejnych snippetu jako relevantni lead, ale evidence je omezena na search vysledky.`;
    const practicalAction = solvedSignals.length > 0
        ? 'Neprodavat obecne self check-in. Overit jen to, zda jsou verejne instrukce opravdu srozumitelne a kompletni.'
        : 'Pridat kratky blok: prijezd, check-in, parkovani a kde host najde instrukce.';

    return {
        firstImpression,
        strengths: signals.slice(0, 3),
        risks: risks.length > 0 ? risks : ['Omezeny verejny nahled, neni potvrzen detail nabidky.'],
        guestFrictionSignals: isLowFit ? ['Neni dost konkretni evidence o treni hosta.'] : ['Host muze pred rezervaci hledat jasne informace k prijezdu, check-inu, parkovani a komunikaci.'],
        quickWins: [
            {
                title: 'Zviditelnit informace pred prijezdem',
                why: 'Search snippet naznacuje provozni tema, ktere host resi pred rezervaci.',
                action: practicalAction,
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
        miniAudit: `Mini-audit pro ${name}: vystup vychazi jen z verejnych search snippetu. Silne signaly: ${signals.join(', ') || 'omezeny verejny signal'}. Rizika: ${risks.join(', ') || 'nedostatek detailu'}. Prvni zaver: ${isLowFit ? 'nejde o jasnou prioritu bez dalsi evidence.' : 'zviditelnit prakticke informace pred prijezdem.'}`,
        outreachEmail: isLowFit
            ? `Dobry den,\n\nvsiml jsem si verejne prezentace ${name}. Z dostupnych verejnych snippetu zatim nevidim jasny problem, ktery by bylo fer prodavat jako hotove reseni. Pokud chcete, muzu poslat kratkou verejnou kontrolu, co je uz vyresene a co by stalo za overeni.\n\nDavid`
            : `Dobry den,\n\nvsiml jsem si verejne prezentace ${name}. Z dostupnych verejnych snippetu pusobi zajimave hlavne ${signals.slice(0, 2).join(' a ') || 'prvni dojem nabidky'}.\n\nPoslal bych vam zdarma 3 konkretni navrhy, jak zlepsit verejnou prezentaci pred rezervaci - hlavne prijezd, check-in a prakticke instrukce. Nehodnotim interni komunikaci ani automaticky neprochazim OTA stranky.\n\nDavid`,
        followUp: `Dobry den, jen se kratce vracim k verejne prezentaci ${name}. Pokud chcete, poslu kratky mini-audit ve 3 bodech bez zavazku.`,
        offerRecommendation: isLowFit ? 'Neposilat jako prioritni obchodni lead; nejdrive ziskat lepsi dukaz o problemu.' : 'Doporucit bezplatny mini-audit a potom placeny audit guest guide / komunikace pred prijezdem.',
        confidence: candidate.confidence || 'low',
        fitVerdict,
        opportunityScore: candidate.opportunityScore || 0,
        alreadySolvedSignals: candidate.alreadySolvedSignals || [],
        missingEvidence: candidate.missingEvidence || ['Fallback analyza nema dost evidence pro jistou obchodni bolest.'],
        contradictionWarnings: candidate.contradictionWarnings || [],
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

const isFitVerdict = (value: unknown): value is FitVerdict => ['strong-opportunity', 'moderate-opportunity', 'weak-opportunity', 'not-enough-evidence', 'skip'].includes(String(value));

const validateAnalysis = (value: unknown) => {
    const analysis = value as { quickWins?: unknown[]; miniAudit?: unknown; outreachEmail?: unknown; confidence?: unknown; fitVerdict?: unknown; opportunityScore?: unknown };

    if (!analysis || !Array.isArray(analysis.quickWins) || analysis.quickWins.length < 3 || typeof analysis.miniAudit !== 'string' || typeof analysis.outreachEmail !== 'string') {
        throw new Error('Invalid analysis JSON shape.');
    }

    if (!['low', 'medium', 'high'].includes(String(analysis.confidence))) {
        throw new Error('Invalid confidence value.');
    }

    if (!isFitVerdict(analysis.fitVerdict)) {
        throw new Error('Invalid fitVerdict value.');
    }

    if (typeof analysis.opportunityScore !== 'number') {
        throw new Error('Invalid opportunityScore value.');
    }

    return value;
};

const logFallback = (details: { debugId: string; status: number; fallbackReason: string; model: string; hasOpenAIKey: boolean; elapsedMs?: number }) => {
    console.error('[stayboost-agent] analyze-lead fallback', details);
};

const fallbackMessage = (fallbackReason: FallbackReason) => {
    if (fallbackReason === 'openai_timeout') return 'OpenAI analýza vypršela. Zkuste menší model gpt-5.4-mini nebo kratší vstup.';
    if (fallbackReason === 'netlify_function_timeout_risk') return 'OpenAI analýza pravděpodobně narazila na limit Netlify Function. Zkuste menší model gpt-5.4-mini nebo kratší vstup.';
    return `OpenAI analyza nebezela: ${fallbackReason}`;
};

const fallbackResponse = ({ candidate, debugId, elapsedMs, fallbackReason, hasOpenAIKey, httpStatus, message, model, sanitizedSample, statusCode = 200 }: {
    candidate: CandidateInput;
    debugId: string;
    elapsedMs?: number;
    fallbackReason: FallbackReason;
    hasOpenAIKey: boolean;
    httpStatus?: number;
    message: string;
    model: string;
    sanitizedSample?: string;
    statusCode?: number;
}) => {
    logFallback({ debugId, status: httpStatus || statusCode, fallbackReason, model, hasOpenAIKey, elapsedMs });

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
            userMessage: fallbackMessage(fallbackReason),
            runtime: 'netlify-function',
            hasOpenAIKey,
            model,
            elapsedMs,
            sanitizedSample,
        },
        analysis: {
            ...fallbackAnalysis(candidate || {}),
            runId: candidate?.runId || 'legacy-run',
            analyzedAt: new Date().toISOString(),
            provider: 'demo-fallback',
            model,
            isMock: true,
        },
    });
};

export const handler = async (event: { httpMethod: string; body?: string | null }) => {
    const debugId = makeDebugId();

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { message: 'Use POST.' });

    const openAiKey = process.env.OPENAI_API_KEY;
    const hasOpenAIKey = Boolean(openAiKey);
    const model = process.env.OPENAI_MODEL || 'gpt-5.4-mini';

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

        const compactInput = compactCandidate(candidate, body.sourceSnippets || []);
        const prompt = `Vrat pouze JSON bez markdownu a bez uvah. Vytvor kratkou obchodni analyzu leadu pro StayBoost z verejnych search snippetu.
    Pravidla: nesmis tvrdit, ze vidis interni instrukce; nesmis tvrdit, ze jsi scrapoval Booking/Airbnb/Google; pokud jsou zdroje jen snippety, uved evidenceLimits. Presne 3 quickWins. Limity: miniAudit max 1200 znaku, outreachEmail max 900, followUp max 500, offerRecommendation max 700.
    Kvalita: Neopakuj doporuceni na vec, kterou zdroj uz prezentuje jako vyresenou. Pokud zdroj rika, ze online/self check-in je pohodlny nebo uz existuje, nedoporucuj obecne zavadet ani zlepsovat self check-in bez konkretniho problemoveho signalu. Pokud neni konkretni obchodni bolest, vrat fitVerdict "not-enough-evidence" nebo "weak-opportunity" a rekni, ze kandidat neni priorita. Kazdy quick win musi stat na konkretnim problemovem signalu nebo chybejici verejne informaci. Radsi kandidata zamitni nez generovat vagne prodejni rady.
    JSON shape: {"firstImpression":string,"strengths":string[],"risks":string[],"guestFrictionSignals":string[],"quickWins":[{"title":string,"why":string,"action":string,"sourceEvidence":string}],"miniAudit":string,"outreachEmail":string,"followUp":string,"offerRecommendation":string,"confidence":"low"|"medium"|"high","fitVerdict":"strong-opportunity"|"moderate-opportunity"|"weak-opportunity"|"not-enough-evidence"|"skip","opportunityScore":number,"alreadySolvedSignals":string[],"missingEvidence":string[],"contradictionWarnings":string[],"evidenceLimits":string[]}.
Lead: ${JSON.stringify(compactInput)}
Poznamky: ${trimText(body.userNotes || '', 400)}`;

        const startedAt = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
        const requestBody: { model: string; input: string; max_output_tokens: number; reasoning?: { effort: 'low' } } = {
            model,
            input: prompt,
            max_output_tokens: 1400,
        };

        if (model.startsWith('gpt-5')) {
            requestBody.reasoning = { effort: 'low' };
        }

        let response: Response;

        try {
            response = await fetch('https://api.openai.com/v1/responses', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${openAiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal as AbortSignal,
            });
        } catch (error) {
            const elapsedMs = Date.now() - startedAt;
            clearTimeout(timeoutId);
            const fallbackReason = error instanceof Error && error.name === 'AbortError' ? 'openai_timeout' : 'openai_network_error';

            return fallbackResponse({
                candidate,
                debugId,
                elapsedMs,
                fallbackReason,
                hasOpenAIKey,
                httpStatus: fallbackReason === 'openai_timeout' ? 408 : 502,
                message: fallbackMessage(fallbackReason),
                model,
            });
        } finally {
            clearTimeout(timeoutId);
        }

        const elapsedMs = Date.now() - startedAt;

        if (!response.ok) {
            const errorText = await response.text();
            const fallbackReason = fallbackReasonForStatus(response.status);

            return fallbackResponse({
                candidate,
                debugId,
                elapsedMs,
                fallbackReason,
                hasOpenAIKey,
                httpStatus: response.status,
                message: fallbackMessage(fallbackReason),
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
                    elapsedMs,
                },
                analysis: {
                    ...(parsed as Record<string, unknown>),
                    runId: candidate.runId || 'legacy-run',
                    analyzedAt: new Date().toISOString(),
                    provider: 'openai',
                    model,
                    isMock: false,
                },
            });
        } catch {
            return fallbackResponse({
                candidate,
                debugId,
                elapsedMs,
                fallbackReason: 'openai_json_parse_error',
                hasOpenAIKey,
                httpStatus: 200,
                message: fallbackMessage('openai_json_parse_error'),
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
