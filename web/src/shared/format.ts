export const time = (s: string) =>
  new Date(s).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
export const nice = (s: string) => s.replaceAll("_", " ");
export const short = (s: string) =>
  s.length > 25 ? s.slice(0, 12) + "…" + s.slice(-8) : s;
