type ScreenshotInput = {
    type?: string;
    fileName?: string;
    dataUrl?: string;
    base64?: string;
    note?: string;
};

type PublicLinkInput = {
    sourceType?: string;
    url?: string;
    label?: string;
    notes?: string;
};

declare const process: { env: Record<string, string | undefined> };

type FallbackReason =
    | 'missing_openai_api_key'
    | 'missing_images'
    | 'openai_401_auth'
    | 'openai_403_access'
    | 'openai_429_rate_limit'
    | 'openai_400_bad_request_or_model'
    | 'openai_5xx_provider_error'
    | 'openai_http_error'
    | 'openai_timeout'
    | 'openai_network_error'
    | 'openai_json_parse_error'
    | 'openai_refusal'
    | 'openai_incomplete'
    | 'openai_json_schema_error'
    | 'function_runtime_error';

const OPENAI_TIMEOUT_MS = 25000;
const MAX_IMAGES = 6;

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
};

const json = (statusCode: number, body: unknown) => ({ statusCode, headers, body: JSON.stringify(body) });

const makeDebugId = () => `vision-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const safeSample = (value: string, maxLength = 500) => value
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]')
    .slice(0, maxLength);

const trimText = (value = '', maxLength = 700) => value.replace(/\s+/g, ' ').trim().slice(0, maxLength);

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

const analysisJsonSchema = {
    type: 'object',
    additionalProperties: false,
    required: [
        'photoFirstImpression',
        'mainPhotoVerdict',
        'photoOrderSuggestions',
        'visibleStrengths',
        'visibleWeaknesses',
        'otaPresentationObservations',
        'reviewSignalsFromScreenshots',
        'guestFrictionVisible',
        'quickWins',
        'confidence',
        'evidenceLimits',
    ],
    properties: {
        photoFirstImpression: { type: 'string' },
        mainPhotoVerdict: { type: 'string', enum: ['strong', 'average', 'weak', 'unknown'] },
        photoOrderSuggestions: { type: 'array', items: { type: 'string' } },
        visibleStrengths: { type: 'array', items: { type: 'string' } },
        visibleWeaknesses: { type: 'array', items: { type: 'string' } },
        otaPresentationObservations: { type: 'array', items: { type: 'string' } },
        reviewSignalsFromScreenshots: { type: 'array', items: { type: 'string' } },
        guestFrictionVisible: { type: 'array', items: { type: 'string' } },
        quickWins: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['title', 'why', 'action', 'sourceEvidence'],
                properties: {
                    title: { type: 'string' },
                    why: { type: 'string' },
                    action: { type: 'string' },
                    sourceEvidence: { type: 'string' },
                },
            },
        },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        evidenceLimits: { type: 'array', items: { type: 'string' } },
    },
};

const fallbackReasonForStatus = (status: number): FallbackReason => {
    if (status === 401) return 'openai_401_auth';
    if (status === 403) return 'openai_403_access';
    if (status === 429) return 'openai_429_rate_limit';
    if (status === 400) return 'openai_400_bad_request_or_model';
    if (status >= 500) return 'openai_5xx_provider_error';
    return 'openai_http_error';
};

const fallbackMessage = (fallbackReason: FallbackReason) => {
    if (fallbackReason === 'missing_openai_api_key') return 'Vision analyza nebezela: missing_openai_api_key. Nastav OPENAI_API_KEY ve Functions environment scope.';
    if (fallbackReason === 'missing_images') return 'Vision analyza nebezela: nejsou ulozene zadne screenshoty.';
    if (fallbackReason === 'openai_timeout') return 'Vision analyza vyprsela v limitu Netlify Function.';
    return `Vision analyza nebezela: ${fallbackReason}`;
};

const fallbackResponse = ({ debugId, elapsedMs, fallbackReason, hasOpenAIKey, httpStatus, model, statusCode = 200, sanitizedOutputSample }: {
    debugId: string;
    elapsedMs?: number;
    fallbackReason: FallbackReason;
    hasOpenAIKey: boolean;
    httpStatus?: number;
    model: string;
    statusCode?: number;
    sanitizedOutputSample?: string;
}) => json(statusCode, {
    status: fallbackReason === 'missing_openai_api_key' ? 'needs-config' : 'error',
    message: fallbackMessage(fallbackReason),
    diagnostic: {
        status: fallbackReason === 'missing_openai_api_key' ? 'needs-config' : 'error',
        provider: 'fallback',
        fallbackReason,
        httpStatus: httpStatus || statusCode,
        debugId,
        userMessage: fallbackMessage(fallbackReason),
        runtime: 'netlify-function',
        hasOpenAIKey,
        model,
        elapsedMs,
        sanitizedOutputSample,
    },
});

const extractOutputText = (payload: unknown) => {
    const response = payload as {
        status?: string;
        incomplete_details?: unknown;
        output_text?: string;
        output?: Array<{ content?: Array<{ text?: string; value?: string; parsed?: unknown; json?: unknown; refusal?: string }> }>;
    };

    if (typeof response.output_text === 'string' && response.output_text.trim()) {
        return { text: response.output_text, parsedObject: undefined, refusal: undefined, incomplete: response.status === 'incomplete' || Boolean(response.incomplete_details) };
    }

    const content = response.output?.flatMap((item) => item.content || []) || [];
    return {
        text: content.map((item) => item.text || item.value || '').filter(Boolean).join('\n'),
        parsedObject: content.find((item) => item.parsed || item.json)?.parsed || content.find((item) => item.parsed || item.json)?.json,
        refusal: content.find((item) => item.refusal)?.refusal,
        incomplete: response.status === 'incomplete' || Boolean(response.incomplete_details),
    };
};

const validateAnalysis = (value: unknown) => {
    const analysis = value as { quickWins?: unknown[]; photoFirstImpression?: unknown; mainPhotoVerdict?: unknown; confidence?: unknown; evidenceLimits?: unknown };

    if (!analysis || typeof analysis.photoFirstImpression !== 'string' || !Array.isArray(analysis.quickWins) || analysis.quickWins.length < 3) {
        throw new Error('Invalid screenshot analysis JSON shape.');
    }

    if (!['strong', 'average', 'weak', 'unknown'].includes(String(analysis.mainPhotoVerdict))) {
        throw new Error('Invalid mainPhotoVerdict value.');
    }

    if (!['low', 'medium', 'high'].includes(String(analysis.confidence))) {
        throw new Error('Invalid confidence value.');
    }

    if (!Array.isArray(analysis.evidenceLimits)) {
        throw new Error('Invalid evidenceLimits value.');
    }

    return value;
};

export const handler = async (event: { httpMethod: string; body?: string | null }) => {
    const debugId = makeDebugId();

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'POST') return json(405, { message: 'Use POST.' });

    const openAiKey = process.env.OPENAI_API_KEY;
    const hasOpenAIKey = Boolean(openAiKey);
    const model = process.env.OPENAI_VISION_MODEL || 'gpt-5.4-mini';

    try {
        const body = JSON.parse(event.body || '{}') as { leadId?: string; leadName?: string; images?: ScreenshotInput[]; existingCandidateSummary?: string; publicLinks?: PublicLinkInput[] };
        const images = (body.images || []).filter((image) => image.dataUrl || image.base64).slice(0, MAX_IMAGES);

        if (!openAiKey) {
            return fallbackResponse({ debugId, fallbackReason: 'missing_openai_api_key', hasOpenAIKey, httpStatus: 501, model, statusCode: 501 });
        }

        if (images.length === 0) {
            return fallbackResponse({ debugId, fallbackReason: 'missing_images', hasOpenAIKey, httpStatus: 400, model, statusCode: 400 });
        }

        const prompt = `Vrat pouze strict JSON bez markdownu. Analyzuj jen dodane screenshoty/fotky verejne prezentace pro StayBoost lead.
Nesmíš tvrdit, ze jsi precetl celou Booking/Airbnb/Google/OTA stranku, nesmis scrapovat URL a nesmis odvozovat neverejne guest instrukce.
OTA URL jsou jen odkazy k otevreni. Search snippet neni kompletni OTA profil. Screenshot je evidence jen v rozsahu toho, co je citelne videt na obrazku.
Guest guide: pokud na screenshotu neni videt, nesmis psat "nemaji guest guide". Pouzij evidenceLimits nebo formulaci "Nelze verejne overit, zda maji guest guide" / "Guest guide muze existovat neverejne". Do klientsky pouzitelnych quickWins guest guide nezminuj, pokud hlavni viditelna evidence resi hlavne fotky, galerii, popis nebo social proof.
Pokud screenshot neni citelny, uved to v evidenceLimits a drz confidence low.
Vytvor presne 3 quickWins prirozenou cestinou pro majitele ubytovani. Kdyz je guest guide opravdu relevantni, formuluj ho podminene a cele: "Pokud hoste nedostavaji pred prijezdem jednoduchy prehled, pripravil bych kratky QR/pruvodce; pokud ho uz maji, zkontroloval bych, jestli je dobre napojeny na zpravy hostum." Nepouzivej useknute tri tecky ani technicke interni formulace.
Lead: ${trimText(body.leadName || 'Neznamy lead', 180)}
Existing summary: ${trimText(body.existingCandidateSummary || '', 700)}
Public links as references only: ${JSON.stringify((body.publicLinks || []).map((link) => ({ sourceType: link.sourceType, label: trimText(link.label, 80), url: trimText(link.url, 240), notes: trimText(link.notes, 160) })))}
Images: ${JSON.stringify(images.map((image) => ({ type: image.type, fileName: trimText(image.fileName, 140), note: trimText(image.note, 260) })))}`;
        const content = [
            { type: 'input_text', text: prompt },
            ...images.map((image) => ({ type: 'input_image', image_url: image.dataUrl || `data:image/jpeg;base64,${image.base64}` })),
        ];
        const startedAt = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
        const baseRequestBody: { model: string; input: Array<{ role: 'user'; content: Array<{ type: string; text?: string; image_url?: string }> }>; max_output_tokens: number; reasoning?: { effort: 'low' } } = {
            model,
            input: [{ role: 'user', content }],
            max_output_tokens: 1600,
        };

        if (model.startsWith('gpt-5')) {
            baseRequestBody.reasoning = { effort: 'low' };
        }

        const structuredRequestBody = {
            ...baseRequestBody,
            text: {
                format: {
                    type: 'json_schema',
                    name: 'stayboost_screenshot_analysis',
                    strict: true,
                    schema: analysisJsonSchema,
                },
            },
        };
        const requestBodies = [structuredRequestBody, baseRequestBody];

        let response: Response | undefined;
        let usedStructuredOutput = true;
        let schemaErrorSample = '';

        try {
            for (let attemptIndex = 0; attemptIndex < requestBodies.length; attemptIndex += 1) {
                response = await fetch('https://api.openai.com/v1/responses', {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${openAiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBodies[attemptIndex]),
                    signal: controller.signal as AbortSignal,
                });
                usedStructuredOutput = attemptIndex === 0;

                if (response.status !== 400 || attemptIndex === requestBodies.length - 1) break;
                schemaErrorSample = safeSample(await response.text());
            }
        } catch (error) {
            clearTimeout(timeoutId);
            const elapsedMs = Date.now() - startedAt;
            const fallbackReason = error instanceof Error && error.name === 'AbortError' ? 'openai_timeout' : 'openai_network_error';
            return fallbackResponse({ debugId, elapsedMs, fallbackReason, hasOpenAIKey, httpStatus: fallbackReason === 'openai_timeout' ? 408 : 502, model });
        } finally {
            clearTimeout(timeoutId);
        }

        const elapsedMs = Date.now() - startedAt;

        if (!response) {
            return fallbackResponse({ debugId, elapsedMs, fallbackReason: 'openai_network_error', hasOpenAIKey, httpStatus: 502, model });
        }

        if (!response.ok) {
            const errorText = await response.text();
            const fallbackReason = response.status === 400 && usedStructuredOutput ? 'openai_json_schema_error' : fallbackReasonForStatus(response.status);
            return fallbackResponse({ debugId, elapsedMs, fallbackReason, hasOpenAIKey, httpStatus: response.status, model, sanitizedOutputSample: safeSample(errorText || schemaErrorSample) });
        }

        const payload = await response.json();
        const output = extractOutputText(payload);

        if (output.refusal) {
            return fallbackResponse({ debugId, elapsedMs, fallbackReason: 'openai_refusal', hasOpenAIKey, httpStatus: 200, model, sanitizedOutputSample: safeSample(output.refusal) });
        }

        if (output.incomplete) {
            return fallbackResponse({ debugId, elapsedMs, fallbackReason: 'openai_incomplete', hasOpenAIKey, httpStatus: 200, model, sanitizedOutputSample: safeSample(output.text || JSON.stringify(payload)) });
        }

        try {
            const parsed = validateAnalysis(output.parsedObject || parseJsonObject(output.text));

            return json(200, {
                status: 'completed',
                message: 'Vision analyza screenshotu dokoncena z dodanych obrazku.',
                analysis: parsed,
                diagnostic: {
                    status: 'completed',
                    provider: 'openai',
                    debugId,
                    userMessage: 'OpenAI vision analyza probehla pres realne API.',
                    runtime: 'netlify-function',
                    hasOpenAIKey,
                    model,
                    elapsedMs,
                },
            });
        } catch {
            return fallbackResponse({ debugId, elapsedMs, fallbackReason: 'openai_json_parse_error', hasOpenAIKey, httpStatus: 200, model, sanitizedOutputSample: safeSample(output.text || JSON.stringify(output.parsedObject || payload)) });
        }
    } catch {
        return fallbackResponse({ debugId, fallbackReason: 'function_runtime_error', hasOpenAIKey, httpStatus: 500, model, statusCode: 500 });
    }
};