import { useEffect, useState, type JSX } from "react";
import { Auth, AuthCallback, Dashboard, NotFound, Planner, PlannerPage } from "@/pages";
import type { Session } from "@supabase/supabase-js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { supabase } from "@/lib/supabaseClient";
import Test from "./pages/Test";
import "./App.css";

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes
            gcTime: 30 * 60 * 1000, // 30 minutes
            refetchOnWindowFocus: false,
            retry: 1,
        },
    },
});

export default function App() {
    const [session, setSession] = useState<Session | null | undefined>(undefined);
    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => setSession(data.session));
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
        return () => subscription.unsubscribe();
    }, []);
    const loading = session === undefined;

    const RequireAuth = ({ children }: { children: JSX.Element }) => {
        if (loading) return null; // or a spinner
        return session ? (
            children
        ) : (
            <Navigate
                to="/auth"
                replace
            />
        );
    };

    const RedirectIfAuthed = ({ children }: { children: JSX.Element }) => {
        if (loading) return null;
        return session ? (
            <Navigate
                to="/"
                replace
            />
        ) : (
            children
        );
    };

    return (
        <QueryClientProvider client={queryClient}>
            <Routes>
                <Route
                    path="/auth/callback"
                    element={<AuthCallback />}
                />
                <Route
                    path="/auth"
                    element={
                        <RedirectIfAuthed>
                            <Auth />
                        </RedirectIfAuthed>
                    }
                />
                <Route element={<Layout />}>
                    <Route
                        path="/"
                        element={
                            <RequireAuth>
                                <Dashboard />
                            </RequireAuth>
                        }
                    />

                    <Route
                        path="/plan/:id"
                        element={
                            <RequireAuth>
                                <PlannerPage />
                            </RequireAuth>
                        }
                    />

                    <Route
                        path="/planner/:id"
                        element={
                            <RequireAuth>
                                <Planner />
                            </RequireAuth>
                        }
                    />

                    <Route
                        path="*"
                        element={<NotFound />}
                    />
                    <Route
                        path="/test"
                        element={<Test />}
                    />
                </Route>
            </Routes>
        </QueryClientProvider>
    );
}
