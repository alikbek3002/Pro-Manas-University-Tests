import React, { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { useNavigate } from "react-router-dom";
import { loginStudent } from "../lib/api";
import { studentQueryClient } from "../lib/queryClient";
import { availableTestsQueryOptions } from "../lib/studentQueries";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import logo from "../assets/pro-manas-logo.png";

const LoginPage = () => {
    const { setStudent } = useAuthStore();
    const navigate = useNavigate();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const isSubmittingRef = React.useRef(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmittingRef.current) return;
        isSubmittingRef.current = true;
        setIsLoading(true);
        setError(null);

        try {
            const response = await loginStudent(username, password);
            setStudent(response);
            void studentQueryClient.prefetchQuery(
                availableTestsQueryOptions(response.student.id),
            );
            navigate("/dashboard");
        } catch (loginError) {
            const message = loginError instanceof Error ? loginError.message : "Ошибка входа";
            setError(message);
            isSubmittingRef.current = false;
            setIsLoading(false);
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
        <section className="min-h-screen flex items-center justify-center px-4 py-8 bg-stone-50">
            <div className="w-full max-w-md">
                <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="rounded-3xl border-2 border-stone-200 bg-white p-6 sm:p-10 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.15)]"
                >
                    <motion.div variants={itemVariants} className="mb-10 text-center">
                        <img src={logo} alt="ProManas" className="mx-auto h-20 sm:h-24 w-auto mb-6" decoding="async" />
                        <h1 className="text-2xl sm:text-3xl font-black text-black">Портал Ученика</h1>
                        <p className="mt-2 text-sm text-stone-500 font-medium">Войдите для доступа к платформе</p>
                    </motion.div>

                    {error && (
                        <motion.div
                            variants={itemVariants}
                            className="mb-6 rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
                        >
                            {error}
                        </motion.div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-5">
                        <motion.div variants={itemVariants} className="space-y-2">
                            <label htmlFor="username" className="text-sm font-bold text-stone-800">
                                Логин
                            </label>
                            <input
                                id="username"
                                type="text"
                                placeholder="Введите логин"
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                                disabled={isLoading}
                                className="flex h-12 w-full rounded-xl border-2 border-stone-200 bg-white px-4 text-base font-medium placeholder:text-stone-400 focus:outline-none focus:border-black transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                required
                            />
                        </motion.div>

                        <motion.div variants={itemVariants} className="space-y-2">
                            <label htmlFor="password" className="text-sm font-bold text-stone-800">
                                Пароль
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Введите пароль"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    disabled={isLoading}
                                    className="flex h-12 w-full rounded-xl border-2 border-stone-200 bg-white px-4 pr-12 text-base font-medium placeholder:text-stone-400 focus:outline-none focus:border-black transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                                    required
                                />
                                <button
                                    type="button"
                                    className="absolute right-0 top-0 h-full px-4 text-stone-400 hover:text-stone-900 focus:outline-none transition-colors"
                                    onClick={() => setShowPassword(!showPassword)}
                                    disabled={isLoading}
                                >
                                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                </button>
                            </div>
                        </motion.div>

                        <motion.div variants={itemVariants} className="pt-2">
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="inline-flex w-full h-14 items-center justify-center rounded-2xl bg-black text-white text-base font-bold transition-all hover:opacity-90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        Вход...
                                    </>
                                ) : (
                                    "Войти"
                                )}
                            </button>
                        </motion.div>
                    </form>
                </motion.div>
            </div>
        </section>
    );
};

export default LoginPage;
