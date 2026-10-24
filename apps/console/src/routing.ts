import { useEffect, useState } from "react";
export type View = "request" | "review" | "replay";
export function href(view: View, id?: string | null, version = 1) {
  return (
    "#/" +
    view +
    (id ? "/" + encodeURIComponent(id) + "?version=" + version : "")
  );
}
function read() {
  const hash = window.location.hash.slice(1);
  const [path = "", query = ""] = hash.split("?");
  const segments = path.split("/");
  const value = segments[1];
  const view: View =
    value === "review" || value === "replay" ? value : "request";
  let id: string | null = null;
  try {
    id = segments[2] ? decodeURIComponent(segments[2]) : null;
  } catch {}
  const number = Number(new URLSearchParams(query).get("version") ?? "1");
  return {
    view,
    id,
    version: Number.isSafeInteger(number) && number > 0 ? number : 1,
  };
}
export function navigate(view: View, id?: string | null, version = 1) {
  window.location.hash = href(view, id, version).slice(1);
}
export function useRoute() {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const update = () => setRoute(read());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return route;
}
