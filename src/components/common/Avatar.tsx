import { useState } from "react";

import { initials } from "../../lib/format";
import { isDemo } from "../../services/sentiongApi";

interface AvatarProps {
  login: string | null;
  label: string;
  size?: number;
  className?: string;
}

/**
 * A GitHub avatar, or the profile's initials when there is no account (or no
 * network). Tinted by the surrounding `--accent`.
 */
export function Avatar({ login, label, size = 44, className = "" }: AvatarProps) {
  const [failedFor, setFailedFor] = useState<string | null>(null);
  // Demo accounts are made up; their names may belong to real people on GitHub.
  const showImage = !isDemo && login !== null && failedFor !== login;

  return (
    <span className={`avatar ${className}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {showImage ? (
        <img
          src={`https://github.com/${login}.png?size=${size * 2}`}
          alt=""
          draggable={false}
          onError={() => setFailedFor(login)}
        />
      ) : (
        <span className="avatar__initials">{initials(label)}</span>
      )}
    </span>
  );
}
