"use client";

import { TelegramLoginWidget } from "@/components/control/TelegramLoginWidget";

/** Unified web sign-in for ADMIN + SPM. After login → /control (role decides UI). */
export default function ControlLoginPage() {
  return (
    <TelegramLoginWidget
      redirectTo="/control"
      title="METRO UP Control"
      subtitle="Войдите через Telegram. Доступ к панели откроется для ролей ADMIN и SPM."
    />
  );
}
