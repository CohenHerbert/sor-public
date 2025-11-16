import { CheckCircleIcon } from "@heroicons/react/24/solid";
import "../ui.css";

type RadioGroupProps = {
    name: string;
    options: { label: string; value: string }[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
};

const RadioGroup = ({
    name,
    options,
    value,
    onChange,
    disabled,
    className = "",
}: RadioGroupProps) => {
    return (
        <div className={`radio-group surface w-fit min-w-63 ${className}`}>
            {options.map((opt) => {
                const isChecked = value === opt.value;
                return (
                    <label
                        key={opt.value}
                        className={`radio-label ${isChecked ? "bg-gray-200" : ""}`}
                    >
                        <input
                            type="radio"
                            name={name}
                            value={opt.value}
                            checked={isChecked}
                            onChange={() => onChange(opt.value)}
                            disabled={disabled}
                            className="sr-only"
                        />
                        <span
                            className={`relative flex h-6 w-6 items-center justify-center ${isChecked ? "" : ""}`}
                        >
                            {isChecked && <CheckCircleIcon className="m-auto fill-blue-500" />}

                            {!isChecked && <div className="h-5 w-5 rounded-full bg-gray-300" />}
                        </span>

                        <div>{opt.label}</div>
                    </label>
                );
            })}
        </div>
    );
};

export default RadioGroup;
