import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  title?: string;
};

function BrandImg({
  src,
  title,
  className,
}: {
  src: string;
  title: string;
  className?: string;
}) {
  return (
    <img
      src={src}
      alt={title}
      title={title}
      className={cn("size-5 object-contain", className)}
      width={20}
      height={20}
      draggable={false}
    />
  );
}

export function LogoGmail({ className, title = "Gmail" }: LogoProps) {
  return <BrandImg src="/brands/gmail.svg" title={title} className={className} />;
}

export function LogoDrive({ className, title = "Google Drive" }: LogoProps) {
  return (
    <BrandImg src="/brands/googledrive.svg" title={title} className={className} />
  );
}

export function LogoCalendar({
  className,
  title = "Google Calendar",
}: LogoProps) {
  return (
    <BrandImg
      src="/brands/googlecalendar.svg"
      title={title}
      className={className}
    />
  );
}

export function LogoSlack({ className, title = "Slack" }: LogoProps) {
  return <BrandImg src="/brands/slack.svg" title={title} className={className} />;
}

export function LogoNotion({ className, title = "Notion" }: LogoProps) {
  return (
    <BrandImg src="/brands/notion.svg" title={title} className={className} />
  );
}

export function LogoAsana({ className, title = "Asana" }: LogoProps) {
  return <BrandImg src="/brands/asana.svg" title={title} className={className} />;
}

export function LogoOpenAI({ className, title = "OpenAI" }: LogoProps) {
  return (
    <BrandImg src="/brands/openai.svg" title={title} className={className} />
  );
}

export function LogoAnthropic({ className, title = "Anthropic" }: LogoProps) {
  return (
    <BrandImg src="/brands/anthropic.svg" title={title} className={className} />
  );
}

export function LogoGemini({ className, title = "Google Gemini" }: LogoProps) {
  return (
    <BrandImg
      src="/brands/googlegemini.svg"
      title={title}
      className={className}
    />
  );
}

export function LogoXAI({ className, title = "xAI" }: LogoProps) {
  return <BrandImg src="/brands/xai.svg" title={title} className={className} />;
}

export function LogoDeepSeek({ className, title = "DeepSeek" }: LogoProps) {
  return (
    <BrandImg src="/brands/deepseek.svg" title={title} className={className} />
  );
}

export function LogoKimi({ className, title = "Kimi" }: LogoProps) {
  return <BrandImg src="/brands/kimi.svg" title={title} className={className} />;
}

/* Premium rendered icon tiles */

export type AppIconName =
  | "shark"
  | "launch"
  | "search"
  | "inbox"
  | "travel"
  | "sales"
  | "project"
  | "chart";

const ICON_SRC: Record<AppIconName, string> = {
  shark: "/icons/shark.png",
  launch: "/icons/launch.png",
  search: "/icons/search.png",
  inbox: "/icons/inbox.png",
  travel: "/icons/travel.png",
  sales: "/icons/sales.png",
  project: "/icons/project.png",
  chart: "/icons/chart.png",
};

/** Full rendered squircle icon (includes its own background). */
export function AppIcon({
  name,
  className,
  alt = "",
}: {
  name: AppIconName;
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={ICON_SRC[name]}
      alt={alt}
      className={cn(
        "shrink-0 object-contain",
        name !== "shark" && "shadow-[0_1px_2px_rgb(15_23_32_/_0.06)]",
        className,
      )}
      draggable={false}
    />
  );
}

/** Aliases used across the landing page */
export function GlyphRocket({ className }: LogoProps) {
  return <AppIcon name="launch" className={cn("size-5 rounded-[22%]", className)} />;
}
export function GlyphInbox({ className }: LogoProps) {
  return <AppIcon name="inbox" className={cn("size-5 rounded-[22%]", className)} />;
}
export function GlyphSearch({ className }: LogoProps) {
  return <AppIcon name="search" className={cn("size-5 rounded-[22%]", className)} />;
}
export function GlyphTravel({ className }: LogoProps) {
  return <AppIcon name="travel" className={cn("size-5 rounded-[22%]", className)} />;
}
export function GlyphChart({ className }: LogoProps) {
  return <AppIcon name="chart" className={cn("size-5 rounded-[22%]", className)} />;
}
export function GlyphSales({ className }: LogoProps) {
  return <AppIcon name="sales" className={cn("size-5 rounded-[22%]", className)} />;
}
export function GlyphProject({ className }: LogoProps) {
  return <AppIcon name="project" className={cn("size-5 rounded-[22%]", className)} />;
}

export type IconTone = "blue" | "violet" | "green" | "orange" | "sky" | "slate";

/** Prefer AppIcon; IconTile kept for rare custom children */
export function IconTile({
  tone = "blue",
  size = "md",
  className,
  children,
  icon,
}: {
  tone?: IconTone;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  children?: ReactNode;
  icon?: AppIconName;
}) {
  const sizes = {
    sm: "size-5 rounded-[6px]",
    md: "size-9 rounded-[11px]",
    lg: "size-11 rounded-[14px]",
    xl: "size-[52px] rounded-[16px]",
  };
  if (icon) {
    return (
      <AppIcon
        name={icon}
        className={cn(sizes[size], className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden",
        sizes[size],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SharkMark({ className }: { className?: string }) {
  return (
    <AppIcon
      name="shark"
      className={cn("size-7", className)}
      alt="Sharker"
    />
  );
}

/** 按模型 id 前缀选厂商标，避免所有 pill 都画成 OpenAI。 */
function ModelLogo({ model, className }: { model: string; className?: string }) {
  if (model.startsWith("anthropic/")) return <LogoAnthropic className={className} />;
  if (model.startsWith("deepseek/")) return <LogoDeepSeek className={className} />;
  if (model.startsWith("google/")) return <LogoGemini className={className} />;
  if (model.startsWith("xai/")) return <LogoXAI className={className} />;
  if (model.startsWith("moonshotai/")) return <LogoKimi className={className} />;
  return <LogoOpenAI className={className} />;
}

export function ModelPill({
  model = "openai/gpt-5.6-terra",
  className,
}: {
  model?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-white px-2.5 py-1.5 text-[12px] font-medium tracking-tight text-fg shadow-[0_0_0_1px_rgb(15_23_32_/_0.06),0_1px_2px_rgb(15_23_32_/_0.04)]",
        className,
      )}
    >
      <span className="relative grid size-2 place-items-center">
        <span className="absolute size-2 animate-ping rounded-full bg-[#22c55e] opacity-30" />
        <span className="size-[7px] rounded-full bg-[#22c55e] shadow-[0_0_0_2px_rgb(34_197_94_/_0.2)]" />
      </span>
      <ModelLogo model={model} className="size-3.5 opacity-80" />
      <span className="tabular-nums text-fg-muted">{model}</span>
    </span>
  );
}
