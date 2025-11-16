import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

export type Planner = {
    id: string;
    name: string;
    description: string | null;
};

export const PLANNERS_QUERY_KEY = ["planners"] as const;

export async function fetchPlanners(): Promise<Planner[]> {
    const { data, error } = await supabase
        .from("planners")
        .select("id,name,description")
        .order("name", { ascending: true });

    if (error) {
        throw new Error(error.message);
    }

    return (data ?? []) as Planner[];
}

export function usePlanners(enabled = true): UseQueryResult<Planner[], Error> {
    return useQuery<Planner[], Error>({
        queryKey: PLANNERS_QUERY_KEY,
        queryFn: fetchPlanners,
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        enabled,
    });
}
