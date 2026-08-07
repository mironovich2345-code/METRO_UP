"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { useApp } from "@/providers/app-provider";
import { easeOutSoft } from "@/lib/motion";

export default function SplashScreen() {
  const router = useRouter();
  const { isOnboarded, hydrated } = useApp();

  // Returning employees skip the splash and go straight Home.
  useEffect(() => {
    if (hydrated && isOnboarded) router.replace("/home");
  }, [hydrated, isOnboarded, router]);

  const start = () => {
    router.push("/welcome");
  };

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-[#09090b] px-6 text-white">
      {/* Brand glow */}
      <motion.div
        className="pointer-events-none absolute left-1/2 top-[34%] size-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/25 blur-[120px]"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.2, ease: easeOutSoft }}
      />

      <div className="flex flex-1 flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.8, ease: easeOutSoft }}
        >
          <Logo tone="onDark" size="lg" />
        </motion.div>

        <motion.p
          className="mt-6 max-w-[240px] text-center text-sm font-medium text-white/50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.8 }}
        >
          Академия команды. Обучение, рейтинг и рост в одном приложении.
        </motion.p>
      </div>

      <motion.div
        className="pb-[calc(env(safe-area-inset-bottom)+28px)]"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.7, ease: easeOutSoft }}
      >
        <Button block size="lg" onClick={start} disabled={!hydrated}>
          Начать
          <ArrowRight className="size-5" />
        </Button>
      </motion.div>
    </main>
  );
}
