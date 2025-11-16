import React from "react";
import "../ui.css";

type InputProps = {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    disabled?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>;

const Input = ({ value, onChange, placeholder, disabled, className = "" }: InputProps) => {
    const base = "flex items-center justify-start surface input w-auto";

    const classes = `${base} ${className}`;

    return (
        <input
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
            className={classes}
        />
    );
};

export default Input;
