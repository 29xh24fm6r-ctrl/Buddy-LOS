import type { SVGProps } from "react";

const paths = {
  dashboard: "M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z",
  deals: "M4 5h16v14H4V5Zm3-3h10v3H7V2Zm1 7h8m-8 4h5",
  alert: "M12 3 2.8 20h18.4L12 3Zm0 6v5m0 3v.1",
  tasks: "M4 5h3l1.5 2L12 3m-8 8h3l1.5 2L12 9m-8 8h3l1.5 2L12 15m2-8h6m-6 6h6m-6 6h6",
  documents: "M6 2h8l4 4v16H6V2Zm8 0v5h5M9 12h6m-6 4h6",
  crm: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  activity: "M3 12h4l2-6 4 12 2-6h6",
  workflow: "M5 5h6v5H5V5Zm8 9h6v5h-6v-5ZM8 10v6h5m3-7V6h-5",
  building: "M4 21h16M6 21V6l6-3 6 3v15M9 9h2m2 0h2m-6 4h2m2 0h2m-6 4h2m2 0h2",
  arrow: "M5 12h14m-5-5 5 5-5 5",
} as const;

export type LosIconName = keyof typeof paths;

export function LosIcon({ name, ...props }: { name: LosIconName } & SVGProps<SVGSVGElement>) {
  const filled = name === "dashboard";
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}>
      <path d={paths[name]} fill={filled ? "currentColor" : "none"} stroke={filled ? "none" : "currentColor"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
