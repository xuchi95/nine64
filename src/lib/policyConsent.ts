/** Phiên bản chính sách; tăng khi nội dung thay đổi để yêu cầu đồng ý lại. */
export const POLICY_VERSION = "2026-09-01";
export const POLICY_CONSENT_KEY = "nine64.policy-consent";

export type PolicyConsent = { version: string; acceptedAt: string };

export function getPolicyConsent(): PolicyConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(POLICY_CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PolicyConsent>;
    if (typeof parsed.version !== "string" || typeof parsed.acceptedAt !== "string") return null;
    return { version: parsed.version, acceptedAt: parsed.acceptedAt };
  } catch {
    return null;
  }
}

/** Người dùng đã đồng ý đúng phiên bản chính sách hiện hành hay chưa. */
export function hasAcceptedPolicy(): boolean {
  return getPolicyConsent()?.version === POLICY_VERSION;
}

export function acceptPolicy() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      POLICY_CONSENT_KEY,
      JSON.stringify({ version: POLICY_VERSION, acceptedAt: new Date().toISOString() } satisfies PolicyConsent),
    );
  } catch {
    /* storage bị chặn */
  }
}
