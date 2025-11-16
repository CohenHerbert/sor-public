import { CheckIcon } from "@heroicons/react/24/solid";
import "../ui.css";

type CheckboxGroupProps = {
    name: string;
    options: { label: string; value: string }[];
    value: string[];
    onChange: (value: string[]) => void;
    disabled?: boolean;
    className?: string;
};

const Checkbox = ({
    name,
    options,
    value,
    onChange,
    disabled,
    className = "",
}: CheckboxGroupProps) => {
    return (
        <div className={`checkbox surface w-fit min-w-63 ${className}`}>
            {options.map((opt) => {
                const isChecked = value.includes(opt.value);
                return (
                    <label
                        key={opt.value}
                        className="checkbox-label"
                    >
                        <input
                            type="checkbox"
                            name={name}
                            value={value}
                            checked={value.includes(opt.value)}
                            onChange={() => {
                                const next = value.includes(opt.value)
                                    ? value.filter((v) => v !== opt.value)
                                    : [...value, opt.value];
                                onChange(next);
                            }}
                            disabled={disabled}
                            className="peer sr-only"
                        />
                        <span
                            className={`relative m-0.5 flex h-5 w-5 items-center justify-center rounded-md ${isChecked ? "bg-blue-500" : "bg-gray-300"}`}
                        >
                            {isChecked && (
                                <CheckIcon
                                    className="m-auto size-[10px] stroke-white"
                                    stroke="currentColor"
                                    stroke-width="2"
                                />
                            )}
                        </span>
                        <div>{opt.label}</div>
                    </label>
                );
            })}
        </div>
    );
};

export default Checkbox;
