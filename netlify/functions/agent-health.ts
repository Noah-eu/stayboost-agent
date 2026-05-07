declare const process: { env: Record<string, string | undefined> };

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
};

const json = (statusCode: number, body: unknown) => ({ statusCode, headers, body: JSON.stringify(body) });

export const handler = async (event: { httpMethod: string }) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'GET') return json(405, { message: 'Use GET.' });

    return json(200, {
        ok: true,
        runtime: 'netlify-function',
        hasTavilyKey: Boolean(process.env.TAVILY_API_KEY),
        hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
        openAIModel: process.env.OPENAI_MODEL || 'gpt-5.5',
        timestamp: new Date().toISOString(),
    });
};