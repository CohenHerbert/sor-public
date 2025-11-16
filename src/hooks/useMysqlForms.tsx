import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type MysqlForm = {
    status: "completed" | "pre-registered" | string;
    formid: number;
    eventdate: string | null;
    prereg: "On" | "Off";
    tld: string;
    workshop_name: string;
    webpage_url: string;
    start_time: string;
    end_time: string;

    memberstatus: string | null;
    expirationdate: string | null;
    autorenew: number | null;
    levelname: string | null;
    memberid: number | null;

    _tickets?: number; // optional, computed client-side
    resolved_url: string | undefined;
    resolved_reason?: "both-404" | "inconclusive" | null;
};

function safeParse(body: string): any {
    try {
        return JSON.parse(body);
    } catch {
        return null;
    }
}

function isDateInFuture(dateString: string | null): boolean {
    if (!dateString) return false;

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return false;

    const now = new Date();
    return date >= now;
}

export function useMysqlForms() {
    const [data, setData] = useState<MysqlForm[]>([]);
    const [isLoading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const { data: sessionData, error: sErr } = await supabase.auth.getSession();
                if (sErr) throw sErr;
                const token = sessionData?.session?.access_token;
                if (!token) throw new Error("Not authenticated");

                const base = import.meta.env.VITE_SUPABASE_URL;
                if (!base) throw new Error("VITE_SUPABASE_URL missing");
                const endpoint = `${base}/functions/v1/mysql`;

                // console.log("[useMysqlForms] endpoint:", endpoint);
                // console.log("[useMysqlForms] token len:", token.length);

                const res = await fetch(endpoint, {
                    method: "GET",
                    headers: { Authorization: `Bearer ${token}` },
                });

                const ct = res.headers.get("content-type") || "";
                const raw = await res.text();
                // console.log(
                //     "[useMysqlForms] status:",
                //     res.status,
                //     "ct:",
                //     ct,
                //     "raw sample:",
                //     raw.slice(0, 200),
                // );

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}: ${raw}`);
                }

                const json = ct.includes("application/json") ? safeParse(raw) : safeParse(raw);
                if (!json) throw new Error("Response was not valid JSON");

                if (Array.isArray(json)) {
                    const filtered = json.filter(item => item.workshop_name !== undefined && ( item.status === "completed" || item.status === "pre-registered" ) && isDateInFuture(item.eventdate));
                    setData(filtered);
                } else if (Array.isArray((json as any).data)) {
                    setData((json as any).data as MysqlForm[]);
                } else {
                    throw new Error("JSON shape unexpected");
                }
            } catch (e: any) {
                console.error("[useMysqlForms] error:", e);
                setError(e?.message ?? "Request failed");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    return { data, isLoading, error };
}
