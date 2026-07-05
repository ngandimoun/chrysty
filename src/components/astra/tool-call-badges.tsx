const TOOL_LABELS: Record<string, string> = {
  calculator: 'Calculator',
  processDate: 'Date',
  convert: 'Convert',
  randomChoice: 'Random',
  getUserContext: 'Context',
  getWeather: 'Weather',
};

function formatToolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
}

interface ToolCallBadgesProps {
  toolNames: string[];
}

export function ToolCallBadges({ toolNames }: ToolCallBadgesProps) {
  if (toolNames.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Tools used">
      {toolNames.map((name) => (
        <span
          key={name}
          className="inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-950/40 px-2.5 py-0.5 text-xs font-medium text-cyan-200"
        >
          {formatToolLabel(name)}
        </span>
      ))}
    </div>
  );
}
