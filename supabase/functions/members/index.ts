import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1) env
const REGFOX_API_KEY = Deno.env.get("REGFOX_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PRODUCT = "regfox.com";

// 2) client
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// 3) type
type Membership = {
    id: number;
    membershipNumber?: string | number;
    memberNumber?: string | number;
    firstName?: string;
    lastName?: string;
    email?: string;
    orderEmail?: string;
    status?: string;
    levelId?: string | number;
    membershipLevelId?: string | number;
    fee?: number | string;
    membershipFee?: number | string;
    total?: number | string;
    expirationDate?: string;
    membershipExpirationDate?: string;
    createdAt?: string;
    createdDate?: string;
    updatedAt?: string;
    billing?: { firstName?: string; lastName?: string };
    fieldData?: Array<{ path?: string; value?: string }>;
};

// 4) fetch all memberships by 50 while isMore === true
async function fetchMemberships(sinceISO?: string): Promise<Membership[]> {
    const out: Membership[] = [];
    let startingAfter = 0; // per request: start next call with startingAfter=50 when isMore=true
    while (true) {
        const url = new URL("https://api.webconnex.com/v2/public/search/memberships");
        url.searchParams.set("product", PRODUCT);
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
        if (!res.ok) throw new Error(`webconnex ${res.status}`);

        const json = (await res.json()) as { data?: Membership[]; isMore?: boolean };
        const batch = json.data ?? [];

        // optional time filter using checkpoint
        const filtered = sinceISO
            ? batch.filter((r) => {
                  const ts = r.updatedAt ?? r.createdAt ?? r.createdDate;
                  return ts ? new Date(ts) > new Date(sinceISO) : true;
              })
            : batch;

        out.push(...filtered);

        if (json.isMore) {
            startingAfter += 50; // per your request
            continue;
        }
        break;
    }
    return out;
}

// 5) upsert all into public.memberships and stamp regfox_checkpoint with current timestamp
function normalizeNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : null;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const numeric = Number(trimmed.replace(/[^0-9.-]/g, ""));
        return Number.isNaN(numeric) ? null : Math.trunc(numeric);
    }
    return null;
}

async function saveMemberships(memberships: Membership[]) {
    if (memberships.length) {
        const rows = memberships
            .map((r: Membership) => {
                const fd: Array<{ path?: string; value?: string }> = Array.isArray(r.fieldData)
                    ? r.fieldData
                    : [];
                const findVal = (p: string) => fd.find((x) => x?.path === p)?.value;

                const memberNumberRaw =
                    r.membershipNumber ??
                    r.memberNumber ??
                    r.id ??
                    findVal("membership.number");

                const memberNumber = normalizeNumber(memberNumberRaw);
                if (memberNumber === null) return null;

                const first = r.firstName ?? r?.billing?.firstName ?? findVal("name.first") ?? null;

                const last = r.lastName ?? r?.billing?.lastName ?? findVal("name.last") ?? null;

                const email = r.email ?? r?.orderEmail ?? findVal("email") ?? null;

                const levelIdRaw =
                    r.membershipLevelId ??
                    r.levelId ??
                    findVal("membership.levelId") ??
                    findVal("membership.level_id");
                const levelId = normalizeNumber(levelIdRaw);

                const feeRaw = r.membershipFee ?? r.fee ?? r.total ?? findVal("membership.fee");
                const fee = normalizeNumber(feeRaw);

                const expiration =
                    r.expirationDate ??
                    r.membershipExpirationDate ??
                    findVal("membership.expirationDate") ??
                    findVal("membership.expiration_date") ??
                    null;

                const status = r.status ?? findVal("membership.status") ?? null;

                return {
                    member_number: memberNumber,
                    first_name: first,
                    last_name: last,
                    email,
                    level_id: levelId,
                    fee,
                    status,
                    expiration_date: expiration,
                };
            })
            .filter((row): row is {
                member_number: number;
                first_name: string | null;
                last_name: string | null;
                email: string | null;
                level_id: number | null;
                fee: number | null;
                status: string | null;
                expiration_date: string | null;
            } => row !== null);

        const { error } = await sb
            .from("memberships")
            .insert(rows, { ignoreDuplicates: true });
        if (error) throw error;
    }

    const nowIso = new Date().toISOString();
    const { error: ckErr } = await sb
        .from("membership_checkpoint")
        .upsert({ form_id: "all", last_id: 0, updated_at: nowIso }); // stores current date/time
    if (ckErr) throw ckErr;
}

// minimal handler to run once per call
Deno.serve(async () => {
    try {
        const { data } = await sb
            .from("membership_checkpoint")
            .select("updated_at")
            .eq("form_id", "all")
            .maybeSingle();

        const sinceISO = data?.updated_at ?? undefined;

        const memberships = await fetchMemberships(sinceISO);
        await saveMemberships(memberships);

        return new Response(JSON.stringify({ ok: true, inserted: memberships.length }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    } catch (e) {
        const msg = e && typeof e === "object" && "message" in e ? (e as any).message : String(e);
        console.error("memberships error:", e);
        return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "content-type": "application/json" },
        });
    }
});

// truncate table public.memberships restart identity;
// Resets identity data for memberships
