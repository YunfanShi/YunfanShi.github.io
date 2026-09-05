'use client';

import Image from 'next/image';
import { useState } from 'react';

interface UserAvatarProps {
  user: {
    user_metadata: Record<string, unknown>;
  };
}

export default function UserAvatar({ user }: UserAvatarProps) {
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const username =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.user_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    'User';
  const initials = username.charAt(0).toUpperCase();
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (avatarUrl && failedUrl !== avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={32}
        height={32}
        unoptimized
        onError={() => setFailedUrl(avatarUrl)}
        className="h-8 w-8 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div aria-label={`${username} 的头像`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#4285F4] text-sm font-medium text-white">
      {initials}
    </div>
  );
}
