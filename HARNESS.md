# How to use the harness

## 1. Configure the runtime

From the `bring-the-firm-builder` repo root:

```bash
cd runtime
npm install
cp .env.example .env.local
```

Edit `runtime/.env.local` and set at least:

```bash
OPENAI_API_KEY=...
BRING_THE_FIRM_BUILDER_OVERBASE_SECRET=...
```

## 2. Start the runtime

From `runtime`:

```bash
npm run dev
```

The runtime listens on:

```text
http://127.0.0.1:8787
```

## 3. Start the harness

In another terminal, from the repo root:

```bash
cd harness
npm install
npm run dev
```

Open the Vite URL, normally:

```text
http://127.0.0.1:5173
```

The harness proxies `/api` requests to the local Bring the Firm runtime on port
`8787`, so both processes need to be running.
