import { useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/24/solid";
import { Button } from "@/components/ui";
import "../ui.css";

type ListboxOption = {
    label: string;
    value: string;
};

type ListboxProps = {
    options: ListboxOption[];
    value: string | null;
    onChange: (v: string | null) => void;
    placeholder?: string;
    disabled?: boolean;
};

const Listbox = ({ options, value, onChange, placeholder, disabled }: ListboxProps) => {
    const [open, setOpen] = useState<boolean>(false);

    const ref = useRef<HTMLDivElement>(null);

    const selected = value
        ? (options.find((option) => option.value === value)?.label ?? value)
        : null;

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div
            className="relative"
            ref={ref}
        >
            <Button
                className="min-w-[16rem]"
                onClick={() => !disabled && setOpen((prev) => !prev)}
                variant={"secondary"}
                aria-haspopup="listbox"
                aria-expanded={open}
                disabled={disabled}
            >
                <div className="flex w-full flex-row justify-between">
                    <span className={!value ? "!text-[var(--color-text-placeholder)]" : ""}>
                        {selected ?? placeholder ?? "Select..."}
                    </span>
                    <ChevronDownIcon
                        className={`my-auto ml-auto h-4 w-4 ${!value ? "fill-gray-400 stroke-gray-400" : ""} ${open ? "rotate-180" : ""}`}
                        stroke-width="1"
                        fill="currentColor"
                        stroke="currentColor"
                    />
                </div>
            </Button>
            {open && (
                <div
                    role="listbox"
                    tabIndex={-1}
                    className="listbox surface absolute z-1"
                >
                    {options.map((opt) => {
                        const isSelected = opt.value === value;
                        return (
                            <Button
                                key={opt.value}
                                role="option"
                                aria-selected={isSelected}
                                className="listbox-label !pl-2"
                                variant={"secondary"}
                                onClick={() => {
                                    onChange(opt.value);
                                    setOpen(false);
                                }}
                            >
                                {isSelected && (
                                    <div className="flex h-5 w-5 items-center justify-center">
                                        <CheckIcon
                                            className="m-auto size-[12px] stroke-black"
                                            stroke="currentColor"
                                            stroke-width="2"
                                        />
                                    </div>
                                )}

                                {!isSelected && (
                                    <div className="flex h-5 w-5 items-center justify-center">
                                        <CheckIcon
                                            className="m-auto size-[12px] opacity-0"
                                            stroke="currentColor"
                                            stroke-width="2"
                                        />
                                    </div>
                                )}

                                <div>{opt.label}</div>
                            </Button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default Listbox;
