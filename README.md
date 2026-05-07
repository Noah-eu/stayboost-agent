# StayBoost Agent

Interni MVP aplikace pro spravu leadu malych hotelu, penzionu a apartmanu. Primarni workflow je Lead Finder Agent: najde kandidatni ubytovani z verejnych search vysledku, ohodnoti je, pripravi mini-audit a draft prvniho osloveni ke schvaleni clovekem.

## Agentni workflow

1. Zadej mesto / oblast, typ ubytovani, segment a poznamky.
2. Lead Finder Agent zavola serverless funkci `discover-leads`.
3. Pokud je nakonfigurovany `TAVILY_API_KEY`, funkce pouzije Tavily Search API. Pokud chybi, vrati jasne oznacene demo vysledky.
4. Kandidati maji skore, signaly, rizika, doporuceny uhel osloveni a zdrojove odkazy/snippety.
5. U kandidata spust `Analyzovat`, coz zavola `analyze-lead`.
6. Pokud je nakonfigurovany `OPENAI_API_KEY`, analyza bezi pres OpenAI Responses API. Pokud OpenAI nebo function selze, frontend ukaze konkretni fallback reason a pouzije demo analyzu.
7. Vysledek je draft ke schvaleni: mini-audit, quick wins, prvni osloveni, follow-up a navrh dalsi nabidky.
8. Po schvaleni lze kandidata pridat do CRM/localStorage jako lead.

## Bezpecnostni hranice

- Aplikace nescrapuje Booking, Airbnb ani Google Maps.
- Aplikace neobchazi captchy, loginy ani blokace.
- Vystupy nesmi tvrdit, ze byla prectena cela OTA stranka, pokud jsou k dispozici jen search snippety nebo vlozeny verejny text.
- E-maily se automaticky neposilaji. Vznikaji pouze drafty ke schvaleni.
- Neobsahuje login, databazi, Gmail integraci ani PDF export.

## Netlify environment variables

Volitelne pro realny agentni rezim:

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4-mini
TAVILY_API_KEY=...
```

Bez `OPENAI_API_KEY` nebo `TAVILY_API_KEY` aplikace nespadne a pouzije demo/mock rezim, ktery je v UI jasne oznaceny.

Pro production Lead Finder analyzy je doporuceny `OPENAI_MODEL=gpt-5.4-mini`, protoze kratke analyzy musi dobehnout rychle v limitu Netlify Function. `gpt-5.5` dava smysl az pro hlubsi placene audity nebo budouci PDF reporty, ne pro rychle vyhodnoceni kandidata.

## Spusteni

```bash
npm install
npm run dev
```

Pro lokalni testovani Netlify Functions pouzij Netlify CLI:

```bash
netlify dev
```

## Validace

```bash
npm run build
npm run lint
npm run typecheck
```
