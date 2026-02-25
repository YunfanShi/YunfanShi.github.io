import { User } from '@supabase/supabase-js';
import Image from 'next/image';

interface UserAvatarProps {
  user: User;
}

export default function UserAvatar({ user }: UserAvatarProps) {
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const username =
    (user.user_metadata?.user_name as string | undefined) ?? 'User';
  const initials = username.charAt(0).toUpperCase();

  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={username}
        width={32}
        height={32}
        className="rounded-full"
      />
    );
  }

  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4285F4] text-white text-sm font-medium">
      {initials}
    </div>
  );
}
