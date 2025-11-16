import { useState, type ChangeEvent } from "react";
import { Button, Checkbox, Input, Listbox, RadioGroup, TextArea } from "@/components/ui";

const Test = () => {
    const [count, setCount] = useState<number>(0);
    const [name, setName] = useState<string>("");
    const [radio, setRadio] = useState<string>("1");
    const [checked, setChecked] = useState<string[]>(["2"]);
    const [textarea, setTextarea] = useState<string>("");
    const [listbox, setListbox] = useState<string | null>(null);

    function increment() {
        setCount((count) => count + 1);
    }

    return (
        <div className="mx-auto my-12 max-w-270">
            <div className="mx-8">
                <h1>This is a Test Page</h1>

                <div className="mx-auto flex flex-col gap-2">
                    <Button
                        className="w-32"
                        disabled={false}
                        variant={"secondary"}
                        onClick={increment}
                    >
                        Clicks: {count}
                    </Button>

                    <Input
                        value={name}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                        placeholder="example@email.com"
                        className="w-fit"
                    />

                    <RadioGroup
                        value={radio}
                        onChange={setRadio}
                        options={[
                            { label: "1", value: "1" },
                            { label: "2", value: "2" },
                        ]}
                        name="radio"
                    />

                    <Checkbox
                        options={[
                            { label: "1", value: "1" },
                            { label: "2", value: "2" },
                        ]}
                        onChange={setChecked}
                        name={"checkbox"}
                        value={checked}
                    />

                    <TextArea
                        value={textarea}
                        placeholder="Text area..."
                        onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                            setTextarea(e.target.value)
                        }
                        rows={3}
                    />

                    <Listbox
                        options={[
                            { label: "1", value: "1" },
                            { label: "2", value: "2" },
                        ]}
                        value={listbox}
                        onChange={setListbox}
                    />
                </div>
            </div>
        </div>
    );
};

export default Test;
