import type { SecretMeta } from "@ops-vault/core";
import { Badge, cn, DomainIcon, IconExternal } from "@ops-vault/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/api";
import { TYPE_META, type VaultFilter } from "../lib/secretMeta";
import { displayHost, toBrowseUrl } from "../lib/url";

interface Props {
  refreshToken: number;
  filter: VaultFilter;
  search: string;
  folderId?: string | null;
  tag?: string | null;
  /** null = personal vault ecosystem */
  workspaceId?: string | null;
  selectedId?: string | null;
  onSelect: (item: SecretMeta) => void;
  onError: (msg: string) => void;
  onMoved?: () => void;
  onCounts?: (counts: Partial<Record<VaultFilter, number>>) => void;
  onMeta?: (meta: {
    folders: { id: string; name: string; count: number }[];
    tags: string[];
  }) => void;
}

export function SecretList({
  refreshToken,
  filter,
  search,
  folderId,
  tag,
  workspaceId = null,
  selectedId,
  onSelect,
  onError,
  onMoved,
  onCounts,
  onMeta,
}: Props) {
  const [items, setItems] = useState<SecretMeta[]>([]);
  const [folderNames, setFolderNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [{ items: list }, { folders }, { tags }] = await Promise.all([
        api.listSecrets({ workspaceId }),
        api.listFolders(),
        api.listTags(),
      ]);
      setItems(list);
      const fmap: Record<string, string> = {};
      const fcounts: Record<string, number> = {};
      for (const f of folders) {
        fmap[f.id] = f.name;
        fcounts[f.id] = 0;
      }
      for (const it of list) {
        if (it.folderId && fcounts[it.folderId] !== undefined) {
          fcounts[it.folderId]!++;
        }
      }
      setFolderNames(fmap);

      const counts: Partial<Record<VaultFilter, number>> = { all: list.length };
      for (const it of list) {
        counts[it.type] = (counts[it.type] ?? 0) + 1;
      }
      onCounts?.(counts);
      onMeta?.({
        folders: folders.map((f) => ({
          id: f.id,
          name: f.name,
          count: fcounts[f.id] ?? 0,
        })),
        tags,
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : "List failed");
    } finally {
      setLoading(false);
    }
  }, [onCounts, onError, onMeta, workspaceId]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filter !== "all" && it.type !== filter) return false;
      if (folderId === "__none__" && it.folderId) return false;
      if (folderId && folderId !== "__none__" && it.folderId !== folderId) {
        return false;
      }
      if (tag && !(it.tags ?? []).includes(tag)) return false;
      if (!q) return true;
      const host = displayHost(it.url)?.toLowerCase() ?? "";
      return (
        it.title.toLowerCase().includes(q) ||
        it.type.includes(q) ||
        host.includes(q) ||
        (it.url ?? "").toLowerCase().includes(q) ||
        (it.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [items, filter, search, folderId, tag]);

  if (loading && items.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)] px-5 py-12 text-center text-sm text-[var(--ov-muted)]">
        Loading…
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--ov-border)] bg-[var(--ov-panel)]/50 px-5 py-14 text-center">
        <p className="text-sm font-medium text-[var(--ov-fg)]">No items</p>
        <p className="mt-1 text-xs text-[var(--ov-muted)]">
          {search || filter !== "all" || folderId || tag
            ? "No matches"
            : "Press N or New to add an item"}
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--ov-border)] overflow-hidden rounded-xl border border-[var(--ov-border)] bg-[var(--ov-panel)]">
      {filtered.map((item) => {
        const meta = TYPE_META[item.type];
        const Icon = meta.Icon;
        const host = displayHost(item.url);
        const selected = selectedId === item.id;
        return (
          <li
            key={item.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/opsvault-secret", item.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            title="Glisser vers un dossier dans la barre latérale"
          >
            <div
              className={cn(
                "flex cursor-grab items-center gap-1 pr-2 transition active:cursor-grabbing",
                selected
                  ? "bg-cyan-500/10"
                  : "hover:bg-[var(--ov-hover)]"
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
              >
                {host ? (
                  <DomainIcon host={host} size={36} />
                ) : (
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--ov-soft)]",
                      meta.accent
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[var(--ov-fg)]">
                    {item.title}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--ov-muted)]">
                    <Badge className="normal-case tracking-normal">
                      {meta.short}
                    </Badge>
                    {host && <span className="truncate">{host}</span>}
                    {item.folderId && folderNames[item.folderId] && (
                      <span className="truncate">
                        {folderNames[item.folderId]}
                      </span>
                    )}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onSelect(item)}
                className="shrink-0 rounded-lg border border-cyan-600/40 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-500/20 dark:text-cyan-300"
                title="Open"
              >
                Open
              </button>
              {item.url && (
                <a
                  href={toBrowseUrl(item.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Ouvrir le site"
                  className="rounded-lg p-2 text-[var(--ov-muted)] hover:bg-[var(--ov-soft)] hover:text-cyan-600 dark:hover:text-cyan-400"
                  onClick={(e) => e.stopPropagation()}
                >
                  <IconExternal className="h-4 w-4" />
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
