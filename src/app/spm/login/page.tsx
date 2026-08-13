"use client";

import { TelegramLoginWidget } from "@/components/control/TelegramLoginWidget";

/** SPM login now routes into the unified web control portal. */
export default function SpmLoginPage() {
  return (
    <TelegramLoginWidget
      redirectTo="/control"
      title="METRO UP Control"
      subtitle="Войдите через Telegram. Доступ откроется для ролей ADMIN и SPM."
    />
  );
}
