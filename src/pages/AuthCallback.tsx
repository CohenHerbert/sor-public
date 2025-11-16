// src/pages/AuthCallback.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallback() {
    const navigate = useNavigate();
    const [status, setStatus] = useState<"working" | "error">("working");
    const [message, setMessage] = useState("");

    // Parse the hash fragment once
    const hash = useMemo(() => new URLSearchParams(window.location.hash.slice(1)), []);

    useEffect(() => {
        const run = async () => {
            // If Supabase sent an error in the hash, surface it
            const err = hash.get("error");
            const errCode = hash.get("error_code");
            const errDesc = hash.get("error_description");

            if (err) {
                setStatus("error");
                setMessage(errDesc || `${err}${errCode ? ` (${errCode})` : ""}`);
                return;
            }

            // Otherwise let supabase-js hydrate the session from the hash
            await supabase.auth.getSession();

            // Clean the URL (remove #access_token etc)
            window.history.replaceState({}, document.title, window.location.pathname);

            // All good — send them where you want
            navigate("/", { replace: true });
        };

        run();
    }, [hash, navigate]);

    if (status === "error") {
        return (
            <div className="flex h-screen flex-col items-center justify-center gap-4 p-6 text-center">
                <h1 className="text-2xl font-semibold">We couldn’t sign you in</h1>
                <p className="max-w-md opacity-80">
                    {message || "The magic link is invalid or has expired."}
                </p>
                <button
                    className="btn btn-primary"
                    onClick={() => navigate("/auth", { replace: true })}
                >
                    Try again
                </button>
            </div>
        );
    }

    return (
        <div className="flex h-screen items-center justify-center">
            <p>Signing you in…</p>
        </div>
    );
}
