"use client";

import { cn } from "../../lib/utils";
import React, { useState } from "react";

interface MenuCardProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    isActive: boolean;
    onClick: () => void;
    className?: string;
    colorClass?: string;
}

function MenuCard({
    icon,
    title,
    description,
    isActive,
    onClick,
    className,
    colorClass = "text-blue-500",
}: MenuCardProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "group relative flex h-[320px] w-full max-w-[480px] flex-col justify-between overflow-hidden rounded-2xl border-2 p-8 transition-all duration-700",
                "bg-white/70 backdrop-blur-md hover:border-blue-400/40",
                "transform-gpu hover:scale-[1.02] hover:shadow-2xl shadow-lg",
                "before:absolute before:inset-0 before:bg-gradient-to-br before:from-blue-500/5 before:to-transparent before:opacity-0 before:transition-opacity before:duration-700 hover:before:opacity-100",
                isActive && "border-blue-500/60 shadow-xl",
                className
            )}
        >
            <div className="relative z-10 flex flex-col gap-6">
                <div
                    className={cn(
                        "inline-flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-700",
                        "bg-blue-50 group-hover:bg-blue-100 group-hover:scale-110",
                        isActive && "bg-blue-100 scale-110"
                    )}
                >
                    <div
                        className={cn(
                            "transition-all duration-700",
                            colorClass,
                            "group-hover:scale-110",
                            isActive && "scale-110"
                        )}
                    >
                        {icon}
                    </div>
                </div>

                <div className="flex flex-col gap-3 text-left">
                    <h2
                        className={cn(
                            "text-3xl font-black uppercase tracking-tight transition-all duration-700",
                            "text-gray-900 group-hover:translate-x-2",
                            isActive && "translate-x-2"
                        )}
                    >
                        {title}
                    </h2>
                    <p
                        className={cn(
                            "text-lg text-gray-500 transition-all duration-700",
                            "group-hover:text-gray-800"
                        )}
                    >
                        {description}
                    </p>
                </div>
            </div>

            <div
                className={cn(
                    "relative z-10 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider transition-all duration-700",
                    colorClass,
                    "opacity-0 group-hover:opacity-100 group-hover:translate-x-2",
                    isActive && "opacity-100 translate-x-2"
                )}
            >
                <span>Начать тест</span>
                <svg
                    className="h-4 w-4 transition-transform duration-700 group-hover:translate-x-1"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                    />
                </svg>
            </div>

            <div
                className={cn(
                    "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700",
                    "bg-gradient-to-t from-blue-500/10 via-transparent to-transparent",
                    "group-hover:opacity-100"
                )}
            />
        </button>
    );
}

interface MenuOption {
    id: string;
    icon: React.ReactNode;
    title: string;
    description: string;
}

interface MenuSelectionProps {
    options: MenuOption[];
    onSelect?: (id: string) => void;
    className?: string;
}

export function MenuSelection({
    options = [],
    onSelect,
    className,
}: MenuSelectionProps) {
    const [activeId, setActiveId] = useState<string | null>(null);

    const handleSelect = (id: string) => {
        setActiveId(id);
        onSelect?.(id);
    };

    return (
        <div
            className={cn(
                "flex w-full items-center justify-center",
                className
            )}
        >
            <div className="w-full max-w-6xl">
                <div className="grid grid-cols-1 gap-8 md:grid-cols-2 place-items-center">
                    {options.map((option, idx) => (
                        <MenuCard
                            key={option.id}
                            icon={option.icon}
                            title={option.title}
                            description={option.description}
                            isActive={activeId === option.id}
                            onClick={() => handleSelect(option.id)}
                            colorClass={idx === 0 ? "text-violet-600" : "text-emerald-600"}
                            className={idx === 0 ? "hover:border-violet-400/40 before:from-violet-500/5 group-hover:before:opacity-100" : "hover:border-emerald-400/40 before:from-emerald-500/5 group-hover:before:opacity-100"}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
