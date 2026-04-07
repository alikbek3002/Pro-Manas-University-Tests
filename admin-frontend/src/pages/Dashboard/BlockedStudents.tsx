import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldOff, Search, ShieldAlert, Ban, Unlock } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchBlockedStudents, unblockStudent, type BlockedStudent } from "@/lib/api";
import { toast } from "sonner";

function formatBlockStatus(student: BlockedStudent) {
    if (student.blockedPermanently) {
        return { label: "Навсегда", variant: "permanent" as const };
    }
    if (student.blockedUntil) {
        const until = new Date(student.blockedUntil);
        const now = new Date();
        if (until > now) {
            const hoursLeft = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / (1000 * 60 * 60)));
            return { label: `${hoursLeft} ч. осталось`, variant: "temporary" as const };
        }
    }
    return { label: "Активна", variant: "expired" as const };
}

export default function BlockedStudentsPage() {
    const [students, setStudents] = useState<BlockedStudent[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [unblocking, setUnblocking] = useState<string | null>(null);

    const filteredStudents = useMemo(() => {
        return students.filter((s) =>
            s.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.username.toLowerCase().includes(searchQuery.toLowerCase()),
        );
    }, [students, searchQuery]);

    const loadStudents = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchBlockedStudents();
            setStudents(data);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Не удалось загрузить список";
            toast.error(message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadStudents();
    }, [loadStudents]);

    const handleUnblock = async (id: string, name: string) => {
        if (!confirm(`Разблокировать ученика "${name}"? Счётчик нарушений будет сброшен.`)) return;
        setUnblocking(id);
        try {
            await unblockStudent(id);
            setStudents((prev) => prev.filter((s) => s.id !== id));
            toast.success(`${name} разблокирован`);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Не удалось разблокировать";
            toast.error(message);
        } finally {
            setUnblocking(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <ShieldOff className="w-6 h-6 text-destructive" />
                        Заблокированные
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Ученики, заблокированные за попытки сделать скриншот во время тестов.
                    </p>
                </div>
            </div>

            <div className="w-full bg-card rounded-xl border border-border shadow-sm">
                <div className="p-4 border-b border-border">
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Поиск по ФИО или логину..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 w-full bg-background"
                        />
                    </div>
                </div>

                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent bg-muted/30">
                            <TableHead>ФИО</TableHead>
                            <TableHead>Класс</TableHead>
                            <TableHead>Логин</TableHead>
                            <TableHead>Нарушения</TableHead>
                            <TableHead>Статус блокировки</TableHead>
                            <TableHead className="text-right">Действия</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                    Загрузка...
                                </TableCell>
                            </TableRow>
                        ) : filteredStudents.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                    Заблокированных учеников нет
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredStudents.map((student) => {
                                const status = formatBlockStatus(student);
                                return (
                                    <TableRow key={student.id}>
                                        <TableCell className="font-medium text-foreground">{student.fullName}</TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                                                {student.class}
                                            </span>
                                        </TableCell>
                                        <TableCell className="font-mono text-sm">{student.username}</TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center gap-1 text-sm font-bold text-red-600">
                                                <ShieldAlert className="w-3.5 h-3.5" />
                                                {student.screenshotStrikes}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {status.variant === "permanent" ? (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                                                    <Ban className="w-3 h-3" />
                                                    {status.label}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                                                    {status.label}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                disabled={unblocking === student.id}
                                                onClick={() => handleUnblock(student.id, student.fullName)}
                                                className="gap-1.5 text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                                            >
                                                <Unlock className="w-3.5 h-3.5" />
                                                {unblocking === student.id ? "..." : "Разблокировать"}
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>

                <div className="p-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
                    <p>
                        Заблокировано: {filteredStudents.length}
                    </p>
                </div>
            </div>
        </div>
    );
}
