import React, { useLayoutEffect, useRef } from "react";
import "../ui.css";

type TextAreaProps = {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    placeholder?: string;
    disabled?: boolean;
    rows?: number;
    resizable?: boolean;
    className?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const TextArea = ({
    value,
    onChange,
    placeholder,
    disabled,
    rows,
    resizable,
    className,
}: TextAreaProps) => {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useLayoutEffect(() => {
        const textareaEl = textareaRef.current;

        if (!textareaEl) {
            return;
        }

        textareaEl.style.height = "auto";
        textareaEl.style.height = `${textareaEl.scrollHeight}px`;
    }, [value, rows]);

    const classes = [
        "text-area surface",
        resizable ? "text-area--resizable" : "text-area--fixed",
        className ?? "",
    ]
        .join(" ")
        .trim();

    return (
        <textarea
            ref={textareaRef}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
            className={classes}
            rows={rows}
        />
    );
};

export default TextArea;
