import { useEffect, useState } from "react";
import { ChevronLeftIcon } from "@heroicons/react/24/solid";
import { Link, useParams } from "react-router-dom";
import QuestionCard from "@/components/patterns/QuestionCard";
import { Button } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient.ts";

// -----------------------------
// Types (your original shapes)
// -----------------------------
type QuestionConfig =
    | {
          id: string;
          type: "text" | "textarea";
          prompt: string;
          placeholder?: string;
          required?: boolean;
      }
    | {
          id: string;
          type: "radio" | "checkbox" | "listbox";
          prompt: string;
          options: { label: string; value: string }[];
          required?: boolean;
      };

type PlannerRow = {
    id: string;
    name: string;
    questions: QuestionConfig[];
    ai_context: string;
};

// -------------------------------------
// Types for planner function responses
// -------------------------------------
type RefineResponse = {
    ok: boolean;
    planner_id: string;
    next_round?: {
        index: number;
        questions: unknown[]; // normalized below
        is_final?: boolean;
    };
};

type FinalizeResponse = {
    ok: boolean;
    planner_id: string;
    final_output: string;
};

// -----------------------------
// Narrow type guards (no `any`)
// -----------------------------
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

const isOption = (o: unknown): o is { label: string; value: string } =>
    isRecord(o) && typeof o.label === "string" && typeof o.value === "string";

const isOptionArray = (arr: unknown): arr is { label: string; value: string }[] =>
    Array.isArray(arr) && arr.every(isOption);

// -----------------------------------

const PlannerPage = () => {
    const { id } = useParams();
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState<string>("Loading…");

    // Holds the planner row we load from Supabase.
    const [planner, setPlanner] = useState<PlannerRow | null>(null);

    // Contains ALL questions the user will see: first your preset ones,
    // then (exactly one time) an appended AI-generated batch.
    const [questions, setQuestions] = useState<QuestionConfig[]>([]);

    // Index of the currently displayed question page.
    const [page, setPage] = useState(0);

    // Flag indicating whether we've already fetched the single AI follow-up set.
    // (We only want to ask ONE extra set of questions before "Finish".)
    const [hasRefined, setHasRefined] = useState(false);

    // If non-null, we render a simple "final output" result page
    // instead of the question flow.
    const [finalOutput, setFinalOutput] = useState<string | null>(null);

    // All user answers keyed by question id. Matches your UI input types:
    // text/textarea -> string, radio/listbox -> string | null, checkbox -> string[]
    const [answers, setAnswers] = useState<Record<string, string | string[] | null>>({});

    // Convenience: total question count and "current" question.
    const total = questions.length;
    const current = questions[page];

    // ---------------------------------
    // Helpers I added
    // ---------------------------------

    // Returns the default value for a given question type.
    // This is used when we append new (AI) questions so the answers object stays in sync.
    const defaultValueFor = (q: QuestionConfig): string | string[] | null =>
        q.type === "checkbox" ? [] : q.type === "radio" || q.type === "listbox" ? null : "";

    // A key to store per-planner finalize results in localStorage.
    const finalCacheKey = id ? `planner:${id}:final_output` : null;

    // Simplified navigation helpers (unchanged from your intent).
    const next = () => setPage((p) => Math.min(p + 1, total - 1));
    const back = () => setPage((p) => Math.max(p - 1, 0));

    // Call your Supabase Edge Function named "planner".
    // We re-use this for refine + finalize. (No `any` here.)
    const callPlanner = async <T = unknown,>(payload: Record<string, unknown>): Promise<T> => {
        const { data, error } = await supabase.functions.invoke("planner", { body: payload });
        if (error) {
            console.error("planner error:", error);
            throw error;
        }
        return data as T;
    };

    // Normalize AI-generated question objects into your QuestionConfig union.
    // This guarantees the new questions render the same way as your presets. (No `any`.)
    const normalizeQuestion = (q: unknown): QuestionConfig | null => {
        if (!isRecord(q)) return null;

        const { id: qid, type, prompt } = q;
        if (typeof qid !== "string" || typeof type !== "string" || typeof prompt !== "string") {
            return null;
        }

        if (type === "text" || type === "textarea") {
            const placeholder = typeof q.placeholder === "string" ? q.placeholder : undefined;
            return {
                id: qid,
                type,
                prompt,
                placeholder,
                required: false,
            };
        }

        if (type === "radio" || type === "checkbox" || type === "listbox") {
            const options = isOptionArray(q.options) ? q.options : [];
            // For radio/checkbox we require options. Listbox can be empty but practically should have options too.
            if (!options.length && type !== "listbox") return null;
            return {
                id: qid,
                type,
                prompt,
                options,
                required: false,
            };
        }

        return null;
    };

    // ---------------------------------
    // Effects I added/modified
    // ---------------------------------

    // Load the planner row. Also: check localStorage for a cached final output.
    // If a cached final exists, we immediately show it to avoid extra API calls.
    useEffect(() => {
        (async () => {
            if (!id) return;

            // 1) Try localStorage final result first (per planner).
            const cached = finalCacheKey ? localStorage.getItem(finalCacheKey) : null;
            if (cached) {
                try {
                    const parsed = JSON.parse(cached) as unknown;
                    if (isRecord(parsed) && typeof parsed.final_output === "string") {
                        setFinalOutput(parsed.final_output);
                    }
                } catch {
                    // If parsing fails, ignore and continue to load planner/questions.
                }
            }

            // 2) Load planner/preset questions from Supabase for context and UI (still needed
            //    even if we show final output, so users can clear it or revisit if you later add that).
            const { data, error } = await supabase
                .from("planners")
                .select("id,name,questions,ai_context")
                .eq("id", id)
                .single();

            if (!error) {
                setPlanner(data as PlannerRow);
                setQuestions((data as PlannerRow)?.questions ?? []);
                setHasRefined(false);
                setPage(0);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    // Keep the answers map synced with whatever questions exist.
    // This runs ONLY when the questions array changes to avoid update loops.
    useEffect(() => {
        if (!questions.length) return;

        setAnswers((prev) => {
            const nextMap: Record<string, string | string[] | null> = { ...prev };
            let changed = false;

            // Add defaults for any new question ids we haven't seen yet.
            for (const q of questions) {
                if (!(q.id in nextMap)) {
                    nextMap[q.id] = defaultValueFor(q);
                    changed = true;
                }
            }

            // Drop answers that no longer correspond to any question.
            for (const k of Object.keys(nextMap)) {
                if (!questions.some((q) => q.id === k)) {
                    delete nextMap[k];
                    changed = true;
                }
            }

            return changed ? nextMap : prev;
        });
    }, [questions]);

    // ---------------------------------
    // One-time "Continue" -> fetch a single AI question set, then never again.
    // ---------------------------------
    const handleContinue = async () => {
        if (!planner || hasRefined) return;

        setLoadingText("Getting your next questions…");
        setIsLoading(true);

        try {
            const res = await callPlanner<RefineResponse>({
                mode: "refine",
                planner_id: planner.id,
                round_index: 0,
                questions,
                answers,
            });

            const raw = res?.next_round?.questions ?? [];
            const mapped = raw
                .map(normalizeQuestion)
                .filter((x): x is QuestionConfig => Boolean(x));

            // Dedupe by id (defensive).
            const existingIds = new Set(questions.map((q) => q.id));
            const deduped = mapped.filter((q) => !existingIds.has(q.id));

            if (deduped.length) {
                const prevLen = questions.length;

                // Append the AI questions to the master list.
                setQuestions((prev) => [...prev, ...deduped]);

                // Seed default answers for the new questions.
                const defaults = Object.fromEntries(deduped.map((q) => [q.id, defaultValueFor(q)]));
                setAnswers((prev) => ({ ...prev, ...defaults }));

                // Jump to first of the newly appended pages.
                setPage(prevLen);
            }

            // Mark refined so we won't fetch another set.
            setHasRefined(true);
        } catch (e) {
            console.error("continue/refine failed:", e);
        } finally {
            setIsLoading(false);
        }
    };

    // ---------------------------------
    // Finish -> call finalize with full questions/answers, then cache locally.
    // ---------------------------------
    const handleFinish = async () => {
        if (!planner) return;

        setLoadingText("Getting your next questions…");
        setIsLoading(true);

        try {
            const res = await callPlanner<FinalizeResponse>({
                mode: "finalize",
                planner_id: planner.id,
                questions,
                answers,
            });

            const text = res?.final_output ?? "";
            setFinalOutput(text);

            // Cache the final result locally so reloading the page shows it immediately
            // and we avoid another API call.
            if (finalCacheKey) {
                const payload = {
                    final_output: text,
                    at: Date.now(),
                };
                localStorage.setItem(finalCacheKey, JSON.stringify(payload));
            }
        } catch (e) {
            console.error("finalize failed:", e);
        } finally {
            setIsLoading(false);
        }
    };

    // ---------------------------------
    // Simple navigation helpers for buttons.
    // We only have three button states now:
    // - Not at last page: "Next"
    // - Last page, not refined yet: "Continue" (fetch single AI set)
    // - Last page, refined: "Finish" (call finalize)
    // ---------------------------------
    const atLastPage = total > 0 && page === total - 1;

    // 2) tiny overlay component (shows while loading)
    const LoadingOverlay = () =>
        !isLoading ? null : (
            <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
                aria-live="polite"
                aria-busy="true"
            >
                <div className="flex items-center gap-3 rounded-xl bg-white p-6 shadow-xl">
                    {/* spinner */}
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent" />
                    <span className="text-sm font-medium">{loadingText}</span>
                </div>
            </div>
        );

    // ---------------------------------
    // If we have a cached or freshly created final output, render that immediately.
    // ---------------------------------
    if (finalOutput) {
        return (
            <div className="wrapper items-center justify-center px-10 pt-2 pb-5">
                <div className="surface container max-w-200 !gap-y-4 rounded-xl !p-8">
                    <h2 className="mb-2 text-xl font-semibold">Your Mobile Solar Plan</h2>
                    <p className="whitespace-pre-wrap">{finalOutput}</p>

                    <div className="mt-4 flex gap-2">
                        {/* Optional UX: clear cache to restart (does not remove Supabase data) */}
                        <Button
                            variant="secondary"
                            onClick={() => {
                                if (finalCacheKey) localStorage.removeItem(finalCacheKey);
                                setFinalOutput(null);
                                // Optionally reset state so user can re-run flow in one go:
                                setHasRefined(false);
                                setPage(0);
                            }}
                        >
                            Start Over
                        </Button>
                    </div>
                </div>
                <LoadingOverlay />
            </div>
        );
    }

    // ---------------------------------
    // Question flow renderer (unchanged UI, just with the new navigation logic).
    // ---------------------------------
    if (!planner) return null;

    return (
        <div className="mx-4 my-4 items-center justify-center">
            <Link to={"/"}>
                <button className="cursor-pointer rounded-full bg-gray-100 p-3">
                    <ChevronLeftIcon
                        className="m-auto size-[16px] stroke-black"
                        stroke="currentColor"
                        stroke-width="2"
                    />
                </button>
            </Link>
            <div className="container mx-auto w-fit !p-8">
                {current &&
                    (() => {
                        switch (current.type) {
                            case "text":
                                return (
                                    <QuestionCard
                                        id={current.id}
                                        type="text"
                                        prompt={current.prompt}
                                        placeholder={current.placeholder}
                                        value={(answers[current.id] as string) ?? ""}
                                        onChange={(e) =>
                                            setAnswers((a) => ({
                                                ...a,
                                                [current.id]: e.target.value,
                                            }))
                                        }
                                    />
                                );
                            case "textarea":
                                return (
                                    <QuestionCard
                                        id={current.id}
                                        type="textarea"
                                        prompt={current.prompt}
                                        placeholder={current.placeholder}
                                        value={(answers[current.id] as string) ?? ""}
                                        onChange={(e) =>
                                            setAnswers((a) => ({
                                                ...a,
                                                [current.id]: e.target.value,
                                            }))
                                        }
                                    />
                                );
                            case "radio":
                                return (
                                    <QuestionCard
                                        id={current.id}
                                        type="radio"
                                        prompt={current.prompt}
                                        options={current.options}
                                        value={(answers[current.id] as string) ?? null}
                                        onChange={(v: string) =>
                                            setAnswers((a) => ({ ...a, [current.id]: v }))
                                        }
                                    />
                                );
                            case "checkbox":
                                return (
                                    <QuestionCard
                                        id={current.id}
                                        type="checkbox"
                                        prompt={current.prompt}
                                        options={current.options}
                                        value={answers[current.id] as string[]}
                                        onChange={(v: string[]) =>
                                            setAnswers((a) => ({ ...a, [current.id]: v }))
                                        }
                                    />
                                );
                            case "listbox":
                                return (
                                    <QuestionCard
                                        id={current.id}
                                        type="listbox"
                                        prompt={current.prompt}
                                        options={current.options}
                                        value={(answers[current.id] as string | null) ?? null}
                                        onChange={(v: string | null) =>
                                            setAnswers((a) => ({ ...a, [current.id]: v }))
                                        }
                                    />
                                );
                        }
                    })()}

                <div className="mt-3 flex w-full flex-row justify-between">
                    <Button
                        onClick={back}
                        disabled={page === 0 || isLoading}
                    >
                        Back
                    </Button>

                    {!atLastPage ? (
                        <Button
                            onClick={next}
                            disabled={isLoading}
                        >
                            Next
                        </Button>
                    ) : hasRefined ? (
                        <Button
                            onClick={handleFinish}
                            disabled={isLoading}
                        >
                            Finish
                        </Button>
                    ) : (
                        <Button
                            onClick={handleContinue}
                            disabled={isLoading}
                        >
                            Continue
                        </Button>
                    )}
                </div>
            </div>
            <LoadingOverlay />
        </div>
    );
};

export default PlannerPage;
