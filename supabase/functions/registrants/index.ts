import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1) env
const REGFOX_API_KEY = Deno.env.get("REGFOX_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PRODUCT = "regfox.com";

// 2) client
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 3) types
type Reg = {
    id: number;
    formId?: string | number;
    firstName?: string;
    lastName?: string;
    email?: string;
    status?: string;
    createdAt?: string;
    createdDate?: string;
};

// helpers
function isNonEmptyString(v?: unknown): v is string {
    return typeof v === "string" && v.trim().length > 0;
}
function isExcludedStatus(s?: string): boolean {
    if (!isNonEmptyString(s)) return false;
    const v = s.trim().toLowerCase();
    return v === "cancelled" || v === "canceled" || v === "abandoned";
}

// Fetch form IDs from public.forms instead of env
async function fetchFormIdsFromDB(): Promise<string[]> {
    const { data, error } = await sb.from("forms").select("id, status").eq("status", "open");

    if (error) throw error;

    // Deduplicate and stringify for API call
    const ids = Array.from(
        new Set((data ?? []).map((r: any) => String(r.id)).filter(isNonEmptyString)),
    );

    return ids;
}

// 4) fetch all registrants for one form, paged by 50 while isMore/hasMore === true
async function fetchAllForForm(formId: string, sinceISO?: string): Promise<Reg[]> {
    const out: Reg[] = [];
    let startingAfter = 0;

    while (true) {
        const url = new URL("https://api.webconnex.com/v2/public/search/registrants");
        url.searchParams.set("product", PRODUCT);
        url.searchParams.set("formId", formId);
        url.searchParams.set("limit", "50");
        url.searchParams.set("sort", "desc");
        if (startingAfter > 0) url.searchParams.set("startingAfter", String(startingAfter));

        const res = await fetch(url.toString(), {
            method: "GET",
            headers: {
                apiKey: REGFOX_API_KEY,
                Accept: "application/json",
                "User-Agent": "deno-supabase-edge",
            },
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`webconnex ${res.status}: ${text}`);
        }

        const json = (await res.json()) as { data?: Reg[]; isMore?: boolean; hasMore?: boolean };
        const batch = (json.data ?? [])
            .filter((r) => String(r.formId ?? "") === formId)
            .filter((r) => !isExcludedStatus(r.status));
        // optional time filter using checkpoint
        const filtered = sinceISO
            ? batch.filter((r) => {
                  const ts = r.createdAt ?? r.createdDate;
                  return ts ? new Date(ts) > new Date(sinceISO) : true;
              })
            : batch;

        out.push(...filtered);

        const more = Boolean(json.hasMore ?? json.isMore);
        if (more) {
            startingAfter += 50;
            continue;
        }
        break;
    }

    return out;
}

// 5) upsert all into public.registrants and stamp regfox_checkpoint with current timestamp
async function saveAllForForm(formId: string, regs: Reg[]) {
    if (regs.length) {
        const rows = regs.map((r: any) => {
            const fd: Array<{ path?: string; value?: string }> = Array.isArray(r.fieldData)
                ? r.fieldData
                : [];
            const findVal = (p: string) => fd.find((x) => x?.path === p)?.value;

            const first = r.firstName ?? r?.billing?.firstName ?? findVal("name.first") ?? null;

            const last = r.lastName ?? r?.billing?.lastName ?? findVal("name.last") ?? null;

            const email = r?.orderEmail ?? findVal("email") ?? null;

            return {
                ext_id: r.id,
                form_id: String(r.formId ?? formId),
                first_name: first,
                last_name: last,
                email,
                status: r.status ?? null,
            };
        });

        const { error } = await sb
            .from("registrants")
            .upsert(rows, { onConflict: "form_id,ext_id" });
        if (error) throw error;
    }

    const nowIso = new Date().toISOString();
    const { error: ckErr } = await sb
        .from("regfox_checkpoint")
        .upsert({ form_id: formId, last_id: 0, updated_at: nowIso });
    if (ckErr) throw ckErr;
}

// minimal handler to run once per call
Deno.serve(async () => {
    try {
        const formIds = await fetchFormIdsFromDB();
        if (formIds.length === 0) {
            return new Response("No open forms found in public.forms", { status: 200 });
        }

        const results: Record<string, number> = {};

        for (const formId of formIds) {
            // read last run time from checkpoint, if present
            const { data, error } = await sb
                .from("regfox_checkpoint")
                .select("updated_at")
                .eq("form_id", formId)
                .maybeSingle();

            if (error) throw error;

            const sinceISO: string | undefined = data?.updated_at ?? undefined;

            const regs = await fetchAllForForm(formId, sinceISO);
            await saveAllForForm(formId, regs);
            results[formId] = regs.length;
        }

        return new Response(JSON.stringify({ ok: true, results, form_count: formIds.length }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    } catch (e) {
        const msg = e && typeof e === "object" && "message" in e ? (e as any).message : String(e);
        console.error("registrants error:", e);
        return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "content-type": "application/json" },
        });
    }
});

// truncate table public.registrants restart identity;
// Resets identity data for registrants
