import { useState } from "react";

type PopoverProps = {
    label: string;
    children: React.ReactNode;
};

const Popover = ({ label, children }: PopoverProps) => {
    const [open, setOpen] = useState(false);

    return (
        <div>
            <button
                type="button"
                onClick={() => setOpen((prev) => !prev)}
                aria-expanded={open}
            >
                {label}
            </button>
            {open && <div>{children}</div>}
        </div>
    );
};

export default Popover;
