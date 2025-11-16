import { memo, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { usePlanners, type Planner } from "@/lib/planners";
import { supabase } from "@/lib/supabaseClient.ts";
import "./Dashboard.css";
import { useMysqlForms, type MysqlForm } from "@/hooks/useMysqlForms";
import { Button } from "@/components/ui/index.ts";
import logo from "../assets/logo.png";
import logoSmall from "../assets/logoSmall.png"
// import { ArrowRightIcon } from "@heroicons/react/24/outline"


const MEMBERSHIP_QUERY_KEY = ["membership-status"] as const;
const MONTH_ABBREVIATIONS = [
    "Jan.",
    "Feb.",
    "Mar.",
    "Apr.",
    "May",
    "Jun.",
    "Jul.",
    "Aug.",
    "Sep.",
    "Oct.",
    "Nov.",
    "Dec.",
] as const;

const formatWorkshopDate = (value: string | null) => {
    if (value === null) {
        return null
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return value;

    const month = MONTH_ABBREVIATIONS[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();

    return `${month} ${day}, ${year}`;
};

async function fetchMembershipStatus(email: string): Promise<boolean> {
    const { count, error } = await supabase
        .from("memberships")
        .select("email", { count: "exact", head: true })
        .eq("email", email);

    if (error) throw new Error(error.message);

    return (count ?? 0) > 0;
}

const PlannerCard = memo(function PlannerCard({ planner }: { planner: Planner }) {
    return (
        <Link
            to={`/planner/${planner.id}`}
            className="planner sm-container"
        >
            <h2>{planner.name}</h2>
            {planner.description ? <p className="!text-[15px]">{planner.description}</p> : null}
        </Link>
    );
});

const useUserEmail = () => {
    const [email, setEmail] = useState<string | null>(null);

    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            setEmail(data.user?.email ?? null);
        });
    }, []);

    return email;
};

const useMembershipQuery = (email: string | null) =>
    useQuery<boolean, Error>({
        queryKey: [...MEMBERSHIP_QUERY_KEY, email],
        queryFn: () => fetchMembershipStatus(email as string),
        enabled: Boolean(email),
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

async function signOut() {
    await supabase.auth.signOut();
}

const isMember = (forms: MysqlForm[]): boolean => {
    for (const f of forms) {
        if (f.memberstatus == "active" || f.memberstatus == "cancelled") {
            return true
        }
    }
    return false
}

// function buildWorkshopUrl(tld: string, webpage_url: string): string | undefined {
//     const domain = tld === "com" ? "schoolofranch.com" : "schoolofranch.org";
//
//     // normalize -> "w braided rug making" → "w-braided-rug-making"
//     if (webpage_url != null) {
//         const slug = webpage_url
//             .trim()
//             .toLowerCase()
//             .replace(/^\/*/, "") // no leading slash
//             .replace(/\s+/g, "-") // spaces → hyphens
//             .replace(/[^a-z0-9-]/g, "") // strip junk
//             .replace(/-+/g, "-"); // collapse hyphens
//
//         const withPrefix = slug.startsWith("w-") ? slug : `w-${slug.replace(/^w/, "")}`;
//
//         return `https://${domain}/${withPrefix}`;
//     }
//     return undefined;
// }

const Dashboard = () => {
    const email = useUserEmail();
    const membershipQuery = useMembershipQuery(email);
    const canViewPlanners = false; // Boolean(email) && Boolean(membershipQuery.data);
    const plannersQuery = usePlanners(canViewPlanners);

    const { data: mysqlForms, isLoading: mysqlLoading, error: mysqlError } = useMysqlForms();

    const planners = plannersQuery.data ?? [];

    const labelFromMysql = (f: any) => {
        if (f.status === "pre-registered") return "Pre-reg";
        if (f.status === "completed" && f.eventdate) return formatWorkshopDate(f.eventdate);
        return null;
    };

    const grouped: MysqlForm[] = Object.values(
        mysqlForms.reduce((acc: any, item) => {
            if (!acc[item.formid]) {
                acc[item.formid] = { ...item, _tickets: 0 };
            }
            acc[item.formid]._tickets += 1;
            return acc;
        }, {})
    );

    // mw-270 1080 | w-180 720

    return (
        <div className="mx-auto my-12 max-w-180 items-center">
            <div className="b-4 flex w-full items-center justify-end pr-8 pb-2 pl-5">
                <img
                    src={logo}
                    alt="logo"
                    className="mr-auto h-20 rounded-full hidden sm:block"
                />

                {/* Small-screen logo */}
                <img
                    src={logoSmall}
                    alt="logo"
                    className="mr-auto h-20 rounded-full sm:hidden"
                />
                <div className="flex-col flex items-end gap-2">
                    <div className="my-auto flex">
                        <p>{email}</p>
                    </div>
                    <Button
                        variant="primary"
                        onClick={signOut}
                    >
                        Sign Out
                    </Button></div>
            </div>
            <div className="mx-8 mt-8 flex flex-col gap-4">
                <header>
                    <h1>Your Workshops</h1>
                    <p className="ml-[.1rem]">Brought to you by School of Ranch</p>
                </header>

                <section className="workshop-container">
                    {/*<h1>Your Workshops</h1>*/}
                    {/*<hr className="divider" />*/}

                    <div>
                        {mysqlLoading && <p>Loading your workshops…</p>}

                        {!mysqlLoading && mysqlError && (
                            <p>Failed to load workshops: {mysqlError}</p>
                        )}

                        {!mysqlLoading && !mysqlError && mysqlForms.length === 0 && (
                            <p>No workshops yet.</p>
                        )}

                        {!mysqlLoading && !mysqlError && mysqlForms.length > 0 && (
                            <div className="flex flex-col gap-2.5">
                                {grouped
                                    // .filter((f): boolean => f.resolved_url !== null)
                                    .map((f) => (
                                        <a
                                            key={f.formid}
                                            // href={f.resolved_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="workshop-card"
                                        >
                                            <div className="flex flex-col gap-1">
                                                <h2>
                                                    {f.workshop_name} Title for Testing
                                                </h2>
                                                {labelFromMysql(f) && (
                                                    <p>
                                                        {labelFromMysql(f)} | {f._tickets} Tickets
                                                    </p>
                                                )}

                                                {/*{(f.start_time || f.end_time) && (*/}
                                                {/*    <p>*/}
                                                {/*        {f.start_time}*/}
                                                {/*        {f.end_time ? `–${f.end_time}` : ""}*/}
                                                {/*    </p>*/}
                                                {/*)}*/}
                                            </div>
                                            <Button variant="primary" href={f.resolved_url}>Details</Button>
                                            {/*<div className="card-indicator flex flex-row items-center gap-1">*/}
                                            {/*    <span>View</span>*/}
                                            {/*    <ArrowRightIcon*/}
                                            {/*        className="size-4"*/}
                                            {/*        stroke="currentColor"*/}
                                            {/*        strokeWidth="3"*/}
                                            {/*    />*/}
                                            {/*</div>*/}
                                        </a>
                                    ))}
                            </div>
                        )}
                    </div>
                </section>

                <header>
                    <h1>Membership</h1>
                    <p>View your membership status and info</p>
                </header>

                <section className="workshop-container">
                    {mysqlLoading && isMember(mysqlForms) && <p>Loading your membership data...</p>}

                    {!mysqlLoading && mysqlError && isMember(mysqlForms) && (
                        <p>Failed to load membership: {mysqlError}</p>
                    )}

                    {!isMember(mysqlForms) && (
                        <div className="flex items-start justify-between sm:flex-row flex-col h-fit gap-2">
                            <div className="py-2">
                                <p>You are not a member. Please consider signing up!</p>
                            </div>
                            <Button href="https://schoolofranch.org/join"> Sign Up! </Button>
                        </div>
                    )}

                    {!mysqlLoading && !mysqlError && mysqlForms.length === 0 && isMember(mysqlForms) && (
                        <p>No available data.</p>
                    )}

                    {!mysqlLoading && !mysqlError && mysqlForms.length > 0 && isMember(mysqlForms) && (
                        <div className="flex flex-col gap-2.5">
                            {grouped
                                // .filter((f): boolean => f.resolved_url !== null)
                                .filter((f): boolean => f.memberstatus !== null)
                                .map((f) => (
                                    <a
                                        key={f.formid}
                                        href={f.resolved_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <div className="flex flex-col text-sm px-2.5 divide-y divide-gray-200 bg-white rounded-[.75rem]">
                                            <div className="member-value">
                                                <p className="!text-black">ID</p>
                                                <p className="!text-black">{f.memberid}</p>
                                            </div>

                                            <div className="member-value">
                                                <p className="!text-black">Status</p>
                                                <p className="!text-black">{f.memberstatus}</p>
                                            </div>

                                            <div className="member-value">
                                                <p className="!text-black">Expires</p>
                                                <p className="!text-black">{formatWorkshopDate(f.expirationdate)}</p>
                                            </div>

                                            <div className="member-value">
                                                <p className="!text-black">Auto Renew</p>
                                                <p className="!text-black">{Boolean(Number(f.autorenew)) ? "Yes" : "No"}</p>
                                            </div>

                                            <div className="member-value">
                                                <p className="!text-black">Level</p>
                                                <p className="!text-black">{f.levelname}</p>
                                            </div>
                                        </div>
                                    </a>

                                ))}
                        </div>
                    )}
                </section>

                {canViewPlanners && (
                    <section>
                        <div>
                            <h1 className="mb-2">Planners</h1>
                            <hr className="divider mb-[1rem]" />
                            {plannersQuery.isFetching && !plannersQuery.isLoading ? (
                                <span
                                    aria-label="Refreshing planners"
                                    title="Refreshing planners"
                                />
                            ) : null}
                        </div>
                        {membershipQuery.isLoading || plannersQuery.isLoading ? (
                            <div>
                                {Array.from({ length: 4 }, (_, index) => (
                                    <div
                                        key={index}
                                        className="container"
                                    />
                                ))}
                            </div>
                        ) : plannersQuery.isError ? (
                            <div className="container">
                                <p>We couldn’t load your planners.</p>
                                <p>
                                    {plannersQuery.error?.message ??
                                        "Please try again in a moment."}
                                </p>
                            </div>
                        ) : planners.length > 0 ? (
                            <div className="planners-grid">
                                {planners.map((planner) => (
                                    <PlannerCard
                                        key={planner.id}
                                        planner={planner}
                                    />
                                ))}
                            </div>
                        ) : null}
                    </section>
                )}
            </div>
        </div>
    );
};

export default Dashboard;
