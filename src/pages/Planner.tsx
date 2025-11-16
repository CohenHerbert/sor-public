import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient.ts";

interface Planner {
    id: number;
    name: string;
    questions: string[];
    ai_context: string;
}

const Planner = () => {
    const { id } = useParams();
    const [planner, setPlanner] = useState<Planner | null>(null);

    useEffect(() => {
        (async () => {
            if (!id) return;

            const { data, error } = await supabase
                .from("planners")
                .select("id,name,questions,ai_context")
                .eq("id", id)
                .single();

            if (!error) {
                setPlanner(data);
            }
        })();
    }, [id]);

    return <div>{planner?.id}</div>;
};

export default Planner;
