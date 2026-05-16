import { useMemo, useCallback } from "react";
import { Network, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Switch } from "@/components/ui/switch";
import { useSettingsQuery } from "@/lib/query/queries";
import { useSaveSettingsMutation } from "@/lib/query/mutations";
import { useProvidersQuery } from "@/lib/query/queries";
import type { FusionModelMapping } from "@/types";

type ModelTypeKey = "default" | "haiku" | "sonnet" | "opus";

const CHANNELS: {
  key: ModelTypeKey;
  icon: string;
  label: string;
}[] = [
  { key: "default", icon: "⚡", label: "Default" },
  { key: "haiku", icon: "🌸", label: "Haiku" },
  { key: "sonnet", icon: "🎵", label: "Sonnet" },
  { key: "opus", icon: "🎭", label: "Opus" },
];

interface FusionChannelBarProps {
  onGoToSettings?: () => void;
}

export function FusionChannelBar({ onGoToSettings }: FusionChannelBarProps) {
  const { data: settings } = useSettingsQuery();
  const { data: providersData } = useProvidersQuery("claude");
  const saveMutation = useSaveSettingsMutation();

  const fusion = settings?.fusionModelMapping;
  const providers = useMemo(() => providersData?.providers ?? {}, [providersData]);

  const getProviderName = useCallback(
    (providerId: string): string => {
      return providers[providerId]?.name ?? providerId;
    },
    [providers],
  );

  const handleToggleChannel = useCallback(
    async (type: ModelTypeKey, enabled: boolean) => {
      if (!fusion) return;
      const current = (fusion as any)[type];
      const entry = current ?? { providerId: "", modelName: "" };
      const updated: FusionModelMapping = {
        ...fusion,
        enabled: fusion.enabled,
      };
      if (enabled) {
        (updated as any)[type] = entry;
      } else {
        delete (updated as any)[type];
      }
      try {
        await saveMutation.mutateAsync({
          ...settings!,
          fusionModelMapping: updated,
        } as any);
      } catch (e) {
        console.error("[FusionChannelBar] Failed to save", e);
      }
    },
    [fusion, settings, saveMutation],
  );

  const handleToggleMaster = useCallback(
    async (enabled: boolean) => {
      if (!fusion) return;
      const updated: FusionModelMapping = { ...fusion, enabled };
      try {
        await saveMutation.mutateAsync({
          ...settings!,
          fusionModelMapping: updated,
        } as any);
      } catch (e) {
        console.error("[FusionChannelBar] Failed to save master toggle", e);
      }
    },
    [fusion, settings, saveMutation],
  );

  // Don't show if fusion is not configured at all
  if (!fusion) return null;

  const activeChannels = CHANNELS.filter((ch) => {
    const entry = (fusion as any)[ch.key];
    return entry && entry.providerId && entry.modelName;
  });

  // Don't show if no channels are configured
  if (activeChannels.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-4 rounded-xl border border-violet-500/30 bg-violet-500/5 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-violet-500/20">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-medium text-violet-300">
            Fusion Routing
          </span>
          <span
            className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${
              fusion.enabled
                ? "bg-violet-500/20 text-violet-300"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <span
              className={`inline-block w-1.5 h-1.5 rounded-full ${
                fusion.enabled ? "bg-violet-400 animate-pulse" : "bg-muted-foreground"
              }`}
            />
            {fusion.enabled ? "Active" : "Inactive"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Switch
            checked={fusion.enabled}
            onCheckedChange={handleToggleMaster}
            className="scale-90"
          />
          {onGoToSettings && (
            <button
              onClick={onGoToSettings}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-violet-300 transition-colors"
            >
              Configure
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Channels */}
      <AnimatePresence>
        {fusion.enabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="divide-y divide-violet-500/10"
          >
            {CHANNELS.map((ch) => {
              const entry = (fusion as any)[ch.key] as
                | { providerId: string; modelName: string }
                | undefined;
              const isConfigured = entry && entry.providerId && entry.modelName;
              if (!isConfigured) return null;

              return (
                <div
                  key={ch.key}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-violet-500/5 transition-colors"
                >
                  <span className="text-sm w-5 text-center">{ch.icon}</span>
                  <span className="text-sm font-medium w-20 shrink-0">
                    {ch.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    &rarr;
                  </span>
                  <span className="text-sm text-violet-300 font-medium min-w-0 truncate">
                    {getProviderName(entry.providerId)}
                  </span>
                  <span className="text-xs text-muted-foreground hidden sm:inline truncate">
                    {entry.modelName}
                  </span>
                  <div className="flex-1" />
                  <Switch
                    checked={true}
                    onCheckedChange={(v) => handleToggleChannel(ch.key, v)}
                    className="scale-75"
                  />
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
