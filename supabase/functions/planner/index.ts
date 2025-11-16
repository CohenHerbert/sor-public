import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

type QuestionOption = { label: string; value: string };
type QuestionCardData = {
    id: string;
    prompt: string;
    type: "text" | "radio" | "checkbox" | "textarea" | "listbox";
    options?: QuestionOption[];
    placeholder?: string;
    rows?: number;
    resizable?: boolean;
};
type Round = {
    index: number;
    questions: QuestionCardData[];
    answers?: Record<string, any>;
    is_final?: boolean;
    created_at: string;
};

// === CORS SETUP ===
const ALLOWED_ORIGINS = ["http://localhost:3000", "https://sor-project.vercel.app"];

function getCorsHeaders(req: Request) {
    const origin = req.headers.get("origin") ?? "";
    const allowed = ALLOWED_ORIGINS.includes(origin) || /\.vercel\.app$/.test(origin);
    const allowOrigin = allowed ? origin : "https://sor-project.vercel.app";

    return {
        "Access-Control-Allow-Origin": allowOrigin,
        Vary: "Origin",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Max-Age": "86400",
    };
}

function json(req: Request, body: unknown, init: ResponseInit = {}) {
    const headers = new Headers({
        "Content-Type": "application/json",
        ...getCorsHeaders(req),
    });
    if (init.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    return new Response(JSON.stringify(body), { ...init, headers });
}
// === end CORS ===

async function callOpenAI(prompt: string) {
    const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: "gpt-5-nano",
            input: prompt,
            max_output_tokens: 700,
            reasoning: {
                effort: "minimal",
            },
            text: { verbosity: "low" },
        }),
    });

    if (!r.ok) {
        const err = await r.text();
        throw new Error(`OpenAI error: ${err}`);
    }

    const data = await r.json();
    console.log(data.usage);
    console.log(
        `reasoning: ${data.usage.output_tokens_details.reasoning_tokens}, ` +
            `total output: ${data.usage.output_tokens}, ` +
            `prompt: ${data.usage.input_tokens}`,
    );

    if (typeof data.output_text === "string" && data.output_text.trim()) {
        return data.output_text;
    }

    if (Array.isArray(data.output)) {
        for (const item of data.output) {
            const parts = item?.content ?? [];
            for (const part of parts) {
                if (
                    (part.type === "output_text" || part.type === "text") &&
                    typeof part.text === "string" &&
                    part.text.trim()
                ) {
                    return part.text;
                }
                if (part.type === "output_json" && part.json) {
                    try {
                        return JSON.stringify(part.json);
                    } catch {
                        /* ignore */
                    }
                }
                if (
                    part.type === "message" &&
                    Array.isArray(part.content) &&
                    part.content[0]?.text
                ) {
                    const t = part.content[0].text;
                    if (typeof t === "string" && t.trim()) return t;
                }
            }
        }
    }

    return "";
}

const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(async (req: Request) => {
    // Preflight
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: getCorsHeaders(req) });
    }

    if (req.method !== "POST") {
        return new Response("Method Not Allowed", {
            status: 405,
            headers: getCorsHeaders(req),
        });
    }

    const body = await req.json().catch(() => ({}));
    const mode = body?.mode;
    const plannerId = body?.planner_id;

    if (mode === "ask" && plannerId) {
        const { data: planner, error } = await supabase
            .from("planners")
            .select("id, name, questions, ai_context")
            .eq("id", plannerId)
            .maybeSingle();

        if (error || !planner) {
            return json(
                req,
                { ok: false, error: error?.message || "Planner not found" },
                { status: 404 },
            );
        }

        return json(req, {
            ok: true,
            planner_id: planner.id,
            round: { index: 0, questions: planner.questions, is_final: false },
        });
    }

    if (mode === "refine" && plannerId) {
        const prevQuestions = body?.questions;
        const prevAnswers = body?.answers;
        const roundIndex = Number.isFinite(body?.round_index) ? body.round_index : 0;

        if (
            !Array.isArray(prevQuestions) ||
            typeof prevAnswers !== "object" ||
            prevAnswers === null
        ) {
            return json(
                req,
                {
                    ok: false,
                    error: "Provide `questions` (array) and `answers` (object).",
                },
                { status: 400 },
            );
        }

        const { data: planner, error } = await supabase
            .from("planners")
            .select("id, ai_context")
            .eq("id", plannerId)
            .maybeSingle();

        if (error || !planner) {
            return json(
                req,
                { ok: false, error: error?.message || "Planner not found" },
                { status: 404 },
            );
        }

        const prompt =
            "You are a question generator. Use the domain guidance to create the NEXT set of follow-up questions.\n" +
            "Return ONLY a JSON array of 5–7 items. No prose. Each item must match:\n" +
            `{"id":string,"prompt":string,"type":"text"|"radio"|"checkbox"|"textarea"|"listbox","options"?:{"label":string,"value":string}[],"placeholder"?:string,"rows"?:number,"resizable"?:boolean}\n` +
            "\nAI_CONTEXT:\n" +
            (planner.ai_context ?? "") +
            "\nALREADY_ASKED_QUESTIONS(JSON):\n" +
            JSON.stringify(prevQuestions) +
            "\nALREADY_ANSWERED(JSON):\n" +
            JSON.stringify(prevAnswers) +
            "\nRULES:\n- Ask 5–7 NEW, non-redundant questions that progress the plan.\n- Use options only for radio/checkbox/listbox.\n- Keep prompts concise and actionable.\n- Generate unique kebab-case `id` values.\n- Output ONLY the JSON array.\n";

        console.time("openai");
        const raw = await callOpenAI(prompt);
        console.timeEnd("openai");

        let nextQuestions: unknown;
        try {
            nextQuestions = JSON.parse(raw);
        } catch {
            return json(
                req,
                { ok: false, error: "Model did not return valid JSON." },
                { status: 502 },
            );
        }
        if (!Array.isArray(nextQuestions) || nextQuestions.length === 0) {
            return json(
                req,
                { ok: false, error: "No questions returned by model." },
                { status: 502 },
            );
        }

        return json(req, {
            ok: true,
            planner_id: plannerId,
            next_round: {
                index: roundIndex + 1,
                questions: nextQuestions.slice(5, 12).length
                    ? nextQuestions.slice(0, 7)
                    : nextQuestions.slice(0, 5),
                is_final: false,
            },
        });
    }

    if (mode === "finalize" && plannerId) {
        const incomingAnswers = body?.answers;
        const incomingQuestions = body?.questions; // optional override

        if (!incomingAnswers || typeof incomingAnswers !== "object") {
            return json(
                req,
                { ok: false, error: "Missing `answers` in request body." },
                { status: 400 },
            );
        }

        const { data: planner, error } = await supabase
            .from("planners")
            .select("id, questions, ai_context")
            .eq("id", plannerId)
            .maybeSingle();

        if (error || !planner) {
            return json(
                req,
                { ok: false, error: error?.message || "Planner not found" },
                { status: 404 },
            );
        }

        const questions = incomingQuestions ?? planner.questions ?? [];
        const prompt =
            "CONTEXT:\n" +
            (planner.ai_context ?? "") +
            "\n\nUSER_QUESTIONS(JSON):\n" +
            JSON.stringify(questions) +
            "\n\nUSER_ANSWERS(JSON):\n" +
            JSON.stringify(incomingAnswers) +
            `

TASK:
Using only the CONTEXT above, produce the final plan for the user.
Do not restate inputs verbatim. Be practical and specific.

OUTPUT:
- Plain text only (no code blocks), ~100–130 words.
- A complete, actionable setup/plan with brief justifications.
- If the CONTEXT defines modes/sections (e.g., workshop gating), follow them.
- If finalize is called, deliver the best possible final plan now.`;

        const aiOutput = await callOpenAI(prompt);

        return json(req, {
            ok: true,
            planner_id: plannerId,
            final_output: aiOutput,
        });
    }

    return json(req, { ok: false, error: "Invalid mode or missing planner_id" }, { status: 400 });
});
