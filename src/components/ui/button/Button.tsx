import React from "react";
import "./Button.css";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = {
    children: React.ReactNode;
    variant?: ButtonVariant;
    disabled?: boolean;
    href?: string; // <-- add this
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ children, className = "", variant = "primary", type = "button", href, ...props }, ref) => {
        const classes = ["button", `button--${variant}`, className].filter(Boolean).join(" ");

        if (href) {
            return (
                <a href={href} className={classes}>
                    {children}
                </a>
            );
        }

        return (
            <button ref={ref} type={type} className={classes} {...props}>
                {children}
            </button>
        );
    }
);

Button.displayName = "Button";

export default Button;
