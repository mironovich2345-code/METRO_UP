"use client";

import Image from "next/image";
import { useState } from "react";
import { cn, getInitials } from "@/lib/utils";

interface AvatarProps {
  name: string;
  src?: string;
  /** Pixel size of the square avatar. */
  size?: number;
  className?: string;
  /** Draws a subtle brand ring around the avatar. */
  ring?: boolean;
}

export function Avatar({ name, src, size = 44, className, ring }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full bg-muted",
        ring && "ring-2 ring-brand ring-offset-2 ring-offset-background",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {showImage ? (
        <Image
          src={src}
          alt={name}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
          unoptimized
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand to-brand-strong">
          <span
            className="font-bold text-brand-foreground"
            style={{ fontSize: size * 0.4 }}
          >
            {getInitials(name)}
          </span>
        </div>
      )}
    </div>
  );
}
