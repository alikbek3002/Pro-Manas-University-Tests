"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useAdminAuthStore } from "@/store/authStore";
import { adminLogin } from "@/lib/api";

const signInSchema = z.object({
    username: z.string().min(1, "Введите логин"),
    password: z.string().min(1, "Введите пароль"),
});

type SignInFormValues = z.infer<typeof signInSchema>;

interface FormState {
    isLoading: boolean;
    error: string | null;
    showPassword: boolean;
}

export default function AdminLogin() {
    const navigate = useNavigate();
    const login = useAdminAuthStore((state) => state.login);

    const [formState, setFormState] = React.useState<FormState>({
        isLoading: false,
        error: null,
        showPassword: false,
    });

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<SignInFormValues>({
        resolver: zodResolver(signInSchema),
        defaultValues: { username: "", password: "" },
    });

    const onSubmit = async (data: SignInFormValues) => {
        setFormState((prev) => ({ ...prev, isLoading: true, error: null }));
        try {
            const response = await adminLogin(data.username, data.password);
            login(response);
            navigate("/dashboard");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Произошла ошибка сервера";
            setFormState((prev) => ({ ...prev, error: errorMessage }));
        } finally {
            setFormState((prev) => ({ ...prev, isLoading: false }));
        }
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 },
        },
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 },
    };

    return (
        <section className="bg-background min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="relative overflow-hidden rounded-xl border border-border/50 bg-card shadow-xl">
                    <motion.div
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                        className="relative z-10 p-8"
                    >
                        <motion.div variants={itemVariants} className="mb-8 text-center">
                            <h1 className="text-3xl font-semibold text-foreground">Панель Админа</h1>
                            <p className="mt-2 text-sm text-muted-foreground">Войдите для управления платформой лицея</p>
                        </motion.div>

                        {formState.error && (
                            <motion.div
                                variants={itemVariants}
                                className="mb-6 animate-in rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
                            >
                                {formState.error}
                            </motion.div>
                        )}

                        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                            <motion.div variants={itemVariants} className="space-y-2">
                                <Label htmlFor="username">Логин</Label>
                                <Input
                                    id="username"
                                    type="text"
                                    placeholder="admin"
                                    disabled={formState.isLoading}
                                    className={cn(errors.username && "border-destructive")}
                                    {...register("username")}
                                />
                                {errors.username && (
                                    <p className="text-xs text-destructive">{errors.username.message}</p>
                                )}
                            </motion.div>

                            <motion.div variants={itemVariants} className="space-y-2">
                                <Label htmlFor="password">Пароль</Label>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        type={formState.showPassword ? "text" : "password"}
                                        placeholder="••••••••"
                                        disabled={formState.isLoading}
                                        className={cn(errors.password && "border-destructive", "pr-10")}
                                        {...register("password")}
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="absolute right-0 top-0 h-full !bg-transparent text-muted-foreground hover:text-foreground"
                                        onClick={() =>
                                            setFormState((prev) => ({
                                                ...prev,
                                                showPassword: !prev.showPassword,
                                            }))
                                        }
                                        disabled={formState.isLoading}
                                    >
                                        {formState.showPassword ? (
                                            <EyeOff className="h-4 w-4" />
                                        ) : (
                                            <Eye className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                                {errors.password && (
                                    <p className="text-xs text-destructive">{errors.password.message}</p>
                                )}
                            </motion.div>

                            <motion.div variants={itemVariants}>
                                <Button
                                    type="submit"
                                    className="w-full bg-primary text-primary-foreground font-semibold h-11"
                                    disabled={formState.isLoading}
                                >
                                    {formState.isLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Вход...
                                        </>
                                    ) : (
                                        "Войти"
                                    )}
                                </Button>
                            </motion.div>
                        </form>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
