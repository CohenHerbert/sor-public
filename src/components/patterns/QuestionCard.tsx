import React from "react";
import { Checkbox, Input, Listbox, RadioGroup, TextArea } from "@/components/ui";

// Base props (shared across all variants)
type QuestionCardBase = {
    id: string;
    prompt: string;
    disabled?: boolean;
    helpText?: string;
};

// Text input
type QuestionCardText = QuestionCardBase & {
    type: "text";
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
};

// Radio input
type QuestionCardRadio = QuestionCardBase & {
    type: "radio";
    options: { label: string; value: string }[];
    value: string;
    onChange: (v: string) => void;
};

// Checkbox input
type QuestionCardCheckbox = QuestionCardBase & {
    type: "checkbox";
    options: { label: string; value: string }[];
    value: string[];
    onChange: (v: string[]) => void;
};

// Textarea input
type QuestionCardTextarea = QuestionCardBase & {
    type: "textarea";
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    placeholder?: string;
    rows?: number;
    resizable?: boolean;
};

type QuestionCardListbox = QuestionCardBase & {
    type: "listbox";
    options: { label: string; value: string }[];
    value: string | null;
    onChange: (v: string | null) => void;
    placeholder?: string;
};

// Union of all
export type QuestionCardProps =
    | QuestionCardText
    | QuestionCardRadio
    | QuestionCardCheckbox
    | QuestionCardTextarea
    | QuestionCardListbox;

const QuestionCard = (props: QuestionCardProps) => {
    const { id, prompt, type, value, onChange, disabled } = props;
    let input;

    if (type === "text") {
        input = (
            <Input
                value={value}
                onChange={onChange}
                placeholder={props.placeholder}
                disabled={disabled}
            />
        );
    } else if (type === "radio") {
        input = (
            <RadioGroup
                name={""}
                options={props.options}
                value={value}
                onChange={onChange}
            />
        );
    } else if (type === "checkbox") {
        input = (
            <Checkbox
                name={""}
                options={props.options}
                value={value}
                onChange={onChange}
            />
        );
    } else if (type === "textarea") {
        input = (
            <TextArea
                value={value}
                onChange={onChange}
                placeholder={props.placeholder}
                rows={props.rows}
                resizable={props.resizable}
                disabled={disabled}
            />
        );
    } else if (type === "listbox") {
        input = (
            <Listbox
                options={props.options}
                value={value}
                onChange={onChange}
                placeholder={props.placeholder}
                disabled={disabled}
            />
        );
    } else {
        input = <></>;
    }

    return (
        <div
            className="flex flex-col gap-3"
            id={id}
        >
            <span className="mx-auto w-64">{prompt}</span>
            <span className="">{input}</span>
        </div>
    );
};

export default QuestionCard;
