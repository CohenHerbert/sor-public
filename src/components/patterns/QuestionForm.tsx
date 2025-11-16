import QuestionCard from "@/components/patterns/QuestionCard";
import type { QuestionCardProps } from "@/components/patterns/QuestionCard";

type QuestionFormProps = {
    questions: QuestionCardProps[];
    onSubmit?: (answers: Record<string, string | string[] | null>) => void;
    className?: string;
};

const QuestionForm = ({ questions, className }: QuestionFormProps) => {
    return (
        <div className={className}>
            {questions.map((q) => (
                <QuestionCard
                    key={q.id}
                    {...q}
                />
            ))}
        </div>
    );
};

export default QuestionForm;
