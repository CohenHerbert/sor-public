import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Supabase Edge Function: forms
 * - Fetch open forms with pagination.
 * - Keep only names that start with "pre-reg" OR "yy mm dd".
 * - Map to rows per rules.
 * - Verify webpage .net/.org with retries.
 * - Upsert only valid rows.
 * - Log every skip and any link uncertainty.
 */

// ===== env =====
const REGFOX_API_KEY = Deno.env.get("REGFOX_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ===== constants =====
const PRODUCT = "regfox.com";
const PAGE_SIZE = 50;

// networking
const FETCH_TIMEOUT_MS = 12000;
const DETAIL_TIMEOUT_MS = 8000;
const PROBE_TIMEOUT_MS = 3000;
const PROBE_RETRIES = 3;
const MAP_CONCURRENCY = 4;

// ===== supabase =====
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ===== types =====
type RawRegfoxForm = { id: number; name?: string; title?: string; status?: string };
type RawRegfoxFormDetail = { id: number; eventStart?: string };
type FormRow = {
    id: number;
    form_name: string;
    scheduled_date: string | null;
    status: string;
    webpage_id: string;
    pre_reg: boolean;
};

// ===== utils =====
function isNonEmptyString(v?: unknown): v is string {
    return typeof v === "string" && v.trim().length > 0;
}

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

function withTimeout(ms: number, parent?: AbortSignal) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort("timeout"), ms);
    function onParentAbort() {
        ctrl.abort("parent-abort");
    }
    if (parent) parent.addEventListener("abort", onParentAbort);
    return {
        signal: ctrl.signal,
        clear: () => {
            clearTimeout(timer);
            if (parent) parent.removeEventListener("abort", onParentAbort);
        },
    };
}

async function fetchWithTimeout(input: string | URL, init: RequestInit, ms: number) {
    const wt = withTimeout(ms, init.signal as AbortSignal | undefined);
    try {
        return await fetch(input, { ...init, signal: wt.signal });
    } finally {
        wt.clear();
    }
}

// format gate
const FORMAT_GATE = /^(?:\s*pre-reg\b|\s*\d{2}\s+\d{2}\s+\d{2}\b)/i;

// slug rules
const LEADING_PATTERN = /^(?:\s*pre-reg\s*|\s*\d{2}\s+\d{2}\s+\d{2}\s*)/i;
const TRAILING_NUM_GROUP = /\s\d+\s*$/;

function buildWebPathFromName(name: string): string {
    let s = name.trim();
    s = s.replace(LEADING_PATTERN, "");
    s = s.replace(TRAILING_NUM_GROUP, "");
    s = s.trim();
    if (!s) return "";
    s = s.replace(/\s+/g, " ").replace(/ /g, "-").toLowerCase();
    return `w-${s}`;
}

function isoFromTitle(title?: string): string | null {
    if (!isNonEmptyString(title)) return null;
    const m = title.match(/^\s*(\d{2})\s+(\d{2})\s+(\d{2})\b/);
    if (!m) return null;
    const [_, yy, mm, dd] = m;
    const year = 2000 + Number(yy);
    const month = Number(mm) - 1;
    const day = Number(dd);
    const dt = new Date(Date.UTC(year, month, day, 0, 0, 0));
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString();
}

// simple promise pool
async function mapLimit<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let i = 0;
    const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
        while (true) {
            const idx = i++;
            if (idx >= items.length) break;
            out[idx] = await fn(items[idx], idx);
        }
    });
    await Promise.all(workers);
    return out;
}

// ===== remote calls =====
async function fetchForms(): Promise<RawRegfoxForm[]> {
    const out: RawRegfoxForm[] = [];
    let startingAfter = 0;

    while (true) {
        const url = new URL("https://api.webconnex.com/v2/public/forms");
        url.searchParams.set("product", PRODUCT);
        url.searchParams.set("limit", String(PAGE_SIZE));
        url.searchParams.set("sort", "desc");
        url.searchParams.set("status", "open");
        if (startingAfter > 0) url.searchParams.set("startingAfter", String(startingAfter));

        const res = await fetchWithTimeout(
            url.toString(),
            {
                method: "GET",
                headers: {
                    apiKey: REGFOX_API_KEY,
                    Accept: "application/json",
                    "User-Agent": "deno-supabase-edge",
                },
            },
            FETCH_TIMEOUT_MS,
        );

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`webconnex ${res.status}: ${text}`);
        }

        const json = (await res.json()) as {
            data?: RawRegfoxForm[];
            isMore?: boolean;
            hasMore?: boolean;
        };
        if (json.data?.length) out.push(...json.data);

        const more = Boolean(json.hasMore ?? json.isMore);
        if (more) {
            startingAfter += PAGE_SIZE;
            continue;
        }
        break;
    }

    return out;
}

async function fetchFormDetail(id: number): Promise<RawRegfoxFormDetail | null> {
    const url = new URL(`https://api.webconnex.com/v2/public/forms/${id}`);
    url.searchParams.set("product", PRODUCT);

    try {
        const res = await fetchWithTimeout(
            url.toString(),
            {
                method: "GET",
                headers: {
                    apiKey: REGFOX_API_KEY,
                    Accept: "application/json",
                    "User-Agent": "deno-supabase-edge",
                },
            },
            DETAIL_TIMEOUT_MS,
        );
        if (!res.ok) return null;
        const json = (await res.json()) as { data?: RawRegfoxFormDetail };
        return json.data ?? null;
    } catch {
        return null;
    }
}

// ===== robust probe =====
// cache only positives and explicit 404 from GET.
const probeCache = new Map<string, true | 404>();

async function tryOnce(
    url: string,
    method: "HEAD" | "GET",
): Promise<number | "timeout" | "network"> {
    try {
        const res = await fetchWithTimeout(
            url,
            {
                method,
                redirect: "follow",
                headers: method === "GET" ? { Accept: "text/html" } : undefined,
            },
            PROBE_TIMEOUT_MS,
        );
        return res.status;
    } catch (e) {
        const msg = String(e ?? "");
        if (msg.includes("timeout")) return "timeout";
        return "network";
    }
}

async function probe(url: string): Promise<"exists" | 404 | "inconclusive"> {
    const cached = probeCache.get(url);
    if (cached === true) return "exists";
    if (cached === 404) return 404;

    for (let attempt = 1; attempt <= PROBE_RETRIES; attempt++) {
        const h = await tryOnce(url, "HEAD");
        if (typeof h === "number" && h !== 404) {
            probeCache.set(url, true);
            return "exists";
        }
        const g = await tryOnce(url, "GET");
        if (typeof g === "number" && g !== 404) {
            probeCache.set(url, true);
            return "exists";
        }
        if (g === 404) {
            probeCache.set(url, 404);
            return 404;
        }
        await sleep(120 * attempt + Math.floor(Math.random() * 80));
    }
    return "inconclusive";
}

async function resolveWebpageURL(
    webPath: string,
): Promise<{ url: string | null; reason?: "both-404" | "inconclusive" }> {
    if (!webPath) return { url: null, reason: "both-404" };

    const netUrl = `https://schoolofranch.net/${webPath}`;
    const orgUrl = `https://schoolofranch.org/${webPath}`;

    const net = await probe(netUrl);
    if (net === "exists") return { url: netUrl };
    if (net === "inconclusive") {
        const org = await probe(orgUrl);
        if (org === "exists") return { url: orgUrl };
        if (org === 404) return { url: netUrl, reason: "inconclusive" };
        return { url: netUrl, reason: "inconclusive" };
    }

    const org = await probe(orgUrl);
    if (org === "exists") return { url: orgUrl };
    if (org === "inconclusive") return { url: netUrl, reason: "inconclusive" };
    return { url: null, reason: "both-404" };
}

// ===== diagnostics =====
const stats = {
    total: 0,
    kept: 0,
    drops: new Map<string, number>(),
    skipped: [] as Array<{
        reason: string;
        id: number | null;
        name: string | null;
        title: string | null;
        status: string | null;
    }>,
    notes: [] as Array<{ note: string; id: number; name: string; picked: string }>,
};
function logDrop(reason: string, form: any) {
    stats.drops.set(reason, (stats.drops.get(reason) ?? 0) + 1);
    const item = {
        reason,
        id: typeof form?.id === "number" ? form.id : null,
        name: isNonEmptyString(form?.name) ? form.name : null,
        title: isNonEmptyString(form?.title) ? form.title : null,
        status: isNonEmptyString(form?.status) ? form.status : null,
    };
    stats.skipped.push(item);
    console.log("SKIPPED FORM:", item);
}

// ===== mapping =====
async function toRow(form: RawRegfoxForm): Promise<FormRow | null> {
    stats.total++;

    if ((form.status ?? "").toLowerCase() !== "open") {
        logDrop("not-open", form);
        return null;
    }

    const idNum = Number(form.id);
    if (!Number.isFinite(idNum)) {
        logDrop("no-id", form);
        return null;
    }

    if (!isNonEmptyString(form.name)) {
        logDrop("no-name", form);
        return null;
    }

    const rawName = form.name.trim();

    // NEW: enforce name format gate
    if (!FORMAT_GATE.test(rawName)) {
        logDrop("bad-format", form);
        return null;
    }

    const isPreReg = /^\s*pre-reg\b/i.test(rawName);

    // scheduled_date
    let scheduledISO: string | null = null;
    if (!isPreReg) {
        scheduledISO = isoFromTitle(form.title) ?? null;
        if (!scheduledISO) {
            const detail = await fetchFormDetail(idNum);
            const d = detail?.eventStart;
            if (isNonEmptyString(d) && !Number.isNaN(new Date(d).getTime())) {
                scheduledISO = new Date(d).toISOString();
            }
        }
        if (!scheduledISO) {
            logDrop("no-date-non-prereg", form);
            return null;
        }
    }

    const webPath = buildWebPathFromName(rawName);
    if (!webPath) {
        logDrop("empty-slug", form);
        return null;
    }

    const resolved = await resolveWebpageURL(webPath);
    if (resolved.url === null) {
        const r = resolved.reason ?? "both-404";
        logDrop(r, form);
        return null;
    }
    if (resolved.reason === "inconclusive") {
        stats.notes.push({
            note: "link-uncertain",
            id: idNum,
            name: rawName,
            picked: resolved.url,
        });
        console.log("LINK UNCERTAIN, KEEPING:", { id: idNum, name: rawName, picked: resolved.url });
    }

    const row: FormRow = {
        id: idNum,
        form_name: rawName,
        scheduled_date: scheduledISO,
        status: "open",
        webpage_id: resolved.url,
        pre_reg: isPreReg,
    };

    stats.kept++;
    return row;
}

// ===== persistence =====
async function saveForms(forms: RawRegfoxForm[]) {
    const rows = (await mapLimit(forms, MAP_CONCURRENCY, toRow)).filter(
        (r): r is FormRow => r !== null,
    );
    if (!rows.length) return 0;

    const { error: upsertErr } = await sb.from("forms").upsert(rows, { onConflict: "id" });
    if (upsertErr) throw upsertErr;

    return rows.length;
}

// ===== handler =====
Deno.serve(async () => {
    try {
        const forms = await fetchForms();
        const synced = await saveForms(forms);

        console.log("forms.stats", {
            totalFetched: forms.length,
            kept: stats.kept,
            drops: Object.fromEntries(stats.drops.entries()),
            skippedSamples: stats.skipped.slice(0, 6),
            linkNotes: stats.notes.slice(0, 6),
        });

        return new Response(
            JSON.stringify({
                ok: true,
                total: forms.length,
                synced,
                drops: Object.fromEntries(stats.drops.entries()),
                skipped: stats.skipped,
                notes: stats.notes,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
        );
    } catch (e) {
        const msg = e && typeof e === "object" && "message" in e ? (e as any).message : String(e);
        console.error("forms error:", e);
        return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "content-type": "application/json" },
        });
    }
});
