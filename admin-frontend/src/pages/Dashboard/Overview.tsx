import { Users, BookOpen, CheckCircle, Clock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge-extended";
import { cn } from "@/lib/utils";

const statsData = [
    {
        icon: Users,
        iconBg: 'border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
        value: 124,
        label: 'Всего учеников',
        info: (
            <Badge variant="success" appearance="light">
                +12 за этот месяц
            </Badge>
        ),
    },
    {
        icon: BookOpen,
        iconBg: 'border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20',
        value: 8,
        label: 'Активных предметов',
        info: (
            <Badge variant="secondary" appearance="light">
                +2 новых теста
            </Badge>
        ),
    },
    {
        icon: CheckCircle,
        iconBg: 'border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
        value: '78%',
        label: 'Средняя успеваемость',
        info: (
            <Badge variant="success" appearance="light">
                +4.2% рост
            </Badge>
        ),
    },
    {
        icon: Clock,
        iconBg: 'border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20',
        value: 45,
        label: 'Тестов пройдено',
        info: (
            <Badge variant="secondary" appearance="light">
                За последние 7 дней
            </Badge>
        ),
    },
];

export default function OverviewPage() {
    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div>
                <h2 className="text-3xl font-bold tracking-tight text-foreground">Обзор</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Общая статистика и сводка по платформе ProManas.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {statsData.map((stat, i) => (
                    <Card key={i} className="hover:shadow-md transition-shadow border-border/60 overflow-hidden group">
                        <CardContent className="p-6 flex flex-col items-start gap-6 relative">
                            {/* Decorative background element */}
                            <div className={cn(
                                "absolute -right-4 -top-4 size-24 rounded-full blur-2xl opacity-20 group-hover:opacity-40 transition-opacity",
                                stat.iconBg.split(' ')[0].replace('border-', 'bg-') // Extract color from iconBg to use as glow
                            )} />

                            {/* Icon */}
                            <div className={cn(`rounded-xl flex items-center justify-center size-12 border shadow-sm relative z-10`, stat.iconBg)}>
                                <stat.icon className="size-6" />
                            </div>

                            {/* Value & Label */}
                            <div className="space-y-1 relative z-10 w-full">
                                <div className="text-3xl font-bold text-foreground leading-none">{stat.value}</div>
                                <div className="text-sm font-medium text-muted-foreground">{stat.label}</div>
                            </div>

                            <div className="relative z-10 mt-auto pt-2 border-t border-border/40 w-full">
                                {stat.info}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
                {/* Заглушки для будущих графиков/таблиц */}
                <Card className="h-80 flex flex-col border-border/60">
                    <div className="p-6 border-b border-border/40">
                        <h3 className="font-semibold text-lg">Активность учеников</h3>
                    </div>
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-2 opacity-50">
                            <Clock className="w-8 h-8" />
                            <span>График в разработке</span>
                        </div>
                    </div>
                </Card>

                <Card className="h-80 flex flex-col border-border/60">
                    <div className="p-6 border-b border-border/40">
                        <h3 className="font-semibold text-lg">Популярные предметы</h3>
                    </div>
                    <div className="flex-1 flex items-center justify-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-2 opacity-50">
                            <BookOpen className="w-8 h-8" />
                            <span>Данные собираются</span>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
