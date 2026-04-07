import { useState } from "react";
import { Plus, Edit, Trash2 } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

interface Subject {
    id: string;
    name_ru: string;
    name_kg: string;
}

const mockSubjects: Subject[] = [
    { id: "1", name_ru: "Математика", name_kg: "Математика" },
    { id: "2", name_ru: "Логика", name_kg: "Логика" },
    { id: "3", name_ru: "Чтение", name_kg: "Окуу" },
];

export default function SubjectsPage() {
    const [subjects, setSubjects] = useState<Subject[]>(mockSubjects);

    const handleDelete = (id: string) => {
        if (confirm("Вы уверены что хотите удалить предмет? Это может затронуть базу вопросов.")) {
            setSubjects(subjects.filter((s) => s.id !== id));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground">Предметы</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Управление учебными предметами (дисциплинами) для тестов.
                    </p>
                </div>
                <Button className="bg-primary text-primary-foreground font-medium">
                    <Plus className="w-4 h-4 mr-2" />
                    Новый предмет
                </Button>
            </div>

            <div className="w-full bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/30">
                            <TableHead>Название (RU)</TableHead>
                            <TableHead>Название (KG)</TableHead>
                            <TableHead className="text-right">Действия</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {subjects.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                                    Предметы не найдены
                                </TableCell>
                            </TableRow>
                        ) : (
                            subjects.map((subject) => (
                                <TableRow key={subject.id}>
                                    <TableCell className="font-medium text-foreground">{subject.name_ru}</TableCell>
                                    <TableCell className="font-medium text-foreground">{subject.name_kg}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-muted-foreground hover:text-primary transition-colors h-8 w-8"
                                            >
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDelete(subject.id)}
                                                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors h-8 w-8"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
