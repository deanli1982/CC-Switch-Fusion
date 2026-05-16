import { useMemo } from "react";
import { motion } from "framer-motion";
import { Network, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProvidersQuery } from "@/lib/query/queries";
import type { FusionModelMapping, FusionMappingEntry } from "@/types";

interface FusionModelMappingPageProps {
  value: FusionModelMapping;
  onChange: (value: FusionModelMapping) => void;
}

type ModelTypeKey = "default" | "haiku" | "sonnet" | "opus";

const MODEL_TYPES: {
  key: ModelTypeKey;
  icon: string;
  labelKey: string;
  descriptionKey: string;
}[] = [
  {
    key: "default",
    icon: "⚡",
    labelKey: "fusion.default",
    descriptionKey: "fusion.defaultDescription",
  },
  {
    key: "haiku",
    icon: "🌸",
    labelKey: "fusion.haiku",
    descriptionKey: "fusion.haikuDescription",
  },
  {
    key: "sonnet",
    icon: "🎵",
    labelKey: "fusion.sonnet",
    descriptionKey: "fusion.sonnetDescription",
  },
  {
    key: "opus",
    icon: "🎭",
    labelKey: "fusion.opus",
    descriptionKey: "fusion.opusDescription",
  },
];

export function FusionModelMappingPage({
  value,
  onChange,
}: FusionModelMappingPageProps) {
  const { t } = useTranslation();
  const { data: providersData } = useProvidersQuery("claude");

  const providers = useMemo(() => {
    if (!providersData?.providers) return [];
    return Object.values(providersData.providers);
  }, [providersData]);

  const updateEntry = (
    type: ModelTypeKey,
    field: keyof FusionMappingEntry,
    newValue: string,
  ) => {
    const current = (value as any)[type] ?? {
      providerId: "",
      modelName: "",
    };
    const updated = { ...current, [field]: newValue };
    onChange({ ...value, [type]: updated });
  };

  const removeEntry = (type: ModelTypeKey) => {
    const next = { ...value };
    delete (next as any)[type];
    onChange(next);
  };

  const handleToggle = (checked: boolean) => {
    onChange({ ...value, enabled: checked });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
          <Network className="h-5 w-5 text-violet-500" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold">
            {t("settings.tabFusion", "Fusion Model Mapping")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t(
              "settings.fusionDescription",
              "Route different Claude model types to different providers for multimodal support",
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={value.enabled} onCheckedChange={handleToggle} />
        </div>
      </div>

      {/* Model Type Rows */}
      <div className="space-y-4">
        {/* Auto Image → Haiku */}
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.02] p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="text-sm font-medium">
                {t("settings.fusion.autoImageToHaiku", "Auto Image → Haiku")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t(
                  "settings.fusion.autoImageToHaikuDesc",
                  "When request contains images, automatically route as Haiku type",
                )}
              </p>
            </div>
            <Switch
              checked={value.autoImageToHaiku ?? false}
              onCheckedChange={(v) =>
                onChange({ ...value, autoImageToHaiku: v })
              }
              disabled={!value.enabled}
            />
          </div>
        </div>

        {MODEL_TYPES.map(({ key, icon, labelKey, descriptionKey }) => {
          const entry = (value as any)[key] as
            | FusionMappingEntry
            | undefined;
          const providerId = entry?.providerId ?? "";
          const modelName = entry?.modelName ?? "";
          const isConfigured = !!providerId && !!modelName;

          return (
            <div
              key={key}
              className={`rounded-xl border p-4 transition-all ${
                !value.enabled
                  ? "border-border/30 opacity-50"
                  : isConfigured
                    ? "border-violet-500/30 bg-violet-500/5"
                    : "border-border/50"
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-base">
                  {icon}
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-base font-medium">
                    {t(`settings.fusion.${labelKey}`)}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t(`settings.fusion.${descriptionKey}`)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                {/* Provider Dropdown */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    {t("settings.fusion.provider", "Target Provider")}
                  </Label>
                  <Select
                    value={providerId}
                    onValueChange={(v) => updateEntry(key, "providerId", v)}
                    disabled={!value.enabled}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue
                        placeholder={t(
                          "settings.fusion.providerPlaceholder",
                          "Select provider",
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Model Name Input */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    {t("settings.fusion.modelName", "Target Model")}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      className="h-9"
                      placeholder={t(
                        "settings.fusion.modelPlaceholder",
                        "e.g. deepseek-v4-pro[1m]",
                      )}
                      value={modelName}
                      onChange={(e) =>
                        updateEntry(key, "modelName", e.target.value)
                      }
                      disabled={!value.enabled}
                    />
                    {isConfigured && (
                      <button
                        className="shrink-0 rounded-md border border-border/50 px-2 text-xs text-muted-foreground hover:bg-muted hover:text-destructive transition-colors"
                        onClick={() => removeEntry(key)}
                        type="button"
                        title={t("settings.fusion.clear", "Clear")}
                      >
                        <ChevronDown className="h-4 w-4 rotate-90" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Status Summary */}
      {value.enabled && (
        <div className="rounded-lg bg-muted/50 p-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
            <span className="font-medium">
              {t("settings.fusion.statusActive", "Fusion routing is active")}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              "settings.fusion.statusDescription",
              "Claude Code requests will be automatically routed to configured providers based on model type",
            )}
          </p>
        </div>
      )}
    </motion.div>
  );
}
