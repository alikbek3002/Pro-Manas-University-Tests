import { Link, Outlet, useLocation } from "react-router-dom";
import { Users, FileText, LogOut, ShieldOff, Film } from "lucide-react";
import { useAdminAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";
import logo from "@/assets/pro-manas-logo.png";

const NAV_LINKS = [
    { name: "Ученики", path: "/dashboard/students", icon: Users },
    { name: "Тесты", path: "/dashboard/tests", icon: FileText },
    { name: "Видеоуроки", path: "/dashboard/videos", icon: Film },
    { name: "Заблокированные", path: "/dashboard/blocked", icon: ShieldOff },
];

export default function AdminLayout() {
    const location = useLocation();
    const logout = useAdminAuthStore((state) => state.logout);

    return (
        <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 border-r border-border bg-card flex flex-col">
                <div className="p-6 border-b border-border space-y-3">
                    <img src={logo} alt="ProManas" className="h-10 w-auto" decoding="async" />
                    <h2 className="text-xl font-bold tracking-tight">ProManas Admin</h2>
                </div>

                <nav className="flex-1 p-4 space-y-1">
                    {NAV_LINKS.map((link) => {
                        const isActive = location.pathname === link.path;
                        const Icon = link.icon;

                        return (
                            <Link
                                key={link.path}
                                to={link.path}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                                    isActive
                                        ? "bg-primary text-primary-foreground"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                )}
                            >
                                <Icon className="w-5 h-5" />
                                {link.name}
                            </Link>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-border">
                    <button
                        onClick={() => logout()}
                        className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        Выйти
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="h-16 shrink-0 border-b border-border bg-card flex items-center px-8 shadow-sm">
                    {/* Здесь можно добавить хлебные крошки или профиль текущего юзера */}
                    <h1 className="text-lg font-medium">
                        {NAV_LINKS.find(l => l.path === location.pathname)?.name || "Панель управления"}
                    </h1>
                </header>

                <div className="flex-1 overflow-auto p-8">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
