/**
 * Mijn werk-inbox — handmatig onderhouden API hooks
 * (Orval codegen is niet beschikbaar voor dit endpoint-cluster)
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface WerkInboxStatus {
  gekoppeld: boolean;
  email?: string;
  verlooptOp?: string;
}

export interface WerkInboxMailbox {
  id: number;
  gebruiker_id: number;
  email_adres: string;
  label: string | null;
  volgorde: number;
  actief: boolean;
  aangemaakt_op: string;
}

export interface WerkInboxMail {
  id: number;
  message_id: string;
  gebruiker_id: number;
  mailbox_adres: string;
  onderwerp: string;
  afzender_naam: string | null;
  afzender_email: string;
  ontvangen_op: string;
  snippet: string | null;
  heeft_bijlage: boolean;
  is_gelezen_ms: boolean;
  verwerkt_op: string | null;
  gesynchroniseerd_op: string;
  notitie_aantal: number;
  koppeling_aantal: number;
}

export interface WerkInboxNotitie {
  id: number;
  message_id: string;
  gebruiker_id: number;
  tekst: string;
  aangemaakt_op: string;
  bijgewerkt_op: string;
}

export interface WerkInboxKoppeling {
  id: number;
  message_id: string;
  gebruiker_id: number;
  entity_type: string;
  entity_id: number;
  entity_label: string | null;
  aangemaakt_op: string;
}

export interface WerkInboxMailDetail {
  meta: WerkInboxMail;
  inhoud: {
    id: string;
    subject: string;
    body: { contentType: string; content: string };
    receivedDateTime: string;
    isRead: boolean;
    hasAttachments: boolean;
    from?: { emailAddress?: { name?: string; address?: string } };
    toRecipients: Array<{ emailAddress: { name: string; address: string } }>;
    ccRecipients: Array<{ emailAddress: { name: string; address: string } }>;
  };
  notities: WerkInboxNotitie[];
  koppelingen: WerkInboxKoppeling[];
}

export interface WerkInboxSyncResultaat {
  mailboxen: Array<{ adres: string; gesynchroniseerd: number; fout?: string }>;
  totaal: number;
  fout?: string;
}

export interface WerkInboxMailsFilter {
  mailbox?: string;
  ongelezen?: boolean;
  vandaag?: boolean;
  bijlage?: boolean;
}

// ── Query keys ────────────────────────────────────────────────────────────────

export const werkInboxKeys = {
  status:     () => ["werk-inbox", "status"] as const,
  mailboxen:  () => ["werk-inbox", "mailboxen"] as const,
  mails:      (f?: WerkInboxMailsFilter) => ["werk-inbox", "mails", f ?? {}] as const,
  mailDetail: (id: string) => ["werk-inbox", "mails", id] as const,
};

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useWerkInboxStatus() {
  return useQuery({
    queryKey: werkInboxKeys.status(),
    queryFn: () => apiFetch<WerkInboxStatus>("/api/werk-inbox/oauth/status"),
    staleTime: 60_000,
  });
}

export function useWerkInboxMailboxen() {
  return useQuery({
    queryKey: werkInboxKeys.mailboxen(),
    queryFn: () => apiFetch<WerkInboxMailbox[]>("/api/werk-inbox/mailboxen"),
  });
}

export function useAddWerkInboxMailbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { emailAdres: string; label?: string }) =>
      apiFetch<WerkInboxMailbox>("/api/werk-inbox/mailboxen", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: werkInboxKeys.mailboxen() }),
  });
}

export function useDeleteWerkInboxMailbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<{ ok: boolean }>(`/api/werk-inbox/mailboxen/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: werkInboxKeys.mailboxen() }),
  });
}

export function useOntkoppelMicrosoft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>("/api/werk-inbox/oauth/ontkoppel", { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: werkInboxKeys.status() });
      void qc.invalidateQueries({ queryKey: ["werk-inbox"] });
    },
  });
}

export function useSyncWerkInbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<WerkInboxSyncResultaat>("/api/werk-inbox/sync", { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["werk-inbox", "mails"] }),
  });
}

export function useWerkInboxMails(filter?: WerkInboxMailsFilter) {
  const params = new URLSearchParams();
  if (filter?.mailbox) params.set("mailbox", filter.mailbox);
  if (filter?.ongelezen) params.set("ongelezen", "true");
  if (filter?.vandaag) params.set("vandaag", "true");
  if (filter?.bijlage) params.set("bijlage", "true");
  const qs = params.toString();
  return useQuery({
    queryKey: werkInboxKeys.mails(filter),
    queryFn: () => apiFetch<WerkInboxMail[]>(`/api/werk-inbox/mails${qs ? `?${qs}` : ""}`),
    staleTime: 30_000,
  });
}

export function useWerkInboxMailDetail(messageId: string | null) {
  return useQuery({
    queryKey: werkInboxKeys.mailDetail(messageId ?? ""),
    queryFn: () => apiFetch<WerkInboxMailDetail>(`/api/werk-inbox/mails/${messageId}`),
    enabled: !!messageId,
    staleTime: 5 * 60_000,
  });
}

export function useMarkeerWerkInboxGelezen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, isGelezen }: { messageId: string; isGelezen: boolean }) =>
      apiFetch<{ ok: boolean }>(`/api/werk-inbox/mails/${encodeURIComponent(messageId)}/gelezen`, {
        method: "PATCH",
        body: JSON.stringify({ isGelezen }),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["werk-inbox", "mails"] }),
  });
}

export function useMarkeerWerkInboxVerwerkt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, verwerkt }: { messageId: string; verwerkt: boolean }) =>
      apiFetch<{ ok: boolean; verwerktOp: string | null }>(
        `/api/werk-inbox/mails/${encodeURIComponent(messageId)}/verwerkt`,
        { method: "PATCH", body: JSON.stringify({ verwerkt }) },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["werk-inbox", "mails"] }),
  });
}

export function useAddWerkInboxNotitie() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, tekst }: { messageId: string; tekst: string }) =>
      apiFetch<WerkInboxNotitie>(`/api/werk-inbox/mails/${encodeURIComponent(messageId)}/notities`, {
        method: "POST",
        body: JSON.stringify({ tekst }),
      }),
    onSuccess: (_r, v) => void qc.invalidateQueries({ queryKey: werkInboxKeys.mailDetail(v.messageId) }),
  });
}

export function useDeleteWerkInboxNotitie() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, messageId }: { id: number; messageId: string }) =>
      apiFetch<{ ok: boolean }>(`/api/werk-inbox/notities/${id}`, { method: "DELETE" }).then(
        (r) => ({ ...r, messageId }),
      ),
    onSuccess: (r) => void qc.invalidateQueries({ queryKey: werkInboxKeys.mailDetail(r.messageId) }),
  });
}

export function useAddWerkInboxKoppeling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      messageId,
      entityType,
      entityId,
      entityLabel,
    }: {
      messageId: string;
      entityType: string;
      entityId: number;
      entityLabel?: string;
    }) =>
      apiFetch<WerkInboxKoppeling>(
        `/api/werk-inbox/mails/${encodeURIComponent(messageId)}/koppelingen`,
        {
          method: "POST",
          body: JSON.stringify({ entityType, entityId, entityLabel }),
        },
      ),
    onSuccess: (_r, v) => void qc.invalidateQueries({ queryKey: werkInboxKeys.mailDetail(v.messageId) }),
  });
}

export function useDeleteWerkInboxKoppeling() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, messageId }: { id: number; messageId: string }) =>
      apiFetch<{ ok: boolean }>(`/api/werk-inbox/koppelingen/${id}`, { method: "DELETE" }).then(
        (r) => ({ ...r, messageId }),
      ),
    onSuccess: (r) => void qc.invalidateQueries({ queryKey: werkInboxKeys.mailDetail(r.messageId) }),
  });
}
