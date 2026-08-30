import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { translate as t } from "@/lib/i18n";

const BUCKET = "avatars";
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"];

/** Resolve a stored avatar path (or absolute URL) into a displayable URL. */
export function useAvatarUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!path) {
      setUrl(null);
      return;
    }
    if (/^https?:\/\//.test(path)) {
      setUrl(path);
      return;
    }
    void supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (alive) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      alive = false;
    };
  }, [path]);

  return url;
}

export type AvatarUploadResult = { path: string } | { error: string };

async function setAvatarPath(path: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("update_my_profile", {
    _avatar_url: path,
  });
  if (error) return error.message;
  const payload = (data ?? {}) as { ok?: boolean; code?: string };
  return payload.ok ? null : (payload.code ?? "PROFILE_UPDATE_FAILED");
}

export async function uploadAvatar(userId: string, file: File): Promise<AvatarUploadResult> {
  if (!ALLOWED.includes(file.type)) return { error: t("avatar.invalidType") };
  if (file.size > MAX_BYTES) return { error: t("avatar.tooLarge") };

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) return { error: error.message };

  // profiles.avatar_url is only writable through the allowlisted RPC.
  const profileError = await setAvatarPath(path);
  if (profileError) return { error: profileError };

  await supabase.auth.updateUser({ data: { avatar_path: path } });
  return { path };
}

export async function removeAvatar(_userId: string, path: string | null) {
  if (path && !/^https?:\/\//.test(path)) {
    await supabase.storage.from(BUCKET).remove([path]);
  }
  await setAvatarPath("");
  await supabase.auth.updateUser({ data: { avatar_path: null } });
}

