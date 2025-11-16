import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { supabase } from "@/lib/supabaseClient.ts";

const Auth = () => {
    const [email, setEmail] = useState<string>("");
    const [code, setCode] = useState<string>("");
    const [step, setStep] = useState<"email" | "verify">("email");
    const [loading, setLoading] = useState(false);

    const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    const sendCode = async () => {
        if (!validateEmail(email)) {
            alert("Please enter a valid email address.");
            return;
        }

        setLoading(true);
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                shouldCreateUser: true,
            },
        });
        setLoading(false);

        if (error) {
            alert(error.message);
            return;
        }

        setStep("verify");
    };

    const verifyCode = async () => {
        if (!code.trim()) {
            alert("Enter your code.");
            return;
        }

        setLoading(true);
        const { data, error } = await supabase.auth.verifyOtp({
            email,
            token: code,
            type: "email",
        });
        setLoading(false);

        if (error) {
            alert(error.message);
            return;
        }

        // Successful authentication
        console.log("Authenticated session:", data.session);
        window.location.href = "/"; // redirect to app home
    };

    return (
        <div className="flex h-screen w-screen items-center justify-center pb-50">
            <div className="surface flex w-80 flex-col gap-3 rounded-lg p-8">
                {step === "email" && (
                    <>
                        <div>Email Address</div>
                        <Input
                            id="email"
                            type="email"
                            placeholder="example@email.com"
                            className="border border-gray-300"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                        <Button
                            variant="primary"
                            className="w-full"
                            onClick={sendCode}
                            disabled={loading}
                        >
                            {loading ? "Sending..." : "Send Code"}
                        </Button>
                    </>
                )}

                {step === "verify" && (
                    <>
                        <div>Enter the Code Sent to {email}</div>
                        <Input
                            id="code"
                            type="text"
                            placeholder="123456"
                            maxLength={6}
                            className="border border-gray-300 text-center tracking-widest"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            required
                        />
                        <div className="flex flex-row gap-2">
                            <Button
                                variant="primary"
                                className="w-full"
                                onClick={verifyCode}
                                disabled={loading}
                            >
                                {loading ? "Verifying..." : "Verify"}
                            </Button>

                            <Button
                                variant="secondary"
                                className="w-full"
                                onClick={() => setStep("email")}
                            >
                                Back
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default Auth;
